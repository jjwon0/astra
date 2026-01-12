# Configuration

The config service loads environment variables from `.env` and fetches Notion database schemas on startup.

## Environment Variables

### Required

```bash
# API Keys
GEMINI_API_KEY=<your_gemini_api_key>
NOTION_API_KEY=<your_notion_integration_token>

# Notion Configuration
PARENT_PAGE_ID=<your_notion_parent_page_id>  # Required for database creation
```

### Optional (with defaults)

```bash
# Database IDs (auto-created if missing)
NOTION_TODO_DATABASE_ID=<todo_db_id>
NOTION_NOTES_DATABASE_ID=<notes_db_id>
NOTION_JOURNAL_DATABASE_ID=<journal_db_id>

# Directory Paths (defaults to ~/.astra/)
VOICE_MEMOS_DIR=~/Library/Mobile Documents/.../Voice Memos/
ARCHIVE_DIR=~/.astra/archive
FAILED_DIR=~/.astra/failed
INVALID_DIR=~/.astra/invalid
LOG_FILE=~/.astra/logs/astra.log
STATE_FILE=~/.astra/state.json

# Job Configuration
VOICE_MEMO_JOB_ENABLED=true
VOICE_MEMO_JOB_INTERVAL_MINUTES=5

# Behavior
MAX_RETRIES=3
GARBAGE_CONFIDENCE_THRESHOLD=30
```

## Notion Schema

### Schema Structure

The config service fetches and caches this schema on startup:

```typescript
interface NotionSchema {
  todoDatabaseId: string;
  notesDatabaseId: string;
  journalDatabaseId: string;
  priorities: string[]; // e.g., ["asap", "soon", "eventually"]
  categories: string[]; // e.g., ["project idea", "feature idea", ...]
}
```

### Fetching Process

1. Read `NOTION_TODO_DATABASE_ID` and `NOTION_NOTES_DATABASE_ID` from env
2. If both exist, query Notion API to get database schemas
3. Extract `priority` options from TODO database
4. Extract `category` options from Notes database
5. Cache the schema for runtime use

Schema is fetched once on startup and cached for the entire runtime. Restart the application to pick up Notion schema changes.

## Auto-Setup

On first run, if database IDs are empty or invalid, the config service automatically creates the Notion databases.

### TODO Database Properties

| Property     | Type      | Options                                              |
| ------------ | --------- | ---------------------------------------------------- |
| title        | Title     | -                                                    |
| description  | Rich text | -                                                    |
| priority     | Select    | asap (red), soon (yellow), eventually (gray)         |
| status       | Select    | not started (gray), in progress (blue), done (green) |
| created_date | Date      | -                                                    |
| source       | Rich text | -                                                    |

### Notes Database Properties

| Property     | Type      | Options                                                                            |
| ------------ | --------- | ---------------------------------------------------------------------------------- |
| title        | Title     | -                                                                                  |
| content      | Rich text | -                                                                                  |
| category     | Select    | project idea (purple), feature idea (blue), research item (orange), general (gray) |
| created_date | Date      | -                                                                                  |
| source       | Rich text | -                                                                                  |

### Journal Database Properties

| Property  | Type     | Description                                |
| --------- | -------- | ------------------------------------------ |
| title     | Title    | Formatted date (e.g., "January 11, 2026")  |
| date      | Date     | ISO date for filtering/sorting             |
| processed | Checkbox | For future post-processing workflows       |

Journal entries are stored as page content (blocks), not properties. Each day has one page with multiple timestamped entries appended throughout the day.

After creating databases, the service writes the new IDs to `.env` and logs a message to restart.

## Error Handling

### Missing Required Variables

- Throws error on startup: "Missing required environment variable: {var_name}"

### Invalid Notion API Key

- Throws error on startup: "Invalid Notion API key"

### Database Not Found

- Logs warning, clears ID, triggers auto-setup
- Message: "Database {id} not found, will create new database"

### Network Timeout

- Retries 3 times with exponential backoff (1s, 5s, 30s)
- If all retries fail, throws error and stops startup

### Parent Page Not Found

- Logs error: "Cannot create database: parent page {PARENT_PAGE_ID} not found"
- Auto-setup stops, manual intervention required
