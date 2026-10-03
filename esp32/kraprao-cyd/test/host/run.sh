#!/usr/bin/env bash
# Host tests for the terminal's Firestore documents (needs g++, Node, Java for the emulators).
# Run from anywhere after `npm ci` (repo root) and `pio pkg install` (fetches ArduinoJson).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FW="$(cd "$HERE/../.." && pwd)"
ROOT="$(cd "$FW/../.." && pwd)"
OUT="${TMPDIR:-/tmp}/cyd-host-test"
mkdir -p "$OUT/emu"

g++ -std=gnu++17 -Wall -DARDUINO=100 -DARDUINOJSON_ENABLE_ARDUINO_STREAM=0 -DARDUINOJSON_ENABLE_ARDUINO_PRINT=0 \
  -DARDUINOJSON_ENABLE_PROGMEM=0 -I"$HERE" -I"$FW/include" -I"$FW/.pio/libdeps/cyd/ArduinoJson/src" \
  -o "$OUT/menu-test" "$HERE/main.cpp" "$FW/src/documents.cpp"

# Thai text shaping for the LVGL fonts
g++ -std=gnu++17 -Wall -I"$HERE" -I"$FW/include" -o "$OUT/thai-test" "$HERE/thai_test.cpp" "$FW/src/thai.cpp"
"$OUT/thai-test"

# Emulator project: a copy of the shop's own firestore.rules plus an auth emulator
cp "$ROOT/firestore.rules" "$OUT/emu/firestore.rules"
cat > "$OUT/emu/firebase.json" <<'JSON'
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": { "auth": { "port": 9099 }, "firestore": { "port": 8080 }, "ui": { "enabled": false } }
}
JSON

cd "$ROOT"
MENU_TEST="$OUT/menu-test" MENU_SNAPSHOT="$OUT/menu.json" SNAPSHOT_DIR="$OUT" npx -y firebase-tools@latest emulators:exec --config "$OUT/emu/firebase.json" \
  --only firestore,auth --project demo-kraprao \
  "cd '$ROOT' && npx vite-node esp32/kraprao-cyd/test/host/emulator-check.ts"
