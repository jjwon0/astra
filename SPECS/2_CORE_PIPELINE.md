# Core Pipeline Spec

## Purpose

The Core Pipeline provides reusable services for voice memo processing: transcription (audio → text), organization (text → structured data), and Notion sync (validation + page creation). These services are used by the VoiceMemoJob and can be reused by future jobs.

---

## Responsibilities

1. **File Watcher** - Poll voice memos directory every 5 minutes for new files
2. **State Tracking** - Maintain list of processed files and progress checkpoints
3. **Transcription** - Convert audio files to text using Gemini API
4. **Organization** - Use AI to categorize and structure content (TODOs vs notes)
5. **Notion Sync** - Validate AI output and create pages in Notion

---

## Sub-Components

### 1. File Watcher Service

**Purpose:** Detect new voice memo files and initiate processing

**Behavior:**
- Poll directory every `POLL_INTERVAL_MINUTES` (default: 5)
- List all files in `VOICE_MEMOS_DIR`
- Filter for audio files (.m4a, .wav)
- Check against state (already processed?)
- For new files: mark as "processing" and initiate pipeline

**Implementation:**
```typescript
class FileWatcher {
  async watch(): Promise<string[]> {
    // 1. List files in directory
    // 2. Filter for audio extensions
    // 3. Exclude files in state (already processed)
    // 4. Return array of new file paths
  }
}
```

**Input:**
- Directory path (from config)
- State service (processed file list)

**Output:**
- Array of new file paths to process

---

### 2. Transcription Service

**Purpose:** Convert audio files to text using Gemini API

**Behavior:**
- Upload audio file to Gemini
- Request transcription
- Handle errors and retries
- Return raw text transcript

**API Call:**
```typescript
// Gemini API (pseudocode)
POST https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key={API_KEY}
{
  "contents": [{
    "parts": [{
      "inline_data": {
        "mime_type": "audio/m4a",
        "data": "<base64_audio>"
      }
    }]
  }]
}
```

**Input:**
- File path to audio file
- Gemini API key

**Output:**
```typescript
interface TranscriptionResult {
  text: string;           // Raw transcript
  success: boolean;
  error?: string;
}
```

**Error Handling:**
- Transient errors: Retry 3 times (1s, 5s, 30s backoff)
- Permanent errors: Move to `failed/`, log error



---

### 3. Organization Service

**Purpose:** Use AI to categorize transcript and extract structured data

**Behavior:**
- Fetch current Notion schema (priorities, categories)
- Build prompt with dynamic enums
- Send transcript + prompt to AI
- Receive structured JSON response
- Validate JSON structure

**Prompt Template:**
```
Given this transcript, extract all actionable items and notes.

Rules:
- Items with "TODO:", "need to", "remember to" → type: "TODO"
- Other items → type: "NOTE"

Priority triggers for TODOs:
- "asap": urgent, immediate, asap, today, right now
- "soon": tomorrow, this week, in a few days, by Friday
- "eventually": later, sometime, next week, default if not specified

Return JSON with these enums:
- types: ["TODO", "NOTE"]
- priorities: ["asap", "soon", "eventually"]
- categories: {fetch from Notion schema}

Default values:
- priority: "asap"
- category: "general"

Transcript:
{transcript_text}

Return valid JSON only, no markdown:
{
  "items": [
    {
      "type": "TODO|NOTE",
      "title": "string",
      "description|content": "string",
      "priority": "asap|soon|eventually",
      "category": "project idea|feature idea|..."
    }
  ]
}
```

**Input:**
- Transcript text
- Notion schema (priorities, categories)
- Gemini API key

**Output:**
```typescript
interface OrganizationResult {
  items: Array<{
    type: "TODO" | "NOTE";
    title: string;
    description?: string;    // For TODOs
    content?: string;         // For notes
    priority: "asap" | "soon" | "eventually";
    category?: string;        // For notes
  }>;
  success: boolean;
  error?: string;
}
```

