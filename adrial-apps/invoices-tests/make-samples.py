"""Make fictional sample invoices for testing the Invoices app.

    python3 make-samples.py <out-dir>          # 6 representative invoices
    python3 make-samples.py <out-dir> --year   # a year of invoices (about 60) for the dashboard

Every vendor here is invented and every PDF says "Sample document for testing".
"""
import os
import sys
from datetime import date, timedelta

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("Sans", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("Sans-Bold", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))

BUYER = ["Adrialvallis d.o.o.", "Dunajska cesta 5, 1000 Ljubljana", "ID za DDV: SI87654321"]


def eur(v, lang="sl", cur="EUR"):
    if lang == "sl":
        s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return s + " €" if cur == "EUR" else s + " " + cur
    sym = {"USD": "$", "GBP": "£", "EUR": "€"}[cur]
    return f"{sym}{v:,.2f}"


def d_sl(d):
    return d.strftime("%d.%m.%Y")


def d_en(d):
    return d.strftime("%B %-d, %Y")


def invoice_sl(path, vendor, addr, taxid, number, issued, due, items, rate=22, extra_rates=None, note=None):
    c = canvas.Canvas(path, pagesize=A4)
    w, h = A4
    y = h - 60
    c.setFont("Sans-Bold", 15)
    c.drawString(50, y, vendor)
    c.setFont("Sans-Bold", 20)
    c.drawRightString(w - 50, y, "RAČUN")
    c.setFont("Sans", 9.5)
    c.drawString(50, y - 18, addr)
    c.drawRightString(w - 50, y - 18, f"Račun št.: {number}")
    c.drawString(50, y - 32, f"ID za DDV: {taxid}")
    c.drawRightString(w - 50, y - 32, f"Datum računa: {d_sl(issued)}")
    c.drawString(50, y - 46, "Matična št.: 1234567000")
    c.drawRightString(w - 50, y - 46, f"Rok plačila: {d_sl(due)}")
    y -= 90
    c.setFont("Sans-Bold", 9.5)
    c.drawString(50, y, "Kupec:")
    c.setFont("Sans", 9.5)
    for i, line in enumerate(BUYER):
        c.drawString(50, y - 14 * (i + 1), line)
    y -= 90
    c.setFont("Sans-Bold", 9)
    for x, t, right in [(50, "Opis", False), (330, "Količina", True), (410, "Cena", True), (460, "DDV %", True), (w - 50, "Znesek", True)]:
        (c.drawRightString if right else c.drawString)(x, y, t)
    c.line(50, y - 6, w - 50, y - 6)
    c.setFont("Sans", 9.5)
    net = 0.0
    for desc, qty, price, r in items:
        y -= 20
        amount = round(qty * price, 2)
        net += amount
        c.drawString(50, y, desc)
        c.drawRightString(330, y, f"{qty:g}")
        c.drawRightString(410, y, eur(price).replace(" €", ""))
        c.drawRightString(460, y, f"{r:g} %")
        c.drawRightString(w - 50, y, eur(amount).replace(" €", ""))
    net = round(net, 2)
    y -= 40
    rows = []
    if extra_rates:
        total = 0.0
        for r, base in extra_rates:
            v = round(base * r / 100, 2)
            rows.append((f"DDV {str(r).replace('.', ',')} %   osnova {eur(base)}", eur(v)))
            total += base + v
        total = round(total, 2)
    else:
        vat = round(net * rate / 100, 2)
        total = round(net + vat, 2)
        rows.append(("Skupaj brez DDV", eur(net)))
        rows.append((f"DDV {rate} %", eur(vat)))
    for label, val in rows:
        c.drawString(320, y, label)
        c.drawRightString(w - 50, y, val)
        y -= 16
    c.setFont("Sans-Bold", 11)
    c.drawString(320, y - 4, "Za plačilo")
    c.drawRightString(w - 50, y - 4, eur(total))
    c.setFont("Sans", 8.5)
    c.drawString(50, 110, f"TRR: SI56 0201 0001 2345 678   Sklic: SI00 {number}")
    if note:
        c.drawString(50, 96, note)
    c.drawString(50, 60, "Sample document for testing — fictional company.")
    c.save()
    return total


