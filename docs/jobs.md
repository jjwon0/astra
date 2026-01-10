# Job System

The job scheduler manages multiple independent jobs that run on configurable intervals.

## Job Interface

```typescript
interface Job {
  name: string; // Unique job identifier
  intervalMinutes: number; // Run interval in minutes
  enabled: boolean; // Enable/disable job

  execute(config: Config, state: JobState, logger: Logger): Promise<void>;
}
```

## Job Scheduler

The scheduler registers jobs and runs them on their configured intervals.

```typescript
class JobScheduler {
  register(job: Job): void; // Add a job
  start(): void; // Start all enabled jobs
  stop(): void; // Stop all jobs (graceful shutdown)
}
```

### Scheduling Behavior

- Each registered job runs every `intervalMinutes`
- Jobs run independently (no blocking between jobs)
- Job failures are logged but don't stop other jobs
- Disabled jobs are skipped
- Jobs are also executed immediately on startup

## Current Jobs

### VoiceMemoJob

Processes voice memos into Notion TODOs and notes.

```bash
# Configuration
VOICE_MEMO_JOB_ENABLED=true
VOICE_MEMO_JOB_INTERVAL_MINUTES=5
VOICE_MEMOS_DIR=~/Library/Mobile Documents/.../Voice Memos/
```

**Interval:** 5 minutes

**Pipeline:** FileWatcher → Transcription → Organization → NotionSync → Archive

## Per-Job State

Each job has isolated state in `state.json`:

```json
{
  "jobs": {
    "voiceMemo": {
      "voice_memo_001.m4a": "completed",
      "failed": ["voice_memo_003.m4a"]
    },
    "otherJob": {
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

## Error Handling

- Each job runs in a try/catch block
- Job failures are logged but scheduler continues
- Other jobs are unaffected by a failing job

```typescript
try {
  await job.execute(config, jobState, logger);
} catch (error) {
  logger.error(`Job ${job.name} failed: ${error.message}`);
  // Don't rethrow - let other jobs continue
}
```

## Graceful Shutdown

On SIGINT/SIGTERM:

1. `scheduler.stop()` is called
2. All interval timers are cleared
3. Application exits cleanly

## Adding a New Job

### 1. Create the Job Class

```typescript
// src/jobs/MyJob.ts
import type { Job } from '../scheduler/Job';
import type { Config } from '../services/config';
import type { StateService } from '../utils/state';
import type { Logger } from '../utils/logger';

export class MyJob implements Job {
  name = 'myJob';
  intervalMinutes: number;
  enabled: boolean;

  constructor(config: Config) {
    this.intervalMinutes = parseInt(config.MY_JOB_INTERVAL_MINUTES) || 60;
    this.enabled = config.MY_JOB_ENABLED === 'true';
  }

  async execute(config: Config, state: StateService, logger: Logger): Promise<void> {
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

### 2. Add Environment Variables

```bash
# .env
MY_JOB_ENABLED=true
MY_JOB_INTERVAL_MINUTES=60
# ... job-specific config
```

### 3. Register in Main Entry Point

```typescript
// src/index.ts
import { MyJob } from './jobs/MyJob';

const myJob = new MyJob(config);
scheduler.register(myJob);
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

## Directory Structure

```
src/
├── scheduler/
│   ├── Job.ts           # Job interface
│   └── JobScheduler.ts  # Scheduler implementation
├── jobs/
│   ├── VoiceMemoJob.ts  # Voice memo job
│   └── [NewJob.ts]      # Future jobs
└── index.ts             # Job registration
```
