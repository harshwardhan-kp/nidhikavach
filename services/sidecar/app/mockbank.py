"""Simulated banking rails for the prototype.

* A "core banking" store of term deposits (SQLite), loaded from the seed and
  extended from the portal's bank-teller page.
* An Account Aggregator style flow: consent -> FI fetch, answering with a
  ReBIT Term Deposit shaped payload. Only some banks are "on the rail".
* A NeSL lookup for e-FDRs / e-BGs.

Clearly simulated: no real bank or AA is contacted.
"""

from __future__ import annotations

import random
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .config import settings

router = APIRouter(prefix="/v1/bank")

AA_RAIL = {"SBIN", "HDFC", "ICIC", "UTIB", "KKBK", "BARB", "PUNB", "CNRB", "UBIN"}
DB_PATH = Path(settings.files_dir).parent / "mockbank.db"


@contextmanager
def db():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.executescript(
            """
            create table if not exists deposits (
              ifsc text not null, account_no text not null, holder text not null,
              principal integer not null, opening_date text not null, maturity_date text not null,
              rate real not null, status text not null default 'ACTIVE', closed_on text,
              lien_holder text, auto_renew integer not null default 0, product text not null default 'FD',
              issued_by text not null default 'seed', created_at text not null,
              primary key (ifsc, account_no)
            );
            create table if not exists consents (
              consent_id text primary key, ifsc text not null, account_no text not null,
              fiu text not null, purpose text not null, created_at text not null
            );
            """
        )


class Deposit(BaseModel):
    ifsc: str = Field(pattern=r"^[A-Z]{4}0[A-Z0-9]{6}$")
    accountNo: str = Field(min_length=4, max_length=24)
    holder: str
    principal: int = Field(gt=0)
    openingDate: str
    maturityDate: str
    rate: float = 7.0
    status: str = "ACTIVE"
    closedOn: str | None = None
    lienHolder: str | None = None
    autoRenew: bool = False
    product: str = "FD"
    issuedBy: str = "seed"


def _row(d: Deposit) -> tuple:
    return (
        d.ifsc, d.accountNo.upper(), d.holder, d.principal, d.openingDate, d.maturityDate, d.rate, d.status,
        d.closedOn, d.lienHolder, int(d.autoRenew), d.product, d.issuedBy, datetime.now(timezone.utc).isoformat(),
    )


UPSERT = """insert into deposits (ifsc, account_no, holder, principal, opening_date, maturity_date, rate, status,
  closed_on, lien_holder, auto_renew, product, issued_by, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  on conflict (ifsc, account_no) do update set holder=excluded.holder, principal=excluded.principal,
  opening_date=excluded.opening_date, maturity_date=excluded.maturity_date, rate=excluded.rate, status=excluded.status,
  closed_on=excluded.closed_on, lien_holder=excluded.lien_holder, auto_renew=excluded.auto_renew, product=excluded.product,
  issued_by=excluded.issued_by"""


class Load(BaseModel):
    deposits: list[Deposit]
    replace: bool = False


@router.post("/admin/load")
def load(body: Load) -> dict:
    with db() as con:
        if body.replace:
            con.execute("delete from deposits")
            con.execute("delete from consents")
        con.executemany(UPSERT, [_row(d) for d in body.deposits])
        n = con.execute("select count(*) from deposits").fetchone()[0]
    return {"loaded": len(body.deposits), "total": n}


@router.post("/admin/issue")
def issue(d: Deposit) -> dict:
    with db() as con:
        con.execute(UPSERT, _row(d))
    return {"ok": True, "deposit": d.model_dump()}


@router.get("/admin/recent")
def recent(limit: int = 20) -> dict:
    with db() as con:
        rows = con.execute(
            "select * from deposits where issued_by != 'seed' order by created_at desc limit ?", (min(limit, 100),)
        ).fetchall()
        total = con.execute("select count(*) from deposits").fetchone()[0]
    return {"total": total, "recent": [dict(r) for r in rows]}


