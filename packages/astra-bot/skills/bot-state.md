# Bot State

View or update persistent bot state stored in ~/.astra/bot/state.json

## Usage

/bot-state [key] [value]

## Instructions

1. Read the current state from `~/.astra/bot/state.json`
   - If the file doesn't exist, start with an empty object `{}`

2. Based on arguments:
   - No args: Show the full state object
   - Key only: Show the value for that key
   - Key and value: Update that key and save the file

3. Always use JSON format for the state file

## Examples

User: "/bot-state"
- Read and display the full state
- "Current state: { lastActive: '2024-01-15', todoCount: 5 }"

User: "/bot-state lastActive"
- Show just that key's value
- "lastActive: 2024-01-15"

User: "/bot-state preferredPriority asap"
- Update the state: { ..., preferredPriority: "asap" }
- Save to state.json

## Common State Keys

- `lastActive` - Last interaction timestamp
- `preferredPriority` - Default TODO priority
- `defaultCategory` - Default note category
- Custom keys as needed

DISCORD_REPLY: <state info or "Updated {key} to {value}">
