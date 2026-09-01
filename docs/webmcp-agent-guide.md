# WebMCP agent guide

Portable playbook for agents adding or improving **WebMCP page tools** on any web app. WebMCP exposes tools from an **open browser tab** via `document.modelContext.registerTool`. It is not backend MCP (HTTP/SSE/stdio) and not a service-worker shim.

Use this guide when:

- You inherit a project with no WebMCP layer yet
- You need to split a monolithic registrar
- You need tests and eval fixtures before shipping tool changes
- You want consistent security and schema hygiene across repos

**Canonical external docs:** [WebMCP spec](https://webmachinelearning.github.io/webmcp/) · [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api) · [Secure tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools) · [Evals intro](https://developer.chrome.com/docs/ai/evals/introduction)

---

## 1. Decide scope first

Before writing code, answer these in the PR or plan:

| Question | Why it matters |
|----------|----------------|
| What user goals do tools support? | One tool ≈ one user-visible outcome |
| What is the initial page state? | Tools must match what the human sees |
| Read vs write? | Drives `readOnlyHint` and confirm flows |
| External or user-generated data? | Drives `untrustedContentHint` |
| How many tools? | >15 often needs discovery or dynamic registration |

**Non-goals to state explicitly:** backend MCP bridge, service-worker-only tools, cross-origin `exposedTo` unless the product embeds other origins.

---

## 2. Best practices checklist

Apply on every tool. Treat failures as blockers unless the product owner documents an exception.

### Tool strategy

- **One function per tool.** No overlapping names (`move` vs `place` vs `align` must be distinguishable from descriptions alone).
- **Positive descriptions.** Say what the tool does and when to call it. Avoid “Do not use for X.”
- **Raw user input.** Accept strings the user said; do not make the model compute dates, IDs, or math.
- **Validate strictly in code.** JSON Schema helps the agent; Zod (or equivalent) enforces at `execute`.
- **Graceful errors.** Return actionable messages the agent can relay: wrong order, bad format, missing prerequisite.

### Registration lifecycle

```text
mount UI  →  feature-detect modelContext  →  register tools  →  AbortSignal on unmount
```

- Feature-detect. If `document.modelContext?.registerTool` is missing, **no-op**. Human UI must still work.
- Register after the UI the tool drives exists.
- Pass `AbortSignal` into `registerTool` and into long `fetch` work inside `execute`.
- Prefer **`document.modelContext`**. Treat `navigator.modelContext` as a deprecated alias only.

### Security annotations

| Annotation | Set `true` when |
|------------|-----------------|
| `readOnlyHint` | Tool does not mutate app state |
| `untrustedContentHint` | Output includes UGC, external APIs, embed URLs, HTML, or Wikipedia |

Other rules:

- Do not use `exposedTo` unless you trust another origin with that data or action.
- Destructive tools (`delete`, `clear`, checkout, send) should require **explicit user confirm** in `execute` or `requestUserInteraction()` when available.
- Redact secrets in tool outputs (tokens in URLs, API keys in query params).

### Character budgets (Chrome guidance)

| Field | Target |
|-------|--------|
| Tool description | ≤ 500 chars |
| Parameter description | ≤ 150 chars |
| Tool / param name | ≤ 30 chars |
| Single tool output | ≤ 1.5K chars |

### Dynamic registration by state (optional)

From best practices: register when a tool is useful for the **current page state**, unregister when not.

**Use when:** evals show wrong-tool or wrong-order mistakes from tool overload (many layout tools, overlapping names).

**Defer when:** static registration works and lifecycle adds complexity. Static + clear descriptions + discovery tools is the default.

---

## 3. Recommended registrar structure

Avoid a single 500+ line file. Split by **role**, not by copy-paste convenience.

```text
src/webmcp/                          # or client/webmcp/
  registerWebMcpTools.ts             # thin orchestrator (~50–120 lines)
  types.ts                           # WebMcpTool, CatalogEntry, JsonSchema
  constants.ts                       # tool names, purposes, shared strings
  toolResults.ts                     # invalidArgumentsResult, isAbortError, …
  registrationHelpers.ts             # getExistingToolNames, discovery helpers
  schemas/
    standaloneSchemas.ts             # JSON Schema + Zod for non-action tools
  execute/
    executeAction.ts                 # shared execute path for domain actions
  catalog/
    createCatalog.ts                 # assembles Map<toolName, CatalogEntry>
    actionTools.ts                   # optional: split if catalog grows
    standaloneTools.ts               # optional: commons, pages, search, …
```

### Orchestrator responsibilities only

`registerWebMcpTools.ts` should:

1. Feature-detect `modelContext`
2. Build catalog (`createCatalog(deps)`)
3. Skip duplicates via `getTools()` when available
4. Map catalog entries to `registerTool` with annotations
5. Handle abort and duplicate-tool errors

It should **not** hold schemas, Zod parsers, or business logic.

### Catalog entry shape

Every tool is one row in a typed catalog:

```ts
type CatalogEntry = {
  name: ToolName
  purpose: string
  inputSchema: JsonSchema
  execute: (input, context?) => unknown | Promise<unknown>
  readOnly: boolean
  untrustedContent: boolean
}
```

Domain code lives in small modules (`pageTools.ts`, `embedTools.ts`). The catalog wires them with validation and error shape.

### Discovery pattern for large tool sets

When you have many action tools, registering full JSON Schema for each consumes agent context.

**Pattern:**

1. Register most tools with a **stub schema** (`additionalProperties: true`, short description pointing to discovery).
2. Register **`list_tools`** — names + one-line purpose + any global workflow string.
3. Register **`describe_tools`** — full schema for 1–10 requested names.
4. Agent flow: `list_tools` → `describe_tools({ names })` → action tools.

Keep full schemas in the catalog and in a human-readable `tools.txt` (or OpenAPI-style doc) for debugging.

---

## 4. Evals layer

Evals split into **deterministic** (code) and **probabilistic** (model). Both belong in the repo before production tool changes.

```text
evals/webmcp/
  README.md                 # what runs in CI vs manual
  fixtures/
    001-isolation.json      # expectedCall for one user turn
    002-journey.json        # ordered or unordered chains
    003-mid-chain-fail.json # deterministicExecute, no model
```

Add unit tests next to pure helpers:

```text
src/webmcp/embedTools.test.ts
src/webmcp/pageTools.test.ts
```

### Layer A — deterministic unit tests

Test without Chromium WebMCP when possible:

- Pure functions (URL redaction, formatting, ID mapping)
- Validation helpers (`requireDestructiveConfirm`, Zod parsers)
- Domain helpers with injected or in-memory deps

If the host library needs DOM (e.g. canvas SDK), use **happy-dom** or **jsdom** in Vitest and provide required ctor deps (`getContainer`, etc.).

**Gate:** `npm test` exits 0.

### Layer B — isolation fixtures (`expectedCall`)

One user message → expected tool + args. Example shape:

```json
{
  "messages": [{ "role": "user", "content": "I'd like a small pizza." }],
  "applicationState": {
    "tools": [
      { "name": "set_pizza_size", "description": "Set the pizza size directly." }
    ]
  },
  "expectedCall": [
    { "functionName": "set_pizza_size", "arguments": { "size": "Small" } }
  ]
}
```

**Critical rule:** `applicationState.tools` must list the **full tool set visible in that state**, not just the tool under test. Otherwise isolation results lie.

Run manually or with [webmcp-tools evals-cli](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/evals-cli).

### Layer C — end-to-end journeys

Multi-step `expectedCall` with `unordered` blocks where order does not matter:

```json
"expectedCall": [
  { "functionName": "inspect_pages", "arguments": {} },
  { "functionName": "create_page", "arguments": {} }
]
```

Include **direct** user phrasing and **ambiguous** phrasing in the fixture set.

### Layer D — mid-chain failure (no model)

For “coupon fails but checkout continues” class bugs, use `deterministicExecute`:

```json
{
  "deterministicExecute": {
    "functionName": "add_discount_coupon",
    "arguments": { "code": "INVALID" },
    "expectedResult": { "ok": false, "tool": "add_discount_coupon" }
  }
}
```

Drive via `document.modelContext.executeTool(...)` in a flagged Chromium tab.

### Failure modes to fixture

| Failure | Fixture type |
|---------|----------------|
| Wrong tool selected | Isolation + clearer descriptions |
| Wrong order | E2E ordered chain |
| Wrong arguments | Isolation with strict schema |
| Bad output shape | Unit test on execute return value |
| Silent destructive action | Unit test on confirm gate |

---

## 5. Agent workflow for a new project

Copy this sequence into your plan or issue. Do not skip verification steps.

### Phase 0 — Recon (read-only)

- [ ] Confirm page runs in a **Window** (not Worker-only)
- [ ] Confirm HTTPS or localhost
- [ ] Find where UI mounts (React `useEffect`, router layout, etc.)
- [ ] List existing user actions (forms, API calls, state mutations)
- [ ] Note package manager and test runner (`npm test`, `vitest`, etc.)

### Phase 1 — Minimum viable WebMCP

- [ ] Add `registerWebMcpTools(deps, signal)` with feature detect
- [ ] One **read** tool (inspect current state)
- [ ] One **write** tool (change visible UI)
- [ ] AbortSignal cleanup on unmount
- [ ] Manual test in Chromium with `#enable-webmcp-testing`

### Phase 2 — Structure

- [ ] Extract `types.ts`, `constants.ts`, `catalog/createCatalog.ts`
- [ ] Keep orchestrator under ~120 lines
- [ ] Centralize `{ ok, tool, error, issues? }` error shape
- [ ] Add annotations on every tool

### Phase 3 — Verification baseline

- [ ] Add test runner if missing (Vitest recommended for Vite/TS repos)
- [ ] Unit tests for pure helpers and confirm gates
- [ ] `evals/webmcp/fixtures/` with at least 3 JSON files
- [ ] `evals/webmcp/README.md` stating CI vs manual

### Phase 4 — Harden

- [ ] Destructive confirm for WebMCP-only path (do not break non-agent callers)
- [ ] `untrustedContentHint` on external-data tools
- [ ] Document tool list in `tools.txt` or OpenAPI fragment
- [ ] README section: flag, discovery flow, confirm rules

### Done criteria (machine-checkable)

```bash
npm run typecheck    # exit 0
npm test             # exit 0; includes new WebMCP unit tests
```

Manual (record in PR test plan):

- [ ] Read tool returns current UI state in flagged Chromium
- [ ] Write tool updates visible UI
- [ ] App works with flag off
- [ ] `delete` / equivalent destructive tool blocked without confirm

---

## 6. Execute contract

Every `execute` should follow this contract so agents and tests stay consistent.

```ts
execute: async (input, { signal } = {}) => {
  if (signal?.aborted) {
    return { ok: false, tool: 'my_tool', error: 'Tool call was aborted.' }
  }

  const parsed = MyInput.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      tool: 'my_tool',
      error: 'Invalid tool arguments.',
      issues: parsed.error.issues.map(/* path + message */),
    }
  }

  try {
    const result = await doWork(parsed.data, signal)
    return { ok: true, tool: 'my_tool', ...result }
  } catch (error) {
    return { ok: false, tool: 'my_tool', error: messageFrom(error) }
  }
}
```

Return JSON-serializable data only (plain objects, arrays, strings, numbers, booleans).

---

## 7. What not to do

- Register tools only in a service worker with no open page
- Throw when `modelContext` is missing
- Return raw stack traces or API keys to the agent
- Register 30 full schemas when 5 would cover 80% of journeys
- Ship tool changes with zero deterministic tests
- Split registrar into dozens of one-line files (split by **domain**, not by line count alone)

---

## 8. Reference layout in this repo

This project implements the patterns above:

| Artifact | Path |
|----------|------|
| Orchestrator | `client/webmcp/registerWebMcpTools.ts` |
| Catalog | `client/webmcp/catalog/createCatalog.ts` |
| Schemas | `client/webmcp/schemas/standaloneSchemas.ts` |
| Unit tests | `client/webmcp/*.test.ts` |
| Eval fixtures | `evals/webmcp/fixtures/` |
| Tool reference | `tools.txt` |
| Agent skills (rubrics) | `.agents/best practices/`, `.agents/webmcp-evals/`, `.agents/webmcp-page-tools/` |

When porting to another repo, copy the **structure and checklists**, not the canvas-specific tool names.

---

## 9. Quick copy-paste for agent prompts

```text
Implement WebMCP on this site using docs/webmcp-agent-guide.md.

Requirements:
- Feature-detect document.modelContext; no-op if missing
- Split: registerWebMcpTools (orchestrator) + catalog + schemas + execute helpers
- readOnlyHint / untrustedContentHint on every tool
- Destructive tools require confirm for WebMCP execute path only
- npm test covers pure helpers; evals/webmcp/fixtures/ has expectedCall JSON
- Do not touch backend MCP unless asked

Verify: npm run typecheck && npm test
Manual: Chromium webmcp-testing flag; call read then write tool; UI updates
```

---

## 10. Further reading in this repo

- `.agents/webmcp-page-tools/SKILL.md` — page API checklist
- `.agents/webmcp-evals/SKILL.md` — fixture shapes and failure modes
- `.agents/agent_tool_security/SKILL.md` — annotations and exposure
- `plans/001-webmcp-verification-baseline.md` — test baseline plan
- `plans/002-split-webmcp-registrar.md` — registrar split plan
