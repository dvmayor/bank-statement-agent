"""Agent orchestrator.

Two execution modes:
  - "react"  — provider-agnostic ReAct loop (default)
  - "native" — Anthropic tool_use API (Claude only; others fall back to react)

Both are exposed as event-emitting generators (run_agent_events) so the API
can stream progress via SSE. A blocking helper run_agent() collects the events
and returns the final result for non-streaming callers.

Tool failures are tolerated: if a tool persistently fails the loop continues
with sensible defaults so downstream tools can still produce output. All
warnings are surfaced in result.metadata.warnings.
"""
from __future__ import annotations
import json
import math
import os
from typing import Iterator, Literal
import structlog
from api.llm import complete, complete_json, Provider, DEFAULT_PROVIDER
from api.tools import (
    ALL_TOOL_SCHEMAS, TOOL_HANDLERS,
    extract_transactions, categorise_transactions, detect_anomalies, generate_summary,
    validate_extraction,
)

log = structlog.get_logger()

Mode = Literal["react", "native"]
DEFAULT_MODE: Mode = "react"
MAX_ITERATIONS = 10


# ---------------------------------------------------------------------------
# Event helpers
# ---------------------------------------------------------------------------

def _event(type_: str, **payload) -> dict:
    return {"type": type_, **payload}


# ---------------------------------------------------------------------------
# ReAct loop — provider-agnostic, event-emitting
# ---------------------------------------------------------------------------

_REACT_SYSTEM = """You are a bank statement analysis agent.

Your goal: produce a complete analysis (transactions, categories, anomalies, summary)
OR explain clearly why you cannot.

Available tools:
  - extract_transactions     — parse PDF text into structured rows
  - validate_extraction      — inspect quality of extracted transactions (cheap, no LLM)
  - categorise_transactions  — assign spending category to each transaction
  - detect_anomalies         — flag unusual transactions (rule-based)
  - generate_summary         — write final monthly summary

The system maintains state — you don't pass data between tools, just call them.

Reasoning guidance:
- After extract_transactions, you SHOULD call validate_extraction to assess quality.
- If validate reports status="empty", do NOT continue — call finish with a clear
  error_message ("The PDF appears to be a scanned image or has no readable text").
- If status="sparse" (< 3 transactions), you MAY skip detect_anomalies — it
  needs more data to be meaningful.
- If status="poor_quality", you MAY retry extract_transactions once.
- If a tool returns an ERROR observation, reason about whether to retry,
  skip, or abort. Don't retry blindly.
- generate_summary should be your last tool before finish.

Response format — EXACTLY ONE JSON object per turn, no prose, no markdown fences:
  Tool call:  {"action": "call_tool", "tool": "<name>", "thought": "<one sentence reasoning>"}
  Finish OK:  {"action": "finish", "thought": "<one sentence>"}
  Finish err: {"action": "finish", "thought": "<one sentence>", "error_message": "<user-facing explanation>"}
"""


def _execute_tool(tool_name: str, state: dict, provider: Provider) -> str:
    """Execute a tool against shared state. Returns a brief observation string."""
    if tool_name == "extract_transactions":
        state["transactions"] = extract_transactions(state["raw_text"], provider=provider)
        return f"OK. Extracted {len(state['transactions'])} transactions."
    if tool_name == "validate_extraction":
        result = validate_extraction(state["transactions"])
        return f"OK. {json.dumps(result)}"
    if tool_name == "categorise_transactions":
        if not state["transactions"]:
            return "ERROR: no transactions in state. Call extract_transactions first."
        state["transactions"] = categorise_transactions(state["transactions"], provider=provider)
        return f"OK. Categorised {len(state['transactions'])} transactions."
    if tool_name == "detect_anomalies":
        if not state["transactions"]:
            return "ERROR: no transactions in state. Call extract_transactions first."
        state["anomalies"] = detect_anomalies(state["transactions"], provider=provider)
        return f"OK. Detected {len(state['anomalies'])} anomalies."
    if tool_name == "generate_summary":
        if not state["transactions"]:
            return "ERROR: no transactions in state."
        state["summary"] = generate_summary(state["transactions"], state["anomalies"], provider=provider)
        net = state["summary"].get("net_cashflow")
        return f"OK. Generated summary. Net cashflow: {net}."
    return f"ERROR: unknown tool '{tool_name}'."