def invoice_en(path, vendor, addr, number, issued, due, items, cur="USD", vat_rate=None, reverse=False, taxline=None):
    c = canvas.Canvas(path, pagesize=A4)
    w, h = A4
    y = h - 60
    c.setFont("Sans-Bold", 20)
    c.drawString(50, y, "Invoice")
    c.setFont("Sans", 9.5)
    c.drawString(50, y - 26, "Invoice number")
    c.drawString(150, y - 26, number)
    c.drawString(50, y - 40, "Date of issue")
    c.drawString(150, y - 40, d_en(issued))
    c.drawString(50, y - 54, "Date due")
    c.drawString(150, y - 54, d_en(due))
    y -= 90
    c.setFont("Sans-Bold", 10)
    c.drawString(50, y, vendor)
    c.drawString(320, y, "Bill to")
    c.setFont("Sans", 9.5)
    c.drawString(50, y - 14, addr)
    if taxline:
        c.drawString(50, y - 28, taxline)
    c.drawString(320, y - 14, "Adrialvallis d.o.o.")
    c.drawString(320, y - 28, "Ljubljana, Slovenia")
    c.drawString(320, y - 42, "SI VAT SI87654321")
    y -= 80
    c.setFont("Sans-Bold", 9)
    c.drawString(50, y, "Description")
    c.drawRightString(380, y, "Qty")
    c.drawRightString(460, y, "Unit price")
    c.drawRightString(w - 50, y, "Amount")
    c.line(50, y - 6, w - 50, y - 6)
    c.setFont("Sans", 9.5)
    sub = 0.0
    for desc, qty, price in items:
        y -= 20
        amount = round(qty * price, 2)
        sub += amount
        c.drawString(50, y, desc)
        c.drawRightString(380, y, f"{qty:g}")
        c.drawRightString(460, y, eur(price, "en", cur))
        c.drawRightString(w - 50, y, eur(amount, "en", cur))
    sub = round(sub, 2)
    vat = round(sub * vat_rate / 100, 2) if vat_rate else 0.0
    total = round(sub + vat, 2)
    y -= 40
    c.drawString(330, y, "Subtotal")
    c.drawRightString(w - 50, y, eur(sub, "en", cur))
    if vat_rate:
        y -= 16
        c.drawString(330, y, f"VAT ({vat_rate}%)")
        c.drawRightString(w - 50, y, eur(vat, "en", cur))
    y -= 16
    c.drawString(330, y, "Total")
    c.drawRightString(w - 50, y, eur(total, "en", cur))
    y -= 20
    c.setFont("Sans-Bold", 11)
    c.drawString(330, y, "Amount due")
    c.drawRightString(w - 50, y, f"{eur(total, 'en', cur)} {cur}")
    c.setFont("Sans", 8.5)
    if reverse:
        c.drawString(50, 96, "Tax to be paid on reverse charge basis.")
    c.drawString(50, 60, "Sample document for testing — fictional company.")
    c.save()
    return total


