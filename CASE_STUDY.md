# TriAgent — Engineering Case Study

> **AI triages, humans approve.** An AI document-triage system for regulated financial operations, built to production standards as a portfolio project.

**Live demo:** [triagent-six.vercel.app](https://triagent-six.vercel.app) (zero-config, no signup or API key) · **License:** Apache 2.0 · **Status:** prototype / demo

---

## Executive summary

TriAgent extracts, validates, and routes regulated financial documents through SLA-driven workflows, with a human approving every AI decision. It is a single-author portfolio project, but it is engineered the way a production system should be: a multi-provider LLM abstraction, schema-validated AI responses with automatic retry, a full automated test suite gated by CI, a documented security review, and a live deployment on Vercel + Railway.

This document is both a **product overview** (what it is and why) and an **engineering report** (how it was built and to what standard). The short version: the interesting part isn't that an AI reads documents — it's the engineering discipline around making that safe, testable, and shippable.

## At a glance

| | |
|---|---|
| **Domain** | Document triage for regulated finance (account transfers, advisor notes) |
| **Pattern** | AI extract → validate → route, with mandatory human-in-the-loop approval |
| **Frontend** | React 18 + TypeScript 5.6 (strict) + Vite 6 + Tailwind 3 |
| **Backend** | Python FastAPI + SQLite (optional — the app runs fully without it) |
| **Codebase** | 137 tracked files · 95 TypeScript modules · clean, single-commit history |
| **Tests** | 129 unit/component (Vitest) + 5 end-to-end (Playwright), green in CI |
| **LLM providers** | 8 adapters behind one interface (Claude, Gemini, OpenAI, OpenRouter, LM Studio, llama.cpp, backend proxy, mock) |
| **Live** | Frontend on Vercel, backend on Railway, verified end-to-end |

---

## The problem

Back-office teams in regulated finance spend enormous effort manually reading transfer paperwork and advisor notes — extracting fields, checking them against rules, and deciding what to do with exceptions. It's slow, repetitive, and error-prone, and the errors are expensive because they're compliance-relevant.

Pure automation isn't acceptable in that context: a regulator (and any sane operations lead) will not let an AI silently act on a financial document. So the design constraint is sharp — **use AI to do the heavy lifting, but never let it act autonomously.**

## What TriAgent does

TriAgent runs documents through a three-stage pipeline — **Ingestion → Validation → Exception resolution** — where each stage performs an LLM call, validates the response against a strict schema, and surfaces a **human review panel** (approve / reject / escalate / override). Nothing advances without a person.

![TriAgent operations dashboard — pipeline status, SLA timers, and queue overview](docs/screenshots/01-dashboard.png)

- **Zero-config demo.** It ships with a mock LLM provider, so the entire feature set works with no API key and no signup — open the link and it just runs.
- **Bring-your-own-key.** To use a real model, a user pastes their own provider key; the app never ships or shares a server-side LLM key.
- **SLA-aware.** Work items track against SLA timers; analytics surface throughput, overrides, and exceptions.

![The three-stage transfer pipeline — Ingestion, Validation, and Exception resolution](docs/screenshots/02-pipeline.png)

## Architecture

```
            Browser (React SPA)
        ┌──────────────────────────┐
        │  pages · components · UI │
        │  ┌────────────────────┐  │
        │  │  AI integration    │  │   one interface, 8 provider adapters
        │  │  · Zod validation  │  │   (Claude · Gemini · OpenAI · OpenRouter
        │  │  · retry + backoff │  │    · LM Studio · llama.cpp · proxy · mock)
        │  │  · SHA-256 cache   │  │
        │  │  · SSE streaming   │  │
        │  └─────────┬──────────┘  │
        └────────────┼─────────────┘
                     │  (optional) X-API-Key + X-User-API-Key
            ┌────────▼─────────┐
            │  FastAPI backend │   per-IP rate limiting · audit log (SQLite on a
            │  proxy + audit   │   persisted volume) · PDF text extraction (OCR fallback)
            └──────────────────┘
```

Design decisions worth calling out:

- **One AI integration point, many providers.** Every model sits behind a single provider interface, so swapping Claude for Gemini for a local llama.cpp instance is a config change, not a code change. The mock provider implements the same interface, which is what makes the zero-config demo possible.
- **Schema-validated AI, not vibes.** Every LLM response is parsed against a Zod schema. Bad JSON retries once; provider 429/5xx errors retry with exponential backoff + jitter and respect `Retry-After`. The UI never trusts unvalidated model output.
- **Resilience built in.** A SHA-256-keyed cache (shared across streaming and non-streaming paths), browser-side SSE streaming with a discriminated-union event protocol, and a worker-pool batch pipeline for bulk runs.
- **Optional backend, real auth.** The FastAPI backend proxies LLM calls (so keys aren't required in the browser for the proxied path), keeps an audit log on a persisted volume, and extracts text from PDFs. It's gated by a shared-secret header and a dependency-free per-IP rate limiter.

## Engineering rigor

This is the part meant for an engineering reader.

- **Automated tests as a gate, not an afterthought.** 129 unit/component tests (Vitest + Testing Library) and 5 Playwright E2E specs. **CI runs type-check → tests → production build on every push**, and a red test blocks the build.
- **Type safety end to end.** TypeScript in strict mode; `tsc -b --noEmit` runs as a husky pre-commit hook via lint-staged, so type errors can't even be committed.
- **Adversarial review.** Significant changes (e.g. the full mobile-responsive pass) were gated through a multi-agent adversarial diff review before shipping — independent passes hunting for regressions, not a single self-check.
- **Decision and troubleshooting discipline.** Architectural decisions are recorded as numbered, immutable entries (`D-001…`), and every non-obvious bug is logged with symptom → root cause → fix (`TS-001…`) so the same problem isn't rediscovered twice.
- **CI hygiene.** The pipeline runs on the current Node LTS with up-to-date actions — no deprecation warnings.

*Concrete example of the test discipline paying off:* the open-source CI immediately caught a test that passed locally but failed on a clean runner — it depended on a developer's local `.env` and on `localStorage` state leaking between tests. That's exactly the class of bug CI exists to catch, and it was fixed (test isolation) rather than papered over.

## Security & compliance posture

Before open-sourcing, the project went through a deliberate security review — not a checkbox, an actual audit including **downloading and grepping the live production bundle** to verify what really ships.

- **No secrets leak.** The live bundle contains only placeholder strings — zero real API keys, no source maps, no third-party trackers, and no XSS sinks anywhere in the source.
- **Findings were fixed, honestly.** The review's findings were addressed: a dependency-free **per-IP rate limiter** to cap abuse of the public proxy; the Gemini key moved out of the URL into an `x-goog-api-key` **header** (URLs leak via history, `Referer`, and logs); dependencies patched to **zero known vulnerabilities**; PII-bearing console logs gated to development only; and a real production bug fixed where file uploads were missing their auth header. One finding — provider keys living in `localStorage` — was **deliberately not "fixed"**, because the only available mitigation would be security theater; it's documented as a conscious bring-your-own-key tradeoff instead.
- **Clean git history.** A full-history secret scan (all branches, all commits — `.gitignore` does nothing about the past) confirmed no live credential was ever committed. Where history did contain internal notes and a private identifier, that was the deciding reason to publish from a **fresh repository with no shared history** rather than scrub the old one.
- **Key hygiene.** A server-side key that had been exposed in an earlier build was revoked and removed; it never appears in the published tree or history.

## Open-sourcing

The project was relicensed and republished cleanly for public release:

- **MIT → Apache 2.0** — for the explicit patent grant, appropriate for anything that might be reused.
- **Fresh-history repository** — built from a clean export so no internal notes, local paths, or scratch artifacts carry over. `LICENSE` + `NOTICE`, a demo disclaimer, and a green CI badge.
- **Professional structure** — conventional, feature-organized layout (`pages/` by feature, `components/` split into primitives/composite/layout, `lib/` with a `providers/` subfolder, tests colocated with source). Nothing that signals carelessness: no committed `node_modules`, `dist`, secrets, or build output.

## Production

The app is deployed and live: **frontend on Vercel**, **backend on Railway** (with a persisted volume for the audit database, CORS locked to the known origin, and shared-secret auth on the proxy). Deployments are verified against the running site, not assumed — a representative end-to-end run extracted 16 fields at 85–98% confidence through the full human-review flow.

## What this project demonstrates

| Capability | Evidence |
|---|---|
| **Full-stack engineering** | React/TS SPA + Python FastAPI backend, both shipped to production |
| **Applied AI / LLM integration** | Provider abstraction, schema-validated responses, retry/cache/streaming — not a thin API wrapper |
| **Security engineering** | Live-bundle audit, full-history secret scan, honest threat assessment over theater |
| **DevOps & quality** | CI gate, 129+ tests, strict typing, pre-commit enforcement |
| **Product judgment** | Human-in-the-loop by design; zero-config demo; honest scope |
| **Communication** | Documented decisions, this case study, an honest README |

## Honest scope

To be straight about what this is: a **single-author portfolio prototype**, not a system with live customers or real regulatory sign-off. It defaults to a mock provider and processes example documents. The value on display is the **engineering practice** — architecture, testing, security, and delivery — applied at production standards to a realistic problem.

---

*Code: [github.com/TrishulMallur/TriAgent](https://github.com/TrishulMallur/TriAgent) · Live: [triagent-six.vercel.app](https://triagent-six.vercel.app)*
