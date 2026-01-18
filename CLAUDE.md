# Astra - Development Guide

## Monorepo Structure

This is a Bun monorepo with two packages:

```
astra/
├── packages/
│   ├── astra-scheduler/     # Standalone job scripts
│   │   ├── src/             # Source code
│   │   └── tests/           # Integration tests
│   └── astra-webapp/        # Val Town frontend
│       └── vals/            # Val Town HTTP handlers
├── docs/                    # Project documentation
├── scripts/                 # Bot daemon scripts
└── package.json             # Workspace root
```

**Runtime data** is stored in `~/.astra/` (auto-created on first run).

## Runtime

This project uses **Bun** as the runtime with Bun workspaces.

```bash
# Run voice memo job
bun run voice-memo

# Run journal processing job
bun run journal

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

Standalone job scripts for processing voice memos and syncing to Notion.

```
packages/astra-scheduler/src/
├── jobs/                 # Job implementations and entrypoints
│   ├── VoiceMemoJob.ts   # Voice memo processing job
│   ├── voice-memo.ts     # Entrypoint for voice memo job
│   ├── JournalProcessingJob.ts
│   └── journal.ts        # Entrypoint for journal job
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
- **Runtime data in ~/.astra/** - State, logs, and archives stored outside repo:
  - `~/.astra/state.json` - Tracks processed files
  - `~/.astra/logs/astra.log` - Application logs (auto-rotated at 10MB)
  - `~/.astra/archive/` - Processed voice memos
  - `~/.astra/failed/`, `~/.astra/invalid/` - Failed/invalid files

## Documentation

**IMPORTANT:** Documentation must stay in sync with code. When making changes, always update the relevant docs in `docs/` as part of the same commit:

- `docs/architecture.md` - System overview and component interactions
- `docs/config.md` - Environment variables and Notion setup
- `docs/pipeline.md` - Core pipeline services (transcription, organization, sync)
- `docs/utilities.md` - Logger, archive, state services
- `docs/jobs.md` - Job system and adding new jobs
- `docs/webapp.md` - Val Town webapp deployment and conventions

## Adding a New Job

1. Create the job class in `packages/astra-scheduler/src/jobs/`:

```typescript
// MyJob.ts
import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';

export class MyJob {
  name = 'myJob';

  constructor(config: ConfigService) {}

  async execute(config: ConfigService, state: StateService, logger: Logger) {
    // Job logic here
  }
}
```

2. Create an entrypoint in the same directory:

```typescript
// my-job.ts
import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';
import { MyJob } from './MyJob';

async function main() {
  const config = new ConfigService();
  await config.initialize();

  const env = config.getEnv();
  const state = new StateService(env.STATE_FILE);
  const logger = new Logger(env.LOG_FILE);

  const job = new MyJob(config);
  await job.execute(config, state, logger);
}

main().catch(console.error);
```

3. Add a script to `package.json`:

```json
{
  "scripts": {
    "my-job": "bun run packages/astra-scheduler/src/jobs/my-job.ts"
  }
}
```

See [docs/jobs.md](docs/jobs.md) for detailed documentation.

## Configuration

Copy `.env.example` to `.env` and fill in:

- `GEMINI_API_KEY` - Google Gemini API key
- `NOTION_API_KEY` - Notion integration token
- `PARENT_PAGE_ID` - Notion page where databases will be created

The config service auto-creates Notion databases on first run if they don't exist.

## Logs

```bash
tail -f ~/.astra/logs/astra.log
```
