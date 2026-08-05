#!/usr/bin/env node
/**
 * Wires release signing into the generated Android Gradle config.
 *
 * `src-tauri/gen/` is gitignored, so CI scaffolds it with `tauri android init`,
 * which produces the stock template WITHOUT any release signing config.
 * This script injects the same signing block that `make android-key-setup`
 * relies on locally (reads `src-tauri/gen/android/keystore.properties`).
 *
 * Strict anchors: if the generated file ever drifts from the tauri-cli
 * template, the script throws instead of silently producing an unsigned APK.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(
  root,
  "src-tauri/gen/android/app/build.gradle.kts",
);

const src = readFileSync(target, "utf8");

// Idempotency: already patched (e.g. local machine after `make android-key-setup`).
if (src.includes('create("release")')) {
  console.log("android-signing-patch: signing config already present, nothing to do");
  process.exit(0);
}

const keystorePropsBlock = `// Release signing — reads src-tauri/gen/android/keystore.properties
// (gitignored). Regenerate it with \`make android-key-setup\`.
val keystoreProperties = Properties().apply {
    val propFile = rootProject.file("keystore.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}`;

const signingConfigsBlock = `    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties.getProperty("keyAlias")
            keyPassword = keystoreProperties.getProperty("keyPassword")
            storeFile = keystoreProperties.getProperty("storeFile")?.let { file(it) }
            storePassword = keystoreProperties.getProperty("storePassword")
        }
    }`;

function replaceOnce(haystack, needle, replacement, label) {
  const idx = haystack.indexOf(needle);
  if (idx === -1) {
    throw new Error(
      `android-signing-patch: anchor not found — ${label}. ` +
        "The tauri-cli template may have changed; update this script.",
    );
  }
  if (haystack.indexOf(needle, idx + needle.length) !== -1) {
    throw new Error(
      `android-signing-patch: anchor not unique — ${label}. ` +
        "The tauri-cli template may have changed; update this script.",
    );
  }
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

let out = src;

// 1) keystoreProperties val right after the tauriProperties block.
const tauriPropsAnchor = `val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}`;
if (!src.includes("keystoreProperties")) {
  out = replaceOnce(
    out,
    tauriPropsAnchor,
    `${tauriPropsAnchor}\n\n${keystorePropsBlock}`,
    "tauriProperties block",
  );
}

// 2) signingConfigs block between defaultConfig and buildTypes.
out = replaceOnce(
  out,
  "    }\n    buildTypes {\n",
  `    }\n${signingConfigsBlock}\n    buildTypes {\n`,
  "android.buildTypes opening",
);

// 3) Use the release signing config in the release build type.
out = replaceOnce(
  out,
  `        getByName("release") {\n            isMinifyEnabled = true`,
  `        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true`,
  "release build type",
);

writeFileSync(target, out);
console.log(`android-signing-patch: patched ${path.relative(root, target)}`);
