# WebMCP eval fixtures

These JSON files describe **expected agent tool calls** for the draw-app WebMCP surface. They follow the shape described in `.agents/webmcp-evals/SKILL.md`.

## What is automated today

- **Deterministic unit tests** run with `npm test` (Vitest). They cover pure helpers, catalog assembly, schema shaping, and fixture validation logic.
- **Fixture shape validation** runs with `npm run test:webmcp-evals`. It parses every file in `fixtures/` and cross-checks tool names against `ALL_TOOL_NAMES`.
- **Live WebMCP sessions** are still manual. Use a WebMCP-compatible agent or the [webmcp-tools evals-cli](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/evals-cli) for end-to-end evals.

## Running unit tests

```bash
npm test
```

Requires `happy-dom` so tldraw `Editor` can initialize in Node.

## Validating fixtures

```bash
npm run test:webmcp-evals
```

Checks:

- JSON parses and matches the fixture schema (`messages`, optional `applicationState`, `expectedCall` or `deterministicExecute`)
- Every referenced tool name exists in the registered WebMCP catalog (`client/webmcp/toolNames.ts`)

This does **not** execute tools in a browser or call a model.

## Using fixtures manually

Each fixture includes:

- `messages` — user turns for the agent
- `applicationState.tools` — tool list the agent should see for that page state (include the full relevant set per the evals skill)
- `expectedCall` — ordered tool calls with arguments (isolation / selection evals)
- `deterministicExecute` — optional direct `executeTool` check for mid-chain failures

For mid-chain failure cases, use `deterministicExecute` to call `document.modelContext.executeTool(...)` directly in a flagged Chromium tab instead of going through the model.

## Fixture index

| File | Intent |
|------|--------|
| `001-list-tools-first.json` | User asks what tools exist → `list_tools` |
| `002-new-page-workflow.json` | New drawing when page has content → `inspect_pages` then `create_page` |
| `003-invalid-commons-pageid.json` | Direct execute: bad `add_commons_image` pageId → structured error |
