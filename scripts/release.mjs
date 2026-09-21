#!/usr/bin/env node
/**
 * Release version bump.
 *
 * Usage: node scripts/release.mjs <patch|minor|major|x.y.z>
 *   (or via make: `make release v=patch`)
 *
 * Bumps the app version in the three manifests that must stay in lockstep:
 *   - package.json
 *   - src-tauri/Cargo.toml   (only the [package] version — never dependencies)
 *   - src-tauri/tauri.conf.json
 *
 * Cargo.lock is intentionally NOT touched: the next `cargo` command syncs the
 * single `ta-assistant` version line itself. Hand-editing the lock is what
 * caused the bitflags 1.3.3 incident (a find-and-replace renamed an unrelated
 * transitive dependency to a version that doesn't exist on crates.io).
 *
 * Fails loudly BEFORE writing anything if the three manifests are out of sync.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PKG = path.join(root, "package.json");
const CARGO = path.join(root, "src-tauri", "Cargo.toml");
const CONF = path.join(root, "src-tauri", "tauri.conf.json");

// ── Parse argument ──────────────────────────────────────────────────────────
const arg = (process.argv[2] ?? "").replace(/^v/, "");
const BUMPS = ["patch", "minor", "major"];
const isLiteral = /^\d+\.\d+\.\d+$/.test(arg);

if (!BUMPS.includes(arg) && !isLiteral) {
  console.error(`Usage: node scripts/release.mjs <patch|minor|major|x.y.z>`);
  console.error(`  or:  make release v=patch   (v=minor, v=major, v=1.4.0)`);
  process.exit(1);
}

// ── Read current state ──────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(PKG, "utf8"));
const current = pkg.version;

const cargoText = readFileSync(CARGO, "utf8");
const conf = JSON.parse(readFileSync(CONF, "utf8"));

// ── Pre-flight: all three manifests must agree on the current version ───────
const problems = [];
if (conf.version !== current) {
  problems.push(`  tauri.conf.json has ${conf.version}, expected ${current}`);
}

// [package] section only — dependency lines like `version = "2"` are off-limits.
let cargoMatches = 0;
let section = "";
for (const line of cargoText.split("\n")) {
  const header = line.match(/^\[([^\]]+)\]/);
  if (header) {
    section = header[1];
    continue;
  }
  if (
    section === "package" &&
    new RegExp(`^version\\s*=\\s*"${current.replace(/\./g, "\\.")}"\\s*$`).test(
      line
    )
  ) {
    cargoMatches++;
  }
}
if (cargoMatches !== 1) {
  problems.push(
    `  Cargo.toml [package] has ${cargoMatches} "version = \"${current}\"" lines (expected 1)`
  );
}

if (problems.length > 0) {
  console.error(
    `✗ Manifests are out of sync for version ${current}. Fix them by hand, then retry.`
  );
  for (const p of problems) console.error(p);
  process.exit(1);
}

// ── Compute next version ────────────────────────────────────────────────────
function bump(version, kind) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const next = isLiteral ? arg : bump(current, arg);
if (next === current) {
  console.error(
    `✗ Next version (${next}) equals current version — nothing to do.`
  );
  process.exit(1);
}

// ── Build new contents in memory (nothing written until every step succeeds) ─
const newPkgText = JSON.stringify({ ...pkg, version: next }, null, 2) + "\n";
const newConfText = JSON.stringify({ ...conf, version: next }, null, 2) + "\n";

let replaced = false;
const newCargoText = cargoText
  .split("\n")
  .map((line) => {
    const header = line.match(/^\[([^\]]+)\]/);
    if (header) {
      section = header[1];
      return line;
    }
    if (
      section === "package" &&
      !replaced &&
      new RegExp(`^version\\s*=\\s*".*"\\s*$`).test(line)
    ) {
      replaced = true;
      return `version = "${next}"`;
    }
    return line;
  })
  .join("\n");

if (!replaced) {
  console.error(
    "✗ Could not locate the [package] version line in Cargo.toml — aborting, nothing written."
  );
  process.exit(1);
}

// ── Write ───────────────────────────────────────────────────────────────────
writeFileSync(PKG, newPkgText);
writeFileSync(CONF, newConfText);
writeFileSync(CARGO, newCargoText);

console.log(`✓ ${current} → ${next}`);
console.log(
  `  updated: package.json, src-tauri/Cargo.toml ([package] only), src-tauri/tauri.conf.json`
);
console.log(
  `  Cargo.lock: left alone — the next cargo command syncs the ta-assistant line.`
);
