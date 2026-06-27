#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const PGYER_UPLOAD_URL = "https://upload.pgyer.com/apiv2/app/upload";
const PGYER_BUILD_INFO_URL = "https://www.pgyer.com/apiv2/app/buildInfo";
const DEFAULT_POLL_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

export function parseArgs(argv) {
  const options = {
    help: false,
    dryRun: true,
    upload: false,
    skipBuild: false,
    skipTests: false,
    skipTypecheck: false,
    description: "",
    pollTimeoutMs: DEFAULT_POLL_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
      options.upload = false;
    } else if (arg === "--upload") {
      options.upload = true;
      options.dryRun = false;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--skip-tests") {
      options.skipTests = true;
    } else if (arg === "--skip-typecheck") {
      options.skipTypecheck = true;
    } else if (arg === "--description") {
      index += 1;
      if (!argv[index]) {
        throw new Error("--description requires a value.");
      }
      options.description = argv[index];
    } else if (arg.startsWith("--description=")) {
      options.description = arg.slice("--description=".length);
    } else if (arg === "--poll-timeout-ms") {
      index += 1;
      options.pollTimeoutMs = parsePositiveInteger(argv[index], "--poll-timeout-ms");
    } else if (arg.startsWith("--poll-timeout-ms=")) {
      options.pollTimeoutMs = parsePositiveInteger(
        arg.slice("--poll-timeout-ms=".length),
        "--poll-timeout-ms",
      );
    } else if (arg === "--poll-interval-ms") {
      index += 1;
      options.pollIntervalMs = parsePositiveInteger(argv[index], "--poll-interval-ms");
    } else if (arg.startsWith("--poll-interval-ms=")) {
      options.pollIntervalMs = parsePositiveInteger(
        arg.slice("--poll-interval-ms=".length),
        "--poll-interval-ms",
      );
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function resolveReleasePaths(repoRoot) {
  const androidDir = path.join(repoRoot, "apps", "mobile", "android");
  const releaseDir = path.join(
    androidDir,
    "app",
    "build",
    "outputs",
    "apk",
    "release",
  );

  return {
    repoRoot,
    androidDir,
    releaseDir,
    apkPath: path.join(releaseDir, "app-release.apk"),
    metadataPath: path.join(releaseDir, "output-metadata.json"),
  };
}

export function buildGradleCommand({
  androidDir,
  gradleInitScript = "",
  platform = process.platform,
}) {
  const command = path.join(androidDir, platform === "win32" ? "gradlew.bat" : "gradlew");
  const args = [];

  if (gradleInitScript) {
    args.push("--init-script", gradleInitScript);
  }

  args.push(":app:assembleRelease", "-PreactNativeArchitectures=arm64-v8a");
  return { command, args };
}

export function commandRequiresShell(command, platform = process.platform) {
  return platform === "win32" && /\.(cmd|bat)$/i.test(command);
}

export function wrapCommandForSpawn(command, args, platform = process.platform) {
  if (!commandRequiresShell(command, platform)) {
    return { command, args };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", command, ...args],
  };
}

export async function readApkVersion({ apkPath, env = process.env }) {
  const metadataPath = path.join(path.dirname(apkPath), "output-metadata.json");
  const metadataVersion = await readVersionFromMetadata(metadataPath, path.basename(apkPath));
  if (metadataVersion) {
    return metadataVersion;
  }

  const aaptPath = await findAapt(env);
  if (!aaptPath) {
    throw new Error(
      "Could not read APK version: output-metadata.json is missing/unusable and aapt was not found. Set AAPT_PATH or ANDROID_HOME/ANDROID_SDK_ROOT.",
    );
  }

  const output = await captureCommand(aaptPath, ["dump", "badging", apkPath], {
    cwd: path.dirname(apkPath),
    env,
    label: "aapt dump badging",
  });
  const match = output.match(/versionCode='([^']+)'\s+versionName='([^']+)'/);
  if (!match) {
    throw new Error("Could not parse versionCode/versionName from aapt output.");
  }

  return {
    versionName: match[2],
    versionCode: Number(match[1]),
    source: "aapt",
  };
}

export async function runRelease(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(helpText());
    return;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const paths = resolveReleasePaths(repoRoot);
  const description = options.description || defaultDescription();

  console.log("Android release to Pgyer");
  console.log(`Repository: ${paths.repoRoot}`);
  console.log(`APK: ${paths.apkPath}`);
  console.log(`Mode: ${options.upload ? "upload" : "dry-run"}`);

  if (!options.skipTypecheck) {
    await runCommand(npmCommand(), ["run", "typecheck", "--workspace", "@bie-rang-wo-xiaoshi/mobile"], {
      cwd: paths.repoRoot,
      env,
      label: "mobile typecheck",
    });
  } else {
    console.log("Skipping mobile typecheck.");
  }

  if (!options.skipTests) {
    await runCommand(npmCommand(), ["run", "test", "--workspace", "@bie-rang-wo-xiaoshi/mobile"], {
      cwd: paths.repoRoot,
      env,
      label: "mobile tests",
    });
  } else {
    console.log("Skipping mobile tests.");
  }

  if (!options.skipBuild) {
    await validateOptionalFile(env.GRADLE_INIT_SCRIPT, "GRADLE_INIT_SCRIPT");
    warnIfBuildEnvLooksIncomplete(env);
    const gradle = buildGradleCommand({
      androidDir: paths.androidDir,
      gradleInitScript: env.GRADLE_INIT_SCRIPT,
    });
    await runCommand(gradle.command, gradle.args, {
      cwd: paths.androidDir,
      env,
      label: "Gradle assembleRelease arm64-v8a",
    });
  } else {
    console.log("Skipping Gradle build.");
  }

  await assertApkExists(paths.apkPath);
  const version = await readApkVersion({ apkPath: paths.apkPath, env });
  console.log(
    `APK version: ${version.versionName} (${version.versionCode}) from ${version.source}`,
  );

  if (!options.upload) {
    console.log("Dry run complete. Re-run with --upload to upload to Pgyer.");
    console.log(`Upload description preview: ${description}`);
    return;
  }

  const apiKey = env.PGYER_API_KEY;
  if (!apiKey) {
    throw new Error("PGYER_API_KEY is required for --upload.");
  }

  const upload = await uploadToPgyer({
    apiKey,
    apkPath: paths.apkPath,
    description,
    fetchImpl: globalThis.fetch,
  });
  const buildKey = upload.data?.buildKey;
  if (!buildKey) {
    throw new Error("Pgyer upload response did not include data.buildKey.");
  }

  const buildInfo = await pollPgyerBuildInfo({
    apiKey,
    buildKey,
    fetchImpl: globalThis.fetch,
    timeoutMs: options.pollTimeoutMs,
    intervalMs: options.pollIntervalMs,
  });

  printPgyerResult(buildInfo.data ?? upload.data);
}

export async function uploadToPgyer({ apiKey, apkPath, description, fetchImpl }) {
  if (!fetchImpl) {
    throw new Error("This Node.js runtime does not provide fetch.");
  }

  const apk = await readFile(apkPath);
  const form = new FormData();
  form.set("_api_key", apiKey);
  form.set(
    "file",
    new Blob([apk], { type: "application/vnd.android.package-archive" }),
    path.basename(apkPath),
  );
  form.set("buildInstallType", "1");
  form.set("buildUpdateDescription", description);

  const response = await fetchImpl(PGYER_UPLOAD_URL, {
    method: "POST",
    body: form,
  });
  const result = await readPgyerJson(response, "upload");
  assertPgyerSuccess(result, "upload");
  return result;
}

export async function pollPgyerBuildInfo({
  apiKey,
  buildKey,
  fetchImpl,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() <= deadline) {
    const form = new FormData();
    form.set("_api_key", apiKey);
    form.set("buildKey", buildKey);

    const response = await fetchImpl(PGYER_BUILD_INFO_URL, {
      method: "POST",
      body: form,
    });
    const result = await readPgyerJson(response, "buildInfo");
    if (result.code === 0) {
      return result;
    }

    lastError = result;
    await sleep(intervalMs);
  }

  const detail = lastError ? ` Last response: ${safeJson(lastError)}` : "";
  throw new Error(`Timed out waiting for Pgyer buildInfo.${detail}`);
}

function helpText() {
  return `Usage: npm run release:android:pgyer -- [options]

Builds the Android release APK for arm64-v8a and optionally uploads it to Pgyer.
Uploads never happen unless --upload is passed.

Options:
  --upload                 Upload to Pgyer. Requires PGYER_API_KEY.
  --dry-run                Do not upload. This is the default.
  --skip-build             Reuse the existing release APK.
  --skip-tests             Skip mobile Jest tests.
  --skip-typecheck         Skip mobile TypeScript check.
  --description <text>     Pgyer buildUpdateDescription.
  --poll-timeout-ms <n>    buildInfo polling timeout. Default: ${DEFAULT_POLL_TIMEOUT_MS}.
  --poll-interval-ms <n>   buildInfo polling interval. Default: ${DEFAULT_POLL_INTERVAL_MS}.
  -h, --help               Show this help.

Environment:
  PGYER_API_KEY            Required only with --upload. Never printed.
  JAVA_HOME                Optional; passed through to Gradle.
  ANDROID_HOME             Optional; passed through to Gradle/aapt lookup.
  ANDROID_SDK_ROOT         Optional; passed through to Gradle/aapt lookup.
  AAPT_PATH                Optional explicit aapt/aapt.exe path.
  GRADLE_INIT_SCRIPT       Optional Gradle init script path, for example a mirror config.
`;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} requires a positive integer.`);
  }
  return parsed;
}

async function readVersionFromMetadata(metadataPath, apkFileName) {
  try {
    const raw = await readFile(metadataPath, "utf8");
    const metadata = JSON.parse(raw);
    const elements = Array.isArray(metadata.elements) ? metadata.elements : [];
    const element =
      elements.find((item) => item?.outputFile === apkFileName) ??
      elements.find((item) => item?.versionName || item?.versionCode);

    if (!element) {
      return null;
    }

    return {
      versionName: String(element.versionName),
      versionCode: Number(element.versionCode),
      source: "output-metadata.json",
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw new Error(`Could not read ${metadataPath}: ${error.message}`);
  }
}

async function findAapt(env) {
  if (env.AAPT_PATH && (await fileExists(env.AAPT_PATH))) {
    return env.AAPT_PATH;
  }

  const sdkRoot = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdkRoot) {
    return null;
  }

  const buildToolsDir = path.join(sdkRoot, "build-tools");
  let entries;
  try {
    entries = await import("node:fs/promises").then((fs) =>
      fs.readdir(buildToolsDir, { withFileTypes: true }),
    );
  } catch {
    return null;
  }

  const executable = process.platform === "win32" ? "aapt.exe" : "aapt";
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(buildToolsDir, entry.name, executable))
    .sort()
    .reverse();

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function assertApkExists(apkPath) {
  let apkStat;
  try {
    apkStat = await stat(apkPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Release APK not found: ${apkPath}`);
    }
    throw error;
  }

  if (!apkStat.isFile() || apkStat.size <= 0) {
    throw new Error(`Release APK is missing or empty: ${apkPath}`);
  }
}

