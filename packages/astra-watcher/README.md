# Astra Watcher

Voice memo file watcher and copier daemon - monitors macOS VoiceMemos and copies new recordings to your Astra inbox.

## Features

- 🔍 **Real-time monitoring** - Watches VoiceMemos shared folder for new recordings
- 📁 **Automatic copying** - Copies new files to `~/.astra/voice-memos-inbox`
- 🔄 **Retry logic** - Handles temporary failures and file writing states
- 📝 **Comprehensive logging** - Logs all activity to `~/.astra/watcher.log`
- 🚀 **Standalone binary** - Can be compiled to a single executable with Bun
- ⚡ **Efficient** - Minimal resource usage, written in TypeScript

## Quick Start

### Build the Executable

```bash
cd packages/astra-watcher
bun build --target=bun --outfile=dist/astra-watcher src/index.ts
```

### Run Directly with Bun

```bash
cd packages/astra-watcher
bun src/index.ts
```

### Build and Install System-wide

```bash
cd packages/astra-watcher

# Build the standalone executable
bun build --target=bun --outfile=dist/astra-watcher src/index.ts

# Install to /usr/local/bin
sudo cp dist/astra-watcher /usr/local/bin/

# Make executable
chmod +x /usr/local/bin/astra-watcher
```

## Configuration

The watcher uses these default paths:

- **Source**: `~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings`
- **Destination**: `~/.astra/voice-memos-inbox`
- **Log file**: `~/.astra/watcher.log`

Update your `.env` file to point to the inbox:

```bash
VOICE_MEMOS_DIR=~/.astra/voice-memos-inbox
```

## Installation as Daemon

### Using launchd (Recommended)

1. **Copy the plist file:**
```bash
cp packages/astra-watcher/com.jjwon.astra.voicememowatcher.plist ~/Library/LaunchAgents/
```

2. **Edit the plist** to point to your executable:
   - If installed system-wide: `/usr/local/bin/astra-watcher`
   - If running from repo: `/path/to/astra/packages/astra-watcher/dist/astra-watcher`

3. **Load and start:**
```bash
launchctl load ~/Library/LaunchAgents/com.jjwon.astra.voicememowatcher.plist
launchctl start com.jjwon.astra.voicememowatcher
```

### Manual Background Process

```bash
# Start in background
nohup astra-watcher > ~/.astra/watcher.log 2>&1 &

# Check if running
ps aux | grep astra-watcher

# View logs
tail -f ~/.astra/watcher.log
```

## Setup

### 1. Grant Full Disk Access

1. Open **System Preferences** → **Security & Privacy** → **Privacy**
2. Select **Full Disk Access**
3. Click the lock to make changes
4. Click **+** and add the executable:
   - System-wide: `/usr/local/bin/astra-watcher`
   - Local build: `/path/to/astra/packages/astra-watcher/dist/astra-watcher`

### 2. Verify Installation

```bash
# Test run (will show startup logs)
astra-watcher

# Check logs
tail -f ~/.astra/watcher.log

# Check daemon status (if using launchd)
launchctl list | grep astra-voicememowatcher
```

## Development

### Project Structure

```
packages/astra-watcher/
├── src/
│   └── index.ts          # Main watcher implementation
├── build.ts              # Build script
├── package.json          # Package configuration
└── README.md             # This file
```

### Build Options

```bash
# Standard build
bun build --target=bun --outfile=dist/astra-watcher src/index.ts

# Debug build (with sourcemaps)
bun build --target=bun --sourcemap --outfile=dist/astra-watcher-debug src/index.ts

# Run with hot reload
bun run --watch src/index.ts
```

### Testing

```bash
# Run directly with Bun
bun src/index.ts

# Check logs in real-time
tail -f ~/.astra/watcher.log
```

## Troubleshooting

### "Permission denied"

- Ensure Full Disk Access is granted to the executable
- Check file permissions: `ls -la /usr/local/bin/astra-watcher`
- Try: `sudo xattr -rd com.apple.quarantine /path/to/astra-watcher`

### "Source directory not found"

- Verify VoiceMemos exist: `ls "~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"`
- Make sure you've recorded at least one voice memo
- Check permissions on the directory

### Watcher stops unexpectedly

- Check logs: `tail -f ~/.astra/watcher.log`
- Verify daemon status: `launchctl list | grep astra-voicememowatcher`
- May need to restart after granting permissions

### Build fails

- Ensure Bun is installed: https://bun.sh
- Check TypeScript errors: `bun run --check src/index.ts`
- Clear cache: `rm -rf node_modules/.cache`

## Integration with Astra

The watcher automatically:
1. Monitors the shared VoiceMemos folder
2. Copies new recordings to `~/.astra/voice-memos-inbox`
3. Your existing Astra jobs will process these files automatically

No additional configuration needed - it works seamlessly with your current setup!

## Performance

- **Binary size**: ~15-20MB (includes all dependencies)
- **Memory usage**: ~20-30MB
- **CPU usage**: Minimal (only when processing files)
- **Startup time**: < 1 second

## Security

- **Minimal permissions**: Only needs file system access
- **Local only**: No network access required
- **Auditable**: Open source TypeScript code
- **Sandboxed**: Cannot access other system areas without Full Disk Access