# Astra - Development Guide

## Runtime

This project uses **Bun** as the runtime. TypeScript files are executed directly without a build step.

```bash
# Run the application
bun run dev

# Run tests (Vitest)
bun run test
bun run test:watch
bun run test:coverage

# Linting and formatting
bun run lint
bun run lint:fix
bun run format
bun run format:check
```

## Project Structure

```
src/
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

tests/                    # Integration tests
docs/                     # Documentation
scripts/                  # Daemon install/uninstall scripts
```

## Key Patterns

- **No Bun-specific APIs** - The codebase uses standard Node.js/Web APIs (fs, fetch, etc.) for portability
- **Tests colocated with source** - Unit tests are `*.test.ts` next to the files they test
- **Integration tests separate** - Located in `tests/` directory
- **State persistence** - `state.json` tracks processed files (git-ignored)
- **Logs** - Written to `logs/astra.log` with automatic rotation at 10MB

## Documentation

**IMPORTANT:** Documentation must stay in sync with code. When making changes, always update the relevant docs in `docs/` as part of the same commit:

- `docs/architecture.md` - System overview and component interactions
- `docs/config.md` - Environment variables and Notion setup
- `docs/pipeline.md` - Core pipeline services (transcription, organization, sync)
- `docs/utilities.md` - Logger, archive, state services
- `docs/jobs.md` - Job system and adding new jobs

**What to update:**
- New environment variables → `docs/config.md`
- New/modified service interfaces → `docs/pipeline.md` or `docs/utilities.md`
- New archive destinations or behaviors → `docs/utilities.md`
- Architectural changes → `docs/architecture.md`

## Architecture

The scheduler supports multiple concurrent jobs. VoiceMemoJob is the current implementation:

```
JobScheduler
    └── VoiceMemoJob (runs every 5 min)
            ├── FileWatcher     → finds new audio files
            ├── Transcription   → audio → text (Gemini API)
            ├── Organization    → text → structured JSON (Gemini API)
            ├── NotionSync      → creates pages in Notion
            └── Archive         → moves processed files
```

## Adding a New Job

1. Create a new file in `src/jobs/` implementing the `Job` interface:

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

2. Register the job in `src/index.ts`:

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
