"""Generate 5 synthetic bank statement PDFs covering varied scenarios.

Run:  py -3.12 scripts/generate_sample_pdfs.py
Output: samples/*.pdf
"""
from __future__ import annotations
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

OUT = Path(__file__).parent.parent / "samples"
OUT.mkdir(exist_ok=True)

styles = getSampleStyleSheet()
title_style = ParagraphStyle(
    "title", parent=styles["Title"], fontSize=16, spaceAfter=4, alignment=0,
)
meta_style = ParagraphStyle(
    "meta", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#444444"),
)


def make_pdf(filename: str, bank: str, account: str, period: str, holder: str, rows: list[list[str]]):
    """rows: [Date, Description, Debit, Credit, Balance]"""
    doc = SimpleDocTemplate(
        str(OUT / filename), pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
    )
    story = []
    story.append(Paragraph(bank, title_style))
    story.append(Paragraph("Account Statement", meta_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<b>Account Holder:</b> {holder}", meta_style))
    story.append(Paragraph(f"<b>Account Number:</b> {account}", meta_style))
    story.append(Paragraph(f"<b>Statement Period:</b> {period}", meta_style))
    story.append(Spacer(1, 12))

    header = ["Date", "Description", "Debit", "Credit", "Balance"]
    data = [header] + rows

    table = Table(data, colWidths=[22 * mm, 80 * mm, 25 * mm, 25 * mm, 28 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (2, 0), (4, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cccccc")),
    ]))
    story.append(table)
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "This is a synthetic statement generated for testing the Bank Statement Agent. "
        "No real personal or financial information is contained herein.",
        meta_style,
    ))
    doc.build(story)
    print(f"  [ok] {filename}")


# ---------------------------------------------------------------------------
# Sample 1 — Clean SG personal statement (DBS-style)
# ---------------------------------------------------------------------------
sample_1 = [
    ["01/05/2026", "Opening Balance", "", "", "3,450.20"],
    ["02/05/2026", "SALARY CREDIT - ACME PTE LTD", "", "8,500.00", "11,950.20"],
    ["03/05/2026", "NTUC FAIRPRICE", "84.30", "", "11,865.90"],
    ["04/05/2026", "GRAB FOOD SG", "18.40", "", "11,847.50"],
    ["05/05/2026", "SP GROUP UTILITIES", "152.80", "", "11,694.70"],
    ["07/05/2026", "GRAB TRANSPORT", "14.20", "", "11,680.50"],
    ["08/05/2026", "NETFLIX SUBSCRIPTION", "19.98", "", "11,660.52"],
    ["10/05/2026", "SINGTEL MOBILE", "62.00", "", "11,598.52"],
    ["12/05/2026", "KOPITIAM LUNCH", "8.50", "", "11,590.02"],
    ["14/05/2026", "SHOPEE ORDER", "127.40", "", "11,462.62"],
    ["16/05/2026", "WATSONS PHARMACY", "42.80", "", "11,419.82"],
    ["18/05/2026", "GRAB FOOD SG", "22.60", "", "11,397.22"],
    ["20/05/2026", "ATM CASH WITHDRAWAL", "300.00", "", "11,097.22"],
    ["22/05/2026", "STARBUCKS", "7.80", "", "11,089.42"],
    ["25/05/2026", "PAYNOW TRANSFER - J.LIM", "150.00", "", "10,939.42"],
    ["28/05/2026", "SPOTIFY PREMIUM", "10.98", "", "10,928.44"],
    ["30/05/2026", "Closing Balance", "", "", "10,928.44"],
]
make_pdf(
    "01_clean_personal_sg.pdf",
    bank="DBS BANK SINGAPORE",
    account="XXXX-XXXX-1234",
    period="01 May 2026 to 31 May 2026",
    holder="JANE TAN",
    rows=sample_1,
)

