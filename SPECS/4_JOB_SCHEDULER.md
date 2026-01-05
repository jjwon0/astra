# Job Scheduler Spec

## Purpose

The Job Scheduler manages multiple independent jobs that run on configurable intervals, providing a simple extensible framework for adding new tasks beyond voice memo processing.

---

## Responsibilities

1. **Job Registration** - Explicitly register available jobs
2. **Scheduling** - Run each job on its configured interval
3. **Job Isolation** - Catch errors per job, don't stop other jobs
4. **Configuration** - Load per-job config from environment variables

---

## Job Interface

### Job Contract

```typescript
interface Job {
  // Job identification
  name: string;

  // Scheduling (in minutes)
  intervalMinutes: number;

  // Enable/disable job
  enabled: boolean;

  // Main execution method
  execute(config: Config, state: JobState, logger: Logger): Promise<void>;
}
```

### JobState

Each job gets its own isolated state object:

```typescript
interface JobState {
  // Job-specific state (any structure)
  [key: string]: any;
}
```

---

## Scheduler

### JobScheduler Interface

```typescript
class JobScheduler {
  constructor(config: Config, state: StateService, logger: Logger);

  // Register a job
  register(job: Job): void;

  // Start all enabled jobs
  start(): void;

  // Stop all jobs
  stop(): void;

  // Get registered jobs
  getJobs(): Job[];
}
```

### Scheduling Behavior

- Each registered job runs every `intervalMinutes`
- Jobs run independently (no blocking between jobs)
- If job fails, log error but don't stop scheduler
- If job is disabled, skip it entirely
- No complex cron expressions - simple minute intervals

### Implementation

```typescript
class JobScheduler {
  private jobs: Job[] = [];
  private intervals: NodeJS.Timeout[] = [];

  register(job: Job): void {
    this.jobs.push(job);
  }

  start(): void {
    for (const job of this.jobs) {
      if (!job.enabled) continue;

      const interval = setInterval(async () => {
        try {
          const jobState = this.state.getJobState(job.name);
          await job.execute(this.config, jobState, this.logger);
          this.state.saveJobState(job.name, jobState);
        } catch (error) {
          this.logger.error(`Job ${job.name} failed: ${error.message}`);
        }
      }, job.intervalMinutes * 60 * 1000);

      this.intervals.push(interval);
    }
  }

  stop(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
  }
}
```

---

## Job Registration

### Explicit Registration

Jobs are explicitly registered in the main entry point:

```typescript
// src/index.ts
const scheduler = new JobScheduler(config, state, logger);

// Register jobs explicitly
scheduler.register(new VoiceMemoJob(config, services));
// scheduler.register(new EmailSummaryJob(config, services));  // Future job

// Start scheduler
scheduler.start();
```

### Job Discovery

No auto-discovery. Jobs are:
- Defined in `src/jobs/` directory
- Explicitly imported and registered in `src/index.ts`

---

## Configuration

### Per-Job Environment Variables

Each job has its own config prefix:

```bash
# Voice Memo Job
VOICE_MEMO_JOB_ENABLED=true
VOICE_MEMO_JOB_INTERVAL_MINUTES=5
VOICE_MEMOS_DIR=~/Library/Mobile Documents/.../Voice Memos/
ARCHIVE_DIR=./archive/
FAILED_DIR=./failed/

# Email Summary Job (example future job)
EMAIL_SUMMARY_JOB_ENABLED=false
EMAIL_SUMMARY_JOB_INTERVAL_MINUTES=60
EMAIL_RECIPIENT=user@example.com
```

### Configuration Loading

```typescript
// Each job loads its own config
class VoiceMemoJob implements Job {
  name = "voiceMemo";
  intervalMinutes = parseInt(config.VOICE_MEMO_JOB_INTERVAL_MINUTES) || 5;
  enabled = config.VOICE_MEMO_JOB_ENABLED === "true";

  constructor(config: Config) {
    this.voiceMemosDir = config.VOICE_MEMOS_DIR;
    this.archiveDir = config.ARCHIVE_DIR;
    // ...
  }
}
```

