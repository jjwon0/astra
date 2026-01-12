# Astra Webapp

Frontend application for Astra, deployed on Val Town.

**Live URL:** https://astral.val.run/

## Deployment

```bash
# Push changes to Val Town
vt push

# Watch for changes (auto-sync)
vt watch

# Open in browser
vt browse
```

## Structure

```
vals/
└── index.http.ts    # Main HTTP handler (Hono)
```

## API Endpoints

- `GET /` - Main page
- `GET /api/health` - Health check
- `GET /api/logs` - Log viewer API (placeholder)

## Local Development

```bash
# From monorepo root
bun run dev:webapp

# Or from this directory
bun run dev
```

Note: Local dev uses different imports than Val Town production.