# ---------------------------------------------------------------------------
# Sample 2 — Statement with anomalies (duplicates, large debit, round-number)
# ---------------------------------------------------------------------------
sample_2 = [
    ["01/04/2026", "Opening Balance", "", "", "5,200.50"],
    ["02/04/2026", "SALARY CREDIT - ACME PTE LTD", "", "8,500.00", "13,700.50"],
    ["03/04/2026", "GRAB FOOD SG", "24.50", "", "13,676.00"],
    ["05/04/2026", "NTUC FAIRPRICE", "128.40", "", "13,547.60"],
    ["07/04/2026", "SP GROUP UTILITIES", "145.20", "", "13,402.40"],
    ["08/04/2026", "NETFLIX SUBSCRIPTION", "19.98", "", "13,382.42"],
    ["10/04/2026", "GRAB TRANSPORT", "12.30", "", "13,370.12"],
    ["12/04/2026", "SHOPEE ORDER", "245.00", "", "13,125.12"],
    ["14/04/2026", "ATM CASH WITHDRAWAL", "500.00", "", "12,625.12"],
    ["15/04/2026", "SINGTEL MOBILE", "62.00", "", "12,563.12"],
    ["17/04/2026", "GRAB FOOD SG", "24.50", "", "12,538.62"],   # duplicate of 03/04
    ["18/04/2026", "PAYNOW TRANSFER - J. TAN", "300.00", "", "12,238.62"],
    ["20/04/2026", "AMAZON SG", "187.40", "", "12,051.22"],
    ["22/04/2026", "WATSONS PHARMACY", "34.80", "", "12,016.42"],
    ["25/04/2026", "UNKNOWN MERCHANT XYZ-7741", "5,200.00", "", "6,816.42"],   # large debit
    ["26/04/2026", "ROUND-NUM TRANSFER", "2,000.00", "", "4,816.42"],   # round-number
    ["27/04/2026", "SPOTIFY PREMIUM", "10.98", "", "4,805.44"],
    ["28/04/2026", "KOPITIAM LUNCH", "8.50", "", "4,796.94"],
    ["30/04/2026", "Closing Balance", "", "", "4,796.94"],
]
make_pdf(
    "02_anomalies_sg.pdf",
    bank="UOB BANK SINGAPORE",
    account="XXXX-XXXX-5678",
    period="01 Apr 2026 to 30 Apr 2026",
    holder="DRUVIN GOH",
    rows=sample_2,
)

# ---------------------------------------------------------------------------
# Sample 3 — AU statement (NAB-style)
# ---------------------------------------------------------------------------
sample_3 = [
    ["01/03/2026", "Opening Balance", "", "", "1,820.00"],
    ["03/03/2026", "PAYROLL - SOUTHBANK ANALYTICS", "", "6,200.00", "8,020.00"],
    ["04/03/2026", "WOOLWORTHS METRO", "94.30", "", "7,925.70"],
    ["05/03/2026", "OPAL TOP UP - SYDNEY TRAINS", "40.00", "", "7,885.70"],
    ["06/03/2026", "TELSTRA POSTPAID", "85.00", "", "7,800.70"],
    ["08/03/2026", "UBER EATS", "28.40", "", "7,772.30"],
    ["09/03/2026", "BWS LIQUOR STORE", "42.00", "", "7,730.30"],
    ["10/03/2026", "COLES SUPERMARKET", "118.60", "", "7,611.70"],
    ["12/03/2026", "AGL ENERGY", "143.20", "", "7,468.50"],
    ["14/03/2026", "NETFLIX AU", "16.99", "", "7,451.51"],
    ["15/03/2026", "ATM WITHDRAWAL - CBA", "200.00", "", "7,251.51"],
    ["17/03/2026", "BUNNINGS WAREHOUSE", "67.40", "", "7,184.11"],
    ["19/03/2026", "MEDIBANK PRIVATE", "180.00", "", "7,004.11"],
    ["21/03/2026", "OSKO TRANSFER - M.WONG", "350.00", "", "6,654.11"],
    ["23/03/2026", "JB HI-FI", "229.00", "", "6,425.11"],
    ["25/03/2026", "DAN MURPHY'S", "58.00", "", "6,367.11"],
    ["27/03/2026", "SPOTIFY", "12.99", "", "6,354.12"],
    ["29/03/2026", "MYER DEPT STORE", "184.50", "", "6,169.62"],
    ["31/03/2026", "Closing Balance", "", "", "6,169.62"],
]
make_pdf(
    "03_au_statement.pdf",
    bank="NATIONAL AUSTRALIA BANK",
    account="XXX-XXX-9012",
    period="01 Mar 2026 to 31 Mar 2026",
    holder="ALEX CHEN",
    rows=sample_3,
)

# ---------------------------------------------------------------------------
# Sample 4 — Multi-currency (SGD with USD entries marked)
# ---------------------------------------------------------------------------
sample_4 = [
    ["01/06/2026", "Opening Balance", "", "", "12,400.00"],
    ["02/06/2026", "SALARY CREDIT - FINTECH CO", "", "9,800.00", "22,200.00"],
    ["03/06/2026", "NTUC FAIRPRICE", "112.40", "", "22,087.60"],
    ["04/06/2026", "AMAZON.COM (USD 89.99 @ 1.36)", "122.39", "", "21,965.21"],
    ["05/06/2026", "APPLE STORE SG", "1,899.00", "", "20,066.21"],
    ["06/06/2026", "GRAB FOOD SG", "32.50", "", "20,033.71"],
    ["08/06/2026", "AIRBNB (USD 240.00 @ 1.36)", "326.40", "", "19,707.31"],
    ["09/06/2026", "STARBUCKS", "8.20", "", "19,699.11"],
    ["10/06/2026", "STARHUB BROADBAND", "78.00", "", "19,621.11"],
    ["12/06/2026", "UDEMY (USD 19.99 @ 1.36)", "27.19", "", "19,593.92"],
    ["14/06/2026", "SHOPEE ORDER", "186.40", "", "19,407.52"],
    ["15/06/2026", "FX TRANSFER OUT - WISE", "2,500.00", "", "16,907.52"],
    ["17/06/2026", "GRAB TRANSPORT", "18.60", "", "16,888.92"],
    ["19/06/2026", "NETFLIX (USD 15.49 @ 1.36)", "21.07", "", "16,867.85"],
    ["21/06/2026", "DBS CREDIT CARD PAYMENT", "1,420.00", "", "15,447.85"],
    ["24/06/2026", "AIA INSURANCE PREMIUM", "320.00", "", "15,127.85"],
    ["28/06/2026", "PAYNOW TRANSFER", "500.00", "", "14,627.85"],
    ["30/06/2026", "Closing Balance", "", "", "14,627.85"],
]
make_pdf(
    "04_multi_currency.pdf",
    bank="OCBC BANK SINGAPORE",
    account="XXXX-XXXX-3456",
    period="01 Jun 2026 to 30 Jun 2026",
    holder="SAMUEL LIM",
    rows=sample_4,
)

