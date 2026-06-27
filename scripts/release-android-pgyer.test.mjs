import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildGradleCommand,
  commandRequiresShell,
  parseArgs,
  readApkVersion,
  resolveReleasePaths,
  wrapCommandForSpawn,
} from "./release-android-pgyer.mjs";

test("parseArgs defaults to dry-run and never uploads implicitly", () => {
  const options = parseArgs([]);

  assert.equal(options.upload, false);
  assert.equal(options.dryRun, true);
  assert.equal(options.skipBuild, false);
  assert.equal(options.skipTests, false);
});

test("parseArgs enables upload only when explicitly requested", () => {
  const options = parseArgs(["--upload", "--skip-build", "--skip-tests"]);

  assert.equal(options.upload, true);
  assert.equal(options.dryRun, false);
  assert.equal(options.skipBuild, true);
  assert.equal(options.skipTests, true);
});

test("buildGradleCommand assembles release for arm64-v8a and includes optional init script", () => {
  const command = buildGradleCommand({
    androidDir: "D:\\bwxapk\\apps\\mobile\\android",
    gradleInitScript: "D:\\mirror.gradle",
    platform: "win32",
  });

  assert.equal(command.command, "D:\\bwxapk\\apps\\mobile\\android\\gradlew.bat");
  assert.deepEqual(command.args, [
    "--init-script",
    "D:\\mirror.gradle",
    ":app:assembleRelease",
    "-PreactNativeArchitectures=arm64-v8a",
  ]);
});

test("readApkVersion prefers output-metadata.json next to the APK", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "pgyer-release-"));
  const apkDir = path.join(tempRoot, "release");
  await mkdir(apkDir, { recursive: true });
  const apkPath = path.join(apkDir, "app-release.apk");
  await writeFile(apkPath, "fake apk");
  await writeFile(
    path.join(apkDir, "output-metadata.json"),
    JSON.stringify({
      elements: [
        {
          outputFile: "app-release.apk",
          versionName: "0.1.1",
          versionCode: 2,
        },
      ],
    }),
  );

  const version = await readApkVersion({
    apkPath,
    env: {},
  });

  assert.deepEqual(version, {
    versionName: "0.1.1",
    versionCode: 2,
    source: "output-metadata.json",
  });
});

test("resolveReleasePaths uses the repository Android release APK location", () => {
  const paths = resolveReleasePaths("D:\\bwxapk");

  assert.equal(
    paths.apkPath,
    "D:\\bwxapk\\apps\\mobile\\android\\app\\build\\outputs\\apk\\release\\app-release.apk",
  );
  assert.equal(paths.androidDir, "D:\\bwxapk\\apps\\mobile\\android");
});

test("commandRequiresShell returns true for Windows command scripts", () => {
  assert.equal(commandRequiresShell("npm.cmd"), true);
  assert.equal(commandRequiresShell("D:\\bwxapk\\apps\\mobile\\android\\gradlew.bat"), true);
  assert.equal(commandRequiresShell("D:\\Android\\Sdk\\build-tools\\35.0.0\\aapt.exe"), false);
});

test("wrapCommandForSpawn uses cmd.exe for Windows command scripts", () => {
  assert.deepEqual(wrapCommandForSpawn("npm.cmd", ["--version"], "win32"), {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "npm.cmd", "--version"],
  });
  assert.deepEqual(wrapCommandForSpawn("node", ["--version"], "win32"), {
    command: "node",
    args: ["--version"],
  });
});