def _build_react_prompt(raw_text: str, history: list[dict]) -> str:
    preview = raw_text[:400].replace("\n", " ")
    parts = [
        f"Bank statement raw text (preview): {preview}{'...' if len(raw_text) > 400 else ''}",
        f"Full text length: {len(raw_text)} characters.",
        "",
        "=== Agent loop history ===" if history else "(No prior actions — pick your first tool.)",
    ]
    for turn in history:
        if turn["type"] == "action":
            parts.append(f"ACTION: {turn['content']}")
        else:
            parts.append(f"OBSERVATION: {turn['content']}")
    parts.append("")
    parts.append("What is your next action? Respond with one JSON object.")
    return "\n".join(parts)


def _tool_llm_calls(tools_called: set[str], tx_count: int) -> int:
    """Infer how many LLM calls the tools made internally.

    - extract_transactions:    1 call
    - categorise_transactions: 1 call per chunk (chunk_size = CATEGORISE_CHUNK_SIZE)
    - detect_anomalies:        1 call
    - generate_summary:        1 call
    """
    chunk_size = int(os.getenv("CATEGORISE_CHUNK_SIZE", "100"))
    counts = {
        "extract_transactions": 1,
        "categorise_transactions": math.ceil(tx_count / chunk_size) if tx_count else 1,
        "detect_anomalies": 1,
        "generate_summary": 1,
    }
    return sum(counts[t] for t in tools_called if t in counts)


def _run_react_events(raw_text: str, provider: Provider) -> Iterator[dict]:
    """ReAct loop as a generator. Yields event dicts; last event is type=result."""
    state = {"transactions": [], "anomalies": [], "summary": {}, "raw_text": raw_text}
    history: list[dict] = []
    warnings: list[str] = []

    # Counters for the summary line
    decision_llm_calls = 0
    tool_calls_count = 0
    tools_called: set[str] = set()

    yield _event("agent_start", provider=provider, mode="react", max_iterations=MAX_ITERATIONS)

    finished_cleanly = False
    for iteration in range(MAX_ITERATIONS):
        yield _event("iteration_start", iteration=iteration + 1)
        log.info("react_iteration", iteration=iteration, provider=provider, history_len=len(history))

        try:
            response_text = complete_json(
                prompt=_build_react_prompt(raw_text, history),
                system=_REACT_SYSTEM,
                provider=provider,
                max_tokens=300,
            )
            decision_llm_calls += 1
        except Exception as e:
            log.error("react_llm_error", error=str(e))
            warnings.append(f"agent_llm_failed: {type(e).__name__}: {str(e)[:200]}")
            yield _event("error", scope="react_decision", error=str(e)[:200])
            break

        response_text = response_text.strip()
        if not response_text.startswith("{"):
            start, end = response_text.find("{"), response_text.rfind("}")
            if start != -1 and end != -1:
                response_text = response_text[start:end + 1]

        try:
            action = json.loads(response_text)
        except json.JSONDecodeError:
            log.warning("react_invalid_json", response=response_text[:200])
            yield _event("warning", scope="invalid_json", text=response_text[:200])
            history.append({"type": "action", "content": response_text[:200]})
            history.append({"type": "observation", "content": "ERROR: response was not valid JSON. Reply with EXACTLY one JSON object."})
            continue

        thought = action.get("thought", "")
        history.append({"type": "action", "content": json.dumps(action)})

        if action.get("action") == "finish":
            if thought:
                yield _event("thought", iteration=iteration + 1, text=thought)
            err_msg = action.get("error_message")
            if err_msg:
                warnings.append(f"agent_aborted: {err_msg}")
                yield _event("error", scope="agent_decision", error=err_msg)
            finished_cleanly = True
            break

        if action.get("action") == "call_tool":
            tool_name = action.get("tool", "")
            if thought:
                yield _event("thought", iteration=iteration + 1, text=thought)
            yield _event("tool_call", iteration=iteration + 1, tool=tool_name)
            tool_calls_count += 1
            tools_called.add(tool_name)

            try:
                observation = _execute_tool(tool_name, state, provider)
                yield _event("tool_done", iteration=iteration + 1, tool=tool_name, observation=observation)
                history.append({"type": "observation", "content": observation})
            except Exception as e:
                log.error("react_tool_exception", tool=tool_name, error=str(e))
                warnings.append(f"tool_failed: {tool_name}: {type(e).__name__}")
                err_obs = f"ERROR: tool {tool_name} raised {type(e).__name__}: {str(e)[:200]}"
                yield _event("tool_error", iteration=iteration + 1, tool=tool_name, error=str(e)[:200])
                history.append({"type": "observation", "content": err_obs})
        else:
            yield _event("warning", scope="unknown_action", text=str(action))
            history.append({"type": "observation", "content": "ERROR: 'action' must be 'call_tool' or 'finish'."})

    if not finished_cleanly:
        warnings.append("loop_terminated_without_finish_signal")

    # Graceful degradation: ensure result has all top-level keys even if tools failed
    _apply_defaults(state, warnings, provider)

    # Emit run stats, then finish
    tx_count = len(state.get("transactions") or [])
    total_llm = decision_llm_calls + _tool_llm_calls(tools_called, tx_count)
    rag_calls = tx_count  # find_similar called once per transaction in categorise
    yield _event("stats", llm_calls=total_llm, tool_calls=tool_calls_count, rag_calls=rag_calls)
    yield _event("finish")

    yield _event("result", data={
        "transactions": state["transactions"],
        "anomalies": state["anomalies"],
        "summary": state["summary"],
        "warnings": warnings,
    })


