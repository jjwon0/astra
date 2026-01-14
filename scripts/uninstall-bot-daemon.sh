#!/bin/bash
# Uninstall Astra Bot launchd daemon

set -e

PLIST_NAME="com.jjwon.astra-bot.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "Uninstalling Astra Bot daemon..."

# Unload daemon if running
if launchctl list | grep -q "com.jjwon.astra-bot"; then
    echo "Stopping daemon..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Remove plist
if [ -f "$PLIST_DEST" ]; then
    rm "$PLIST_DEST"
    echo "Removed $PLIST_DEST"
fi

echo ""
echo "Astra Bot daemon uninstalled!"
echo ""
echo "Note: Bot data in ~/.astra/bot/ was preserved."
echo "To remove all bot data: rm -rf ~/.astra/bot"