**Error Handling:**
- Invalid JSON: Retry with improved prompt
- Invalid enum values: Log error, will fail validation later
- API errors: Retry 3 times



---

### 4. Notion Sync Service

**Purpose:** Validate AI output and create pages in Notion

**Behavior:**
- Validate each item against Notion schema
- Ensure priority exists in Notion TODO database
- Ensure category exists in Notion Notes database
- For valid items: create pages in appropriate database
- Track successful/failed syncs

**Validation:**
```typescript
function validateItem(item: OrganizationItem, schema: NotionSchema): boolean {
  if (item.type === "TODO") {
    // Check if priority exists in schema
    if (!schema.priorities.includes(item.priority)) {
      return false;
    }
  } else if (item.type === "NOTE") {
    // Check if category exists in schema
    if (!schema.categories.includes(item.category)) {
      return false;
    }
  }
  return true;
}
```

**API Calls:**

**Create TODO:**
```typescript
POST https://api.notion.com/v1/pages
{
  "parent": { "database_id": "{todo_database_id}" },
  "properties": {
    "title": {
      "title": [{ "text": { "content": "Buy milk" } }]
    },
    "description": {
      "rich_text": [{ "text": { "content": "Remember to get milk from store" } }]
    },
    "priority": {
      "select": { "name": "soon" }
    },
    "status": {
      "select": { "name": "not started" }
    },
    "created_date": {
      "date": { "start": "2025-01-05" }
    },
    "source": {
      "rich_text": [{ "text": { "content": "voice_memo_001.m4a" } }]
    }
  }
}
```

**Create Note:**
```typescript
POST https://api.notion.com/v1/pages
{
  "parent": { "database_id": "{notes_database_id}" },
  "properties": {
    "title": {
      "title": [{ "text": { "content": "React Server Components" } }]
    },
    "content": {
      "rich_text": [{ "text": { "content": "Look into RSC for better performance" } }]
    },
    "category": {
      "select": { "name": "research item" }
    },
    "created_date": {
      "date": { "start": "2025-01-05" }
    },
    "source": {
      "rich_text": [{ "text": { "content": "voice_memo_001.m4a" } }]
    }
  }
}
```

**Input:**
- Organized items from AI
- Notion database IDs
- Notion schema (for validation)
- Source filename

**Output:**
```typescript
interface SyncResult {
  itemsCreated: number;
  itemsFailed: number;
  success: boolean;
  errors: string[];
}
```

**Error Handling:**
- Invalid enum value: Skip item, log error (user can fix in Notion and restart)
- API rate limit: Wait and retry
- Network error: Retry 3 times
- Partial success: Continue processing other items

**Update state:** Mark file as completed

---

## Data Flow (Step-by-Step with Checkpoints)

```
START LOOP (every 5 minutes)
  │
  ├─> FileWatcher.watch()
  │   ├─> List files in VOICE_MEMOS_DIR
  │   ├─> Check state (already processed?)
  │   └─> Return: [new_file_1.m4a, new_file_2.m4a]
  │
  └─> FOR EACH new_file:
      │
      ├─> Transcription.transcribe(new_file)
      │   ├─> Upload to Gemini
      │   └─> Get transcript: "TODO: buy milk. Remember to call dentist."
      │
      ├─> Organization.organize(transcript)
      │   ├─> Fetch schema: priorities=["asap","soon","eventually"]
      │   ├─> Build prompt with enums
      │   ├─> Send to Gemini
      │   └─> Get JSON:
      │       {
      │         "items": [
      │           { "type": "TODO", "title": "buy milk", ... },
      │           { "type": "TODO", "title": "call dentist", ... }
      │         ]
      │       }
      │
      ├─> NotionSync.sync(items, filename=new_file)
      │   ├─> Validate priorities/categories against schema
      │   ├─> Create TODO page in Notion: "buy milk"
      │   ├─> Create TODO page in Notion: "call dentist"
      │   └─> State: mark file as completed
      │
      ├─> Archive.archive(new_file)
      │   └─> Copy to archive/ directory
      │
      └─> Log: "Processed new_file.m4a: 2 TODOs created"
```

