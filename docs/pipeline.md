# Pipeline Services

The core pipeline provides services for voice memo processing: file watching, transcription, organization, and Notion sync.

## File Watcher

Detects new voice memo files in the configured directory.

### Behavior

- Polls `VOICE_MEMOS_DIR` every 5 minutes
- Filters for `.m4a` and `.wav` files
- Checks state service to exclude already processed files
- Returns array of new file paths

### Input/Output

```typescript
// Input: directory path, state service
// Output: string[] (new file paths)

async function watch(): Promise<string[]>;
```

## Transcription Service

Converts audio files to text using the Gemini API.

### Behavior

- Reads audio file and converts to base64
- Sends to Gemini API with transcription prompt
- Returns raw text transcript
- Retries on transient errors (1s, 5s, 30s backoff)

### Input/Output

```typescript
// Input: file path, Gemini API key
// Output: TranscriptionResult

interface TranscriptionResult {
  text: string;
  success: boolean;
  error?: string;
  confidence?: number;      // 0-100 quality score
  isGarbage?: boolean;      // true if recording is noise/silence
  garbageReason?: string;   // explanation if garbage detected
}
```

### Garbage Detection

The transcription service asks Gemini to assess audio quality alongside transcription. Recordings are flagged as garbage if:

- Less than 2 words of actual speech
- Only background noise, static, or ambient sounds
- Mostly silence
- Completely unintelligible speech

**Confidence thresholds:**

| Score   | Meaning                                    |
| ------- | ------------------------------------------ |
| 80-100  | Clear speech with understandable content   |
| 50-79   | Partially audible, some unclear portions   |
| 20-49   | Mostly noise with possible speech fragments |
| 0-19    | No discernible speech                      |

Garbage recordings are archived to `invalid/` instead of being processed.

### Error Handling

- **Network timeout:** Retry 3 times with exponential backoff
- **Invalid audio format:** Log error, move to `failed/`
- **Rate limit:** Wait 60 seconds, retry

## Organization Service

Uses Gemini AI to categorize transcript and extract structured data.

### Behavior

1. Fetches current Notion schema (priorities, categories)
2. Builds prompt with dynamic enums from schema
3. Sends transcript + prompt to Gemini
4. Parses JSON response
5. Validates structure

### Prompt Logic

The AI extracts items based on these rules:

- Items with "TODO:", "need to", "remember to" → type: `TODO`
- Other items → type: `NOTE`

**Priority triggers for TODOs:**

- `asap`: urgent, immediate, asap, today, right now
- `soon`: tomorrow, this week, in a few days
- `eventually`: later, sometime, next week (default)

**Default values:**

- priority: `asap`
- category: `general`

### Input/Output

```typescript
// Input: transcript text, Notion schema, API key
// Output: OrganizationResult

interface OrganizationResult {
  items: Array<{
    type: 'TODO' | 'NOTE';
    title: string;
    description?: string; // For TODOs
    content?: string; // For notes
    priority: 'asap' | 'soon' | 'eventually';
    category?: string; // For notes
  }>;
  success: boolean;
  error?: string;
}
```

### Error Handling

- **Invalid JSON:** Retry with improved prompt
- **Invalid enum values:** Log warning, skip item
- **API errors:** Retry 3 times

## Notion Sync Service

Validates AI output and creates pages in Notion.

### Behavior

1. Validates each item against Notion schema
2. Checks that priority/category exists in database
3. Creates pages in appropriate database (TODO or Notes)
4. Sets metadata: priority, category, status, source file, created date
5. Tracks success/failure counts

### Validation

```typescript
function validateItem(item, schema): boolean {
  if (item.type === 'TODO') {
    return schema.priorities.includes(item.priority);
  } else {
    return schema.categories.includes(item.category);
  }
}
```

Invalid items are skipped with a logged warning.

### Input/Output

```typescript
// Input: organized items, database IDs, schema, source filename
// Output: SyncResult

interface SyncResult {
  itemsCreated: number;
  itemsFailed: number;
  success: boolean;
  errors: string[];
}
```

### Error Handling

- **Invalid enum:** Skip item, log error
- **Rate limit:** Wait 60 seconds, retry
- **Network error:** Retry 3 times
- **Partial success:** Continue processing remaining items

## Complete Data Flow

```
START (every 5 minutes)
│
├─> FileWatcher.watch()
│   ├─> List files in VOICE_MEMOS_DIR
│   ├─> Check state (already processed?)
│   └─> Return: [new_file_1.m4a, new_file_2.m4a]
│
└─> FOR EACH new file:
    │
    ├─> Transcription.transcribe(file)
    │   ├─> Upload to Gemini
    │   └─> Get transcript: "TODO: buy milk..."
    │
    ├─> Organization.organize(transcript)
    │   ├─> Fetch schema: priorities, categories
    │   ├─> Build prompt with enums
    │   ├─> Send to Gemini
    │   └─> Get JSON: { items: [...] }
    │
    ├─> NotionSync.sync(items, filename)
    │   ├─> Validate against schema
    │   ├─> Create pages in Notion
    │   └─> Mark file as completed in state
    │
    ├─> Archive.archive(file)
    │   └─> Copy to archive/ directory
    │
    └─> Log: "Processed file.m4a: 2 TODOs created"
```
