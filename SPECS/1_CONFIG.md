# Config Service Spec

## Purpose

The Config Service manages environment variables, fetches and caches the Notion schema, and auto-sets up Notion databases on first run.

---

## Responsibilities

1. Load environment variables from `.env` file
2. Validate required environment variables are present
3. Connect to Notion API and retrieve database schemas
4. Cache schema for runtime use
5. Auto-create Notion databases if they don't exist
6. Seed default priority/category options in databases
7. Provide schema to other services (transcription, organization, sync)

---

## Environment Variables

### Required Variables

```bash
# API Keys
GEMINI_API_KEY=<your_gemini_api_key>
NOTION_API_KEY=<your_notion_integration_token>

# Notion Configuration
PARENT_PAGE_ID=<your_notion_parent_page_id>  # Required for database creation
NOTION_TODO_DATABASE_ID=<todo_db_id_or_empty>  # Optional, will be created if missing
NOTION_NOTES_DATABASE_ID=<notes_db_id_or_empty>  # Optional, will be created if missing

# Directory Paths
VOICE_MEMOS_DIR=/path/to/voice/memos
ARCHIVE_DIR=/path/to/archive
FAILED_DIR=/path/to/failed
LOG_FILE=/path/to/log/file

# Behavior Configuration
POLL_INTERVAL_MINUTES=5
MAX_RETRIES=3
```

### Optional Variables

```bash
# Defaults will be used if not specified
POLL_INTERVAL_MINUTES=5
MAX_RETRIES=3
```

---

## Notion Schema Fetching

### Schema Structure

The service fetches and caches this schema:

```typescript
interface NotionSchema {
  todoDatabaseId: string;
  notesDatabaseId: string;
  priorities: string[]; // ["asap", "soon", "eventually"]
  categories: string[]; // ["project idea", "feature idea", ...]
}
```

### Fetching Process

1. **Startup:**
   - Read `NOTION_TODO_DATABASE_ID` and `NOTION_NOTES_DATABASE_ID` from env
   - If both exist, query Notion API to get schemas
   - Extract `priority` options from TODO database
   - Extract `category` options from Notes database
   - Cache the schema

2. **Refresh Frequency:**
   - Fetch schema once on application startup
   - Cache for entire runtime
   - Refresh on application restart
   - **No runtime refresh needed** (manually restart to pick up Notion changes)

3. **API Calls:**

   ```typescript
   // Get database schema
   GET https://api.notion.com/v1/databases/{database_id}

   // Response includes select property options
   {
     "properties": {
       "priority": {
         "select": {
           "options": [
             {"name": "asap", "color": "red"},
             {"name": "soon", "color": "yellow"},
             {"name": "eventually", "color": "gray"}
           ]
         }
       }
     }
   }
   ```

---

## Auto-Setup Logic

### Database Creation

**Trigger:** If database IDs are empty or invalid in environment

**Steps:**

1. Connect to Notion API
2. Create TODO database:
   ```typescript
   POST https://api.notion.com/v1/databases
   {
     "parent": { "type": "page_id", "page_id": "<parent_page_id>" },
     "title": [{ "type": "text", "text": { "content": "TODOs" } }],
     "properties": {
       "title": { "title": {} },
       "description": { "rich_text": {} },
       "priority": {
         "select": {
           "options": [
             { "name": "asap", "color": "red" },
             { "name": "soon", "color": "yellow" },
             { "name": "eventually", "color": "gray" }
           ]
         }
       },
       "status": {
         "select": {
           "options": [
             { "name": "not started", "color": "gray" },
             { "name": "in progress", "color": "blue" },
             { "name": "done", "color": "green" }
           ]
         }
       },
       "created_date": { "date": {} },
       "source": { "rich_text": {} }
     }
   }
   ```
3. Create Notes database:
   ```typescript
   POST https://api.notion.com/v1/databases
   {
     "parent": { "type": "page_id", "page_id": "<parent_page_id>" },
     "title": [{ "type": "text", "text": { "content": "Notes" } }],
     "properties": {
       "title": { "title": {} },
       "content": { "rich_text": {} },
       "category": {
         "select": {
           "options": [
             { "name": "project idea", "color": "purple" },
             { "name": "feature idea", "color": "blue" },
             { "name": "research item", "color": "orange" },
             { "name": "general", "color": "gray" }
           ]
         }
       },
       "created_date": { "date": {} },
       "source": { "rich_text": {} }
     }
   }
   ```
