"""NidhiKavach sidecar: document AI, mock bank gateway and file storage.

Runs on the shared VM behind Caddy. Every route except /health requires the
shared API key, so only the Next.js app can call it.
"""

import hmac

from fastapi import Depends, FastAPI, Header, HTTPException

from .config import settings

app = FastAPI(title="NidhiKavach sidecar", version="0.1.0", docs_url=None, redoc_url=None)


def require_key(authorization: str = Header(default="")) -> None:
    expected = f"Bearer {settings.api_key}"
    if not settings.api_key or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "nidhikavach-sidecar", "version": app.version}


@app.get("/v1/ping", dependencies=[Depends(require_key)])
def ping() -> dict:
    return {"ok": True}
