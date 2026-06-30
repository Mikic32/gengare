#!/usr/bin/env bash

set -euo pipefail

ANDROID_STUDIO_JAVA_HOME="/opt/android-studio/jbr"

if [ -d "$ANDROID_STUDIO_JAVA_HOME" ]; then
  export JAVA_HOME="$ANDROID_STUDIO_JAVA_HOME"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

exec "$@"