def _find(ifsc: str, account_no: str):
    with db() as con:
        return con.execute(
            "select * from deposits where ifsc = ? and account_no = ?", (ifsc.upper(), account_no.upper().replace(" ", ""))
        ).fetchone()


def _latency():
    time.sleep(random.uniform(0.25, 0.7))


def _term_deposit(r: sqlite3.Row) -> dict:
    """ReBIT FI schema v1.2 'TERM_DEPOSIT' shaped payload (subset)."""
    opening, maturity = date.fromisoformat(r["opening_date"]), date.fromisoformat(r["maturity_date"])
    years = max(1, round((maturity - opening).days / 365))
    maturity_amount = int(r["principal"] * (1 + r["rate"] / 400) ** (4 * years))
    return {
        "type": "TERM_DEPOSIT",
        "maskedAccNumber": "XXXX" + r["account_no"][-4:],
        "linkedAccRef": r["account_no"],
        "profile": {"holders": {"type": "SINGLE", "holder": [{"name": r["holder"], "nominee": "NOT-REGISTERED"}]}},
        "summary": {
            "branch": r["ifsc"],
            "ifsc": r["ifsc"],
            "openingDate": r["opening_date"],
            "maturityDate": r["maturity_date"],
            "principalAmount": r["principal"],
            "currentValue": r["principal"],
            "maturityAmount": maturity_amount,
            "interestRate": r["rate"],
            "interestComputation": "COMPOUND",
            "compoundingFrequency": "QUARTERLY",
            "tenureDays": (maturity - opening).days,
            "accountType": "FIXED",
            "status": r["status"],
            "closedOn": r["closed_on"],
            "autoRenewal": bool(r["auto_renew"]),
            "lien": {"marked": bool(r["lien_holder"]), "inFavourOf": r["lien_holder"]},
        },
    }


class ConsentReq(BaseModel):
    ifsc: str
    accountNo: str
    fiu: str = "AICTE-NIDHIKAVACH"
    purpose: str = "Verification of security deposit (lien to AICTE)"


@router.post("/aa/consent")
def consent(req: ConsentReq) -> dict:
    _latency()
    bank = req.ifsc[:4].upper()
    if bank not in AA_RAIL:
        raise HTTPException(status_code=422, detail={"code": "FIP_NOT_ON_AA", "message": f"{bank} is not live as an FIP on the AA network"})
    cid = f"CNS-{uuid.uuid4().hex[:12].upper()}"
    with db() as con:
        con.execute(
            "insert into consents values (?,?,?,?,?,?)",
            (cid, req.ifsc.upper(), req.accountNo.upper(), req.fiu, req.purpose, datetime.now(timezone.utc).isoformat()),
        )
    expires = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    return {"consentId": cid, "status": "ACTIVE", "fiTypes": ["TERM_DEPOSIT"], "consentMode": "VIEW", "expiresAt": expires}


class FetchReq(BaseModel):
    consentId: str


@router.post("/aa/fetch")
def fetch(req: FetchReq) -> dict:
    _latency()
    with db() as con:
        c = con.execute("select * from consents where consent_id = ?", (req.consentId,)).fetchone()
    if not c:
        raise HTTPException(status_code=404, detail={"code": "CONSENT_NOT_FOUND"})
    r = _find(c["ifsc"], c["account_no"])
    sid = f"SES-{uuid.uuid4().hex[:10].upper()}"
    if not r:
        return {"sessionId": sid, "found": False, "fipMessage": "No term deposit with this account reference at the branch"}
    return {"sessionId": sid, "found": True, "fi": _term_deposit(r)}


class NeslReq(BaseModel):
    ifsc: str
    instrumentNo: str


@router.post("/nesl/lookup")
def nesl(req: NeslReq) -> dict:
    _latency()
    r = _find(req.ifsc, req.instrumentNo)
    if not r:
        return {"found": False, "message": "No e-instrument registered with NeSL under this number"}
    return {"found": True, "registeredWithNeSL": True, "instrument": _term_deposit(r)}
