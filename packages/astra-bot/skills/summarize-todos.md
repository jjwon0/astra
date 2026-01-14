# Summarize TODOs

Get a summary of open TODOs from Notion.

## Usage

/summarize-todos [filter]

## Instructions

1. Use the Notion MCP to query the TODO database
2. Filter for items where status is NOT "done"
3. Group results by priority:
   - asap (urgent)
   - soon (near-term)
   - eventually (backlog)
4. Format as a readable summary

## Optional Filters

- `/summarize-todos asap` - Show only urgent TODOs
- `/summarize-todos soon` - Show only near-term TODOs
- `/summarize-todos` - Show all open TODOs grouped by priority

## Output Format

```
Open TODOs Summary:

ASAP (3):
- Fix login bug
- Review PR #123
- Call dentist

Soon (5):
- Update documentation
- Refactor auth module
...

Eventually (12):
- Research new frameworks
...
```

DISCORD_REPLY: You have X open TODOs: Y urgent, Z soon, W eventually.
