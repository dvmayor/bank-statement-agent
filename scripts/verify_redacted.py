import sys, pdfplumber, re
sys.path.insert(0, ".")
from api.tools.extract import extract_transactions

PDF = "samples/CommBank_Statement_2025-12_redacted.pdf"

with pdfplumber.open(PDF) as pdf:
    raw = "".join(p.extract_text() for p in pdf.pages)

# PDF-stated totals
m = re.search(r"([\d,]+\.\d+) CR\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+) CR", raw)
if m:
    opening, total_deb, total_cred, closing = m.groups()
    td = float(total_deb.replace(",",""))
    tc = float(total_cred.replace(",",""))
    print("=== PDF STATED TOTALS ===")
    print(f"  Opening  : {opening}")
    print(f"  Debits   : {total_deb}")
    print(f"  Credits  : {total_cred}")
    print(f"  Closing  : {closing}")
    print(f"  Net      : {round(tc - td, 2)}")
    print()

# App-extracted totals
txs = extract_transactions(raw)
app_deb  = round(sum(float(t.get("debit")  or 0) for t in txs), 2)
app_cred = round(sum(float(t.get("credit") or 0) for t in txs), 2)
app_net  = round(app_cred - app_deb, 2)

print("=== APP EXTRACTED ===")
print(f"  Transactions : {len(txs)}")
print(f"  Debits       : {app_deb}  (PDF: {total_deb})")
print(f"  Credits      : {app_cred}  (PDF: {total_cred})")
print(f"  Net          : {app_net}  (PDF: {round(float(total_cred.replace(',','')) - float(total_deb.replace(',','')), 2)})")
print()

# Credits breakdown
print("=== CREDIT TRANSACTIONS ===")
for t in txs:
    if t.get("credit"):
        print(f"  {t['date']}  ${t['credit']:>10.2f}  {t['description'][:50]}")

# Flag mismatch
if app_deb != float(total_deb.replace(",","")) or app_cred != float(total_cred.replace(",","")):
    print("\n⚠️  MISMATCH between app and PDF totals")
else:
    print("\n✅  Totals match PDF exactly")
