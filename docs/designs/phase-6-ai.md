# Phase 6: AI Assistant with Real Providers and Human Approval

| Field | Value |
|---|---|
| Status | Implemented under the owner's standing instruction (2026-11-05) |
| Source spec | Remediation spec §3.8, §13 |

## 1. Problems found in the audit

The previous assistant had the following problems:

- **Fake routing.** The AI Centre picked a tool by matching keywords and returned a canned reply. The real provider router was never called.
- **Fake fallback.** When both providers failed, the router returned a fabricated "deterministic draft". It was labelled as OpenAI and recorded with made-up token counts and cost.
- **Retired model.** The Claude model was `claude-3-5-sonnet-20241022`, which was retired on 2025-10-28.
- **Bypassable approval.** Approval was a client flag, `_approvedByHuman`, so any caller could skip it.

## 2. Providers (`src/lib/ai/providers.ts`)

### Provider order

| Order | Provider | When it is used |
|---|---|---|
| 1 (primary) | OpenAI Chat Completions with function tools | When `OPENAI_API_KEY` and a model (`OPENAI_MODEL` or `AiProviderConfig`) are configured and the integration is enabled. |
| 2 (secondary) | Anthropic Claude through the official `@anthropic-ai/sdk` | When `ANTHROPIC_API_KEY` is configured and enabled and `AI_CLAUDE_FALLBACK` is not `false`. |

### Claude request settings

- Model: `claude-opus-5-5`.
- `output_config.effort: "medium"`.
- Tools use `tool_choice: auto`.
- Server-side refusal fallback is enabled (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
- Assistant content is passed back unchanged across tool rounds, so thinking blocks stay valid.

### Failure handling

- If the primary provider fails (HTTP error, network error or timeout), the whole request is retried once on the next permitted provider.
- If no permitted provider answers, the request returns **503**. There is no canned or fabricated text.

### Controls

| Control | Setting |
|---|---|
| Global kill switch | `AI_DISABLED=true` |
| Per-provider switch | `isEnabled` on the integration |
| Daily token budget | `AI_DAILY_TOKEN_BUDGET`, counted per event and in total |

### Usage and cost

- Each attempt is logged in `ai_usage_logs`, with the provider and model, the tokens the provider reported, latency, and status: `success`, `fallback_triggered` or `failed`.
- **Claude cost** is computed from Anthropic's published per-token prices.
- **OpenAI cost** is recorded only when `AI_OPENAI_PRICE_IN` and `AI_OPENAI_PRICE_OUT` are set; otherwise it stays `null`. No price is invented.

### ChatGPT

ChatGPT is never called. When the service is unavailable, the UI tells the user they can copy the question into ChatGPT themselves, without guest contact details.

## 3. Tools and permissions (`src/lib/ai/orchestrator.ts`, `/api/v1/ai`)

### What the model receives

- The registry tools, as JSON schemas.
- **`eventId` is never exposed to the model.** The server injects the event the user selected and authorized.

### How tools run

- Every tool call runs `executeAiTool(name, args, actor)`.
- That function authorizes `ai.use` and the tool's own permission on the event. It also checks that any referenced plan or guest belongs to the event.

### Redaction

`redactForModel()` removes the following before anything reaches a provider:

- email, phone, notes and accessibility fields;
- email or phone patterns found anywhere in the user's prompt or in tool outputs.

### Records and audit

| Record | When it is written |
|---|---|
| `ai_sessions`, `ai_interactions` | Every request. The prompt and response are stored redacted. |
| `ai_tool_executions` | Every tool call. |
| `ai.request` audit entry | Every request, listing the provider, the model and the tools used. |

## 4. Human approval

- **Holding.** A tool marked `requiresHumanApproval` (for example `propose_seating_allocation`) never runs during the conversation. It is stored as an `ai_tool_executions` row with status `awaiting_approval`, and the model is told it is queued.
- **Approving.** The request is approved or rejected with `POST /api/v1/ai/approvals/[executionId]` and the body `{decision: "approve" | "reject"}`.
- **Who can approve.** The approver must hold the tool's own permission on that event, for example `seating.assign`. They do not need `ai.use`.
- **What runs.** The *stored* arguments run, not anything the browser sends.
- **Decided once.** The row is claimed atomically, so a request can be decided only once.
- **Audit.** Each decision is recorded as `ai.tool_approved` or `ai.tool_rejected`.

## 5. Acceptance (tests: `tests/ai/assistant.test.mjs`)

- No provider configured → 503, with no canned answer.
- Ushers are refused.
- Tools run with the server's event id. Tool output is redacted. The token usage logged is the provider's own count, and no cost is invented.
- When OpenAI fails, the request falls back to Claude (`claude-opus-5-5`), and the fallback is logged.
- A write tool waits for approval and changes nothing before it. An usher cannot approve. An authorized approver runs it once, and a second approval returns 409.

## 6. Owner configuration

Set these to enable the assistant:

- `OPENAI_API_KEY` and `OPENAI_MODEL`. Choose a current OpenAI model; the code does not guess one.
- Optionally, `ANTHROPIC_API_KEY`.
- Optionally, `AI_DAILY_TOKEN_BUDGET`.
- Optionally, `AI_OPENAI_PRICE_IN` and `AI_OPENAI_PRICE_OUT`, so OpenAI cost is recorded.