async function validateOptionalFile(filePath, envName) {
  if (!filePath) {
    return;
  }
  if (!(await fileExists(filePath))) {
    throw new Error(`${envName} points to a missing file: ${filePath}`);
  }
}

function warnIfBuildEnvLooksIncomplete(env) {
  if (!env.JAVA_HOME) {
    console.warn("Warning: JAVA_HOME is not set; Gradle will rely on java from PATH.");
  }
  if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
    console.warn(
      "Warning: neither ANDROID_HOME nor ANDROID_SDK_ROOT is set; Gradle must find the Android SDK another way.",
    );
  }
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runCommand(command, args, { cwd, env, label }) {
  console.log(`Running: ${label}`);
  const spawned = wrapCommandForSpawn(command, args);
  await new Promise((resolve, reject) => {
    const child = spawn(spawned.command, spawned.args, {
      cwd,
      env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", (error) => {
      reject(new Error(`${label} failed to start: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
      }
    });
  });
}

async function captureCommand(command, args, { cwd, env, label }) {
  const spawned = wrapCommandForSpawn(command, args);
  return await new Promise((resolve, reject) => {
    const child = spawn(spawned.command, spawned.args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`${label} failed to start: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(
            `${label} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}. ${stderr}`.trim(),
          ),
        );
      }
    });
  });
}

