# Astra

A job-based automation system that processes voice memos into structured TODOs and notes in Notion.

## Quick Start

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your API keys:
   # - GEMINI_API_KEY
   # - NOTION_API_KEY
   # - PARENT_PAGE_ID
   ```

3. **Run**
   ```bash
   bun run dev
   ```

Notion databases are auto-created on first run.

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Configuration](docs/config.md)
- [Pipeline Services](docs/pipeline.md)
- [Utilities](docs/utilities.md)
- [Job System](docs/jobs.md)

## Development

See [CLAUDE.md](CLAUDE.md) for development commands and patterns.
