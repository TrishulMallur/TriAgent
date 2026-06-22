"""
Triagent — Backend
FastAPI server for AI orchestration, audit logging, and document processing.

Run: uvicorn main:app --reload --port 8000
"""
import os
import json
import logging
import sqlite3
import uuid
import threading
import time
from datetime import datetime
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from typing import Any, AsyncGenerator, Dict, List, Optional
import anthropic
try:
    import openai as _openai_module
except ImportError:  # pragma: no cover — openai is in requirements.txt
    _openai_module = None
import httpx

logger = logging.getLogger("triagent.backend")
logging.basicConfig(level=logging.INFO)

# Module-level constants. Keep these one-liners so future tweaks stay trivial.
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB cap on uploaded files (/api/documents/extract-text).

# ------------------------------------------------------------
# LLM Proxy configuration (Phase A: per-user-key proxy endpoints)
# ------------------------------------------------------------
# The Gemini SDK stores its configured api_key in `genai` module globals.
# Under Railway concurrency two simultaneous requests would race on that
# shared state, so we serialise the entire configure-then-call window.
_GEMINI_SDK_LOCK = threading.Lock()

# Cap user-requested max_tokens so a runaway client can't burn Railway
# minutes or explode their upstream bill on a single call.
LLM_PROXY_MAX_OUTPUT_TOKENS = 4096
# Per-call timeout (seconds) applied to every upstream provider request.
LLM_PROXY_TIMEOUT_SECONDS = 120
# OpenRouter requires HTTP-Referer and X-Title on every request, else
# they throttle / reject. Sensible defaults for production + local dev.
_OPENROUTER_HTTP_REFERER = os.getenv(
    "OPENROUTER_HTTP_REFERER", "https://triagent.app"
)
_OPENROUTER_TITLE = os.getenv("OPENROUTER_TITLE", "TriAgent")

app = FastAPI(
    title="Triagent — AI Document Triage Backend",
    version="2.0.0",
    description="AI triage agent for regulated document operations — backend API.",
)

# CORS — env-driven so Railway/production deployments can whitelist the Vercel URL.
# Set ALLOWED_ORIGINS as a comma-separated list (e.g. "https://wsimple.vercel.app,https://www.example.com").
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://localhost:5174,http://localhost:5175"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# AUTH — shared-secret middleware (X-API-Key header vs BACKEND_API_KEY env)
# ============================================================
# Behaviour:
#   1. If BACKEND_API_KEY env var is unset or empty string, auth is DISABLED and
#      every request passes through. A one-time warning is logged at startup so
#      operators notice. This preserves the local-dev and demo workflow.
#   2. If BACKEND_API_KEY is set, every protected route requires the request to
#      carry an `X-API-Key` header whose value matches exactly. Mismatch returns 401.
# Apply via `Depends(require_api_key)` on state-changing or AI-calling routes.
# Pure GETs and /api/health stay open by design.
_BACKEND_API_KEY = os.getenv("BACKEND_API_KEY", "").strip()
if not _BACKEND_API_KEY:
    logger.warning(
        "BACKEND_API_KEY is unset or empty. Shared-secret auth is DISABLED. "
        "Set BACKEND_API_KEY in the environment to enforce X-API-Key on /api/* routes."
    )


def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    """FastAPI dependency. Validates X-API-Key against BACKEND_API_KEY env var.

    No-op when BACKEND_API_KEY is unset (local dev). Otherwise 401 on mismatch.
    """
    if not _BACKEND_API_KEY:
        return  # Auth disabled, see startup warning.
    if not x_api_key or x_api_key != _BACKEND_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header.")

# ============================================================
# RATE LIMITING — in-memory, per-client sliding window
# ============================================================
# The shared secret (X-API-Key) ships inside the public frontend bundle, so it
# cannot keep a determined caller out. To bound abuse of the expensive
# LLM-proxy and document-extraction endpoints (DoS, anonymising relay) we add a
# dependency-free, per-IP sliding-window limiter. Per-process and best-effort by
# design — fine for a demo; swap for a shared store (e.g. Redis) if this ever
# runs multi-worker behind real traffic.
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))
_RATE_WINDOW_SECONDS = 60.0
_rate_lock = threading.Lock()
_rate_hits: Dict[str, List[float]] = {}


