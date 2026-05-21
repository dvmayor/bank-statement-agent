import sys, pdfplumber, re
sys.path.insert(0, ".")
from dotenv import load_dotenv
load_dotenv()
from api.tools.extract import extract_transactions

PDF = "samples/ANZ-bank-statement-sample.pdf"

with pdfplumber.open(PDF) as pdf:
    raw = "".join(p.extract_text() for p in pdf.pages)

# Try to find PDF-stated totals
totals = re.findall(r'Total[^\d]*([\d,]+\.\d{2})', raw, re.IGNORECASE)
print("=== RAW TOTALS FOUND IN PDF ===")
for t in totals[:8]:
    print(" ", t)
print()

# App extraction
txs = extract_transactions(raw)
app_deb  = round(sum(float(t.get("debit")  or 0) for t in txs), 2)
app_cred = round(sum(float(t.get("credit") or 0) for t in txs), 2)
app_net  = round(app_cred - app_deb, 2)

print("=== APP EXTRACTED ===")
print(f"  Transactions : {len(txs)}")
print(f"  Debits       : {app_deb}")
print(f"  Credits      : {app_cred}")
print(f"  Net          : {app_net}")
print()
print(f"{'DATE':<12} {'DEBIT':>10} {'CREDIT':>10}  DESCRIPTION")
print("-" * 75)
for t in txs:
    d = str(t.get("debit") or "")
    c = str(t.get("credit") or "")
    print(f"  {t.get('date',''):<10} {d:>10} {c:>10}  {t.get('description','')[:45]}")
