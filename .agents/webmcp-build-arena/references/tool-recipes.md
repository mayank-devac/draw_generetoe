# Tool recipes (copy these)

Use with `SKILL.md`. Each recipe is one WebMCP tool: schema, execute, expected result. Put schemas in `src/webmcp/tool-schemas.ts` and wrappers in `src/webmcp/register-arena-tools.ts`.

Shared pieces:

```ts
const coord = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "z"],
  properties: {
    x: { type: "integer", description: "Ground axis X. Platform centre is 0." },
    y: { type: "integer", description: "Height. Platform is 0 and is not editable. Builds start at 1." },
    z: { type: "integer", description: "Ground axis Z. Platform centre is 0." },
  },
};

const blockId = {
  type: "string",
  enum: ["dirt", "stone", "oak_log", "oak_planks", "leaves", "glass", "obsidian"],
  description: "Phase A full-cube block id.",
};
```

Write results always:

```ts
// success
{ success: true, revision, affectedBlocks, affectedBounds: { min, max }, warnings: string[], undoId }
// failure
{ success: false, error: string, fieldPath?: string }
```

---

## New tool worksheet

Fill this, then code. If a box is empty, do not register the tool yet.

1. Human can already do this via which command? `________________`
2. Tool name (`verb_noun`): `________________`
3. Read, UI write, or arena mutation? Arena mutations require `expectedRevision`.
4. Input fields (name, type, required, max): `________________`
5. Engine function to call: `________________`
6. Result fields the next agent step needs: `________________`
7. AbortController registered in arena mount? yes / no

---

## 1. `get_arena_context` (read first)

```ts
{
  name: "get_arena_context",
  description: "Returns coordinate convention, current X/Z/Y bounds, platform Y, revision, Phase A block ids, and operation limits.",
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
  execute() {
    return engine.getContext();
  },
  annotations: { readOnlyHint: true },
}
```

Return at least: `coordinateOrder: "x,y,z"`, `bounds`, `platformY: 0`, `revision`, `blockTypes`, `limits.maxEditsPerCall`.

---

## 2. `get_build_summary` (read)

```ts
{
  name: "get_build_summary",
  description: "Returns occupied bounds, total block count, counts by type, validation counts, and revision. Does not return every block.",
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
  execute() {
    return engine.getSummary();
  },
  annotations: { readOnlyHint: true },
}
```

---

## 3. `query_blocks` (read)

```ts
inputSchema: {
  type: "object",
  additionalProperties: false,
  properties: {
    min: { ...coord, description: "Inclusive region minimum. Omit to use arena min." },
    max: { ...coord, description: "Inclusive region maximum. Omit to use arena max." },
    y: { type: "integer", description: "If set, only this height layer." },
    blockType: { ...blockId, description: "If set, only this block id." },
    limit: { type: "integer", minimum: 1, maximum: 500, default: 200, description: "Max blocks returned." },
    offset: { type: "integer", minimum: 0, default: 0 },
  },
}
```

Return `{ revision, blocks: [{ x, y, z, blockType, state? }], truncated: boolean }`.

---

## 4. `get_build_slices` (read)

```ts
inputSchema: {
  type: "object",
  additionalProperties: false,
  required: ["axis", "index"],
  properties: {
    axis: { type: "string", enum: ["y", "x", "z"], description: "y = top X/Z, x = Z/Y slice, z = X/Y slice." },
    index: { type: "integer", description: "Layer along that axis." },
  },
}
```

Return a 2D grid of block ids (and `air`). This is the source of truth, not screenshots.

---

## 5. `set_manual_edit_lock` (write)

Call with `{ locked: true }` before the final read that informs an arena mutation. Call with `{ locked: false }` after agent work completes, including failure cleanup. It does not change the arena revision. The page blocks human place/remove, undo/redo, JSON apply, and resizing while locked; a five-minute inactivity timeout and the human Unlock control recover abandoned locks.

---

## 6. `set_blocks` (write)

```ts
inputSchema: {
  type: "object",
  additionalProperties: false,
  required: ["expectedRevision", "edits"],
  properties: {
    expectedRevision: { type: "integer", description: "Must match current world revision or the call is rejected." },
    dryRun: { type: "boolean", description: "If true, validate and return what would change without writing." },
    edits: {
      type: "array",
      minItems: 1,
      maxItems: 256,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y", "z", "op"],
        properties: {
          x: { type: "integer" },
          y: { type: "integer", minimum: 1, description: "Must be >= 1. y = 0 is the platform." },
          z: { type: "integer" },
          op: { type: "string", enum: ["place", "replace", "remove"] },
          blockType: { ...blockId, description: "Required for place and replace." },
        },
      },
    },
  },
}
```

`replace` is one engine command, never remove-then-place. Every place/replace names `blockType` in the same edit.

---

## 7. `generate_shape` (write)

```ts
inputSchema: {
  type: "object",
  additionalProperties: false,
  required: ["expectedRevision", "shape", "blockType", "min", "max"],
  properties: {
    expectedRevision: { type: "integer" },
    dryRun: { type: "boolean" },
    shape: { type: "string", enum: ["floor", "wall", "filled_box", "hollow_box"] },
    blockType: blockId,
    min: coord,
    max: coord,
    runString: {
      type: "string",
      description: "Optional compact pattern such as oak_planks_1-(x5). Parsed by pattern-dsl.ts into this same command.",
    },
  },
}
```

If `runString` is present, parse it into min/max/axis/count, then call `generate_shape`. Do not bypass validation.

---

## 8. `undo_build_change` (write)

```ts
inputSchema: {
  type: "object",
  additionalProperties: false,
  required: ["expectedRevision"],
  properties: {
    expectedRevision: { type: "integer" },
    undoId: { type: "string", description: "If omitted, undo the latest eligible change." },
  },
}
```

---

## 9. `render_build_views`

Update the visible diagnostics panel. Return view ids / metadata, not huge image dumps by default.

```ts
inputSchema: {
  type: "object",
  additionalProperties: false,
  properties: {
    views: {
      type: "array",
      items: { type: "string", enum: ["top", "front", "right", "iso"] },
      description: "Which visible views to refresh. Default top only.",
    },
    highlight: { description: "Optional bounds to outline.", ...{ type: "object" } },
  },
}
```

---

## 10. `transform_region` (write, after 1–8 work)

Ops: `copy`, `move`, `rotate`, `mirror`, `replace_type`. Right-angle rotates only. Mirror across X or Z. Always `expectedRevision`.

---

## Register helper

```ts
export async function registerArenaTools(engine: ArenaEngine, signal: AbortSignal) {
  const ctx = document.modelContext;
  if (!ctx?.registerTool) return { registered: false };

  const tools = [
    makeGetArenaContextTool(engine),
    makeGetBuildSummaryTool(engine),
    makeQueryBlocksTool(engine),
    makeGetBuildSlicesTool(engine),
    makeSetBlocksTool(engine),
    makeGenerateShapeTool(engine),
    makeUndoBuildChangeTool(engine),
  ];

  for (const tool of tools) {
    await ctx.registerTool(tool, { signal });
  }
  return { registered: true, count: tools.length };
}
```

Call from the arena page `useEffect`. Abort on cleanup.
