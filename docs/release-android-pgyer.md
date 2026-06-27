# Android Pgyer Release

This repo provides a scripted Android release flow:

```powershell
npm run release:android:pgyer -- --dry-run
```

The default mode is a dry run. It runs mobile typecheck, mobile tests, Gradle
`assembleRelease` for `arm64-v8a`, validates the APK, and reads version
metadata. It does not upload unless `--upload` is passed.

To upload:

```powershell
$env:PGYER_API_KEY = "<your-pgyer-api-key>"
npm run release:android:pgyer -- --upload --description "Release notes"
```

Useful options:

- `--skip-build`: reuse `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
- `--skip-tests`: skip mobile Jest tests.
- `--skip-typecheck`: skip mobile TypeScript checking.
- `--dry-run`: force no upload.
- `--upload`: upload to `https://upload.pgyer.com/apiv2/app/upload`.

Optional environment variables:

- `JAVA_HOME`: JDK for Gradle, for example `D:\bwxapk-tools\jdk17\jdk-17.0.19+10`.
- `ANDROID_HOME` or `ANDROID_SDK_ROOT`: Android SDK, for example `D:\Android\Sdk`.
- `GRADLE_INIT_SCRIPT`: optional Gradle init script, such as a local mirror config.
- `AAPT_PATH`: optional explicit `aapt.exe` path when `output-metadata.json` is unavailable.

The script never prints `PGYER_API_KEY`.