# ---------------------------------------------------------------------------
# Claude native tool-use loop — also event-emitting
# ---------------------------------------------------------------------------

_CLAUDE_NATIVE_SYSTEM = """You are a bank statement analysis agent.

Your job: take raw PDF-extracted text and produce a complete analysis.

You MUST call tools in this order:
1. extract_transactions
2. categorise_transactions
3. detect_anomalies
4. generate_summary

Rules:
- Never invent, round, or modify transaction amounts.
- After the summary tool returns, reply with a final JSON object:
  {"transactions": [...], "anomalies": [...], "summary": {...}}
- No prose outside the final JSON.
"""


def _run_claude_native_events(raw_text: str) -> Iterator[dict]:
    from anthropic import Anthropic
    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    messages = [{"role": "user", "content": f"Statement raw text:\n\n{raw_text}"}]
    state = {"transactions": [], "anomalies": [], "summary": {}}
    warnings: list[str] = []

    native_llm_calls = 0
    tool_calls_count = 0
    tools_called: set[str] = set()

    yield _event("agent_start", provider="claude", mode="native", max_iterations=MAX_ITERATIONS)

    for iteration in range(MAX_ITERATIONS):
        yield _event("iteration_start", iteration=iteration + 1)
        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=_CLAUDE_NATIVE_SYSTEM,
                tools=ALL_TOOL_SCHEMAS,
                messages=messages,
            )
        except Exception as e:
            log.error("claude_native_llm_error", error=str(e))
            warnings.append(f"agent_llm_failed: {type(e).__name__}")
            yield _event("error", scope="native_call", error=str(e)[:200])
            break

        native_llm_calls += 1

        if response.stop_reason == "end_turn":
            for block in response.content:
                if block.type == "text":
                    text = block.text.strip()
                    if text.startswith("```"):
                        text = text.split("```")[1].lstrip("json").strip()
                    try:
                        final = json.loads(text)
                        # Merge LLM-returned final into state (state wins if discrepancy)
                        for k in ("transactions", "anomalies", "summary"):
                            if not state[k] and final.get(k):
                                state[k] = final[k]
                    except json.JSONDecodeError:
                        pass
            break

        if response.stop_reason != "tool_use":
            warnings.append(f"unexpected_stop_reason: {response.stop_reason}")
            yield _event("warning", scope="stop_reason", text=str(response.stop_reason))
            break

        messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            yield _event("tool_call", iteration=iteration + 1, tool=block.name)
            tool_calls_count += 1
            tools_called.add(block.name)
            handler = TOOL_HANDLERS.get(block.name)
            if handler is None:
                yield _event("tool_error", tool=block.name, error="unknown tool")
                tool_results.append({"type": "tool_result", "tool_use_id": block.id,
                                     "content": f"Unknown tool: {block.name}", "is_error": True})
                continue
            try:
                kwargs = {**block.input, "provider": "claude"}
                result = handler(**kwargs)
                if block.name in ("extract_transactions", "categorise_transactions"):
                    state["transactions"] = result
                    obs = f"OK. {len(result)} transactions."
                elif block.name == "detect_anomalies":
                    state["anomalies"] = result
                    obs = f"OK. {len(result)} anomalies."
                elif block.name == "generate_summary":
                    state["summary"] = result
                    obs = f"OK. Net cashflow: {result.get('net_cashflow')}."
                else:
                    obs = "OK."
                yield _event("tool_done", iteration=iteration + 1, tool=block.name, observation=obs)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id,
                                     "content": json.dumps(result, default=str)})
            except Exception as e:
                log.error("claude_native_tool_failed", tool=block.name, error=str(e))
                warnings.append(f"tool_failed: {block.name}: {type(e).__name__}")
                yield _event("tool_error", iteration=iteration + 1, tool=block.name, error=str(e)[:200])
                tool_results.append({"type": "tool_result", "tool_use_id": block.id,
                                     "content": f"Tool error: {e}", "is_error": True})
        messages.append({"role": "user", "content": tool_results})

    _apply_defaults(state, warnings, "claude")

    tx_count = len(state.get("transactions") or [])
    total_llm = native_llm_calls + _tool_llm_calls(tools_called, tx_count)
    rag_calls = tx_count
    yield _event("stats", llm_calls=total_llm, tool_calls=tool_calls_count, rag_calls=rag_calls)
    yield _event("finish")

    yield _event("result", data={
        "transactions": state["transactions"],
        "anomalies": state["anomalies"],
        "summary": state["summary"],
        "warnings": warnings,
    })


