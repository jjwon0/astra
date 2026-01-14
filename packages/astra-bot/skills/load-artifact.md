# Load Artifact

Retrieve a previously saved artifact from ~/.astra/bot/artifacts/

## Usage

/load-artifact [name]

## Instructions

1. If a name is provided:
   - Read from `~/.astra/bot/artifacts/{name}.md`
   - If not found, try `{name}` without the .md extension
   - Present the content to the user

2. If no name is provided:
   - List all available artifacts in `~/.astra/bot/artifacts/`
   - Show the list to the user so they can choose

3. If the artifact doesn't exist:
   - Inform the user it wasn't found
   - List available artifacts as suggestions

## Example

User: "/load-artifact meeting-notes"
- Read `~/.astra/bot/artifacts/meeting-notes.md`
- Display the content

User: "/load-artifact"
- List all files in artifacts directory
- "Available artifacts: meeting-notes, weekly-review, project-ideas"

DISCORD_REPLY: Here's the "{name}" artifact: <first 100 chars or summary>
