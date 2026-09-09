#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRO_PORT="${RCT_METRO_PORT:-8081}"

run_adb() {
  "$SCRIPT_DIR/with-android-jdk.sh" adb "$@"
}

adb_output="$(run_adb devices -l)"
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

mapfile -t connected_serials < <(
  printf '%s\n' "$adb_output" | awk 'NR > 1 && $2 == "device" { print $1 }'
)

if [ "${#connected_devices[@]}" -eq 0 ]; then
  echo "No authorized Android device. Plug in the S24 with a data cable (USB debugging on) or:" >&2
  echo "  adb pair <ip>:<pairing-port>" >&2
  echo "  adb connect <ip>:<adb-port>" >&2
  echo "Then re-run. 'unauthorized' means tap Allow USB debugging on the phone." >&2
  exit 1
fi

# Phone WiFi can ping this machine but cannot open TCP to it (wired-vs-WiFi /
# AP isolation). Expo's default LAN URL (192.168.0.x:8081) therefore ETIMEDOUT
# on first load. ADB reverse + 127.0.0.1 is the path that actually works.
for serial in "${connected_serials[@]}"; do
  echo "adb reverse tcp:${METRO_PORT} tcp:${METRO_PORT} ($serial)"
  run_adb -s "$serial" reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}"
done

export REACT_NATIVE_PACKAGER_HOSTNAME="${REACT_NATIVE_PACKAGER_HOSTNAME:-127.0.0.1}"
echo "Packager host: ${REACT_NATIVE_PACKAGER_HOSTNAME}:${METRO_PORT} (via adb reverse)"

if [ "${#connected_devices[@]}" -eq 1 ]; then
  exec "$SCRIPT_DIR/with-android-jdk.sh" npx expo run:android --device "${connected_devices[0]}"
fi

exec "$SCRIPT_DIR/with-android-jdk.sh" npx expo run:android --device
