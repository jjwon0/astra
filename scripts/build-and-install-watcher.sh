#!/bin/bash

set -e

echo "🚀 Astra Watcher Installation Script"
echo "=================================="
echo ""

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install it first:"
    echo "   curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo "✅ Bun found: $(bun --version)"

# Navigate to watcher directory (relative to repo root, not script location)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WATCHER_DIR="$REPO_ROOT/packages/astra-watcher"
cd "$WATCHER_DIR"

echo "📁 Building watcher..."
echo ""

# Build the watcher (use --compile for standalone executable)
if bun build --compile --outfile=dist/astra-watcher src/index.ts; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed"
    exit 1
fi

# Get binary size
if [ -f "dist/astra-watcher" ]; then
    SIZE=$(ls -lh dist/astra-watcher | awk '{print $5}')
    echo "📊 Binary size: $SIZE"
fi

echo ""
echo "🔧 Installation Options:"
echo ""
echo "1. Install system-wide (requires sudo)"
echo "2. Run from local directory"
echo "3. Set up as launch daemon"
echo ""

read -p "Choose option (1-3): " choice

case $choice in
    1)
        echo ""
        echo "📦 Installing system-wide..."
        sudo cp dist/astra-watcher /usr/local/bin/
        sudo chmod +x /usr/local/bin/astra-watcher
        echo "✅ Installed to /usr/local/bin/astra-watcher"
        
        EXECUTABLE_PATH="/usr/local/bin/astra-watcher"
        ;;
        
    2)
        echo ""
        echo "🏃 Running from local directory..."
        EXECUTABLE_PATH="$(pwd)/dist/astra-watcher"
        echo "✅ Executable ready at: $EXECUTABLE_PATH"
        ;;
        
    3)
        echo ""
        echo "🔧 Setting up as launch daemon..."
        
        # Ask for installation method
        read -p "Install system-wide first? (y/n): " install_systemwide
        
        if [[ $install_systemwide =~ ^[Yy]$ ]]; then
            sudo cp dist/astra-watcher /usr/local/bin/
            sudo chmod +x /usr/local/bin/astra-watcher
            EXECUTABLE_PATH="/usr/local/bin/astra-watcher"
            echo "✅ Installed system-wide"
        else
            EXECUTABLE_PATH="$(pwd)/dist/astra-watcher"
            echo "⚠️  Using local executable for daemon"
        fi
        
        # Update plist with correct path
        sed "s|/usr/local/bin/astra-watcher|$EXECUTABLE_PATH|g" com.jjwon.astra.voicememowatcher.plist > /tmp/astra-voicememowatcher.plist
        
        echo ""
        echo "📋 Next steps for launch daemon:"
        echo "1. Copy plist: cp /tmp/astra-voicememowatcher.plist ~/Library/LaunchAgents/"
        echo "2. Grant Full Disk Access to: $EXECUTABLE_PATH"
        echo "3. Load daemon: launchctl load ~/Library/LaunchAgents/com.jjwon.astra.voicememowatcher.plist"
        ;;
        
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎯 Configuration:"
echo ""
echo "1. Add to your .env file:"
echo "   echo 'VOICE_MEMOS_DIR=~/.astra/voice-memos-inbox' >> ~/.astra/.env"
echo ""
echo "2. Grant Full Disk Access:"
echo "   - System Preferences → Security & Privacy → Privacy → Full Disk Access"
echo "   - Add: $EXECUTABLE_PATH"
echo ""

if [[ $choice == 3 ]]; then
    echo "3. Start the daemon:"
    echo "   launchctl load ~/Library/LaunchAgents/com.jjwon.astra.voicememowatcher.plist"
    echo "   launchctl start com.jjwon.astra.voicememowatcher"
else
    echo "3. Start the watcher:"
    echo "   $EXECUTABLE_PATH"
    echo ""
    echo "   Or run from project root:"
    echo "   bun run watcher"
fi

echo ""
echo "📝 Monitor logs:"
echo "   tail -f ~/.astra/watcher.log"
echo ""
echo "✨ Installation complete!"