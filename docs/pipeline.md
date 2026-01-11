# Pipeline Services

The core pipeline provides services for voice memo processing: file watching, transcription, intent routing, organization (TODOs/notes), journal formatting, and Notion sync.

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

## Intent Routing

After transcription, recordings are routed based on keyword prefixes:

| Prefix Pattern          | Intent    | Processing Path              |
| ----------------------- | --------- | ---------------------------- |
| `todo:`, `to do:`, `to-do:` | TODO  | Organization → Notion Sync   |
| `note:`                 | NOTE      | Organization → Notion Sync   |
| Everything else         | JOURNAL   | Journal Format → Journal Sync |

The prefix (and punctuation) is stripped before further processing.

**Examples:**
- "Todo: buy groceries" → TODO, processed by OrganizationService
- "Note: interesting article about AI" → NOTE, processed by OrganizationService
- "Had a great day at the park" → JOURNAL, processed by JournalService
- "Journal: thoughts on the meeting" → JOURNAL (explicit prefix also works)

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

## Journal Service

Cleans up voice transcripts for journal entries using Gemini AI.

### Behavior

1. Receives raw transcript (with "journal" prefix already stripped)
2. Sends to Gemini with cleanup prompt
3. Returns polished text ready for Notion

### Cleanup Rules

The AI applies these transformations:
- Remove filler words (um, uh, like, you know, basically, actually, sort of)
- Fix grammar and punctuation
- Format into natural paragraphs at topic/thought changes
- Preserve original meaning and conversational tone
- No headers, metadata, or commentary added

### Input/Output

```typescript
interface JournalFormatResult {
  formattedText: string;
  success: boolean;
  error?: string;
}
```

## Journal Notion Sync Service

Syncs journal entries to Notion with one page per day.

### Behavior

1. Check if a page exists for the recording's date
2. If exists: append entry with timestamp heading and divider
3. If not: create new page titled with the date

### Page Structure

Each journal page contains:
- **Title:** "January 11, 2026" (formatted date)
- **Date property:** ISO date for filtering/sorting
- **Content:** Multiple timestamped entries throughout the day

Entry format:
```
---
### 2:30 PM
Cleaned up journal text appears here as paragraphs...

---
### 5:45 PM
Another entry from later in the day...
```

### Input/Output

```typescript
interface JournalSyncResult {
  success: boolean;
  pageId: string;
  isNewPage: boolean;
  error?: string;
}
```

### Error Handling

- **Page not found:** Create new page
- **API errors:** Retry 3 times with backoff
- **Text too long:** Automatically chunked to 2000 char blocks

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
    │   ├─> Get transcript + confidence score
    │   └─> If garbage → Archive to invalid/, DONE
    │
    ├─> Detect intent from transcript prefix
    │   ├─> "todo:" or "note:" → TODO/NOTE path
    │   └─> Everything else → JOURNAL path
    │
    ├─> [TODO/NOTE PATH]
    │   ├─> Organization.organize(transcript)
    │   │   ├─> Build prompt with schema enums
    │   │   ├─> Send to Gemini
    │   │   └─> Get JSON: { items: [...] }
    │   │
    │   └─> NotionSync.sync(items)
    │       ├─> Validate against schema
    │       └─> Create pages in TODO/Notes database
    │
    ├─> [JOURNAL PATH]
    │   ├─> JournalService.format(transcript)
    │   │   ├─> Clean up filler words, grammar
    │   │   └─> Return polished text
    │   │
    │   └─> JournalNotionSync.syncEntry(text, timestamp)
    │       ├─> Find or create day's page
    │       └─> Append timestamped entry
    │
    ├─> Archive.archive(file)
    │   └─> Copy to archive/ directory
    │
    └─> Mark completed in state
```