def _client_ip(request: Request) -> str:
    """Best-effort client IP. Railway terminates TLS at a proxy, so the real
    caller is the first hop in X-Forwarded-For; fall back to the socket peer.

    X-Forwarded-For is client-spoofable, so this limiter raises the cost of
    abuse rather than guaranteeing per-identity fairness — acceptable for a demo.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request) -> None:
    """FastAPI dependency. Allows RATE_LIMIT_PER_MINUTE requests per client IP
    per rolling 60s window; returns 429 once the window is full. No-op when the
    limit is set to 0 or below (RATE_LIMIT_PER_MINUTE env var)."""
    if RATE_LIMIT_PER_MINUTE <= 0:
        return
    now = time.monotonic()
    cutoff = now - _RATE_WINDOW_SECONDS
    ip = _client_ip(request)
    with _rate_lock:
        hits = _rate_hits.get(ip)
        if hits is None:
            hits = []
            _rate_hits[ip] = hits
        # Drop timestamps that fell outside the rolling window.
        fresh = sum(1 for ts in hits if ts > cutoff)
        if fresh != len(hits):
            del hits[: len(hits) - fresh]
        if len(hits) >= RATE_LIMIT_PER_MINUTE:
            retry_after = max(1, int(hits[0] + _RATE_WINDOW_SECONDS - now))
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded · {RATE_LIMIT_PER_MINUTE} requests/min. Retry in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )
        hits.append(now)

# ============================================================
# AI CLIENTS — keys live server-side only, never exposed to browser
# ============================================================
_ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
_GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
_AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini")  # gemini | claude

claude_client = anthropic.Anthropic(api_key=_ANTHROPIC_KEY) if _ANTHROPIC_KEY else None


def call_ai(system_prompt: str, user_message: str, max_tokens: int = 4096) -> str:
    """Route an AI call to Gemini or Claude based on server-side env config."""
    if _AI_PROVIDER == "gemini" and _GEMINI_KEY:
        import google.generativeai as genai
        genai.configure(api_key=_GEMINI_KEY)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=system_prompt,
        )
        response = model.generate_content(
            user_message,
            generation_config={"max_output_tokens": max_tokens},
        )
        return response.text

    if claude_client:
        response = claude_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    raise HTTPException(
        status_code=503,
        detail="No AI provider configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in backend/.env",
    )

# ============================================================
# DATABASE
# ============================================================
# Use Railway persistent volume if mounted, otherwise fall back to ephemeral storage.
_VOLUME_MOUNT = "/data"
_DB_DIR = _VOLUME_MOUNT if os.path.isdir(_VOLUME_MOUNT) else "."
DB_PATH = os.path.join(_DB_DIR, "audit.db")

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                user_role TEXT NOT NULL,
                module TEXT NOT NULL,
                document_id TEXT NOT NULL,
                action TEXT NOT NULL,
                ai_verdict TEXT,
                human_decision TEXT,
                override_reason TEXT,
                metadata TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                module TEXT NOT NULL,
                document_id TEXT NOT NULL,
                input_text TEXT,
                ai_response TEXT,
                verdict TEXT,
                risk_score INTEGER,
                status TEXT DEFAULT 'pending',
                reviewed_by TEXT,
                override_reason TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exceptions (
                id TEXT PRIMARY KEY,
                transfer_id TEXT,
                client_id TEXT,
                rejection_code TEXT,
                rejection_reason TEXT,
                status TEXT DEFAULT 'pending_diagnosis',
                diagnosis TEXT,
                email_draft TEXT,
                reviewed_by TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        # LLM proxy audit log (Phase A). Every call through /api/llm/* writes
        # one row. No PII, no keys, no prompt content — only the dimensions
        # useful for traffic accounting: which provider/model the visitor
        # routed to, token counts, and user-agent. `ok` flags whether the
        # upstream provider returned a successful response.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS llm_proxy_log (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                user_agent TEXT,
                tokens_in INTEGER,
                tokens_out INTEGER,
                ok INTEGER NOT NULL,
                error_code TEXT
            )
        """)
    print("Database initialized")

init_db()

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

# ============================================================
# MODELS
# ============================================================
class AdvisorNoteRequest(BaseModel):
    note_text: str
    advisor_id: str = "usr_002"

class TransferValidationRequest(BaseModel):
    document_text: str
    agent_id: str = "usr_001"

class TransferExtractionRequest(BaseModel):
    document_text: str
    agent_id: str = "usr_001"

class ExceptionDiagnosisRequest(BaseModel):
    exception_id: str
    rejection_code: str
    rejection_reason: str
    client_profile: dict
    transfer_details: dict

class ReviewDecisionRequest(BaseModel):
    decision: str  # approve, reject, escalate, override
    reason: Optional[str] = None
    reviewed_by: str = "usr_001"

class AuditLogEntry(BaseModel):
    user_id: str
    user_name: str
    user_role: str
    module: str
    document_id: str
    action: str
    ai_verdict: Optional[str] = None
    human_decision: Optional[str] = None
    override_reason: Optional[str] = None
    metadata: Optional[dict] = None

class AnalyzeRequest(BaseModel):
    system_prompt: str
    user_message: str
    max_tokens: int = 4096

# ============================================================
# ROUTES — Health
# ============================================================
@app.get("/api/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat(), "version": "2.0.0",
            "provider": _AI_PROVIDER}

