#!/bin/bash
# Injects Fix-Damaged-App.command into the built DMG

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DMG=$(find "$ROOT_DIR/src-tauri/target" -path "*/bundle/dmg/*.dmg" | head -1)
ASSET="$ROOT_DIR/src-tauri/assets/修复提示软件已损坏说明.txt"

[ -z "$DMG" ] && { echo "❌ No DMG found"; exit 1; }
echo "📦 $DMG"

MOUNT=$(mktemp -d)  
RW_DMG="$DMG.rw.dmg"

hdiutil convert "$DMG" -format UDRW -o "$RW_DMG" -quiet
hdiutil attach "$RW_DMG" -mountpoint "$MOUNT" -quiet

# Remove any previously injected txt files
rm -f "$MOUNT"/*.txt

cp "$ASSET" "$MOUNT/修复提示软件已损坏说明.txt"

# Retain the custom .DS_Store so the DMG keeps its beautiful background and large icons.
# Use AppleScript to tell Finder to position the new file and flush the changes.
osascript <<EOF
tell application "Finder"
  set volPath to POSIX file "$MOUNT" as alias
  tell folder volPath
    open
    -- Wait for Finder window to render
    delay 1
    -- Position slightly below and between Sanka and Applications
    set position of item "修复提示软件已损坏说明.txt" to {330, 310}
    -- Force Finder to write the new .DS_Store
    update
    delay 2
    close
  end tell
end tell
EOF

# Give Finder extra time to flush .DS_Store to the mounted volume before unmounting
sleep 3

hdiutil detach "$MOUNT" -quiet
hdiutil convert "$RW_DMG" -format UDZO -o "$DMG.new.dmg" -quiet

mv "$DMG.new.dmg" "$DMG"
rm -f "$RW_DMG"
rm -rf "$MOUNT"

echo "✅ Done"