async function readPgyerJson(response, label) {
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Pgyer ${label} returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`Pgyer ${label} HTTP ${response.status}: ${safeJson(result)}`);
  }

  return result;
}

function assertPgyerSuccess(result, label) {
  if (result.code !== 0) {
    throw new Error(`Pgyer ${label} failed: ${safeJson(result)}`);
  }
}

function printPgyerResult(data) {
  const shortcut = data?.buildShortcutUrl;
  const publicUrl = shortcut
    ? shortcut.startsWith("http")
      ? shortcut
      : `https://www.pgyer.com/${shortcut}`
    : "";

  console.log("Pgyer upload complete.");
  if (publicUrl) {
    console.log(`Public link: ${publicUrl}`);
  }
  if (data?.buildVersion || data?.buildVersionNo || data?.buildKey) {
    console.log(
      `Build: version=${data.buildVersion ?? "-"} versionNo=${data.buildVersionNo ?? "-"} key=${data.buildKey ?? "-"}`,
    );
  }
}

function defaultDescription() {
  return `Android release ${new Date().toISOString()}`;
}

function safeJson(value) {
  return JSON.stringify(value, (key, nestedValue) => {
    if (key === "_api_key" || key.toLowerCase().includes("apikey")) {
      return "[redacted]";
    }
    return nestedValue;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isMainModule()) {
  runRelease().catch((error) => {
    console.error(`Release failed: ${error.message}`);
    process.exitCode = 1;
  });
}
