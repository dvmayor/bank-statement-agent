"""FastAPI entrypoint."""
from __future__ import annotations
import json
import logging
import os
import time
import uuid
from contextvars import ContextVar
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import structlog

from api.agent import run_agent, run_agent_events, DEFAULT_MODE
from api.pdf_parser import extract_text
from api.llm import DEFAULT_PROVIDER, PROVIDER_LABELS, PROVIDER_MODELS

# Per-request correlation ID — set by middleware, read by structlog processor and llm logger
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")

load_dotenv()

# ---------------------------------------------------------------------------
# Logging — Option B + Option C
# ---------------------------------------------------------------------------
LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

APP_LOG_PATH = LOG_DIR / "app.log"
ANALYSES_LOG_PATH = LOG_DIR / "analyses.jsonl"

# Stdlib logging: console + rotating file (5 MB × 3 backups)
_handlers: list[logging.Handler] = [
    logging.StreamHandler(),
    RotatingFileHandler(APP_LOG_PATH, maxBytes=5_000_000, backupCount=3, encoding="utf-8"),
]
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(message)s",
    handlers=_handlers,
    force=True,  # override any prior config (matters with uvicorn --reload)
)

def _inject_request_id(logger: object, method: str, event_dict: dict) -> dict:
    rid = request_id_ctx.get("-")
    if rid != "-":
        event_dict["request_id"] = rid
    return event_dict


def _order_log_keys(logger: object, method: str, event_dict: dict) -> dict:
    """Reorder JSON log keys: timestamp → level → request_id → event → everything else."""
    ordered: dict = {}
    for key in ("timestamp", "level", "request_id", "event"):
        if key in event_dict:
            ordered[key] = event_dict.pop(key)
    ordered.update(event_dict)
    return ordered


# Structlog feeds through stdlib so both handlers receive every event
structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=False),
        _inject_request_id,
        _order_log_keys,
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)
log = structlog.get_logger()


