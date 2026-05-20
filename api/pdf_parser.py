"""PDF text extraction. pdfplumber for text/tables, PyMuPDF as fallback."""
from __future__ import annotations
from io import BytesIO
import pdfplumber
import fitz  # PyMuPDF
import structlog

log = structlog.get_logger()


def extract_text(pdf_bytes: bytes) -> str:
    """Extract text from a PDF. Tries pdfplumber first, falls back to PyMuPDF."""
    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
        text = "\n\n".join(pages).strip()
        if len(text) > 100:
            log.info("pdf_parsed", parser="pdfplumber", chars=len(text), pages=len(pages))
            return text
        log.info("pdfplumber_thin_output", chars=len(text))
    except Exception as e:
        log.warning("pdfplumber_failed", error=str(e))

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = [page.get_text() for page in doc]
    doc.close()
    text = "\n\n".join(pages).strip()
    log.info("pdf_parsed", parser="pymupdf", chars=len(text), pages=len(pages))
    return text
