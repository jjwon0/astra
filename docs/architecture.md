# Architecture

Astra is a job-based automation system that processes voice memos into structured TODOs and notes in Notion. It runs as a background daemon on macOS.

## System Overview

```
┌─────────────────────────────────────────┐
│           Job Scheduler                 │
│       (Manages multiple jobs)           │
└─────┬──────────────────────────────────┘
      │
      ▼
┌─────────────┐
│VoiceMemoJob │  (runs every 5 min)
└─────┬───────┘
      │
      ├─> File Watcher     → detects new .m4a/.wav files
      ├─> Transcription    → audio to text (Gemini API)
      ├─> Organization     → text to structured JSON (Gemini API)
      ├─> Notion Sync      → creates pages in Notion
      └─> Archive          → copies processed files

Shared Services:
├─ Config Service (env + Notion schema)
├─ Logger Service
├─ State Service (per-job state)
└─ Archive Service
```

## Data Flow

1. **Job Scheduler starts**
   - Registers all enabled jobs
   - Runs each job on its configured interval

2. **VoiceMemoJob runs every 5 minutes**
   - File Watcher detects new audio files
   - Checks job state (skip already processed files)
   - For each new file:
     - Transcription (Gemini API) → raw text
     - Organization (Gemini AI) → structured JSON
     - Notion Sync (validation + page creation)
     - Archive (copy file to archive/)
     - Update job state (mark completed)

3. **State persists per-job**
   - `voiceMemo` state: processed files, failed files
   - Other jobs have their own isolated state

## Tech Stack

- **Runtime:** Bun + TypeScript
- **Scheduler:** Custom interval-based job scheduler
- **AI:** Gemini API (transcription + organization)
- **Storage:** Notion API (dynamic schema)
- **Configuration:** dotenv
- **Logging:** Plain text files with rotation

## Directory Structure

```
astra/
├── src/
│   ├── scheduler/
│   │   ├── Job.ts            # Job interface
│   │   └── JobScheduler.ts   # Job scheduling logic
│   ├── jobs/
│   │   └── VoiceMemoJob.ts   # Voice memo processing job
│   ├── services/
│   │   ├── config/
│   │   │   └── index.ts      # Config service (env + Notion schema)
│   │   └── core/
│   │       ├── fileWatcher.ts
│   │       ├── transcription.ts
│   │       ├── organization.ts
│   │       └── notionSync.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── archive.ts
│   │   └── state.ts
│   ├── types/
│   │   └── index.ts
│   └── index.ts              # Main entry point
├── docs/                     # Documentation
├── tests/                    # Integration tests
├── scripts/                  # Daemon scripts
├── logs/                     # Log files
├── archive/                  # Processed audio files
├── failed/                   # Failed files
├── .env                      # Environment variables
└── state.json                # Job state persistence
```

## Component Interactions

### Job Scheduler (`src/scheduler/`)

- Called by main entry point on startup
- Manages job registration, scheduling, and isolation
- Provides access to Config, State, and Logger for each job

### Jobs (`src/jobs/`)

- Each job implements the `Job` interface
- Jobs have independent intervals and state
- Currently only VoiceMemoJob is implemented

### Config Service (`src/services/config/`)

- Loads environment variables from `.env`
- Fetches Notion database schemas on startup
- Auto-creates Notion databases if missing

### Core Services (`src/services/core/`)

- **FileWatcher** - polls directory for new audio files
- **Transcription** - converts audio to text via Gemini
- **Organization** - extracts structured data via Gemini
- **NotionSync** - validates and creates Notion pages

### Utilities (`src/utils/`)

- **Logger** - plain text logging with rotation
- **Archive** - copies processed/failed files
- **State** - per-job state persistence

## Related Documentation

- [Configuration](config.md) - environment variables and Notion schema
- [Pipeline Services](pipeline.md) - transcription, organization, sync
- [Utilities](utilities.md) - logging, archiving, state management
- [Job System](jobs.md) - scheduler and adding new jobs
