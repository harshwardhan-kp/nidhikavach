"""Document storage on local disk. Keys look like 'uploads/<uuid>.pdf' or 'specimen/FDR-26-04187.png'."""

import hashlib
import os
import re
from pathlib import Path

from fastapi import HTTPException

from .config import settings

KEY_RE = re.compile(r"^(uploads|specimen|orders|derived)/[A-Za-z0-9._-]{1,120}$")

MAGIC = {
    "application/pdf": [b"%PDF-"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
}


def path_for(key: str) -> Path:
    if not KEY_RE.match(key) or ".." in key:
        raise HTTPException(status_code=400, detail="bad key")
    return Path(settings.files_dir) / key


def sniff(head: bytes) -> str | None:
    for mime, sigs in MAGIC.items():
        if any(head.startswith(s) for s in sigs):
            return mime
    return None


def meta(key: str) -> dict:
    p = path_for(key)
    if not p.exists():
        return {"key": key, "exists": False}
    data = p.read_bytes()
    return {
        "key": key,
        "exists": True,
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "mime": sniff(data[:16]) or "application/octet-stream",
    }


def write_atomic(key: str, data: bytes) -> dict:
    p = path_for(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".part")
    tmp.write_bytes(data)
    os.replace(tmp, p)
    return {"key": key, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(), "mime": sniff(data[:16])}
