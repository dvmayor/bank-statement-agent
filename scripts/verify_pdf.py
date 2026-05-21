import sys
sys.path.insert(0, ".")
from api.tools.extract import extract_transactions
import pdfplumber

PDF = "samples/CommBank_Statement_2025-12_clean.pdf"

with pdfplumber.open(PDF) as pdf:
    raw = "".join(p.extract_text() for p in pdf.pages)

txs = extract_transactions(raw)
print(f"Transactions extracted : {len(txs)}")

total_debit  = sum(float(t.get("debit") or 0)  for t in txs)
total_credit = sum(float(t.get("credit") or 0) for t in txs)
net = round(total_credit - total_debit, 2)

print(f"Sum of debits          : {round(total_debit, 2)}  (PDF says 5413.53)")
print(f"Sum of credits         : {round(total_credit, 2)}  (PDF says 4123.23)")
print(f"Net cashflow           : {net}  (expected -1290.30)")
print()
print(f"{'DATE':<12} {'DEBIT':>10} {'CREDIT':>10}  DESCRIPTION")
print("-" * 75)
for t in txs:
    d = str(t.get("debit") or "")
    c = str(t.get("credit") or "")
    print(f"  {t['date']:<10} {d:>10} {c:>10}  {t['description'][:45]}")
