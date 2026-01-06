# Utilities Spec

## Purpose

The Utilities module provides supporting services for logging, file archiving, and per-job state management across the entire system.

---

## Responsibilities

1. **Logging Service** - Plain text logging for monitoring and debugging
2. **Archive Service** - Copy processed files to archive directory
3. **State Service** - Track per-job state (processed files, job-specific data)

---

## Logging Service

### Purpose

Provide plain text logging for all system operations, errors, and debugging information.

### Logging Format

**Plain text format:**

```
2025-01-05 14:30:00 [INFO] Astra started
2025-01-05 14:30:01 [INFO] Loaded config from .env
2025-01-05 14:30:02 [INFO] Notion schema fetched: priorities=3, categories=4
2025-01-05 14:30:03 [INFO] File watcher started (polling every 5 min)
2025-01-05 14:35:00 [INFO] Found 1 new file: voice_memo_001.m4a
2025-01-05 14:35:01 [INFO] Transcribing voice_memo_001.m4a...
2025-01-05 14:35:05 [INFO] Transcription complete: 45 words
2025-01-05 14:35:06 [INFO] Organizing content...
2025-01-05 14:35:10 [INFO] Found 2 TODOs, 1 note
2025-01-05 14:35:11 [INFO] Syncing to Notion...
2025-01-05 14:35:15 [INFO] Created 2 TODO pages in Notion
2025-01-05 14:35:16 [INFO] Created 1 note page in Notion
2025-01-05 14:35:17 [INFO] Archived voice_memo_001.m4a
2025-01-05 14:35:18 [INFO] Processing complete for voice_memo_001.m4a
2025-01-05 14:40:00 [ERROR] Failed to transcribe voice_memo_002.m4a: Network timeout after 3 retries
2025-01-05 14:40:01 [WARN] Moved voice_memo_002.m4a to failed/
```

### Log Levels

**INFO:** Normal operations

- Application start/stop
- File processing steps
- Successful operations
- Schema updates

**WARN:** Recoverable issues

- Retrying operation
- Non-critical errors
- Partial failures

**ERROR:** Critical failures

- Failed operations (after retries)
- API errors
- Configuration errors

### Log Rotation

**Strategy:**

- Size-based rotation
- Rotate when log file exceeds 10 MB
- Keep last 5 log files
- Naming: `astra.log`, `astra.log.1`, `astra.log.2`, etc.

**Implementation:**

```typescript
class Logger {
  log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logLine = `${timestamp} [${level}] ${message}\n`;

    fs.appendFileSync(this.logFile, logLine);

    // Check file size and rotate if needed
    const stats = fs.statSync(this.logFile);
    if (stats.size > 10 * 1024 * 1024) {
      // 10 MB
      this.rotateLog();
    }
  }

  private rotateLog(): void {
    // Move astra.log.4 to astra.log.5
    // Move astra.log.3 to astra.log.4
    // Move astra.log.2 to astra.log.3
    // Move astra.log.1 to astra.log.2
    // Move astra.log to astra.log.1
    // Create new astra.log
  }
}
```

### Location and File Naming

**Default:** `./logs/astra.log`

**Configurable:** Via `LOG_FILE` environment variable

**Directory structure:**

```
logs/
├── astra.log         # Current log
├── astra.log.1       # Previous (most recent)
├── astra.log.2       # 2nd previous
├── astra.log.3       # 3rd previous
├── astra.log.4       # 4th previous
└── astra.log.5       # 5th previous (oldest)
```

### Input/Output Contract

**Input:**

- Log level: "INFO" | "WARN" | "ERROR"
- Message: string

**Output:**

- None (writes to file)

**API:**

```typescript
interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void;
}
```

---

## Archive Service

### Purpose