def scanned(path, text_lines):
    """An image-only PDF (no text layer), like a phone scan."""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (1240, 1754), "white")
    dr = ImageDraw.Draw(img)
    font = ImageFont.truetype(os.path.join(FONT_DIR, "DejaVuSans.ttf"), 30)
    bold = ImageFont.truetype(os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf"), 38)
    y = 120
    for i, line in enumerate(text_lines):
        dr.text((110, y), line, fill=(20, 20, 20), font=bold if i == 0 else font)
        y += 62 if i == 0 else 50
    png = path + ".png"
    img.save(png)
    c = canvas.Canvas(path, pagesize=A4)
    c.drawImage(png, 0, 0, width=A4[0], height=A4[1])
    c.save()
    os.remove(png)


def showcase(out):
    invoice_sl(os.path.join(out, "studio-lipa-2026-0142.pdf"), "Studio Lipa d.o.o.", "Trubarjeva cesta 12, 1000 Ljubljana",
               "SI12345678", "2026-0142", date(2026, 10, 2), date(2026, 10, 16),
               [("Oblikovanje spletne strani", 1, 1200.00, 22), ("Gostovanje (12 mesecev)", 1, 180.00, 22)])
    invoice_sl(os.path.join(out, "lumen-telecom-september.pdf"), "Lumen Telecom d.d.", "Cigaletova ulica 9, 1000 Ljubljana",
               "SI55667788", "3001-2026-0918822", date(2026, 10, 3), date(2026, 10, 18),
               [("Mobilna telefonija", 1, 24.58, 22), ("Internet in optika", 1, 29.51, 22)])
    invoice_en(os.path.join(out, "nimbus-cloud-oct.pdf"), "Nimbus Cloud, Inc.", "548 Market St, San Francisco, CA 94104",
               "NC-48213-0010", date(2026, 10, 1), date(2026, 10, 1), [("Team plan — monthly subscription", 1, 49.00)],
               cur="USD", reverse=True)
    invoice_sl(os.path.join(out, "sever-gorivo.pdf"), "Bencinski servis Sever d.o.o.", "Celovška cesta 280, 1000 Ljubljana",
               "SI24681357", "0123-45-678901", date(2026, 9, 28), date(2026, 9, 28),
               [("Bencin 95 (42,10 L)", 1, 62.69, 22), ("Kava", 1, 2.20, 9.5)], extra_rates=[(22, 51.39), (9.5, 2.01)])
    invoice_en(os.path.join(out, "brightline-ba-2026-311.pdf"), "Brightline Analytics Ltd", "12 Fenchurch Street, London EC3M 3BY",
               "BA-2026-311", date(2026, 9, 14), date(2026, 10, 14), [("Dashboard consulting, hours", 4, 100.00)],
               cur="GBP", vat_rate=20, taxline="VAT Reg No. GB123456789")
    scanned(os.path.join(out, "scanned-receipt.pdf"),
            ["Mojster Marko s.p.", "Račun št. R-77/2026", "Datum izdaje: 05.10.2026", "Popravilo klimatske naprave",
             "Za plačilo: 250,00 EUR", "Ni zavezanec za DDV po 94. členu ZDDV-1", "", "Sample document for testing."])


def year(out):
    """About 60 invoices across January–October 2026."""
    n = 0
    for m in range(1, 11):
        d = date(2026, m, 3)
        invoice_sl(os.path.join(out, f"lumen-{m:02d}.pdf"), "Lumen Telecom d.d.", "Cigaletova ulica 9, 1000 Ljubljana",
                   "SI55667788", f"3001-2026-{m:02d}1882", d, d + timedelta(days=15),
                   [("Mobilna telefonija", 1, 24.58 + m * 0.4, 22), ("Internet in optika", 1, 29.51, 22)])
        invoice_sl(os.path.join(out, f"pisarna-{m:02d}.pdf"), "Pisarna Center d.o.o.", "Dunajska cesta 160, 1000 Ljubljana",
                   "SI33445566", f"N-{m:02d}/2026", date(2026, m, 1), date(2026, m, 10),
                   [("Najemnina pisarne", 1, 850.00, 22), ("Obratovalni stroški", 1, 95.00 + (m % 3) * 12, 22)])
        invoice_sl(os.path.join(out, f"bilanca-{m:02d}.pdf"), "Računovodstvo Bilanca d.o.o.", "Slovenska cesta 40, 1000 Ljubljana",
                   "SI77889900", f"2026-{m:03d}", date(2026, m, 5), date(2026, m, 20),
                   [("Računovodske storitve", 1, 180.00, 22)])
        invoice_en(os.path.join(out, f"nimbus-{m:02d}.pdf"), "Nimbus Cloud, Inc.", "548 Market St, San Francisco, CA 94104",
                   f"NC-48213-{m:04d}", date(2026, m, 1), date(2026, m, 1), [("Team plan — monthly subscription", 1, 49.00)],
                   cur="USD", reverse=True)
        for k in range(1 + (m % 3)):
            day = 6 + k * 9
            fuel = 48 + (m * 7 + k * 13) % 30
            base22 = round(fuel / 1.22, 2)
            invoice_sl(os.path.join(out, f"sever-{m:02d}-{k}.pdf"), "Bencinski servis Sever d.o.o.", "Celovška cesta 280, 1000 Ljubljana",
                       "SI24681357", f"0123-{m:02d}-{k}0091", date(2026, m, day), date(2026, m, day),
                       [("Gorivo", 1, base22, 22)])
        n += 4
    invoice_sl(os.path.join(out, "studio-lipa-03.pdf"), "Studio Lipa d.o.o.", "Trubarjeva cesta 12, 1000 Ljubljana",
               "SI12345678", "2026-0031", date(2026, 3, 12), date(2026, 3, 26), [("Nova celostna podoba", 1, 2400.00, 22)])
    invoice_sl(os.path.join(out, "studio-lipa-10.pdf"), "Studio Lipa d.o.o.", "Trubarjeva cesta 12, 1000 Ljubljana",
               "SI12345678", "2026-0142", date(2026, 10, 2), date(2026, 10, 16),
               [("Oblikovanje spletne strani", 1, 1200.00, 22), ("Gostovanje (12 mesecev)", 1, 180.00, 22)])
    invoice_sl(os.path.join(out, "racunalniki-06.pdf"), "Tehno Tir d.o.o.", "Leskoškova cesta 9, 1000 Ljubljana",
               "SI99001122", "MP-2026-0612", date(2026, 6, 18), date(2026, 7, 2), [("Prenosnik 14\" (laptop)", 1, 1390.00, 22), ("Monitor 27\"", 1, 289.00, 22)])
    invoice_en(os.path.join(out, "brightline-09.pdf"), "Brightline Analytics Ltd", "12 Fenchurch Street, London EC3M 3BY",
               "BA-2026-311", date(2026, 9, 14), date(2026, 10, 14), [("Dashboard consulting, hours", 4, 100.00)],
               cur="GBP", vat_rate=20, taxline="VAT Reg No. GB123456789")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "samples")
    os.makedirs(out, exist_ok=True)
    (year if "--year" in sys.argv else showcase)(out)
    print("wrote", len([f for f in os.listdir(out) if f.endswith(".pdf")]), "PDFs to", out)