# ---------------------------------------------------------------------------
# Graceful degradation
# ---------------------------------------------------------------------------

def _apply_defaults(state: dict, warnings: list[str], provider: Provider) -> None:
    """Ensure the result has usable shape even if some tools failed.

    If categorise failed → fill missing categories with "Other".
    If anomalies failed  → empty list.
    If summary failed    → compute basic aggregates from whatever transactions exist.
    """
    # Categories default
    fixed = 0
    for tx in state.get("transactions") or []:
        if not tx.get("category"):
            tx["category"] = "Other"
            tx["category_reasoning"] = "Default — categorisation step did not complete."
            fixed += 1
    if fixed:
        warnings.append(f"categories_defaulted: {fixed}")

    # Summary default — compute minimal aggregates if missing
    if not state.get("summary"):
        warnings.append("summary_defaulted")
        txs = state.get("transactions") or []
        total_credits = sum(tx.get("credit") or 0 for tx in txs)
        total_debits = sum(tx.get("debit") or 0 for tx in txs)
        dates = sorted([tx.get("date") for tx in txs if tx.get("date")])
        state["summary"] = {
            "period_start": dates[0] if dates else None,
            "period_end": dates[-1] if dates else None,
            "total_credits": round(total_credits, 2),
            "total_debits": round(total_debits, 2),
            "net_cashflow": round(total_credits - total_debits, 2),
            "top_categories": [],
            "anomaly_count": len(state.get("anomalies") or []),
            "narrative": "Summary narrative unavailable — the summary step did not complete. Cashflow totals computed from raw transactions.",
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_agent_events(
    raw_text: str,
    provider: Provider = DEFAULT_PROVIDER,
    mode: Mode = DEFAULT_MODE,
) -> Iterator[dict]:
    """Stream agent execution as events. Last event is always type=result."""
    if mode == "native" and provider != "claude":
        log.warning("native_mode_unsupported", provider=provider, falling_back_to="react")
        yield from _run_react_events(raw_text, provider)
        return
    if mode == "native":
        yield from _run_claude_native_events(raw_text)
        return
    yield from _run_react_events(raw_text, provider)


def run_agent(
    raw_text: str,
    provider: Provider = DEFAULT_PROVIDER,
    mode: Mode = DEFAULT_MODE,
) -> dict:
    """Blocking version: drain the event stream and return the final result dict."""
    final: dict = {"transactions": [], "anomalies": [], "summary": {}, "warnings": []}
    for event in run_agent_events(raw_text, provider, mode):
        if event["type"] == "result":
            final = event["data"]
    return final
