---
name: phone-release
description: Builds a standalone Android release APK and installs it on the connected phone.
disable-model-invocation: true
---

# Phone release

Sideload a **release** APK with the JS bundle embedded. After install the app runs from the launcher with no Expo/Metro process.

## Run

Copy this checklist and complete every item:

```
- [ ] Authorized device on adb (sandbox hides USB; use required_permissions: ["all"])
- [ ] scripts/install-android-release.sh exits 0
- [ ] MainActivity is resumed
- [ ] Report APK path; Metro was not started
```

**Device.** `all` permissions. Empty `adb devices` in the sandbox is a false negative.

```bash
./scripts/with-android-jdk.sh adb devices -l
```

Done when a line is `device` (not `unauthorized` / `offline`). If none, stop and tell the user to authorize USB debugging or `adb connect`.

**Build + install.** First `assembleRelease` is ~8 min; later ones are incremental. `block_until_ms` ≥ 600000, then poll.

```bash
./scripts/install-android-release.sh
```

Done when the script prints `Launched com.mikic32.gengare/.MainActivity` and exits 0.

**Confirm.**

```bash
./scripts/with-android-jdk.sh adb shell dumpsys activity activities | grep -E 'mResumedActivity|mCurrentFocus' | head -5
./scripts/with-android-jdk.sh adb logcat -d -t 40 | grep ReactNativeJS
```

Done when focus is `com.mikic32.gengare/.MainActivity` and logcat has `Running "main"`.

Reply with the APK path (`android/app/build/outputs/apk/release/app-release.apk`) and that they can unplug.

## Path

`scripts/install-android-release.sh` is the only build/install entrypoint for this skill: `assembleRelease` → `adb install -r` → `am start` `com.mikic32.gengare/.MainActivity`. Multiple devices: `ANDROID_SERIAL=<serial> ./scripts/install-android-release.sh`.
