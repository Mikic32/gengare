#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

adb_output="$("$SCRIPT_DIR/with-android-jdk.sh" adb devices -l)"
printf '%s\n' "$adb_output"

mapfile -t connected_devices < <(
  printf '%s\n' "$adb_output" | awk '
    NR > 1 && $2 == "device" {
      device_name = ""
      for (i = 3; i <= NF; i++) {
        if ($i ~ /^model:/) {
          device_name = substr($i, 7)
        }
      }
      if (device_name != "") {
        print device_name
      } else {
        print $1
      }
    }
  '
)

if [ "${#connected_devices[@]}" -eq 0 ]; then
  echo "No authorized Android device. Plug in the S24 with a data cable (USB debugging on) or:" >&2
  echo "  adb pair <ip>:<pairing-port>" >&2
  echo "  adb connect <ip>:<adb-port>" >&2
  echo "Then re-run. 'unauthorized' means tap Allow USB debugging on the phone." >&2
  exit 1
fi

if [ "${#connected_devices[@]}" -eq 1 ]; then
  exec "$SCRIPT_DIR/with-android-jdk.sh" npx expo run:android --device "${connected_devices[0]}"
fi

exec "$SCRIPT_DIR/with-android-jdk.sh" npx expo run:android --device
