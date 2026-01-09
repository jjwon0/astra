#!/bin/bash
# Install Astra as a launchd daemon

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.jjwon.astra.plist"
PLIST_SRC="$PROJECT_DIR/$PLIST_NAME"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "Installing Astra daemon..."

# Ensure logs directory exists
mkdir -p "$PROJECT_DIR/logs"

# Ensure LaunchAgents directory exists
mkdir -p "$HOME/Library/LaunchAgents"

# Unload existing daemon if running
if launchctl list | grep -q "com.jjwon.astra"; then
    echo "Stopping existing daemon..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Copy plist to LaunchAgents
cp "$PLIST_SRC" "$PLIST_DEST"

# Load the daemon
launchctl load "$PLIST_DEST"

echo ""
echo "Astra daemon installed and started!"
echo ""
echo "Useful commands:"
echo "  Check status:  launchctl list | grep astra"
echo "  View app logs: tail -f $PROJECT_DIR/logs/astra.log"
echo "  View stdout:   tail -f $PROJECT_DIR/logs/daemon-stdout.log"
echo "  View stderr:   tail -f $PROJECT_DIR/logs/daemon-stderr.log"
echo "  Stop daemon:   launchctl stop com.jjwon.astra"
echo "  Start daemon:  launchctl start com.jjwon.astra"
echo "  Uninstall:     $SCRIPT_DIR/uninstall-daemon.sh"
