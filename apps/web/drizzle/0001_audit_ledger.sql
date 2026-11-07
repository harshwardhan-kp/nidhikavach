-- Hash-chained, append-only audit ledger.
--
-- hash = sha256(prev_hash || '|' || canonical entry)
-- The canonical entry is a jsonb object (jsonb has a deterministic key order),
-- and the timestamp is hashed as integer microseconds so the result does not
-- depend on the session time zone.

CREATE OR REPLACE FUNCTION ledger_entry_hash(
  p_prev text, p_ts timestamptz, p_actor uuid, p_role text, p_action text,
  p_entity text, p_entity_id text, p_payload jsonb
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(
    digest(
      p_prev || '|' || jsonb_build_object(
        'ts', (extract(epoch FROM p_ts) * 1000000)::bigint,
        'actor', p_actor,
        'role', p_role,
        'action', p_action,
        'entity', p_entity,
        'entity_id', p_entity_id,
        'payload', p_payload
      )::text,
      'sha256'
    ),
    'hex'
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ledger_append(
  p_actor uuid, p_role text, p_action text, p_entity text, p_entity_id text, p_payload jsonb
) RETURNS TABLE (seq bigint, hash text) LANGUAGE plpgsql AS $$
DECLARE
  v_prev text;
  v_ts timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_hash text;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
BEGIN
  -- Serialise writers so the chain never forks.
  PERFORM pg_advisory_xact_lock(727274);
  SELECT l.hash INTO v_prev FROM audit_ledger l ORDER BY l.seq DESC LIMIT 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  v_hash := ledger_entry_hash(v_prev, v_ts, p_actor, p_role, p_action, p_entity, p_entity_id, v_payload);

  INSERT INTO audit_ledger (ts, actor_id, actor_role, action, entity, entity_id, payload, prev_hash, hash)
  VALUES (v_ts, p_actor, p_role, p_action, p_entity, p_entity_id, v_payload, v_prev, v_hash)
  RETURNING audit_ledger.seq, audit_ledger.hash INTO seq, hash;
  RETURN NEXT;
END
$$;
--> statement-breakpoint

-- Walks the chain in order; returns the first broken entry (if any) and how many were checked.
CREATE OR REPLACE FUNCTION ledger_verify(p_table regclass DEFAULT 'audit_ledger')
RETURNS TABLE (checked bigint, first_bad_seq bigint, reason text) LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v_prev text := repeat('0', 64);
  v_n bigint := 0;
BEGIN
  FOR r IN EXECUTE format('SELECT * FROM %s ORDER BY seq', p_table) LOOP
    v_n := v_n + 1;
    IF r.prev_hash <> v_prev THEN
      checked := v_n; first_bad_seq := r.seq; reason := 'prev_hash does not match previous entry';
      RETURN NEXT; RETURN;
    END IF;
    IF r.hash <> ledger_entry_hash(r.prev_hash, r.ts, r.actor_id, r.actor_role, r.action, r.entity, r.entity_id, r.payload) THEN
      checked := v_n; first_bad_seq := r.seq; reason := 'entry content does not match its hash';
      RETURN NEXT; RETURN;
    END IF;
    v_prev := r.hash;
  END LOOP;
  checked := v_n; first_bad_seq := NULL; reason := NULL;
  RETURN NEXT;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_ledger is append-only (% blocked)', TG_OP;
END
$$;
--> statement-breakpoint

CREATE TRIGGER audit_ledger_no_update BEFORE UPDATE OR DELETE ON audit_ledger
  FOR EACH ROW EXECUTE FUNCTION audit_ledger_immutable();
--> statement-breakpoint

CREATE TRIGGER audit_ledger_no_truncate BEFORE TRUNCATE ON audit_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION audit_ledger_immutable();