Copy processed audio files to archive directory. Keep originals (don't delete).

### Behavior

**For each processed file:**

1. Copy file from `VOICE_MEMOS_DIR` to `ARCHIVE_DIR`
2. Preserve original filename
3. Maintain original timestamp
4. **Do not delete** original file

**Example:**

```
Input:  ~/Library/Mobile Documents/.../Voice Memos/voice_memo_001.m4a
Output: ./archive/voice_memo_001.m4a
```

### Directory Structure

**Archive directory:** `./archive/`

**Structure:**

```
archive/
├── voice_memo_001.m4a
├── voice_memo_002.m4a
└── voice_memo_003.m4a
```

**Failed directory:** `./failed/`

```
failed/
├── corrupted_file.m4a
└── unsupported_format.wav
```

### Naming Conventions

**Keep original filename:** No renaming

**Optional enhancement (future):**

- Add timestamp prefix: `2025-01-05_14-30-00_voice_memo_001.m4a`
- Organize by date: `archive/2025-01-05/voice_memo_001.m4a`

### Input/Output Contract

**Input:**

- Source file path (from voice memos directory)
- Archive directory path (from config)
- Failed directory path (for failed files)

**Output:**

- Archive file path (success)
- None (failed)

**API:**

```typescript
interface ArchiveService {
  archive(filePath: string): Promise<string>; // Returns archive path
  archiveFailed(filePath: string): Promise<string>; // Move to failed/
}
```

### Error Handling

**Error:** Source file not found

- **Action:** Log error, skip archiving
- **Recovery:** Continue with next file

**Error:** Archive directory doesn't exist

- **Action:** Create directory, then copy file
- **Message:** "Archive directory not found, creating: {path}"

**Error:** Permission denied

- **Action:** Log error, stop processing
- **Recovery:** User must fix permissions

---

## State Service

### Purpose

Track processed files, in-progress files, and recovery checkpoints. Persist state to disk for crash recovery.

### State File Structure

**Location:** `./state.json` (or configurable)

**Format:**

```json
{
  "processedFiles": {
    "voice_memo_001.m4a": "completed",
    "voice_memo_002.m4a": "completed"
  },
  "failedFiles": ["voice_memo_003.m4a", "voice_memo_004.m4a"]
}
```

**Purpose:**

- `processedFiles`: Track files that have been successfully processed (don't process again)
- `failedFiles`: Track files that failed processing (don't retry them)

### State Service Methods

```typescript
interface StateService {
  // Check if file is already completed
  isProcessed(filename: string): boolean;

  // Mark file as completed
  markCompleted(filename: string): void;

  // Mark file as failed
  markFailed(filename: string): void;

  // Get list of completed filenames
  getCompletedFiles(): string[];

  // Get list of failed filenames
  getFailedFiles(): string[];

  // Save state to disk
  save(): void;

  // Load state from disk
  load(): void;
}
```

### Input/Output Contract

**Input:**

- Filename to check/update

**Output:**

- Boolean (for `isProcessed`)
- String arrays (for getting lists)

### Error Handling

**Error:** State file not found (first run)

- **Action:** Create new empty state file
- **Message:** "No state file found, creating new state"

**Error:** Corrupted state file (invalid JSON)

- **Action:** Log error, create backup, create new empty state
- **Message:** "State file corrupted, backed up to state.json.backup, creating new state"

**Error:** Write failure (disk full)

- **Action:** Log critical error, stop application
- **Recovery:** User must free disk space

### Persistence

**Save frequency:**

- After each state update (mark in progress, update stage, mark completed, mark failed)

**Atomic writes:**

- Write to temporary file: `state.json.tmp`
- Rename to `state.json` (atomic operation)

---

## Utility Integration

### Dependencies

**Shared dependencies:**

- `fs` - Node.js filesystem module
- `path` - Node.js path module
- `dotenv` - Environment variables

### Interactions

**Logger Service:**

- Called by: All services (config, core pipeline, archive, state)
- Usage: Log all operations and errors

**Archive Service:**

- Called by: Core pipeline (after successful sync)
- Calls: Logger (for logging archive operations)

**State Service:**

- Called by: File watcher (check if processed), Core pipeline (track completion/failure)
- Calls: Logger (for logging state changes)

### Example Usage

```typescript
import { Logger } from './utils/logger';
import { ArchiveService } from './utils/archive';
import { StateService } from './utils/state';

const logger = new Logger('./logs/astra.log');
const archive = new ArchiveService(config.ARCHIVE_DIR, config.FAILED_DIR);
const state = new StateService('./state.json');

// In core pipeline:
logger.info(`Processing ${filename}`);
state.markInProgress(filename, 'in_progress: started');

// After transcription:
state.updateStage(filename, 'in_progress: transcribed');

// After successful sync:
await archive.archive(filename);
state.markCompleted(filename, itemsCreated);
logger.info(`Archived ${filename}, created ${itemsCreated} items`);

// On error:
logger.error(`Failed to process ${filename}: ${error.message}`);
await archive.archiveFailed(filename);
state.markFailed(filename, error.message);
```

---

## Implementation Notes

### Dependencies

- Node.js built-in: `fs`, `path`
- No external dependencies for logging and archiving

### Performance Considerations

**Logger:**

- Use synchronous writes for reliability (fs.appendFileSync)
- Consider async writes if performance becomes an issue

**Archive:**

- Use fs.copyFile for efficient copying
- Consider streams for large files (>100 MB)

**State:**

- Load once at startup, keep in memory
- Save on every update (small file size)

---

## Testing Considerations

### Unit Tests

- Logger format and rotation logic
- Archive copy operations
- State file save/load
- Checkpoint tracking

### Integration Tests

- Log rotation triggers
- Archive with large files
- State persistence across restarts

### Manual Testing

- Process file, check archive directory
- Check log file format and rotation
- Verify state file accuracy
- Verify failed files are not retried
