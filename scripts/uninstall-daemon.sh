#!/bin/bash
# Uninstall Astra launchd daemon

PLIST_NAME="com.jjwon.astra.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "Uninstalling Astra daemon..."

# Unload if running
if launchctl list | grep -q "com.jjwon.astra"; then
    echo "Stopping daemon..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Remove plist
if [ -f "$PLIST_PATH" ]; then
    rm -f "$PLIST_PATH"
    echo "Removed plist from LaunchAgents"
fi

echo ""
echo "Astra daemon uninstalled successfully"
