#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mapfile -t connected_devices < <(
  adb devices -l | awk '
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

if [ "${#connected_devices[@]}" -eq 1 ]; then
  exec "$SCRIPT_DIR/with-android-jdk.sh" npx expo run:android --device "${connected_devices[0]}"
fi

exec "$SCRIPT_DIR/with-android-jdk.sh" npx expo run:android --device
