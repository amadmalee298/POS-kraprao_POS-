#!/usr/bin/env bash
# Builds the real UI (src/ui.cpp) with LVGL for the computer and saves screenshots of an order.
# Needs the menu snapshot from test/host/run.sh and ImageMagick (convert) for the PNGs.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FW="$(cd "$HERE/../.." && pwd)"
OUT="${TMPDIR:-/tmp}/cyd-host-test"
SHOTS="${1:-$FW/docs/screens}"
LVGL="$FW/.pio/libdeps/cyd/lvgl"
OBJ="$OUT/sim-obj"
mkdir -p "$OBJ" "$SHOTS"

FLAGS="-O1 -w -DARDUINO=100 -DARDUINOJSON_ENABLE_ARDUINO_STREAM=0 -DARDUINOJSON_ENABLE_ARDUINO_PRINT=0 \
  -DARDUINOJSON_ENABLE_PROGMEM=0 -DLV_CONF_INCLUDE_SIMPLE -DLV_LVGL_H_INCLUDE_SIMPLE \
  -I$HERE -I$FW/test/host -I$FW/include -I$LVGL -I$FW/.pio/libdeps/cyd/ArduinoJson/src"

# LVGL (once)
if [ ! -f "$OBJ/liblvgl.a" ]; then
  find "$LVGL/src" -name '*.c' | xargs -P"$(nproc)" -I{} sh -c 'gcc '"$FLAGS"' -c "{}" -o "'"$OBJ"'/$(echo "{}" | md5sum | cut -c1-12).o"'
  ar rcs "$OBJ/liblvgl.a" "$OBJ"/*.o
fi

gcc $FLAGS -c "$FW/src/font_th_18.c" -o "$OBJ/f18.o"
gcc $FLAGS -c "$FW/src/font_th_24.c" -o "$OBJ/f24.o"
g++ -std=gnu++17 $FLAGS -o "$OUT/sim" "$HERE/sim.cpp" "$FW/src/ui.cpp" "$FW/src/documents.cpp" "$FW/src/promptpay.cpp" "$FW/src/thai.cpp" \
  "$OBJ/f18.o" "$OBJ/f24.o" "$OBJ/liblvgl.a"

rm -f "$OUT"/*.ppm
"$OUT/sim" "$OUT/menu.json" "$OUT"
for f in "$OUT"/*.ppm; do
  convert "$f" -filter point -resize 200% "$SHOTS/$(basename "${f%.ppm}").png"
done
echo "screenshots in $SHOTS"
