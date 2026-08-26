#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# AGP Prefab treats JDK 24+ System.load warnings as a CMake failure.
# Prefer JDK 21; skip Android Studio's bundled JBR 25.
java_major() {
  "$1/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1
}

JAVA_HOME=""
for candidate in \
  "$HOME/.local/share/mise/installs/java/21" \
  /usr/lib/jvm/java-21-openjdk \
  /usr/lib/jvm/java-17-openjdk \
  /opt/android-studio/jbr
do
  if [ -x "$candidate/bin/java" ]; then
    major="$(java_major "$candidate")"
    if [ -n "$major" ] && [ "$major" -ge 17 ] && [ "$major" -le 21 ]; then
      JAVA_HOME="$candidate"
      break
    fi
  fi
done

if [ -z "$JAVA_HOME" ]; then
  echo "Need JDK 17 or 21 for the Android build. Android Studio's JBR is 25 and breaks Prefab/CMake." >&2
  echo "Install with: mise install java@21" >&2
  exit 1
fi

export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d "$HOME/Android/Sdk" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  elif [ -d "$HOME/Android/sdk" ]; then
    export ANDROID_HOME="$HOME/Android/sdk"
  fi
fi

if [ -n "${ANDROID_HOME:-}" ]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$REPO_ROOT/android/local.properties"
fi

exec "$@"