# ============================================================
# ROUTES — Generic AI proxy (used by frontend backend-provider)
# ============================================================
@app.post("/api/analyze", dependencies=[Depends(require_api_key)])
def analyze(req: AnalyzeRequest):
    """Generic AI proxy — receives system_prompt + user_message, returns raw AI text.
    The API key never leaves the server."""
    try:
        result = call_ai(req.system_prompt, req.user_message, req.max_tokens)
        return {"result": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# LLM PROXY — per-user-key passthrough to Claude / OpenAI / OpenRouter / Gemini
# ============================================================
# Design:
#   - The visitor pastes *their own* provider key in the TriAgent frontend,
#     which arrives here in `X-User-API-Key`.
#   - We NEVER log, cache, or persist that key. It lives only for the
#     duration of one request, scoped to the per-request SDK client.
#   - Backend auth (BACKEND_API_KEY / X-API-Key) is required in addition,
#     so an anonymous internet user cannot use Railway as a free proxy.
#   - Every call — success or failure — writes one row to llm_proxy_log
#     with no PII.
#   - `max_tokens` is capped at LLM_PROXY_MAX_OUTPUT_TOKENS server-side.
#   - The Gemini branch acquires `_GEMINI_SDK_LOCK` because google-generativeai
#     mutates module-global state on `genai.configure()`; under worker
#     concurrency the next request would see the previous request's key.


class LLMProxyRequest(BaseModel):
    """Request shape for /api/llm/{claude,openai,openrouter,gemini}."""
    messages: List[Dict[str, Any]]
    model: str
    system: Optional[str] = None
    stream: Optional[bool] = False
    max_tokens: Optional[int] = None

    @field_validator("messages")
    @classmethod
    def _messages_required(cls, v: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not v:
            raise ValueError("messages must contain at least one turn")
        for m in v:
            if "role" not in m or "content" not in m:
                raise ValueError("each message must have 'role' and 'content'")
        return v


def _cap_max_tokens(req: LLMProxyRequest) -> int:
    """Apply the server-side ceiling regardless of what the caller asked for."""
    if req.max_tokens is None or req.max_tokens <= 0:
        return LLM_PROXY_MAX_OUTPUT_TOKENS
    return min(req.max_tokens, LLM_PROXY_MAX_OUTPUT_TOKENS)


def _err(status_code: int, error: str, detail: Optional[str] = None) -> dict:
    """Build the canonical error envelope used by every LLM proxy endpoint."""
    body: Dict[str, Any] = {"error": error, "provider": None, "model": None,
                            "content": "", "usage": {"in": 0, "out": 0},
                            "timestamp": datetime.utcnow().isoformat()}
    if detail is not None:
        body["detail"] = detail
    raise HTTPException(status_code=status_code, detail=body)


def _ua(req: Request) -> Optional[str]:
    """Return the User-Agent header truncated for storage; None if missing."""
    v = req.headers.get("user-agent")
    if not v:
        return None
    return v[:255]


def _sanitize(exc: Exception) -> str:
    """Strip noisy internal frame info from an exception message.

    Upstream SDK error strings can include internal URLs, request IDs or
    stack fragments. Keep the head so the client sees a useful reason.
    """
    msg = str(exc)
    if len(msg) > 400:
        return msg[:400] + "…"
    return msg or exc.__class__.__name__


def _audit_llm(provider: str, model: str, user_agent: Optional[str],
               tokens_in: int, tokens_out: int, ok: bool,
               error_code: Optional[str] = None) -> None:
    """Persist a proxy-call row. Failures here must NEVER surface to the
    caller — a broken audit DB should not 500 a successful LLM response."""
    try:
        with get_db() as db:
            db.execute(
                "INSERT INTO llm_proxy_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), datetime.utcnow().isoformat(), provider,
                 model, user_agent, int(tokens_in or 0), int(tokens_out or 0),
                 1 if ok else 0, error_code),
            )
    except Exception as e:  # pragma: no cover — best-effort
        logger.warning("llm_proxy_log audit write failed: %s", e)


# --- Claude (Anthropic SDK, per-request client) ------------------------------

async def _call_claude(req: LLMProxyRequest, api_key: str) -> Dict[str, Any]:
    client = anthropic.Anthropic(api_key=api_key)
    max_tokens = _cap_max_tokens(req)
    kwargs: Dict[str, Any] = {
        "model": req.model,
        "max_tokens": max_tokens,
        "messages": [{"role": m["role"], "content": m["content"]} for m in req.messages],
    }
    if req.system:
        kwargs["system"] = req.system

    if req.stream:
        stream_mgr = client.messages.stream(**kwargs)
        stream = await stream_mgr.__aenter__()
        try:
            async def gen() -> AsyncGenerator[str, None]:
                try:
                    tin = tout = 0
                    async for event in stream:
                        if (getattr(event, "type", None) == "content_block_delta"
                                and getattr(event.delta, "type", "") == "text_delta"):
                            text = getattr(event.delta, "text", "") or ""
                            if text:
                                tout += 1
                                yield f"data: {json.dumps({'content': text})}\n\n"
                    # Final usage event from the Anthropic stream
                    try:
                        msg = await stream.get_final_message()
                        tin = getattr(msg.usage, "input_tokens", 0) or 0
                        tout = getattr(msg.usage, "output_tokens", 0) or 0
                    except Exception:
                        pass
                    yield f"data: {json.dumps({'done': True, 'usage': {'in': tin, 'out': tout}})}\n\n"
                    yield "data: [DONE]\n\n"
                finally:
                    try:
                        await stream_mgr.__aexit__(None, None, None)
                    except Exception:
                        pass
            return {"__stream__": gen()}
        except Exception:
            try:
                await stream_mgr.__aexit__(None, None, None)
            except Exception:
                pass
            raise

    # Non-streaming
    response = await client.messages.create(**kwargs)
    text_parts = []
    for block in response.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(getattr(block, "text", ""))
    return {
        "provider": "claude",
        "model": req.model,
        "content": "".join(text_parts),
        "usage": {"in": int(getattr(response.usage, "input_tokens", 0) or 0),
                  "out": int(getattr(response.usage, "output_tokens", 0) or 0)},
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/llm/claude", dependencies=[Depends(require_api_key), Depends(rate_limit)])
async def llm_claude(req: LLMProxyRequest, request: Request,
                     x_user_api_key: Optional[str] = Header(default=None)):
    """Proxy to Anthropic's Messages API using the visitor's own key."""
    if not x_user_api_key:
        return _err(401, "Missing X-User-API-Key header",
                    "Paste your Anthropic key in TriAgent Settings.")
    try:
        out = await _call_claude(req, x_user_api_key)
    except anthropic.AuthenticationError as e:
        _audit_llm("claude", req.model, _ua(request), 0, 0, False, "auth")
        return _err(401, "Anthropic rejected the API key", _sanitize(e))
    except anthropic.RateLimitError as e:
        _audit_llm("claude", req.model, _ua(request), 0, 0, False, "rate_limit")
        return _err(429, "Anthropic rate limit reached", _sanitize(e))
    except anthropic.APIStatusError as e:
        _audit_llm("claude", req.model, _ua(request), 0, 0, False, "upstream")
        code = getattr(e, "status_code", 502)
        return _err(code if 400 <= code < 600 else 502,
                    "Anthropic upstream error", _sanitize(e))
    except Exception as e:
        _audit_llm("claude", req.model, _ua(request), 0, 0, False, "unknown")
        return _err(500, "LLM proxy error", _sanitize(e))

    if "__stream__" in out:
        _audit_llm("claude", req.model, _ua(request), 0, 0, True, None)
        return StreamingResponse(out["__stream__"], media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no",
                                          "X-Provider": "claude",
                                          "X-Model": req.model})
    _audit_llm("claude", req.model, _ua(request),
               out["usage"]["in"], out["usage"]["out"], True, None)
    return out


# --- OpenAI (openai SDK, per-request client) ---------------------------------

async def _call_openai(req: LLMProxyRequest, api_key: str) -> Dict[str, Any]:
    if _openai_module is None:
        raise RuntimeError("openai package not installed")
    client = _openai_module.AsyncOpenAI(api_key=api_key)
    max_tokens = _cap_max_tokens(req)
    messages: List[Dict[str, Any]] = []
    if req.system:
        messages.append({"role": "system", "content": req.system})
    messages.extend({"role": m["role"], "content": m["content"]} for m in req.messages)

    if req.stream:
        stream = await client.chat.completions.create(
            model=req.model, max_tokens=max_tokens, messages=messages, stream=True,
        )
        async def gen() -> AsyncGenerator[str, None]:
            try:
                tin = tout = 0
                async for chunk in stream:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    text = getattr(delta, "content", None) if delta else None
                    if text:
                        tout += 1
                        yield f"data: {json.dumps({'content': text})}\n\n"
                    # Some OpenAI-compatible providers return usage on the last chunk
                    u = getattr(chunk, "usage", None)
                    if u:
                        tin = getattr(u, "prompt_tokens", 0) or 0
                        tout = getattr(u, "completion_tokens", 0) or 0
                yield f"data: {json.dumps({'done': True, 'usage': {'in': tin, 'out': tout}})}\n\n"
                yield "data: [DONE]\n\n"
            finally:
                try:
                    await stream.aclose()
                except Exception:
                    pass
        return {"__stream__": gen()}

    response = await client.chat.completions.create(
        model=req.model, max_tokens=max_tokens, messages=messages,
    )
    content = response.choices[0].message.content if response.choices else ""
    usage = getattr(response, "usage", None)
    return {
        "provider": "openai",
        "model": req.model,
        "content": content or "",
        "usage": {"in": int(getattr(usage, "prompt_tokens", 0) or 0),
                  "out": int(getattr(usage, "completion_tokens", 0) or 0)},
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/llm/openai", dependencies=[Depends(require_api_key), Depends(rate_limit)])
async def llm_openai(req: LLMProxyRequest, request: Request,
                     x_user_api_key: Optional[str] = Header(default=None)):
    """Proxy to OpenAI's Chat Completions API using the visitor's own key."""
    if not x_user_api_key:
        return _err(401, "Missing X-User-API-Key header",
                    "Paste your OpenAI key in TriAgent Settings.")
    if _openai_module is None:
        return _err(503, "openai SDK not installed on the backend", None)
    try:
        out = await _call_openai(req, x_user_api_key)
    except _openai_module.AuthenticationError as e:
        _audit_llm("openai", req.model, _ua(request), 0, 0, False, "auth")
        return _err(401, "OpenAI rejected the API key", _sanitize(e))
    except _openai_module.RateLimitError as e:
        _audit_llm("openai", req.model, _ua(request), 0, 0, False, "rate_limit")
        return _err(429, "OpenAI rate limit reached", _sanitize(e))
    except _openai_module.APIStatusError as e:
        _audit_llm("openai", req.model, _ua(request), 0, 0, False, "upstream")
        code = getattr(e, "status_code", 502)
        return _err(code if 400 <= code < 600 else 502,
                    "OpenAI upstream error", _sanitize(e))
    except Exception as e:
        _audit_llm("openai", req.model, _ua(request), 0, 0, False, "unknown")
        return _err(500, "LLM proxy error", _sanitize(e))

    if "__stream__" in out:
        _audit_llm("openai", req.model, _ua(request), 0, 0, True, None)
        return StreamingResponse(out["__stream__"], media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no",
                                          "X-Provider": "openai",
                                          "X-Model": req.model})
    _audit_llm("openai", req.model, _ua(request),
               out["usage"]["in"], out["usage"]["out"], True, None)
    return out


# --- OpenRouter (httpx against OpenAI-compatible endpoint) --------------------

async def _call_openrouter(req: LLMProxyRequest, api_key: str) -> Dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": _OPENROUTER_HTTP_REFERER,
        "X-Title": _OPENROUTER_TITLE,
    }
    max_tokens = _cap_max_tokens(req)
    # Strip accidental "openrouter/" prefix — valid slugs are "provider/model"
    # (e.g. "anthropic/claude-haiku-4.5"). Only "openrouter/auto" keeps the prefix.
    model = req.model if req.model == "openrouter/auto" else req.model.removeprefix("openrouter/")
    messages: List[Dict[str, Any]] = []
    if req.system:
        messages.append({"role": "system", "content": req.system})
    messages.extend({"role": m["role"], "content": m["content"]} for m in req.messages)
    payload = {"model": model, "messages": messages,
               "max_tokens": max_tokens, "stream": bool(req.stream)}

    async with httpx.AsyncClient(timeout=LLM_PROXY_TIMEOUT_SECONDS) as client:
        if req.stream:
            async with client.stream(
                "POST", "https://openrouter.ai/api/v1/chat/completions",
                json=payload, headers=headers,
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    try:
                        err = json.loads(body.decode("utf-8"))
                    except Exception:
                        err = {"error": {"message": body.decode("utf-8", "replace")}}
                    msg = (err.get("error", {}).get("message")
                           if isinstance(err.get("error"), dict) else str(err))
                    raise RuntimeError(
                        f"OpenRouter {response.status_code}: {msg}"
                    )

                async def gen() -> AsyncGenerator[str, None]:
                    tin = tout = 0
                    async for raw in response.aiter_lines():
                        if not raw or not raw.startswith("data:"):
                            continue
                        data = raw[len("data:"):].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        err = chunk.get("error")
                        if err:
                            msg = err.get("message") if isinstance(err, dict) else str(err)
                            yield (f"data: {json.dumps({'error': msg})}\n\n")
                            return
                        choices = chunk.get("choices") or []
                        if choices:
                            text = (choices[0].get("delta") or {}).get("content")
                            if text:
                                tout += 1
                                yield f"data: {json.dumps({'content': text})}\n\n"
                        u = chunk.get("usage") or {}
                        if u:
                            tin = u.get("prompt_tokens", tin) or tin
                            tout = u.get("completion_tokens", tout) or tout
                    yield f"data: {json.dumps({'done': True, 'usage': {'in': tin, 'out': tout}})}\n\n"
                    yield "data: [DONE]\n\n"
                return {"__stream__": gen()}

        # Non-streaming
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            json=payload, headers=headers,
        )
        if resp.status_code != 200:
            try:
                err = resp.json()
            except Exception:
                err = {"error": {"message": resp.text}}
            msg = (err.get("error", {}).get("message")
                   if isinstance(err.get("error"), dict) else str(err))
            raise RuntimeError(f"OpenRouter {resp.status_code}: {msg}")

        body = resp.json()
        choices = body.get("choices") or []
        content = (choices[0].get("message") or {}).get("content", "") if choices else ""
        u = body.get("usage") or {}
        return {
            "provider": "openrouter",
            "model": req.model,
            "content": content or "",
            "usage": {"in": int(u.get("prompt_tokens", 0) or 0),
                      "out": int(u.get("completion_tokens", 0) or 0)},
            "timestamp": datetime.utcnow().isoformat(),
        }


