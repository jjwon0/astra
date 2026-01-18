#!/bin/bash
# Download Dashu Mandarin podcast transcripts (Chinese subtitles only)

OUTPUT_DIR="$HOME/.astra/dashu-transcripts"
CHANNEL_URL="https://www.youtube.com/@dashumandarin/videos"
SEEN_FILE="$OUTPUT_DIR/.seen_videos"

# Create output directory if needed
mkdir -p "$OUTPUT_DIR"

# Create seen file if it doesn't exist
touch "$SEEN_FILE"

# Get list of recent videos
echo "Fetching recent videos from Dashu Mandarin..."
yt-dlp --flat-playlist "$CHANNEL_URL" --print "%(upload_date)s %(id)s %(title)s" 2>/dev/null | while read -r date id title; do
    # Check if already seen
    if grep -q "$id" "$SEEN_FILE" 2>/dev/null; then
        continue
    fi

    echo "Downloading: $title"
    OUTPUT_FILE="$OUTPUT_DIR/${date}_${id}_${title}.zh.vtt"

    # Download Chinese subtitles
    yt-dlp --write-subs --sub-langs "zh" --skip-download "https://www.youtube.com/watch?v=$id" --output "$OUTPUT_FILE" 2>/dev/null

    if [ -f "${OUTPUT_FILE%.*}.zh.vtt" ]; then
        echo "  → Saved: $(basename "${OUTPUT_FILE%.*}.zh.vtt")"
        echo "$id" >> "$SEEN_FILE"
    else
        echo "  → Failed to download subtitles"
    fi
done

echo "Done! Transcripts saved to: $OUTPUT_DIR"
