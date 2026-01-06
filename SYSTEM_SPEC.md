# Astra - Personal Automation System

## Project Overview

**Name:** Astra
**Purpose:** Extensible job-based automation system for personal tasks
**Platform:** macOS homelab
**User:** Single-user, personal use

Astra is a job-based automation system that currently processes voice memos (transcribing, organizing, and syncing to Notion), with a simple framework for adding future jobs like email summaries, backups, or other automated tasks.

---

## Architecture

```
┌─────────────────────────────────────────┐
│        Job Scheduler                 │
│  (Manages multiple jobs)            │
└─────┬──────────────┬───────────────┘
      │              │
      │              │
      ▼              ▼
┌─────────────┐  ┌─────────────┐
│VoiceMemoJob │  │ Future Jobs │
│ (5 min)     │  │ (...)       │
└─────┬───────┘  └─────────────┘
      │
      ▼
┌─────────────────┐
│ File Watcher    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Transcription   │
│ (Gemini API)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Organization    │
│ (Gemini +       │
│  Dynamic Schema)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Notion Sync     │
│ (Validation +   │
│  Page Creation) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Archive Files   │
└─────────────────┘

         Shared Services:
         ├─ Config Service (env + Notion schema)
         ├─ Logger Service
         ├─ State Service (per-job state)
         └─ Archive Service
```

┌─────────────────┐
│ iOS Voice Memos │
└────────┬────────┘
│ iCloud Sync
▼
┌─────────────────┐
│ File Watcher │ ◄──────┐
│ (5 min polling) │ │
└────────┬────────┘ │
│ │
▼ │
┌─────────────────┐ │
│ Transcription │ │
│ (Gemini API) │ │
└────────┬────────┘ │
│ │
▼ │
┌─────────────────┐ │
│ Organization │ │
│ (Gemini + │ │
│ Dynamic Schema)│ │
└────────┬────────┘ │
│ │
▼ │
┌─────────────────┐ │
│ Notion Sync │ │
│ (Validation + │ │
│ Page Creation) │ │
└────────┬────────┘ │
│ │
▼ │
┌─────────────────┐ │
│ Archive Files │ │
│ Log Completion │ │
└─────────────────┘ │
│
▼
┌─────────────────┐
│ Config Service │
│ (Schema Fetch) │
└─────────────────┘

```

---

## Tech Stack

- **Runtime:** Bun + TypeScript
- **Scheduler:** Custom job scheduler (interval-based)
- **AI:** Gemini API (transcription + organization)
- **Storage:** Notion API (dynamic schema)
- **Configuration:** dotenv
- **Logging:** Plain text files
- **File System:** macOS native file system operations

---

## Complete Data Flow

```

1. Job Scheduler starts
   └─> Registers all enabled jobs
   └─> Starts each job on its interval

2. VoiceMemoJob runs every 5 minutes
   ├─> File Watcher detects new audio files
   ├─> Checks job state (already processed?)
   └─> For each new file:
   ├─> Transcription (Gemini API) → Raw text
   ├─> Organization (Gemini AI) → Structured JSON
   ├─> Notion Sync (Validation + Page Creation)
   ├─> Archive (Copy file to archive/)
   └─> Update job state (mark completed)

3. State is persisted per-job
   └─> voiceMemo state: processedFiles, failedFiles
   └─> Other jobs have their own state

4. Repeat on interval
   └─> VoiceMemoJob: every 5 minutes
   └─> Future jobs: on their own intervals

```

---

## Directory Structure

```

