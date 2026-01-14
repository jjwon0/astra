# Save Artifact

Save content persistently to ~/.astra/bot/artifacts/

## Usage

/save-artifact <name>

## Instructions

1. If no content is provided in the message, ask the user what they'd like to save
2. Sanitize the artifact name (replace spaces with dashes, remove special characters)
3. Write the content to `~/.astra/bot/artifacts/{name}.md`
4. Confirm the save with the file path

## Example

User: "/save-artifact meeting-notes"
- Ask: "What would you like to save as 'meeting-notes'?"
- User provides content
- Write to `~/.astra/bot/artifacts/meeting-notes.md`

User: "/save-artifact weekly-review Here are my notes from this week..."
- Write the provided content directly

DISCORD_REPLY: Saved artifact "{name}" to artifacts folder.
