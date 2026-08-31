---
name: WebMCP page tools
description: >-
  Use this when adding, reviewing, or debugging WebMCP tools on an open web page
  with document.modelContext.registerTool (not service workers, not backend
  MCP).
---
# WebMCP page tools

WebMCP lets an **open browser tab** expose named tools to an in-browser agent. The page is the tool server. The agent visits the live page, calls a tool, and the page’s JavaScript runs in that same tab so the human can see the UI change.

This is **not** backend [MCP](https://modelcontextprotocol.io/) (no HTTP/SSE/stdio server). This is **not** the service-worker explainer (`docs/service-workers.md`, `self.agent.provideContext`). Do not follow that file.

Canonical sources:

- Spec: https://webmachinelearning.github.io/webmcp/
- Chrome imperative API: https://developer.chrome.com/docs/ai/webmcp/imperative-api
- Chrome overview: https://developer.chrome.com/docs/ai/webmcp

## When not to use this skill

- Background tools with no tab open (service workers)
- `navigator.modelContext` as the only API (deprecated in Chromium 150; keep it only as a fallback alias)

## 1. Confirm the surface

The app must be a normal website:

- Runs in a **Window** (not a Worker)
- **Secure context**: `https://` or `http://localhost`
- Client-side JS on the page the human is looking at
- Human UI still works if WebMCP is missing

Feature-detect before registering:

```js
const modelContext = document.modelContext ?? navigator.modelContext;
if (!modelContext?.registerTool) {
  // Keep the human UI. Do not throw.
  return;
}
```

Prefer `document.modelContext`. Treat `navigator.modelContext` as a deprecated alias only.

## 2. Register tools on the live page

Register after the UI that the tool will drive exists (typically on mount). Unregister on unmount with `AbortSignal`.

```js
const controller = new AbortController();

await modelContext.registerTool(
  {
    name: "example_tool",
    description: "One sentence: what it does and when to call it.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
      },
      required: ["query"],
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false,
    },
    execute: async (input, { signal }) => {
      const result = doTheThing(input.query);
      return `Found ${result.length} items`;
    },
  },
  { signal: controller.signal },
);

// Later (component unmount, page teardown):
controller.abort();
```

Required fields: `name`, `description`, `execute`. `inputSchema` should be a JSON Schema object so the agent knows the args.

`search_products` in hackathon copy is an **example of this shape**, not a required tool name. Name tools for this app.

## 3. Name and schema rules

From the spec:

- `name`: length 1–128; only ASCII letters, digits, `_`, `-`, `.`
- `name` and `description` must be non-empty
- Duplicate `name` on the same document rejects registration
- Document must be fully active and allowed to use the `tools` permission policy (default `self`)

Write descriptions for the **agent**, not for marketing. Say when to call the tool, what it changes, and what to call next. Keep them honest: if `checkout` charges a card, say that.

Mark `annotations.readOnlyHint: true` only when the tool does not change state.

If `execute` returns data from the user or the open web, set `untrustedContentHint: true`.

## 4. What `execute` must do

- Run in the tab. Drive the **same** UI the human sees (play a note, place a block, fill a form). Do not only hit a hidden backend while the screen stays still.
- Accept `(input, { signal })`. Pass `signal` into `fetch` and long work so cancel actually stops.
- Return a value that `JSON.stringify` can handle (string, plain object, array, number, boolean). The spec stringifies the result. Do not return DOM nodes, class instances, or functions.
- Prefer a short string or `{ ok, summary, ... }` object. Chrome examples often return a sentence.
- Do not require a user gesture to *register*. For money, delete, or send, confirm in the page UI inside `execute`.

## 5. `getTools` is optional

`document.modelContext.getTools()` and `executeTool()` are for **in-page** JS agents. The browser’s own agent (ChatGPT in-app browser, Chrome agent) observes registered tools internally.

If `registerTool` exists and `getTools` does not, that is normal. Do not treat missing `getTools` as a failed integration.

## 6. Cross-origin iframes (only if needed)

Default: tools work on the top page and same-origin frames. Cross-origin iframes need:

1. Parent: `<iframe allow="tools" src="https://other.example">`
2. Child register options: `{ exposedTo: ["https://parent.example"] }` (HTTPS origins only)

Skip this unless the app actually embeds another origin.

## 7. Do not do these

- Do not copy `docs/service-workers.md` or `self.agent.provideContext`
- Do not register only in a service worker and skip the open page
- Do not ship tools that throw when `modelContext` is missing
- Do not use `document.domain` / `Origin-Agent-Cluster: ?0` (WebMCP is disabled)
- Do not assume headless Chrome will see tools; Chrome expects a real visit to the page
- Do not return images unless you have confirmed the current client accepts them; today’s typical path is **text** results. The page UI is what the human sees.

## 8. How to test

1. Serve the site (`localhost` or HTTPS).
2. Chrome 149+: enable `chrome://flags/#enable-webmcp-testing`, relaunch, open the page.
3. Or open the **deployed** URL in ChatGPT’s in-app browser.
4. Confirm tools appear (Chrome WebMCP inspector extension, or the agent’s tool list).
5. Call a read tool, then a write tool, and check the visible UI updated.
6. Disable the flag / use a browser without WebMCP and confirm the human UI still works.

## 9. Implementation checklist

When adding WebMCP to an app:

1. Feature-detect `document.modelContext`.
2. Register one tool that **reads** current page state.
3. Register one tool that **changes** that same state in the UI.
4. Unregister with `AbortSignal` on teardown.
5. Keep humans able to do the same actions without an agent.
6. Deploy HTTPS and test in ChatGPT in-app browser or flagged Chrome.

If the request is “add WebMCP to this site,” implement the page API above. Do not build a service-worker MCP shim unless the user explicitly asked for that future explainer.
