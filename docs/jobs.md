# Job System

Jobs are standalone scripts that run once and exit. They are invoked directly via npm scripts or scheduled externally (e.g., cron, launchd).

## Running Jobs

```bash
# Process voice memos
bun run voice-memo

# Process journal entries
bun run journal
```

## Current Jobs

### VoiceMemoJob

Processes voice memos into Notion TODOs, notes, and journal entries.

```bash
bun run voice-memo
```

**Pipeline:** FileWatcher → Transcription → Organization → NotionSync → Archive

### JournalProcessingJob

Processes aggregated journal entries with AI summarization.

```bash
bun run journal
```

**Status:** Stubbed - implementation pending.

## Per-Job State

Each job has isolated state in `~/.astra/state.json`:

```json
{
  "jobs": {
    "voiceMemo": {
      "voice_memo_001.m4a": "completed",
      "failed": ["voice_memo_003.m4a"]
    },
    "journalProcessing": {
      "lastRun": "2025-01-05T09:00:00Z"
    }
  }
}
```

Jobs access their state via:

```typescript
const jobState = state.getJobState('jobName');
// ... modify state ...
state.saveJobState('jobName', jobState);
```

## Adding a New Job

### 1. Create the Job Class

```typescript
// src/jobs/MyJob.ts
import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';

export class MyJob {
  name = 'myJob';

  constructor(config: ConfigService) {
    // Initialize with config
  }

  async execute(config: ConfigService, state: StateService, logger: Logger): Promise<void> {
    logger.info('MyJob starting');

    // Get job-specific state
    const jobState = state.getJobState(this.name);

    // Job logic here
    // ...

    // Save state
    state.saveJobState(this.name, jobState);

    logger.info('MyJob completed');
  }
}
```

### 2. Create the Entrypoint

```typescript
// src/jobs/my-job.ts
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

### 3. Add Script to package.json

```json
{
  "scripts": {
    "my-job": "bun run packages/astra-scheduler/src/jobs/my-job.ts"
  }
}
```

### 4. Add Tests

```typescript
// src/jobs/MyJob.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MyJob } from './MyJob';

describe('MyJob', () => {
  it('executes successfully', async () => {
    const job = new MyJob(mockConfig);
    await job.execute(mockConfig, mockState, mockLogger);
    // assertions
  });
});
```

## Scheduling Jobs

Jobs are designed to run once and exit. For recurring execution, use external schedulers like cron:

```bash
# Run voice memo job every 5 minutes
*/5 * * * * cd /path/to/astra && bun run voice-memo
```

## Directory Structure

```
src/
├── jobs/
│   ├── VoiceMemoJob.ts      # Voice memo job class
│   ├── VoiceMemoJob.test.ts # Tests
│   ├── voice-memo.ts        # Entrypoint
│   ├── JournalProcessingJob.ts
│   └── journal.ts           # Entrypoint
└── services/
    └── config/              # Shared configuration
```
