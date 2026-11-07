"""Heuristic tamper scan for uploaded FDR scans. Advisory only.

Images (JPEG): error level analysis (ELA). A region pasted onto an already
compressed image re-compresses differently from its surroundings; we
re-save at a fixed quality, measure the difference per block, and flag
blocks that stand far above the page's typical level. Also checks EXIF
editing software.

PDFs: incremental saves (several %%EOF markers), editing tools in the
producer/creator, modification after creation, and unusually many fonts.
"""

from __future__ import annotations

import io
import re
import statistics

from PIL import ExifTags, Image, ImageChops, ImageOps

EDITORS = re.compile(rb"(photoshop|gimp|canva|pixlr|paint\.net|snapseed|ilovepdf|smallpdf|pdfescape|sejda|pdf-xchange|foxit phantom|microsoft.? word|libreoffice)", re.I)
BLOCK = 24


def _finding(kind: str, detail: str, weight: int, box: list[float] | None = None) -> dict:
    return {"kind": kind, "detail": detail, "weight": weight, "box": box}


def analyse_image(data: bytes) -> tuple[list[dict], bytes | None]:
    findings: list[dict] = []
    img = Image.open(io.BytesIO(data))
    fmt = (img.format or "").upper()

    exif = img.getexif() if hasattr(img, "getexif") else {}
    software = str(exif.get(ExifTags.Base.Software, "")) if exif else ""
    if software and EDITORS.search(software.encode()):
        findings.append(_finding("exif_editor", f"Image was saved by editing software ({software})", 35))

    if fmt != "JPEG":
        findings.append(_finding("format", f"{fmt or 'Unknown'} image: lossless, so compression analysis does not apply", 0))
        return findings, None

    rgb = img.convert("RGB")
    w, h = rgb.size
    cols, rows = max(1, w // BLOCK), max(1, h // BLOCK)

    def block_map(q: int) -> list[float]:
        buf = io.BytesIO()
        rgb.save(buf, "JPEG", quality=q)
        diff = ImageChops.difference(rgb, Image.open(io.BytesIO(buf.getvalue()))).convert("L")
        return list(diff.resize((cols, rows), Image.BOX).getdata()), diff

    # JPEG ghost: the page changes least when re-saved at the quality it was last
    # compressed at; a region pasted in later was never at that quality and stands out.
    best = None
    for q in (50, 55, 60, 65, 70, 75, 80):
        blocks, diff = block_map(q)
        med = statistics.median(blocks) or 0.01
        if best is None or med < best[0]:
            best = (med, q, blocks, diff)
    median, q_star, blocks, diff = best
    p95 = sorted(blocks)[int(len(blocks) * 0.95)]
    hot = [(v, i % cols, i // cols) for i, v in enumerate(blocks) if v > max(p95 * 1.6, median * 6, 1.5)]
    if len(hot) >= 3:
        xs = [x for _, x, _ in hot]
        ys = [y for _, _, y in hot]
        span_ok = (max(xs) - min(xs)) <= cols * 0.4 and (max(ys) - min(ys)) <= rows * 0.3
        if span_ok:
            ratio = max(v for v, _, _ in hot) / max(p95, 0.5)
            box = [min(xs) * BLOCK / w, min(ys) * BLOCK / h, (max(xs) - min(xs) + 1) * BLOCK / w, (max(ys) - min(ys) + 1) * BLOCK / h]
            findings.append(
                _finding(
                    "jpeg_ghost",
                    f"One region was not compressed with the rest of the page (page last saved near quality {q_star}; this region stands out {ratio:.1f}x): typical of text pasted onto an existing scan",
                    min(75, int(40 + ratio * 6)),
                    [round(b, 3) for b in box],
                )
            )

    # Heatmap from the ghost difference, normalised to the 99th percentile.
    hist = diff.histogram()
    total, acc, p99 = sum(hist), 0, 1
    for i, c in enumerate(hist):
        acc += c
        if acc >= total * 0.995:
            p99 = max(i, 1)
            break
    amp = diff.point(lambda v: min(255, int(v * 255 / p99)))
    heat = ImageOps.colorize(amp, black=(235, 233, 228), white=(231, 58, 58))
    base = rgb.convert("L").convert("RGB")
    overlay = Image.blend(base, heat, 0.7)
    out = io.BytesIO()
    overlay.save(out, "JPEG", quality=80)
    return findings, out.getvalue()


def analyse_pdf(data: bytes) -> list[dict]:
    findings: list[dict] = []
    eofs = data.count(b"%%EOF")
    if eofs > 1:
        findings.append(_finding("pdf_incremental", f"PDF was saved {eofs} times (incremental updates after it was first produced)", 30))
    meta = b" ".join(re.findall(rb"/(?:Producer|Creator)\s*\(([^)]{0,120})\)", data))
    if meta and EDITORS.search(meta):
        findings.append(_finding("pdf_editor", f"Producer/creator shows an editing tool: {meta.decode('latin-1')[:80]}", 30))
    created = re.search(rb"/CreationDate\s*\(D:(\d{8,14})", data)
    modified = re.search(rb"/ModDate\s*\(D:(\d{8,14})", data)
    if created and modified and modified.group(1)[:12] != created.group(1)[:12]:
        findings.append(_finding("pdf_modified", "PDF was modified after it was created", 20))
    fonts = set(re.findall(rb"/BaseFont\s*/([A-Za-z0-9+_-]+)", data))
    if len(fonts) > 6:
        findings.append(_finding("pdf_fonts", f"{len(fonts)} different fonts embedded: unusual for a bank receipt", 15))
    return findings


def analyse(data: bytes, mime: str) -> dict:
    heatmap = None
    if mime == "application/pdf":
        findings = analyse_pdf(data)
    else:
        findings, heatmap = analyse_image(data)
    score = min(100, sum(f["weight"] for f in findings))
    return {"score": score, "findings": findings, "heatmap": heatmap}
