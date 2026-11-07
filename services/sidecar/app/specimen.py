"""Renders synthetic FDR receipt scans for the seeded dataset.

These are generic, fictional layouts (no bank logos or real templates) and
every image carries a "SPECIMEN · SYNTHETIC" watermark. Variants:
  clean        normal scan
  forged       the amount has been pasted over a patch (what a tamper scan should catch)
  low_quality  blurred, skewed phone photo
  lien_other   lien printed in favour of someone other than AICTE
"""

from __future__ import annotations

import hashlib
import io
import random
from datetime import date

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1500, 1020
FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/truetype/liberation2", "/usr/share/fonts/truetype/liberation"]


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for d in FONT_DIRS:
        try:
            return ImageFont.truetype(f"{d}/{name}", size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def serif(size: int, bold: bool = False):
    return _font("LiberationSerif-Bold.ttf" if bold else "LiberationSerif-Regular.ttf", size)


def sans(size: int, bold: bool = False):
    return _font("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size)


def mono(size: int):
    return _font("DejaVuSansMono.ttf", size)


ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
        "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n: int) -> str:
    return ONES[n] if n < 20 else (TENS[n // 10] + (" " + ONES[n % 10] if n % 10 else ""))


def rupees_in_words(n: int) -> str:
    """Indian numbering: 2500000 -> 'Twenty Five Lakh'."""
    if n == 0:
        return "Zero"
    parts = []
    for div, name in ((10**7, "Crore"), (10**5, "Lakh"), (1000, "Thousand"), (100, "Hundred")):
        if n >= div:
            parts.append(f"{_two(n // div) if div != 10**7 else rupees_in_words(n // div)} {name}")
            n %= div
    if n:
        parts.append(_two(n))
    return " ".join(parts)


def inr(n: int) -> str:
    s = str(n)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ",".join(groups) + "," + tail


def dmy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def render(spec: dict) -> bytes:
    seed = int(hashlib.sha256(spec.get("caseNo", "x").encode()).hexdigest()[:8], 16)
    rnd = random.Random(seed)
    variant = spec.get("variant", "clean")

    paper = (247, 244, 236)
    img = Image.new("RGB", (W, H), paper)
    d = ImageDraw.Draw(img)
    ink = (28, 32, 48)
    accent = rnd.choice([(22, 64, 120), (120, 30, 40), (20, 90, 70), (90, 50, 120)])

    # Guilloche-like security background lines.
    for i in range(0, W, 7):
        d.line([(i, 140), (i + 60, H - 90)], fill=(236, 232, 222), width=1)

    # Border and header band.
    d.rectangle([24, 24, W - 24, H - 24], outline=accent, width=4)
    d.rectangle([36, 36, W - 36, H - 36], outline=accent, width=1)
    d.rectangle([36, 36, W - 36, 132], fill=accent)
    bank = spec.get("bank", "Bank")
    d.text((64, 52), bank.upper(), font=serif(40, True), fill=(255, 255, 255))
    d.text((64, 100), f"{spec.get('branch', '')} Branch  ·  IFSC {spec.get('ifsc', '')}", font=sans(20), fill=(230, 235, 245))

    d.text((W // 2, 168), "FIXED DEPOSIT RECEIPT", font=serif(38, True), fill=ink, anchor="mm")
    d.text((W // 2, 206), "(Non-transferable · Not a negotiable instrument)", font=serif(20), fill=(90, 90, 100), anchor="mm")

    amount = int(spec.get("amountRupees", 0))
    years = int(spec.get("tenureYears") or 1)
    rate = round(6.25 + rnd.random() * 1.25, 2)
    maturity_value = int(amount * (1 + rate / 400) ** (4 * years))

    rows = [
        ("Receipt No.", spec.get("instrumentNo", "")),
        ("Depositor", spec.get("depositor", "")),
        ("Date of Deposit", dmy(spec.get("issueDate", "2000-01-01"))),
        ("Period", f"{years} year{'s' if years != 1 else ''}"),
        ("Rate of Interest", f"{rate:.2f}% p.a. (compounded quarterly)"),
        ("Due Date of Maturity", dmy(spec.get("maturityDate", "2000-01-01"))),
        ("Maturity Value", f"Rs. {inr(maturity_value)}.00"),
        ("Auto Renewal", "Yes" if spec.get("autoRenew") else "No"),
    ]
    y = 250
    label_font, value_font = sans(22), mono(26)
    for label, value in rows:
        d.text((90, y), label, font=label_font, fill=(80, 80, 95))
        d.text((420, y - 2), str(value), font=value_font, fill=ink)
        d.line([(420, y + 32), (1100, y + 32)], fill=(205, 200, 190), width=1)
        y += 56

    # Amount box (figures and words).
    box = (1140, 250, W - 70, 440)
    d.rectangle(box, outline=ink, width=2)
    d.text((box[0] + 18, box[1] + 14), "PRINCIPAL AMOUNT", font=sans(18, True), fill=(80, 80, 95))
    amount_xy = (box[0] + 18, box[1] + 56)
    # A forged receipt starts life as a genuine one for the true (smaller) amount;
    # the inflated figure is pasted on afterwards (see the end of render()).
    printed = int(spec.get("originalAmountRupees") or amount // 10) if variant == "forged" else amount
    d.text(amount_xy, f"Rs. {inr(printed)}.00", font=mono(25), fill=ink)
    words = f"Rupees {rupees_in_words(printed)} Only"
    wy = box[1] + 110
    line = ""
    for word in words.split():
        if d.textlength(line + " " + word, font=serif(20)) > box[2] - box[0] - 36:
            d.text((box[0] + 18, wy), line.strip(), font=serif(20), fill=ink)
            wy += 26
            line = ""
        line += " " + word
    d.text((box[0] + 18, wy), line.strip(), font=serif(20), fill=ink)

    # Lien clause.
    lien = spec.get("lien", "")
    d.rectangle([90, 730, W - 70, 800], outline=(150, 140, 120), width=1)
    d.text((110, 745), "LIEN MARKED IN FAVOUR OF:", font=sans(18, True), fill=(80, 80, 95))
    d.text((430, 742), lien, font=serif(26, True), fill=ink)

    # Signature, stamp, footer.
    d.line([(1100, 900), (1400, 900)], fill=ink, width=1)
    d.text((1250, 912), "Authorised Signatory", font=sans(17), fill=(80, 80, 95), anchor="ma")
    sx, sy = 1180 + rnd.randint(-10, 10), 830
    d.line([(sx, sy + 50), (sx + 40, sy + 20), (sx + 80, sy + 60), (sx + 130, sy + 25), (sx + 190, sy + 55)], fill=(30, 40, 110), width=3)
    cx, cy = 200, 880
    d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], outline=(accent[0], accent[1], accent[2]), width=3)
    d.text((cx, cy - 12), bank.split()[0].upper()[:10], font=sans(16, True), fill=accent, anchor="mm")
    d.text((cx, cy + 14), dmy(spec.get("issueDate", "2000-01-01")), font=sans(14), fill=accent, anchor="mm")
    d.text((W // 2, H - 52), f"Ref {spec.get('caseNo', '')}  ·  This receipt is generated for the NidhiKavach prototype and has no value.",
           font=sans(15), fill=(120, 120, 130), anchor="mm")

    # Watermark.
    wm = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wm)
    wd.text((W // 2, H // 2), "SPECIMEN · SYNTHETIC", font=sans(110, True), fill=(231, 58, 58, 46), anchor="mm")
    wm = wm.rotate(18, resample=Image.BICUBIC, center=(W // 2, H // 2))
    img = Image.alpha_composite(img.convert("RGBA"), wm).convert("RGB")

    # Scanner / camera feel.
    if variant == "low_quality":
        img = img.rotate(rnd.uniform(-3.5, 3.5), resample=Image.BICUBIC, expand=False, fillcolor=(60, 60, 60))
        img = img.filter(ImageFilter.GaussianBlur(1.6))
        img = Image.eval(img, lambda v: int(v * 0.86))
    else:
        img = img.rotate(rnd.uniform(-0.6, 0.6), resample=Image.BICUBIC, expand=False, fillcolor=paper)
    noise = Image.effect_noise((W // 2, H // 2), 9).convert("RGB").resize((W, H))
    img = Image.blend(img, noise, 0.035)

    if variant == "forged":
        # The "original scan" as the bank issued it...
        first = io.BytesIO()
        img.save(first, format="JPEG", quality=58)
        img = Image.open(io.BytesIO(first.getvalue())).convert("RGB")
        # ...then the amount is covered with a clean patch and retyped in a slightly different face.
        d = ImageDraw.Draw(img)
        f = sans(25, True)
        text = f"Rs. {inr(amount)}.00"
        tw = d.textlength(text, font=f)
        d.rectangle([amount_xy[0] - 6, amount_xy[1] - 6, amount_xy[0] + max(tw, 250) + 8, amount_xy[1] + 40], fill=(249, 246, 239))
        d.text(amount_xy, text, font=f, fill=(18, 18, 18))
        words_top = box[1] + 106
        d.rectangle([box[0] + 14, words_top, box[2] - 10, words_top + 58], fill=(249, 246, 239))
        d.text((box[0] + 18, words_top + 4), f"Rupees {rupees_in_words(amount)} Only"[:34], font=serif(19), fill=ink)

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=88)
    return out.getvalue()


if __name__ == "__main__":  # quick local preview: python -m app.specimen out.jpg
    import sys

    sample = {
        "variant": sys.argv[2] if len(sys.argv) > 2 else "clean",
        "caseNo": "FDR-26-04187", "bank": "State Bank of India", "branch": "Sitabuldi", "ifsc": "SBIN0001234",
        "instrumentNo": "34521880145", "depositor": "Deccan Plateau Polytechnic, Nagpur", "amountRupees": 1000000,
        "issueDate": "2023-12-22", "maturityDate": "2026-12-22", "lien": "Member Secretary, AICTE, New Delhi",
        "autoRenew": False, "tenureYears": 3,
    }
    open(sys.argv[1] if len(sys.argv) > 1 else "specimen.jpg", "wb").write(render(sample))
    print(date.today(), "written")