# ---------------------------------------------------------------------------
# Sample 5 — Heavy/realistic statement (~35 transactions, varied)
# ---------------------------------------------------------------------------
sample_5 = [
    ["01/02/2026", "Opening Balance", "", "", "2,180.40"],
    ["02/02/2026", "SALARY CREDIT - TECH STARTUP PL", "", "7,200.00", "9,380.40"],
    ["02/02/2026", "FOODPANDA", "21.30", "", "9,359.10"],
    ["03/02/2026", "NTUC FAIRPRICE", "62.80", "", "9,296.30"],
    ["03/02/2026", "STARBUCKS", "6.40", "", "9,289.90"],
    ["04/02/2026", "GRAB TRANSPORT", "12.80", "", "9,277.10"],
    ["04/02/2026", "GRAB FOOD SG", "18.20", "", "9,258.90"],
    ["05/02/2026", "SHELL PETROL", "65.00", "", "9,193.90"],
    ["06/02/2026", "SP GROUP UTILITIES", "138.60", "", "9,055.30"],
    ["07/02/2026", "SINGTEL MOBILE", "55.00", "", "9,000.30"],
    ["07/02/2026", "DELIVEROO", "28.40", "", "8,971.90"],
    ["08/02/2026", "GOLDEN VILLAGE CINEMAS", "32.00", "", "8,939.90"],
    ["09/02/2026", "UNIQLO ORCHARD", "129.00", "", "8,810.90"],
    ["10/02/2026", "GRAB FOOD SG", "24.60", "", "8,786.30"],
    ["11/02/2026", "COLD STORAGE", "84.20", "", "8,702.10"],
    ["12/02/2026", "NETFLIX SUBSCRIPTION", "19.98", "", "8,682.12"],
    ["13/02/2026", "GIRO PAYMENT - AIA INSURANCE", "165.00", "", "8,517.12"],
    ["14/02/2026", "KOPITIAM LUNCH", "9.20", "", "8,507.92"],
    ["15/02/2026", "SHOPEE ORDER", "76.40", "", "8,431.52"],
    ["16/02/2026", "GRAB TRANSPORT", "14.80", "", "8,416.72"],
    ["17/02/2026", "WATSONS PHARMACY", "32.40", "", "8,384.32"],
    ["18/02/2026", "ATM CASH WITHDRAWAL", "400.00", "", "7,984.32"],
    ["19/02/2026", "PAYNOW TRANSFER - L.NG", "200.00", "", "7,784.32"],
    ["20/02/2026", "SHENG SIONG", "48.60", "", "7,735.72"],
    ["21/02/2026", "GRAB FOOD SG", "26.40", "", "7,709.32"],
    ["22/02/2026", "STARBUCKS", "7.20", "", "7,702.12"],
    ["23/02/2026", "LAZADA SG", "142.00", "", "7,560.12"],
    ["24/02/2026", "RAFFLES MEDICAL", "85.00", "", "7,475.12"],
    ["25/02/2026", "SPOTIFY PREMIUM", "10.98", "", "7,464.14"],
    ["26/02/2026", "STARHUB BROADBAND", "58.00", "", "7,406.14"],
    ["27/02/2026", "GRAB FOOD SG", "22.40", "", "7,383.74"],
    ["28/02/2026", "GIRO PAYMENT - GREAT EASTERN", "210.00", "", "7,173.74"],
    ["28/02/2026", "PAYNOW TRANSFER - PARENTS", "1,000.00", "", "6,173.74"],
    ["28/02/2026", "Closing Balance", "", "", "6,173.74"],
]
make_pdf(
    "05_heavy_realistic.pdf",
    bank="DBS BANK SINGAPORE",
    account="XXXX-XXXX-7890",
    period="01 Feb 2026 to 28 Feb 2026",
    holder="PRIYA NAIR",
    rows=sample_5,
)

print(f"\nDone. {len(list(OUT.glob('*.pdf')))} PDFs in {OUT}")
