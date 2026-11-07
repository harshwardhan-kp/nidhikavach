"""NidhiKavach sidecar: document storage, synthetic scan rendering, and (P2)
document AI + mock bank gateway.

Runs on the shared VM behind Caddy. Server-to-server routes need the shared
API key; browser routes (upload / download) need a short-lived token signed
by the Next.js app.
"""

import hmac

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from . import specimen, storage, tokens
from .config import settings

app = FastAPI(title="NidhiKavach sidecar", version="0.2.0", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
    max_age=600,
)

FRAME_ANCESTORS = " ".join(o.strip() for o in settings.allowed_origins.split(",") if o.strip())


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


# ------------------------------------------------------------------ files --


@app.post("/v1/files/upload")
async def upload(token: str = Query(...), file: UploadFile = File(...)) -> dict:
    """Browser upload with a 'put' token. Validates size and file type by content, not by name."""
    claims = tokens.verify(token, "put")
    limit = min(int(claims.get("max", settings.max_upload_bytes)), settings.max_upload_bytes)
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"file larger than {limit // (1024 * 1024)} MB")
    mime = storage.sniff(data[:16])
    if mime is None:
        raise HTTPException(status_code=415, detail="only PDF, PNG or JPEG files are accepted")
    if storage.path_for(claims["key"]).exists():
        raise HTTPException(status_code=409, detail="already uploaded")
    return storage.write_atomic(claims["key"], data)


@app.get("/v1/files/get")
def get_file(token: str = Query(...)) -> Response:
    """Inline download with a 'get' token (valid a few minutes)."""
    claims = tokens.verify(token, "get")
    p = storage.path_for(claims["key"])
    if not p.exists():
        raise HTTPException(status_code=404, detail="not found")
    data = p.read_bytes()
    mime = storage.sniff(data[:16]) or "application/octet-stream"
    name = claims.get("name") or p.name
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": f'inline; filename="{name}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": f"default-src 'none'; frame-ancestors {FRAME_ANCESTORS}",
        },
    )


@app.get("/v1/files/meta", dependencies=[Depends(require_key)])
def file_meta(key: str = Query(...)) -> dict:
    return storage.meta(key)


class SpecimenRequest(BaseModel):
    key: str
    spec: dict


@app.post("/v1/specimen/render", dependencies=[Depends(require_key)])
def render_specimen(req: SpecimenRequest) -> dict:
    """Renders a synthetic FDR scan once and stores it; later calls return the stored file's metadata."""
    if not req.key.startswith("specimen/"):
        raise HTTPException(status_code=400, detail="specimen keys only")
    existing = storage.meta(req.key)
    if existing.get("exists"):
        return existing
    return storage.write_atomic(req.key, specimen.render(req.spec))
