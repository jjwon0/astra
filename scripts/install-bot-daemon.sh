#!/bin/bash
# Install Astra Bot as a launchd daemon

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.jjwon.astra-bot.plist"
PLIST_SRC="$PROJECT_DIR/$PLIST_NAME"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "Installing Astra Bot daemon..."

# Ensure ~/.astra directories exist
mkdir -p "$HOME/.astra/logs"
mkdir -p "$HOME/.astra/bot/scratch"
mkdir -p "$HOME/.astra/bot/artifacts"

# Ensure LaunchAgents directory exists
mkdir -p "$HOME/Library/LaunchAgents"

# Unload existing daemon if running
if launchctl list | grep -q "com.jjwon.astra-bot"; then
    echo "Stopping existing daemon..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Copy plist to LaunchAgents
cp "$PLIST_SRC" "$PLIST_DEST"

# Load the daemon
launchctl load "$PLIST_DEST"

echo ""
echo "Astra Bot daemon installed and started!"
echo ""
echo "Useful commands:"
echo "  Check status:  launchctl list | grep astra-bot"
echo "  View stdout:   tail -f ~/.astra/logs/bot-stdout.log"
echo "  View stderr:   tail -f ~/.astra/logs/bot-stderr.log"
echo "  Stop daemon:   launchctl stop com.jjwon.astra-bot"
echo "  Start daemon:  launchctl start com.jjwon.astra-bot"
echo "  Uninstall:     $SCRIPT_DIR/uninstall-bot-daemon.sh"