astra/
├── src/
│ ├── scheduler/
│ │ ├── Job.ts # Job interface
│ │ └── JobScheduler.ts # Job scheduling logic
│ ├── jobs/
│ │ └── VoiceMemoJob.ts # Voice memo processing job
│ ├── services/
│ │ ├── config/
│ │ │ └── index.ts # Config service (env + Notion schema)
│ │ ├── core/
│ │ │ ├── transcription.ts # Gemini audio → text
│ │ │ ├── organization.ts # Gemini text → JSON
│ │ │ └── notionSync.ts # Notion API + validation
│ │ └── utils/
│ │ ├── logger.ts # Plain text logging
│ │ ├── archive.ts # File archiving
│ │ └── state.ts # Per-job state tracking
│ ├── types/
│ │ └── index.ts # TypeScript contracts
│ └── index.ts # Main entry point (job registration)
├── SPECS/
│ ├── SYSTEM_SPEC.md # This file
│ ├── 1_CONFIG.md
│ ├── 2_CORE_PIPELINE.md
│ ├── 3_UTILITIES.md
│ └── 4_JOB_SCHEDULER.md # Job scheduler
├── logs/
│ └── astra.log # Plain text logs
├── archive/ # Processed audio files
├── failed/ # Files that failed processing
├── .env # Environment variables
├── .env.example # Environment template
├── package.json
├── tsconfig.json
└── README.md

````

---

## Component Integration

### Job Scheduler (`src/scheduler/`)
- **Called by:** Main entry point on startup
- **Provides:** Job registration, scheduling, isolation
- **Uses:** Config (per-job config), State (per-job state), Logger
- **Manages:** Multiple jobs with different intervals

### Jobs (`src/jobs/`)
- **VoiceMemoJob** - Current voice memo processing
- **Future jobs** - Any additional automation tasks
- **Each job:** Implements Job interface, has own config and state

### Config Service (`src/services/config/`)
- **Called by:** All jobs and services
- **Provides:** Environment variables, Notion schema
- **Updates:** Notion schema on startup, cached for runtime
- **Creates:** Notion databases if missing (auto-setup)

### Core Services (`src/services/core/`)
- **Transcription** - Gemini audio → text
- **Organization** - Gemini text → JSON with dynamic enums
- **NotionSync** - Notion API + validation + page creation
- **Called by:** Jobs that need these capabilities

### Utilities (`src/services/utils/`)
- **Called by:** All services and jobs
- **Provides:** Logging, file archiving, state persistence (per-job)
- **Updates:** Log files, archive directory, state file

---

## Default Configuration Values

### Environment Variables

```bash
# API Keys
GEMINI_API_KEY=<your_gemini_key>
NOTION_API_KEY=<your_notion_integration_token>

# Notion Configuration
PARENT_PAGE_ID=<your_notion_parent_page_id>
NOTION_TODO_DATABASE_ID=<todo_db_id_or_empty>
NOTION_NOTES_DATABASE_ID=<notes_db_id_or_empty>

# Voice Memo Job Configuration
VOICE_MEMO_JOB_ENABLED=true
VOICE_MEMO_JOB_INTERVAL_MINUTES=5
VOICE_MEMOS_DIR=~/Library/Mobile Documents/.../Voice Memos/
ARCHIVE_DIR=./archive/
FAILED_DIR=./failed/

# Global Configuration
LOG_FILE=./logs/astra.log
MAX_RETRIES=3
````

### Notion Schema Defaults

**TODO Database:**

- Priority options: ["asap", "soon", "eventually"]

**Notes Database:**

- Category options: ["project idea", "feature idea", "research item", "general"]

---

## Deployment Overview

### Development Mode

```bash
bun run dev
```

- Runs in foreground
- Verbose logging
- Manual execution for testing

### Production Mode (macOS Daemon)

```bash
# Create launchd plist file
# Enable service to run in background
# Auto-restart on crash
```

### Monitoring

- Check logs: `tail -f ./logs/astra.log`
- Check job status: Logs show job execution and errors
- Failed files: Check `failed/` directory

---

## Adding New Jobs

1. Create new job class in `src/jobs/` implementing Job interface
2. Add per-job environment variables
3. Register job in `src/index.ts`
4. Job runs automatically on its interval

---

## Related Documentation

- [Config Service Spec](SPECS/1_CONFIG.md) - Environment variables, Notion schema, auto-setup
- [Core Pipeline Spec](SPECS/2_CORE_PIPELINE.md) - Watch, transcribe, organize, sync
- [Utilities Spec](SPECS/3_UTILITIES.md) - Logging, archiving, state management
- [Job Scheduler Spec](SPECS/4_JOB_SCHEDULER.md) - Job system, registration, scheduling