---

## State Management

### Per-Job State

State is organized by job name:

```json
{
  "jobs": {
    "voiceMemo": {
      "processedFiles": {
        "voice_memo_001.m4a": "completed",
        "voice_memo_002.m4a": "completed"
      },
      "failedFiles": ["voice_memo_003.m4a"]
    },
    "emailSummary": {
      "lastRun": "2025-01-05T09:00:00Z"
    }
  }
}
```

### StateService Updates

New methods for per-job state:

```typescript
interface StateService {
  // Get state for specific job
  getJobState(jobName: string): JobState;

  // Save state for specific job
  saveJobState(jobName: string, state: JobState): void;

  // Existing methods (backward compatible)
  isProcessed(filename: string): boolean;
  markCompleted(filename: string): void;
  markFailed(filename: string): void;
  getCompletedFiles(): string[];
  getFailedFiles(): string[];
}
```

### Usage in Jobs

```typescript
class VoiceMemoJob implements Job {
  async execute(config, state, logger) {
    const jobState = state.getJobState("voiceMemo");

    // Use jobState for job-specific state
    const newFiles = this.findNewFiles(jobState);

    // Save job state after execution
    state.saveJobState("voiceMemo", jobState);
  }
}
```

---

## Error Handling

### Job-Level Error Isolation

- Each job runs in try/catch
- Job failure doesn't stop scheduler
- Failed jobs log error but other jobs continue

### Error Handling Flow

```typescript
// In scheduler
try {
  await job.execute(config, jobState, logger);
  state.saveJobState(job.name, jobState);
} catch (error) {
  logger.error(`Job ${job.name} failed: ${error.message}`);
  // Don't rethrow - let other jobs continue
}
```

---

## Adding a New Job

### Step-by-Step

1. **Create job file:**
   ```typescript
   // src/jobs/NewJob.ts
   import { Job } from '../scheduler/Job';

   export class NewJob implements Job {
     name = "newJob";
     intervalMinutes = 60;
     enabled = config.NEW_JOB_ENABLED === "true";

     async execute(config, state, logger) {
       const jobState = state.getJobState("newJob");
       // Job logic here
       state.saveJobState("newJob", jobState);
     }
   }
   ```

2. **Add environment variables:**
   ```bash
   NEW_JOB_ENABLED=true
   NEW_JOB_INTERVAL_MINUTES=60
   # Job-specific config...
   ```

3. **Register in main entry point:**
   ```typescript
   // src/index.ts
   import { NewJob } from './jobs/NewJob';

   scheduler.register(new NewJob(config, services));
   ```

---

## Directory Structure

```
src/
├── scheduler/
│   ├── Job.ts              # Job interface + base class
│   └── JobScheduler.ts    # Job scheduling logic
├── jobs/
│   ├── VoiceMemoJob.ts     # Voice memo processing job
│   └── [future jobs]      # Additional jobs as needed
├── services/              # Shared services
│   ├── config/
│   ├── core/              # Reusable core services
│   └── utils/
└── index.ts              # Main entry point, job registration
```

---

## Implementation Notes

### Dependencies
- No external dependencies needed for scheduler
- Uses `setInterval` for scheduling
- Simple and lightweight

### Performance Considerations
- Jobs run independently (no blocking)
- Consider adding max concurrency limit if many jobs
- Each job should handle its own resource limits

### Graceful Shutdown
- On SIGINT/SIGTERM, call `scheduler.stop()`
- Allow jobs to finish current execution before stopping

---

## Testing Considerations

### Unit Tests
- Job registration
- Scheduling logic
- Job isolation (one failure doesn't stop others)
- State management per job

### Integration Tests
- Multiple jobs running simultaneously
- Job failure scenarios
- State persistence across job runs

### Manual Testing
- Run multiple jobs with different intervals
- Verify job isolation (disable one job, others still run)
- Test graceful shutdown
