# Utilities

Supporting services for logging, file archiving, and state management.

## Logger Service

Plain text logging for monitoring and debugging.

### Log Format

```
2025-01-05 14:30:00 [INFO] Astra started
2025-01-05 14:30:01 [INFO] Loaded config from .env
2025-01-05 14:35:00 [INFO] Found 1 new file: voice_memo_001.m4a
2025-01-05 14:35:05 [INFO] Transcription complete: 45 words
2025-01-05 14:35:15 [INFO] Created 2 TODO pages in Notion
2025-01-05 14:40:00 [ERROR] Failed to transcribe voice_memo_002.m4a: Network timeout
```

### Log Levels

| Level | Usage                                                                 |
| ----- | --------------------------------------------------------------------- |
| INFO  | Normal operations: start/stop, file processing, successful operations |
| WARN  | Recoverable issues: retrying operation, partial failures              |
| ERROR | Critical failures: failed operations after retries, API errors        |

### Log Rotation

- **Trigger:** When log file exceeds 10 MB
- **Retention:** Keep last 5 log files
- **Naming:** `astra.log`, `astra.log.1`, `astra.log.2`, etc.

```
logs/
├── astra.log       # Current log
├── astra.log.1     # Previous (most recent)
├── astra.log.2     # 2nd previous
├── astra.log.3     # 3rd previous
├── astra.log.4     # 4th previous
└── astra.log.5     # 5th previous (oldest)
```

### API

```typescript
interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```

## Archive Service

Copies processed audio files to the archive directory.

### Behavior

- Copies file from `VOICE_MEMOS_DIR` to `ARCHIVE_DIR`
- Preserves original filename
- Does **not** delete original file
- Creates archive directory if it doesn't exist

### Directory Structure

```
archive/
├── voice_memo_001.m4a
├── voice_memo_002.m4a
└── voice_memo_003.m4a

failed/
├── corrupted_file.m4a
└── unsupported_format.wav

invalid/
├── noise_recording.m4a
└── silent_recording.m4a
```

### API

```typescript
interface ArchiveService {
  archive(filePath: string): Promise<string>;        // Returns archive path
  archiveFailed(filePath: string): Promise<string>;  // Copy to failed/
  archiveInvalid(filePath: string): Promise<string>; // Copy to invalid/
}
```

### Archive Destinations

| Destination | When Used                                         |
| ----------- | ------------------------------------------------- |
| `archive/`  | Successfully processed recordings                 |
| `failed/`   | Processing errors (API failures, corrupted files) |
| `invalid/`  | Garbage recordings (noise, silence, too short)    |

### Error Handling

- **Source file not found:** Log error, skip archiving
- **Archive directory missing:** Create directory, then copy
- **Permission denied:** Log error, stop processing

## State Service

Tracks processed files and job state. Persists to disk for crash recovery.

### State File

**Location:** `./state.json`

```json
{
  "jobs": {
    "voiceMemo": {
      "voice_memo_001.m4a": "completed",
      "voice_memo_002.m4a": "completed",
      "failed": ["voice_memo_003.m4a"]
    }
  }
}
```

### Per-Job State

Each job has isolated state under `jobs[jobName]`:

- Processed files are tracked to prevent reprocessing
- Failed files are tracked separately

### API

```typescript
interface StateService {
  // Check if file is already processed
  isProcessed(jobName: string, filename: string): boolean;

  // Mark file as completed
  markCompleted(jobName: string, filename: string): void;

  // Mark file as failed
  markFailed(jobName: string, filename: string): void;

  // Get job-specific state
  getJobState(jobName: string): JobState;

  // Save job-specific state
  saveJobState(jobName: string, state: JobState): void;
}
```

### Persistence

- **Save frequency:** After each state update
- **Atomic writes:** Write to `state.json.tmp`, then rename to `state.json`

### Error Handling

- **State file not found:** Create new empty state (first run)
- **Corrupted JSON:** Log error, backup to `state.json.backup`, create new state
- **Disk full:** Log critical error, stop application

## Usage Example

```typescript
import { Logger } from './utils/logger';
import { ArchiveService } from './utils/archive';
import { StateService } from './utils/state';

const logger = new Logger('./logs/astra.log');
const archive = new ArchiveService('./archive', './failed', './invalid');
const state = new StateService('./state.json');

// Processing a file
logger.info(`Processing ${filename}`);

// After successful sync
await archive.archive(filename);
state.markCompleted('voiceMemo', filename);
logger.info(`Archived ${filename}`);

// On error
logger.error(`Failed: ${error.message}`);
await archive.archiveFailed(filename);
state.markFailed('voiceMemo', filename);
```
