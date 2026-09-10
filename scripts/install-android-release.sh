#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE="com.mikic32.gengare"
ACTIVITY="${PACKAGE}/.MainActivity"
APK="$REPO_ROOT/android/app/build/outputs/apk/release/app-release.apk"

run() {
  "$SCRIPT_DIR/with-android-jdk.sh" "$@"
}

adb_output="$(run adb devices -l)"
printf '%s\n' "$adb_output"

mapfile -t connected_serials < <(
  printf '%s\n' "$adb_output" | awk 'NR > 1 && $2 == "device" { print $1 }'
)

if [ "${#connected_serials[@]}" -eq 0 ]; then
  echo "No authorized Android device. Plug in the S24 with a data cable (USB debugging on) or:" >&2
  echo "  adb pair <ip>:<pairing-port>" >&2
  echo "  adb connect <ip>:<adb-port>" >&2
  echo "Then re-run. 'unauthorized' means tap Allow USB debugging on the phone." >&2
  exit 1
fi

if [ -n "${ANDROID_SERIAL:-}" ]; then
  serial="$ANDROID_SERIAL"
elif [ "${#connected_serials[@]}" -eq 1 ]; then
  serial="${connected_serials[0]}"
else
  echo "Multiple devices. Set ANDROID_SERIAL to one of:" >&2
  printf '%s\n' "${connected_serials[@]}" >&2
  exit 1
fi

echo "Device: $serial"
echo "assembleRelease (embeds JS; no Metro)"
run bash -lc "cd \"$REPO_ROOT/android\" && ./gradlew assembleRelease"

echo "Installing $APK"
run adb -s "$serial" install -r "$APK"
run adb -s "$serial" shell am force-stop "$PACKAGE"
run adb -s "$serial" shell am start -n "$ACTIVITY"

echo "Launched $ACTIVITY from $APK"