@app.post("/api/llm/openrouter", dependencies=[Depends(require_api_key), Depends(rate_limit)])
async def llm_openrouter(req: LLMProxyRequest, request: Request,
                         x_user_api_key: Optional[str] = Header(default=None)):
    """Proxy to OpenRouter (OpenAI-compatible). Requires HTTP-Referer + X-Title."""
    if not x_user_api_key:
        return _err(401, "Missing X-User-API-Key header",
                    "Paste your OpenRouter key in TriAgent Settings.")
    try:
        out = await _call_openrouter(req, x_user_api_key)
    except httpx.HTTPStatusError as e:
        _audit_llm("openrouter", req.model, _ua(request), 0, 0, False, "upstream")
        code = e.response.status_code
        return _err(code if 400 <= code < 600 else 502,
                    "OpenRouter upstream error", _sanitize(e))
    except httpx.TimeoutException:
        _audit_llm("openrouter", req.model, _ua(request), 0, 0, False, "timeout")
        return _err(504, "OpenRouter request timed out",
                    f"{LLM_PROXY_TIMEOUT_SECONDS}s ceiling exceeded.")
    except RuntimeError as e:
        _audit_llm("openrouter", req.model, _ua(request), 0, 0, False, "upstream")
        return _err(502, "OpenRouter upstream error", _sanitize(e))
    except Exception as e:
        _audit_llm("openrouter", req.model, _ua(request), 0, 0, False, "unknown")
        return _err(500, "LLM proxy error", _sanitize(e))

    if "__stream__" in out:
        _audit_llm("openrouter", req.model, _ua(request), 0, 0, True, None)
        return StreamingResponse(out["__stream__"], media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no",
                                          "X-Provider": "openrouter",
                                          "X-Model": req.model})
    _audit_llm("openrouter", req.model, _ua(request),
               out["usage"]["in"], out["usage"]["out"], True, None)
    return out


