// scripts/package.mjs — build then zip dist/ into release/claude-usage-tracker-v<version>.zip
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(".");
const DIST = resolve(ROOT, "dist");
const RELEASE_DIR = resolve(ROOT, "release");

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const zipName = `claude-usage-tracker-v${version}.zip`;
const zipPath = resolve(RELEASE_DIR, zipName);

console.log("→ rebuilding dist/");
execFileSync(process.execPath, [resolve(ROOT, "scripts/build.mjs")], { stdio: "inherit" });

if (!existsSync(DIST)) {
  console.error("dist/ missing after build");
  process.exit(1);
}

mkdirSync(RELEASE_DIR, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

console.log(`→ zipping dist/ → ${zipPath}`);
// Use system zip; -X drops extra metadata, -r recurse, -q quiet, "." includes hidden if any.
execFileSync("zip", ["-Xrq", zipPath, "."], { cwd: DIST, stdio: "inherit" });

const sizeBytes = execFileSync("stat", ["-f", "%z", zipPath]).toString().trim();
console.log(`✓ ${zipName} (${sizeBytes} bytes)`);
console.log(`  ${zipPath}`);
