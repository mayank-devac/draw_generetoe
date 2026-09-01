# WebMCP judge build (ChatGPT Sites)

This repo supports a **judge-only** static build without removing chat, Worker, or MCP bridge code. The full dev app is unchanged (`npm run dev`).

## Local preview

```bash
npm run dev:judge 
```

Open http://127.0.0.1:5173/ — canvas only, WebMCP tools register as usual, no chat panel.

Production artifact:

```bash
npm run build:judge
npm run preview:judge
```

Output directory: `dist-judge/` (static SPA, no Cloudflare Worker).

## How it works

- `vite.config.judge.ts` — Vite + React only (no `@cloudflare/vite-plugin`)
- `VITE_JUDGE_MODE=true` is baked in via Vite `define`
- `client/judgeMode.ts` — `isJudgeMode` flag
- `App.tsx` — hides `ChatPanel`, chat highlights, and helper buttons when judge mode is on

## Deploy with ChatGPT Sites

1. **Requirements:** ChatGPT Plus, Pro, Business, Enterprise, or Edu. Use the [ChatGPT desktop app](https://chatgpt.com/download) or **Work** on chatgpt.com.
2. Open **More → Sites** or [chatgpt.com/sites](https://chatgpt.com/sites).
3. Prompt (include **website** or **@Sites**):

   ```text
   Deploy this project with Sites for the WebMCP hackathon judge demo.

   Build command: npm run build:judge
   Static output directory: dist-judge

   Do not deploy the Cloudflare Worker. This is a client-only SPA.
   VITE_JUDGE_MODE is already set in vite.config.judge.ts.

   After deploy, set sharing to anyone on the internet so judges can open the URL.
   ```

4. **Save a version** → review preview → **Deploy a version**.
5. Copy the live URL for Devpost.

## Judge testing checklist

1. Chrome/Edge **146+** with `chrome://flags/#enable-webmcp-testing` → **Enabled** → Relaunch
2. Open the live URL
3. DevTools: `typeof document.modelContext?.registerTool === 'function'` → `true`
4. Agent flow: `list_tools` → `describe_tools({ names: [...] })` → e.g. `create`, `inspect_pages`
5. Destructive tools need `confirm: true` after user approval (`delete`, `clear`)

## Devpost submission

Include on the form:

- **Live URL** (ChatGPT Sites or other host using `build:judge`)
- **Public GitHub repo** with open-source license
- **Testing instructions** (flag + tool discovery flow above)
- **&lt; 3 min YouTube demo** showing WebMCP tools on the canvas

Your main repo keeps all code; only the judge build omits chat and backend at runtime.