# --- Gemini (google-generativeai, locked configure-then-call) -----------------

def _call_gemini_sync(req: LLMProxyRequest, api_key: str) -> Dict[str, Any]:
    """Run under `_GEMINI_SDK_LOCK` — never invoke directly from a threadpool.

    The Gemini SDK mutates `genai` module globals on every `configure()`;
    without the lock, two concurrent requests would clobber each other's
    api_key and produce calls billed to the wrong account.
    """
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=req.model,
        system_instruction=req.system if req.system else None,
    )
    generation_config = {"max_output_tokens": _cap_max_tokens(req)}
    # Gemini's chat semantics takes a history + the final user turn.
    history = [m for m in req.messages if m.get("role") != "user"]
    user_turns = [m for m in req.messages if m.get("role") == "user"]
    user_text = user_turns[-1]["content"] if user_turns else ""
    chat = model.start_chat(history=[
        {"role": m["role"], "parts": [m["content"]]} for m in history
    ])
    response = chat.send_message(user_text, generation_config=generation_config)
    text = getattr(response, "text", "") or ""
    meta = getattr(response, "usage_metadata", None) or {}
    tin = int(meta.get("prompt_token_count", 0) or 0)
    tout = int(meta.get("candidates_token_count", 0) or 0)
    return {
        "provider": "gemini",
        "model": req.model,
        "content": text,
        "usage": {"in": tin, "out": tout},
        "timestamp": datetime.utcnow().isoformat(),
        "__gemini_lock_held__": True,  # caller converts to SSE under the lock
    }


async def _call_gemini(req: LLMProxyRequest, api_key: str) -> Dict[str, Any]:
    """Wrap the synchronous, lock-held Gemini call so FastAPI can await it."""
    loop = __import__("asyncio").get_event_loop()

    def _blocking() -> Dict[str, Any]:
        with _GEMINI_SDK_LOCK:
            return _call_gemini_sync(req, api_key)

    result = await loop.run_in_executor(None, _blocking)

    if req.stream:
        # Gemini has no native server-side streaming in this SDK version;
        # emit the whole response as a single content event so SSE clients
        # still get a uniform shape.
        text = result["content"]
        async def gen() -> AsyncGenerator[str, None]:
            yield f"data: {json.dumps({'content': text})}\n\n"
            yield (f"data: {json.dumps({'done': True, 'usage': result['usage']})}\n\n")
            yield "data: [DONE]\n\n"
        return {"__stream__": gen()}

    return {k: v for k, v in result.items() if not k.startswith("__")}


@app.post("/api/llm/gemini", dependencies=[Depends(require_api_key), Depends(rate_limit)])
async def llm_gemini(req: LLMProxyRequest, request: Request,
                     x_user_api_key: Optional[str] = Header(default=None)):
    """Proxy to Google Generative AI, serialised by `_GEMINI_SDK_LOCK`."""
    if not x_user_api_key:
        return _err(401, "Missing X-User-API-Key header",
                    "Paste your Gemini key in TriAgent Settings.")
    try:
        out = await _call_gemini(req, x_user_api_key)
    except Exception as e:
        _audit_llm("gemini", req.model, _ua(request), 0, 0, False, "upstream")
        msg = _sanitize(e)
        lower = msg.lower()
        if "api key" in lower and ("invalid" in lower or "not valid" in lower):
            return _err(401, "Gemini rejected the API key", msg)
        if "rate" in lower and "limit" in lower:
            return _err(429, "Gemini rate limit reached", msg)
        return _err(502, "Gemini upstream error", msg)

    if "__stream__" in out:
        _audit_llm("gemini", req.model, _ua(request), 0, 0, True, None)
        return StreamingResponse(out["__stream__"], media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no",
                                          "X-Provider": "gemini",
                                          "X-Model": req.model})
    _audit_llm("gemini", req.model, _ua(request),
               out["usage"]["in"], out["usage"]["out"], True, None)
    return out


