"""Short-lived signed tokens issued by the Next.js app (HMAC-SHA256).

Format: base64url(json payload) + "." + base64url(hmac(payload_b64)).
Payload: {"op": "get" | "put", "key": str, "exp": unix_seconds, ...}
"""

import base64
import hashlib
import hmac
import json
import time

from fastapi import HTTPException

from .config import settings


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify(token: str, op: str) -> dict:
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=401, detail="bad token")
    expected = hmac.new(settings.url_signing_key.encode(), body.encode(), hashlib.sha256).digest()
    if not settings.url_signing_key or not hmac.compare_digest(expected, _b64d(sig)):
        raise HTTPException(status_code=401, detail="bad signature")
    payload = json.loads(_b64d(body))
    if payload.get("op") != op:
        raise HTTPException(status_code=401, detail="wrong operation")
    if int(payload.get("exp", 0)) < time.time():
        raise HTTPException(status_code=401, detail="token expired")
    return payload
