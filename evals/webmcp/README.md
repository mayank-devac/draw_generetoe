# WebMCP eval fixtures

These JSON files describe **expected agent tool calls** for the draw-app WebMCP surface. They follow the shape described in `.agents/webmcp-evals/SKILL.md`.

## What is automated today

- **Deterministic unit tests** run with `npm test` (Vitest). They cover pure helpers such as `redactSensitiveQueryParameters`, `inspectCanvasPages`, and `createCanvasPage`.
- **Fixtures in `fixtures/`** are not wired to CI yet. Use them with a WebMCP-compatible agent or the [webmcp-tools evals-cli](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/evals-cli) when running manual eval sessions.

## Running unit tests

```bash
npm test
```

Requires `happy-dom` so tldraw `Editor` can initialize in Node.

## Using fixtures

Each fixture includes:

- `messages` — user turns for the agent
- `applicationState.tools` — tool list the agent should see for that page state (include the full relevant set per the evals skill)
- `expectedCall` — ordered tool calls with arguments

For mid-chain failure cases, use `deterministicExecute` to call `document.modelContext.executeTool(...)` directly in a flagged Chromium tab instead of going through the model.

## Fixture index

| File | Intent |
|------|--------|
| `001-list-tools-first.json` | User asks what tools exist → `list_tools` |
| `002-new-page-workflow.json` | New drawing when page has content → `inspect_pages` then `create_page` |
| `003-invalid-commons-pageid.json` | Direct execute: bad `add_commons_image` pageId → structured error |
