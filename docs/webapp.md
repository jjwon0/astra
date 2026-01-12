# Astra Webapp

Frontend application deployed on Val Town.

## Live URL

https://astral.val.run/

## Val Town Deployment

The webapp is deployed via the `vt` CLI.

```bash
cd packages/astra-webapp

# Push changes to Val Town
vt push

# Watch for changes (auto-sync)
vt watch

# Open in browser
vt browse
```

## Project Structure

```
packages/astra-webapp/
├── vals/
│   └── index.http.ts    # Main HTTP handler (Hono)
├── .vt/                 # Val Town metadata (do not edit)
├── deno.json            # Deno/Val Town config
├── .vtignore            # Files excluded from Val Town
├── AGENTS.md            # AI coding guidelines
└── README.md
```

## Val Town Conventions

### HTTP Triggers

Files with `.http.ts` suffix are HTTP handlers. Export the Hono fetch handler:

```typescript
import { Hono } from "https://esm.sh/hono@4";

const app = new Hono();

app.get("/", (c) => c.text("Hello"));

// Required export for Val Town
export default app.fetch;
```

### Imports

Use `https://esm.sh` for npm packages to ensure browser/server compatibility:

```typescript
import { Hono } from "https://esm.sh/hono@4";
```

### Environment Variables

```typescript
const apiKey = Deno.env.get("MY_API_KEY");
```

### Storage Options

- **Blob storage**: Simple key-value for JSON/text
- **SQLite**: Relational data via `@stevekrouse/sqlite`

```typescript
// Blob
import { blob } from "https://esm.town/v/std/blob";
await blob.setJSON("key", { data: "value" });

// SQLite
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";
await sqlite.execute("SELECT * FROM users");
```

### Best Practices

- Use TailwindCSS via `<script src="https://cdn.twind.style" crossorigin></script>`
- Add error capture: `<script src="https://esm.town/v/std/catch"></script>`
- Re-throw Hono errors for full stack traces:
  ```typescript
  app.onError((err) => { throw err; });
  ```
- Use `Response` redirect instead of `Response.redirect` (broken in Val Town):
  ```typescript
  return new Response(null, { status: 302, headers: { Location: "/path" }});
  ```

## Local Development

The webapp can also run locally with Bun for testing:

```bash
# From monorepo root
bun run dev:webapp
```

Note: Local dev uses different imports than Val Town. The deployed version uses `esm.sh` imports.