# --- Provider model catalog --------------------------------------------------

# Snapshot date: 2026-06-06. Refresh when providers retire or rename models.
# The frontend uses this to populate the model dropdown in Settings.
LLM_PROVIDER_MODELS: Dict[str, Dict[str, Any]] = {
    "claude": {
        "models": [
            {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
            {"id": "claude-opus-4-20250514", "name": "Claude Opus 4"},
            {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku"},
        ],
        "streamSupported": True,
        "defaultModel": "claude-sonnet-4-20250514",
    },
    "openai": {
        "models": [
            {"id": "gpt-4o", "name": "GPT-4o"},
            {"id": "gpt-4o-mini", "name": "GPT-4o mini"},
            {"id": "o4-mini", "name": "o4-mini (reasoning)"},
            {"id": "gpt-4.1", "name": "GPT-4.1"},
        ],
        "streamSupported": True,
        "defaultModel": "gpt-4o-mini",
    },
    "openrouter": {
        # OpenRouter aggregates many providers; surface the most-requested
        # chat models as of the snapshot date.
        "models": [
            {"id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4"},
            {"id": "openai/gpt-4o", "name": "GPT-4o"},
            {"id": "google/gemini-2.0-flash-exp:free", "name": "Gemini 2.0 Flash (free)"},
            {"id": "meta-llama/llama-3.1-70b-instruct", "name": "Llama 3.1 70B"},
            {"id": "mistralai/mistral-large", "name": "Mistral Large"},
        ],
        "streamSupported": True,
        "defaultModel": "anthropic/claude-sonnet-4",
    },
    "gemini": {
        "models": [
            {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash"},
            {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
        ],
        # Streaming is emulated server-side (single-event flush) — see
        # `_call_gemini`. The frontend should still show a streaming UI.
        "streamSupported": True,
        "defaultModel": "gemini-2.0-flash",
    },
}


@app.get("/api/llm/models")
def llm_list_models() -> Dict[str, Any]:
    """Return the per-provider model catalog for frontend dropdowns.

    This endpoint is intentionally open (no auth) so the Settings page can
    populate its model picker before the visitor pastes any key.
    """
    return {"snapshotDate": "2026-06-06", "providers": LLM_PROVIDER_MODELS}

# ============================================================
# ROUTES — Audit Log
# ============================================================
@app.post("/api/audit", dependencies=[Depends(require_api_key)])
def create_audit_entry(entry: AuditLogEntry):
    entry_id = str(uuid.uuid4())
    with get_db() as db:
        db.execute(
            "INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (entry_id, datetime.utcnow().isoformat(), entry.user_id, entry.user_name,
             entry.user_role, entry.module, entry.document_id, entry.action,
             entry.ai_verdict, entry.human_decision, entry.override_reason,
             json.dumps(entry.metadata) if entry.metadata else None),
        )
    return {"id": entry_id, "status": "logged"}

@app.get("/api/audit")
def get_audit_log(
    module: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 500,
):
    """Return audit entries, optionally filtered by module and a `since` ISO-8601
    timestamp. The Analytics dashboard uses `since` to honour the 7d/14d/30d
    time-range selector."""
    where_clauses: list[str] = []
    params: list = []
    if module:
        where_clauses.append("module = ?")
        params.append(module)
    if since:
        where_clauses.append("timestamp >= ?")
        params.append(since)
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    sql = f"SELECT * FROM audit_log {where_sql} ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    with get_db() as db:
        rows = db.execute(sql, tuple(params)).fetchall()
    return [dict(row) for row in rows]

@app.get("/api/audit/stats")
def get_audit_stats():
    """Aggregated statistics for analytics dashboard."""
    with get_db() as db:
        total = db.execute("SELECT COUNT(*) as count FROM audit_log").fetchone()["count"]
        by_module = db.execute(
            "SELECT module, COUNT(*) as count FROM audit_log GROUP BY module"
        ).fetchall()
        by_action = db.execute(
            "SELECT action, COUNT(*) as count FROM audit_log GROUP BY action"
        ).fetchall()
        recent = db.execute(
            "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 20"
        ).fetchall()
    return {
        "total": total,
        "byModule": {row["module"]: row["count"] for row in by_module},
        "byAction": {row["action"]: row["count"] for row in by_action},
        "recent": [dict(row) for row in recent],
    }

# ============================================================
# ROUTES — Advisor Notes
# ============================================================
@app.post("/api/advisor-notes/analyze", dependencies=[Depends(require_api_key)])
def analyze_advisor_note(req: AdvisorNoteRequest):
    try:
        raw = call_ai(ADVISOR_NOTE_PROMPT, f"Analyze this advisor meeting note for CIRO compliance:\n\n{req.note_text}")
        result = json.loads(raw.replace("```json", "").replace("```", "").strip())

        # Log to DB
        review_id = str(uuid.uuid4())
        with get_db() as db:
            db.execute(
                "INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (review_id, datetime.utcnow().isoformat(), "advisor_notes", review_id,
                 req.note_text, raw, result.get("verdict", "unknown"),
                 result.get("overallScore", 0), "pending", req.advisor_id, None),
            )

        return {"review_id": review_id, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# ROUTES — Transfer Validation (Stage 2)
# ============================================================
@app.post("/api/transfer/validate", dependencies=[Depends(require_api_key)])
def validate_transfer(req: TransferValidationRequest):
    try:
        raw = call_ai(TRANSFER_VALIDATION_PROMPT, f"Validate this transfer document:\n\n{req.document_text}")
        result = json.loads(raw.replace("```json", "").replace("```", "").strip())

        review_id = str(uuid.uuid4())
        with get_db() as db:
            db.execute(
                "INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (review_id, datetime.utcnow().isoformat(), "transfer_validation", review_id,
                 req.document_text, raw, result.get("verdict", {}).get("verdict", "unknown"),
                 result.get("verdict", {}).get("riskScore", 0), "pending", req.agent_id, None),
            )

        return {"review_id": review_id, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# ROUTES — Transfer Extraction (Stage 1)
# ============================================================
@app.post("/api/transfer/extract", dependencies=[Depends(require_api_key)])
def extract_transfer(req: TransferExtractionRequest):
    try:
        raw = call_ai(DOCUMENT_EXTRACTION_PROMPT, f"Extract all fields from this transfer document:\n\n{req.document_text}")
        result = json.loads(raw.replace("```json", "").replace("```", "").strip())

        review_id = str(uuid.uuid4())
        with get_db() as db:
            db.execute(
                "INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (review_id, datetime.utcnow().isoformat(), "transfer_ingestion", review_id,
                 req.document_text, raw, "extracted",
                 int(result.get("overallConfidence", 0) * 100), "pending", req.agent_id, None),
            )

        return {"review_id": review_id, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# ROUTES — Exception Diagnosis (Stage 3)
# ============================================================
@app.post("/api/transfer/diagnose", dependencies=[Depends(require_api_key)])
def diagnose_exception(req: ExceptionDiagnosisRequest):
    try:
        raw = call_ai(EXCEPTION_DIAGNOSIS_PROMPT, f"""Diagnose this transfer exception:

REJECTION CODE: {req.rejection_code}
REJECTION REASON: {req.rejection_reason}

CLIENT PROFILE:
{json.dumps(req.client_profile, indent=2)}

TRANSFER DETAILS:
{json.dumps(req.transfer_details, indent=2)}""")
        result = json.loads(raw.replace("```json", "").replace("```", "").strip())

        # Update exception in DB
        with get_db() as db:
            db.execute(
                "INSERT OR REPLACE INTO exceptions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (req.exception_id, req.transfer_details.get("transferId", ""),
                 req.client_profile.get("clientId", ""),
                 req.rejection_code, req.rejection_reason,
                 "diagnosed", raw,
                 json.dumps(result.get("draftedEmail", {})),
                 None, datetime.utcnow().isoformat(), datetime.utcnow().isoformat()),
            )

        return {"exception_id": req.exception_id, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# ROUTES — Document Text Extraction (File Upload)
# ============================================================
@app.post("/api/documents/extract-text", dependencies=[Depends(require_api_key), Depends(rate_limit)])
async def extract_text_from_file(
    file: UploadFile = File(...),
    content_length: Optional[int] = Header(default=None),
):
    """Extract text from uploaded PDF or image file.

    Enforces MAX_UPLOAD_SIZE (10 MB by default). Returns 413 Payload Too Large
    if the upload exceeds the cap, either by Content-Length header or by
    streamed-bytes accumulation when the header is absent or unreliable.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Cheap up-front guard: trust Content-Length when present, reject before reading.
    if content_length is not None and content_length > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_UPLOAD_SIZE // (1024 * 1024)} MB limit.",
        )

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""

    # Stream-read in chunks so we can short-circuit when Content-Length lies or is missing.
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)  # 1 MB chunks.
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds {MAX_UPLOAD_SIZE // (1024 * 1024)} MB limit.",
            )
        chunks.append(chunk)
    content = b"".join(chunks)

    try:
        if ext == "pdf":
            import fitz  # PyMuPDF
            doc = fitz.open(stream=content, filetype="pdf")
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            return {"text": text.strip(), "pageCount": len(doc), "method": "pdf"}

        elif ext in ("png", "jpg", "jpeg", "tiff"):
            import pytesseract
            from PIL import Image
            import io
            image = Image.open(io.BytesIO(content))
            text = pytesseract.image_to_string(image)
            return {"text": text.strip(), "method": "ocr"}

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}")

    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Required library not installed: {e}. Install with: pip install pymupdf pytesseract Pillow"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {str(e)}")

# ============================================================
# ROUTES — Reviews
# ============================================================
@app.get("/api/reviews")
def get_reviews(module: Optional[str] = None, status: Optional[str] = None, limit: int = 100):
    """List reviews for analytics."""
    with get_db() as db:
        query = "SELECT * FROM reviews WHERE 1=1"
        params = []
        if module:
            query += " AND module = ?"
            params.append(module)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        rows = db.execute(query, params).fetchall()
    return [dict(row) for row in rows]

@app.put("/api/reviews/{review_id}/decision", dependencies=[Depends(require_api_key)])
def update_review_decision(review_id: str, req: ReviewDecisionRequest):
    """Record human review decision."""
    with get_db() as db:
        existing = db.execute("SELECT * FROM reviews WHERE id = ?", (review_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Review not found")

        db.execute(
            "UPDATE reviews SET status = ?, reviewed_by = ?, override_reason = ? WHERE id = ?",
            (req.decision, req.reviewed_by, req.reason, review_id),
        )

    return {"id": review_id, "status": req.decision}

# ============================================================
# SYSTEM PROMPTS (synced with frontend src/lib/ai.ts)
# ============================================================
ADVISOR_NOTE_PROMPT = """You are a CIRO compliance auditor for a Canadian investment advisory firm. Your job is to analyze advisor meeting notes and check them against CIRO documentation requirements.

You MUST return a valid JSON object with this exact structure:
{
  "checklist": [
    { "item": "Client investment objectives", "present": true/false, "details": "description" },
    { "item": "Risk tolerance level", "present": true/false, "details": "description" },
    { "item": "Suitability rationale", "present": true/false, "details": "description" },
    { "item": "Material risks discussed", "present": true/false, "details": "description" },
    { "item": "Client concerns/objections", "present": true/false, "details": "description" },
    { "item": "Time horizon", "present": true/false, "details": "description" },
    { "item": "Current financial situation", "present": true/false, "details": "description" },
    { "item": "Conflicts of interest", "present": true/false, "details": "description" }
  ],
  "flags": [
    {
      "element": "name of missing/insufficient element",
      "status": "missing" | "insufficient",
      "severity": "critical" | "warning" | "info",
      "description": "what is wrong",
      "suggestion": "what the advisor should add",
      "confidence": "high" | "medium" | "low",
      "ciroRule": "specific CIRO rule reference"
    }
  ],
  "overallScore": 0-100,
  "verdict": "compliant" | "needs_completion" | "non_compliant"
}

CIRO Requirements to check:
1. Client investment objectives MUST be documented (growth, income, capital preservation, speculation)
2. Risk tolerance level MUST be referenced and matched to the recommended product
3. Suitability rationale MUST be explicitly stated
4. Material risks of the recommendation MUST be discussed and noted
5. Client concerns or objections MUST be documented with advisor response
6. Time horizon MUST be referenced and matched to recommended product characteristics
7. Client's current financial situation MUST be referenced as basis for recommendation
8. Conflicts of interest MUST be disclosed if applicable

Scoring: Each element is worth 12.5 points. Deduct full points for missing, half for insufficient.
Verdict: 80-100 = compliant, 50-79 = needs_completion, 0-49 = non_compliant

Flag vague statements like "discussed risk" as insufficient — CIRO requires SPECIFIC documentation.
Return ONLY the JSON object, no other text."""

TRANSFER_VALIDATION_PROMPT = """You are a transfer document validation system for Triagent, a Canadian financial platform. You validate inbound account transfer documents against ATON/ACATS rules.

You MUST return a valid JSON object with this exact structure:
{
  "checks": [
    {
      "category": "Account Identification" | "Client Identity" | "Transfer Details" | "Authorization" | "Sending Institution" | "Special Conditions",
      "fieldName": "name of field",
      "expectedFormat": "what is expected",
      "actualValue": "what was found",
      "status": "pass" | "fail" | "warning",
      "errorDescription": "description if fail/warning, null if pass",
      "confidence": "high" | "medium" | "low",
      "rule": "specific rule reference"
    }
  ],
  "verdict": {
    "verdict": "pass" | "needs_review" | "fail",
    "riskScore": 1-10,
    "summary": "one sentence summary"
  },
  "extractedFields": {
    "accountNumber": "string or null",
    "accountType": "string or null",
    "clientName": "string or null",
    "dateOfBirth": "string or null",
    "transferType": "string or null",
    "sendingInstitution": "string or null",
    "transferAmount": "string or null",
    "authorizationDate": "string or null",
    "signaturePresent": true/false
  }
}

Validation rules:
- Account numbers must be valid format (7-12 digits for Canadian institutions)
- Account type must be recognized (RRSP, TFSA, FHSA, RRIF, non-registered, LIRA, RESP, RDSP)
- Client name must not be empty and should be consistent across the document
- Transfer type must be specified (full/partial, cash/in-kind)
- Authorization signature must be present
- Authorization date must be within 90 days
- Sending institution must have valid institution code
- For joint accounts, both signatures required
- For spousal RRSP, attribution rules must be noted

Return ONLY the JSON object, no other text."""

DOCUMENT_EXTRACTION_PROMPT = """You are a document extraction system for Triagent. You read unstructured transfer documents from legacy banks and extract all fields into a structured format.

You MUST return a valid JSON object with this exact structure:
{
  "fields": [
    {
      "fieldName": "name of field",
      "value": "extracted value or null",
      "confidence": 0.0-1.0,
      "confidenceLevel": "high" | "medium" | "low",
      "reasoning": "why this confidence level"
    }
  ],
  "sourceInstitution": "detected institution name",
  "documentType": "transfer_form" | "account_statement" | "authorization_letter" | "other",
  "overallConfidence": 0.0-1.0,
  "warnings": ["any issues detected with the document"]
}

Fields to extract (in order):
1. Account Number
2. Account Type (RRSP, TFSA, FHSA, RRIF, non-registered, LIRA, etc.)
3. Client Full Name
4. Date of Birth
5. Client Address
6. Transfer Type (full/partial)
7. Asset Type (cash/in-kind/mixed)
8. Transfer Amount / Asset Breakdown
9. Sending Institution Name
10. Sending Institution Code
11. Branch Identifier
12. Authorization Signature (present/absent)
13. Authorization Date
14. Beneficiary Designation (if present)
15. Special Conditions (locked-in, spousal RRSP, etc.)

If a field cannot be found, return value as null with low confidence and explain why.
Return ONLY the JSON object, no other text."""

EXCEPTION_DIAGNOSIS_PROMPT = """You are an account transfer exception resolution system for Triagent. When a transfer is rejected by the losing institution, you diagnose the root cause and draft a client communication.

You will receive: the rejection code and reason, the client's Triagent profile, and the original transfer details.

You MUST return a valid JSON object with this exact structure:
{
  "rootCause": "specific diagnosis of why the transfer was rejected",
  "rejectionType": "name_mismatch" | "insufficient_fee" | "account_type_conflict" | "missing_signature" | "expired_authorization" | "account_closed" | "other",
  "resolutionSteps": ["step 1", "step 2"],
  "draftedEmail": {
    "subject": "email subject line",
    "body": "complete email body, personalized to the client"
  },
  "internalNotes": "notes for the ops team",
  "confidence": "high" | "medium" | "low",
  "requiresManualReview": true/false,
  "manualReviewReason": "why manual review is needed, if applicable"
}

Guidelines:
- Use the client's first name in the email
- Be specific about what the client needs to do
- Keep the email warm, clear, and action-oriented, this is Triagent's brand voice
- If the diagnosis is uncertain, set requiresManualReview to true
- Never instruct the client to do something impossible or incorrect
- For fee issues, mention Triagent's transfer fee reimbursement program

Return ONLY the JSON object, no other text."""

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
