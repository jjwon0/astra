# Astra - Development Guide

## Monorepo Structure

This is a Bun monorepo with two packages:

```
astra/
├── packages/
│   ├── astra-scheduler/     # Background job scheduler
│   │   ├── src/             # Scheduler source code
│   │   └── tests/           # Integration tests
│   └── astra-webapp/        # Val Town frontend
│       └── vals/            # Val Town HTTP handlers
├── docs/                    # Project documentation
├── scripts/                 # Daemon scripts
├── logs/                    # Runtime logs (git-ignored)
└── package.json             # Workspace root
```

## Runtime

This project uses **Bun** as the runtime with Bun workspaces.

```bash
# Run scheduler
bun run dev

# Run webapp
bun run dev:webapp

# Run all tests
bun run test

# Linting and formatting
bun run lint
bun run lint:fix
bun run format
bun run format:check
```

## Packages

### astra-scheduler

Background job scheduler for processing voice memos and syncing to Notion.

```
packages/astra-scheduler/src/
├── index.ts              # Main entry point
├── scheduler/            # Job scheduler
│   ├── Job.ts            # Job interface
│   └── JobScheduler.ts   # Scheduler implementation
├── jobs/                 # Job implementations
│   └── VoiceMemoJob.ts   # Voice memo processing job
├── services/
│   ├── config/           # Environment and Notion schema loading
│   └── core/             # Pipeline services (transcription, organization, notionSync)
├── utils/                # Logger, archive, state utilities
└── types/                # TypeScript type definitions
```

### astra-webapp

Val Town frontend for viewing logs (and future customer-facing features).

**Live URL:** https://astral.val.run/

```
packages/astra-webapp/
├── vals/
│   └── index.http.ts     # Main HTTP handler (Hono)
├── .vt/                  # Val Town metadata
├── deno.json             # Deno/Val Town config
└── .vtignore             # Files excluded from Val Town
```

**Deployment:**
```bash
cd packages/astra-webapp
vt push      # Deploy to Val Town
vt watch     # Auto-sync on file changes
vt browse    # Open in browser
```

See [docs/webapp.md](docs/webapp.md) for Val Town conventions and best practices.

## Key Patterns

- **No Bun-specific APIs** - The codebase uses standard Node.js/Web APIs for portability
- **Tests colocated with source** - Unit tests are `*.test.ts` next to the files they test
- **Integration tests separate** - Located in `packages/astra-scheduler/tests/`
- **State persistence** - `state.json` tracks processed files (git-ignored, at repo root)
- **Logs** - Written to `logs/astra.log` with automatic rotation at 10MB

## Documentation

**IMPORTANT:** Documentation must stay in sync with code. When making changes, always update the relevant docs in `docs/` as part of the same commit:

- `docs/architecture.md` - System overview and component interactions
- `docs/config.md` - Environment variables and Notion setup
- `docs/pipeline.md` - Core pipeline services (transcription, organization, sync)
- `docs/utilities.md` - Logger, archive, state services
- `docs/jobs.md` - Job system and adding new jobs
- `docs/webapp.md` - Val Town webapp deployment and conventions

## Adding a New Job

1. Create a new file in `packages/astra-scheduler/src/jobs/` implementing the `Job` interface:

```typescript
import type { Job } from '../scheduler/Job';

export class MyJob implements Job {
  name = 'myJob';
  intervalMinutes = 10;
  enabled = true;

  async execute(config, state, logger) {
    // Job logic here
  }
}
```

2. Register the job in `packages/astra-scheduler/src/index.ts`:

```typescript
import { MyJob } from './jobs/MyJob';

const myJob = new MyJob(config);
scheduler.register(myJob);
```

See [docs/jobs.md](docs/jobs.md) for detailed documentation.

## Configuration

Copy `.env.example` to `.env` and fill in:

- `GEMINI_API_KEY` - Google Gemini API key
- `NOTION_API_KEY` - Notion integration token
- `PARENT_PAGE_ID` - Notion page where databases will be created

The config service auto-creates Notion databases on first run if they don't exist.

## Running as a Daemon

```bash
# Install as macOS launchd service
./scripts/install-daemon.sh

# Uninstall
./scripts/uninstall-daemon.sh

# View logs
tail -f logs/astra.log
```