4. Write new database IDs to `.env` file
5. Log: "Created Notion databases. IDs written to .env. Restart to load schema."

### Handling Existing Databases

**Scenario 1: Both databases exist and have IDs**

- Fetch schema from existing databases
- Use existing options (don't overwrite)

**Scenario 2: One database missing**

- Create missing database
- Fetch schema from existing + new database

**Scenario 3: Both databases exist but schema is empty**

- Create databases and seed default options

---

## Input/Output Contract

### Input

**From:**

- `.env` file (environment variables)
- Notion API (database schemas)

**Environment Variables Provided:**

```typescript
interface ConfigEnv {
  GEMINI_API_KEY: string;
  NOTION_API_KEY: string;
  NOTION_TODO_DATABASE_ID?: string;
  NOTION_NOTES_DATABASE_ID?: string;
  VOICE_MEMOS_DIR: string;
  ARCHIVE_DIR: string;
  FAILED_DIR: string;
  LOG_FILE: string;
  POLL_INTERVAL_MINUTES: number;
  MAX_RETRIES: number;
}
```

### Output

**To:**

- Core Pipeline services (organization, notionSync)
- Main entry point (environment config)

**Schema Provided:**

```typescript
interface ConfigServiceOutput {
  // Environment config
  env: ConfigEnv;

  // Notion schema
  notion: {
    todoDatabaseId: string;
    notesDatabaseId: string;
    priorities: string[];
    categories: string[];
  };

  // Helper methods
  refreshSchema: () => Promise<void>;
  getSchema: () => NotionSchema;
}
```

---

## Error Handling

### Environment Variable Errors

**Error:** Missing required environment variable

- **Action:** Throw error on startup
- **Message:** "Missing required environment variable: {var_name}"
- **Recovery:** User must add variable to `.env` and restart

**Error:** Invalid value (e.g., non-numeric POLL_INTERVAL)

- **Action:** Use default value, log warning
- **Message:** "Invalid {var_name}, using default: {default_value}"

### Notion API Errors

**Error:** Invalid NOTION_API_KEY

- **Action:** Throw error on startup
- **Message:** "Invalid Notion API key"
- **Recovery:** User must update API key

**Error:** Database not found (invalid ID)

- **Action:** Log warning, clear ID from config, trigger auto-setup
- **Message:** "Database {id} not found, will create new database"

**Error:** Network timeout during schema fetch

- **Action:** Retry 3 times with exponential backoff (1s, 5s, 30s)
- **Recovery:** If still failed, throw error and stop startup

**Error:** Rate limit exceeded

- **Action:** Wait 60 seconds, retry
- **Recovery:** If retry fails, throw error

### Auto-Setup Errors

**Error:** Failed to create database

- **Action:** Log error, do not write ID to `.env`
- **Message:** "Failed to create TODO database: {error}. Database IDs not written to .env. Please fix issue and restart."

**Error:** Parent page not found (for database creation)

- **Action:** Log error, stop auto-setup
- **Message:** "Cannot create database: parent page {PARENT_PAGE_ID} not found. Please verify PARENT_PAGE_ID in .env"

---

## Implementation Notes

### Dependencies

- `@notionhq/client` - Notion API client
- `dotenv` - Environment variable loading

### Startup Sequence

```
1. Load .env file
2. Validate required environment variables
3. Initialize Notion client
4. Check if database IDs exist
5. If missing, auto-create databases
6. Fetch schemas from Notion
7. Cache schemas
8. Provide config to other services
9. Start main processing loop
```

### Schema Updates

When user changes Notion database properties (adds new category, changes priority options):

1. Restart application
2. Schema is fetched fresh on startup
3. New options are available to AI organization service
4. Old options still work (graceful degradation)

---

## Testing Considerations

### Unit Tests

- Environment variable loading
- Schema parsing
- Default value fallbacks

### Integration Tests

- Notion API connection
- Database creation
- Schema fetching
- Error scenarios (invalid key, missing database)

### Manual Testing

- First run (auto-setup)
- Subsequent runs (schema fetch)
- Notion database property changes (schema refresh on restart)