---

## State Tracking

### State File Structure

```json
{
  "processedFiles": {
    "voice_memo_001.m4a": "completed",
    "voice_memo_002.m4a": "completed"
  },
  "failedFiles": [
    "voice_memo_003.m4a"
  ]
}
```

### State Service Methods

```typescript
interface StateService {
  // Check if file is already processed
  isProcessed(filename: string): boolean;

  // Mark file as completed
  markCompleted(filename: string): void;

  // Mark file as failed
  markFailed(filename: string): void;

  // Get list of completed files
  getCompletedFiles(): string[];

  // Get list of failed files
  getFailedFiles(): string[];
}
```

---

## Error Handling

### Transcription Errors

**Error:** Network timeout
- **Action:** Retry 3 times (1s, 5s, 30s)
- **Recovery:** Move to `failed/` if all retries fail

**Error:** Invalid audio format
- **Action:** Log error, move to `failed/`
- **Message:** "Unsupported audio format: {format}"

**Error:** Transcription API rate limit
- **Action:** Wait 60 seconds, retry
- **Recovery:** If retry fails, move to `failed/`

---

### Organization Errors

**Error:** Invalid JSON response from AI
- **Action:** Retry with improved prompt: "Return valid JSON only"
- **Recovery:** Move to `failed/` after 3 retries

**Error:** AI returns invalid enum value (not in Notion schema)
- **Action:** Log warning: "Invalid priority 'urgent', not in schema"
- **Recovery:** Skip item, continue with other items (user can update Notion and retry later)

---

### Notion Sync Errors

**Error:** Validation failed (invalid enum)
- **Action:** Skip item, log error
- **Recovery:** User updates Notion schema, manually restarts processing

**Error:** API rate limit
- **Action:** Wait 60 seconds, retry
- **Recovery:** Continue with other items if partial success

**Error:** Database not found
- **Action:** Log critical error, stop processing
- **Recovery:** User must re-run auto-setup

---

### File Watcher Errors

**Error:** Directory not found
- **Action:** Log error, stop processing
- **Recovery:** User must update `VOICE_MEMOS_DIR` in `.env`

**Error:** Permission denied
- **Action:** Log error, stop processing
- **Recovery:** User must fix file permissions

---

## Integration Points

### Uses From Other Services

**From Config Service:**
- Environment variables (`GEMINI_API_KEY`, `NOTION_API_KEY`, etc.)
- Notion schema (`priorities`, `categories`, database IDs)

**From Utilities:**
- Logger service (log all operations and errors)
- Archive service (copy processed files)
- State service (track progress)

### Provides To Main Loop

**Main entry point:**
```typescript
async function main() {
  const config = await ConfigService.load();
  const state = new StateService(config.LOG_FILE);

  while (true) {
    const newFiles = await FileWatcher.watch(config.VOICE_MEMOS_DIR, state);

    for (const file of newFiles) {
      const transcript = await TranscriptionService.transcribe(file);
      const organized = await OrganizationService.organize(transcript, config.notion);
      await NotionSyncService.sync(organized, file);
      await ArchiveService.archive(file);
      state.markCompleted(file);
    }

    await sleep(config.POLL_INTERVAL_MINUTES * 60 * 1000);
  }
}
```

---

## Testing Considerations

### Unit Tests
- File watcher filtering logic
- Transcript parsing
- JSON validation
- Schema validation

### Integration Tests
- Full pipeline with mock APIs
- Error handling paths

### Manual Testing
- Record voice memo, wait 5 min, check Notion
- Test multiple items in one voice memo
- Test failure scenarios (corrupted file, network issues)
- Test schema updates (change Notion, restart app)
