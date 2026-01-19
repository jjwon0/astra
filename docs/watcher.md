# Astra Voice Memo Watcher

The Astra Voice Memo Watcher is a background daemon that monitors the macOS shared VoiceMemos folder and automatically copies new recordings to your Astra processing inbox.

## Overview

This watcher provides a reliable replacement for macOS Shortcuts by running as a system daemon with proper Full Disk Access permissions. It monitors the VoiceMemos shared folder and copies new `.m4a`, `.caf`, `.aac`, `.mp3`, and `.wav` files to your Astra inbox for automatic processing.

## Architecture

The watcher consists of:

- **TypeScript Implementation**: Core file watching logic in `packages/astra-watcher/src/index.ts`
- **Build System**: Bun-based compilation to standalone executable
- **Launch Daemon**: macOS launchd configuration for background operation
- **Installation Scripts**: Automated setup and configuration

## Installation

### Quick Install

Run the automated installation script:

```bash
./scripts/build-and-install-watcher.sh
```

This script will:
1. Build the watcher from TypeScript source
2. Install the executable system-wide
3. Set up the launch daemon
4. Guide you through Full Disk Access configuration

### Manual Installation

If you prefer manual installation:

```bash
# Build the executable
cd packages/astra-watcher
bun build --compile --outfile=dist/astra-watcher src/index.ts

# Install system-wide
sudo cp dist/astra-watcher /usr/local/bin/
sudo chmod +x /usr/local/bin/astra-watcher

# Set up launch daemon
cp com.jjwon.astra.voicememowatcher.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.jjwon.astra.voicememowatcher.plist
launchctl start com.jjwon.astra.voicememowatcher
```

## Configuration

### Paths

- **Source Directory**: `~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings`
- **Destination Directory**: `~/.astra/voice-memo-inbox`
- **Log File**: `~/.astra/watcher.log`
- **Daemon Logs**: `/tmp/astra-voicememowatcher.log`

### Environment Variables

Update your `.env` file to point to the correct directory:

```bash
VOICE_MEMOS_DIR=~/.astra/voice-memo-inbox
```

### Full Disk Access

The watcher requires Full Disk Access to read the VoiceMemos shared folder:

1. Open **System Preferences** → **Security & Privacy** → **Privacy**
2. Click **Full Disk Access** in the sidebar
3. Click the lock icon to make changes
4. Click **+** and add `/usr/local/bin/astra-watcher`
5. Check the checkbox next to the executable
6. Click the lock again to save

## Usage

### Starting the Daemon

```bash
# Start the daemon
launchctl start com.jjwon.astra.voicememowatcher

# Check if it's running
launchctl list | grep astra-voicememowatcher

# View logs
tail -f /tmp/astra-voicememowatcher.log
```

### Monitoring

```bash
# Watch real-time logs
tail -f /tmp/astra-voicememowatcher.log

# Check copied files
ls -la ~/.astra/voice-memo-inbox/

# Monitor daemon status
launchctl list | grep astra-voicememowatcher
```

### Stopping the Daemon

```bash
# Stop the daemon
launchctl stop com.jjwon.astra.voicememowatcher

# Unload from auto-start
launchctl unload ~/Library/LaunchAgents/com.jjwon.astra.voicememowatcher.plist
```

## Troubleshooting

### Permission Issues

If you see "EPERM: operation not permitted" errors:

1. Verify Full Disk Access is granted to `/usr/local/bin/astra-watcher`
2. Restart the daemon: `launchctl restart com.jjwon.astra.voicememowatcher`
3. If issues persist, restart your Mac to clear the TCC cache

### Daemon Not Running

```bash
# Check daemon status
launchctl list | grep astra-voicememowatcher

# Check for startup errors
tail -10 /tmp/astra-voicememowatcher.log

# Verify executable exists and is executable
ls -la /usr/local/bin/astra-watcher
```

### Files Not Being Copied

1. Check the watcher logs for errors
2. Verify the VoiceMemos shared folder exists and contains files
3. Ensure the destination directory is writable
4. Check that files match the supported extensions: `.m4a`, `.caf`, `.aac`, `.mp3`, `.wav`

## Development

### Building from Source

```bash
cd packages/astra-watcher
bun build --compile --outfile=dist/astra-watcher src/index.ts
```

### Running in Development Mode

```bash
# Run with Bun (for development)
bun run dev:watcher

# Run with file watching
bun run watch
```

### Project Structure

```
packages/astra-watcher/
├── src/
│   └── index.ts              # Main watcher implementation
├── build.ts                   # Build script
├── package.json              # Package configuration
├── tsconfig.json             # TypeScript configuration
├── README.md                 # Package documentation
└── com.jjwon.astra.voicememowatcher.plist  # Launch daemon config

scripts/
└── build-and-install-watcher.sh  # Installation script
```

## Integration with Astra

The watcher integrates seamlessly with the existing Astra pipeline:

1. **Voice memos are copied** to `~/.astra/voice-memo-inbox`
2. **Astra jobs** automatically process new files
3. **Existing voice memo job** continues to work unchanged
4. **Full pipeline** from voice memo to processed Notion entries

## Benefits

- **Reliable**: Runs as a system daemon with automatic restart
- **Secure**: Uses proper macOS Full Disk Access permissions
- **Efficient**: Real-time file monitoring with minimal resource usage
- **Maintainable**: TypeScript implementation consistent with monorepo
- **Production-Ready**: Comprehensive logging and error handling

## License

This implementation is part of the Astra project.