def _append_analysis_log(filename: str, provider: str, mode: str, elapsed: float, result: dict) -> None:
    """Append one JSON line per analysis to logs/analyses.jsonl."""
    payload = {
        "ts": datetime.now().isoformat(timespec="seconds"),
        "filename": filename,
        "provider": provider,
        "mode": mode,
        "elapsed_seconds": elapsed,
        "transactions_count": len(result.get("transactions") or []),
        "anomalies_count": len(result.get("anomalies") or []),
        "summary_present": bool(result.get("summary")),
        "result": result,
    }
    try:
        with ANALYSES_LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, default=str) + "\n")
    except Exception as e:
        log.warning("analyses_log_write_failed", error=str(e))


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Bank Statement Agent", version="0.0.3")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    """Generate a UUID for every request and bind it to the logging context."""
    rid = request.headers.get("x-request-id") or str(uuid.uuid4())
    token = request_id_ctx.set(rid)
    try:
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        return response
    finally:
        request_id_ctx.reset(token)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/providers")
def providers() -> dict:
    """List available LLM providers and agent modes for the UI."""
    return {
        "default_provider": DEFAULT_PROVIDER,
        "default_mode": DEFAULT_MODE,
        "providers": [
            {"id": pid, "label": label, "model": PROVIDER_MODELS[pid]}
            for pid, label in PROVIDER_LABELS.items()
        ],
        "modes": [
            {
                "id": "react",
                "label": "ReAct loop (any provider)",
                "description": "Provider-agnostic agent loop. Thinks, calls a tool, observes, repeats.",
            },
            {
                "id": "native",
                "label": "Native tool-use (Claude only)",
                "description": "Uses Anthropic's tool_use API directly. Falls back to ReAct for other providers.",
            },
        ],
    }


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    provider: Literal["gemini", "claude", "groq"] = Form(DEFAULT_PROVIDER),
    mode: Literal["react", "native"] = Form(DEFAULT_MODE),
) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "PDF file required")
    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(413, "PDF too large (max 10 MB)")

    started = time.time()
    raw_text = extract_text(pdf_bytes)
    if len(raw_text) < 50:
        raise HTTPException(422, "Could not extract text from PDF")

    try:
        result = run_agent(raw_text, provider=provider, mode=mode)
    except KeyError as e:
        raise HTTPException(400, f"Missing API key for provider '{provider}': {e}")

    elapsed = round(time.time() - started, 2)
    log.info("analysis_complete", elapsed_s=elapsed, provider=provider, mode=mode,
             tx_count=len(result.get("transactions") or []),
             anomaly_count=len(result.get("anomalies") or []),
             summary_present=bool(result.get("summary")))
    result["metadata"] = {
        "elapsed_seconds": elapsed,
        "filename": file.filename,
        "raw_text_chars": len(raw_text),
        "provider": provider,
        "model": PROVIDER_MODELS[provider],
        "mode": mode,
    }
    _append_analysis_log(file.filename, provider, mode, elapsed, result)
    return result


@app.post("/analyze/stream")
async def analyze_stream(
    file: UploadFile = File(...),
    provider: Literal["gemini", "claude", "groq"] = Form(DEFAULT_PROVIDER),
    mode: Literal["react", "native"] = Form(DEFAULT_MODE),
):
    """SSE-streaming variant of /analyze. Emits one event per agent step,
    plus a final 'result' event with the same payload as POST /analyze."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "PDF file required")
    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(413, "PDF too large (max 10 MB)")

    started = time.time()
    raw_text = extract_text(pdf_bytes)
    if len(raw_text) < 50:
        raise HTTPException(422, "Could not extract text from PDF")

    def event_stream():
        # Bookend with our own pdf_parsed event so the UI shows immediate progress
        yield f"event: pdf_parsed\ndata: {json.dumps({'chars': len(raw_text), 'filename': file.filename})}\n\n"
        last_result = None
        try:
            for ev in run_agent_events(raw_text, provider=provider, mode=mode):
                ev_type = ev["type"]
                if ev_type == "result":
                    # Emit the inner payload directly so the UI can spread it into state
                    result_data = ev.get("data", {})
                    last_result = result_data
                    payload = json.dumps(result_data, default=str)
                else:
                    payload = json.dumps(ev, default=str)
                yield f"event: {ev_type}\ndata: {payload}\n\n"
        except KeyError as e:
            yield f"event: error\ndata: {json.dumps({'error': f'Missing API key: {e}'})}\n\n"
            return
        except Exception as e:
            log.error("stream_unhandled", error=str(e))
            yield f"event: error\ndata: {json.dumps({'error': str(e)[:200]})}\n\n"
            return

        elapsed = round(time.time() - started, 2)
        metadata = {
            "elapsed_seconds": elapsed,
            "filename": file.filename,
            "raw_text_chars": len(raw_text),
            "provider": provider,
            "model": PROVIDER_MODELS[provider],
            "mode": mode,
        }
        if last_result is not None:
            last_result["metadata"] = metadata
            _append_analysis_log(file.filename, provider, mode, elapsed, last_result)
            log.info("analysis_complete", elapsed_s=elapsed, provider=provider, mode=mode,
                     tx_count=len(last_result.get("transactions") or []),
                     anomaly_count=len(last_result.get("anomalies") or []),
                     summary_present=bool(last_result.get("summary")),
                     warnings=last_result.get("warnings") or [])
            yield f"event: done\ndata: {json.dumps({'metadata': metadata})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx/proxy buffering if deployed behind one
        },
    )


@app.get("/evaluate")
def evaluate() -> dict:
    import subprocess
    proc = subprocess.run(
        ["pytest", "tests/", "--tb=short", "-q"],
        capture_output=True,
        text=True,
        timeout=300,
    )
    return {
        "exit_code": proc.returncode,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-2000:],
    }
