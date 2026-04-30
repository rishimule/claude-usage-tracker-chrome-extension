// scripts/build.mjs — bundle src/* into dist/ for unpacked load
import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DIST = resolve("dist");

async function run() {
  if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await mkdir(resolve(DIST, "icons"), { recursive: true });

  const common = {
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    sourcemap: true,
    logLevel: "info",
  };

  await build({ ...common, entryPoints: ["src/background.ts"], outfile: resolve(DIST, "background.js") });
  await build({ ...common, entryPoints: ["src/content/content.ts"], outfile: resolve(DIST, "content.js") });
  await build({ ...common, entryPoints: ["src/content/page-context.ts"], outfile: resolve(DIST, "page-context.js") });

  await copyFile("manifest.json", resolve(DIST, "manifest.json"));
  await copyFile("src/content/footer.css", resolve(DIST, "footer.css"));
  await copyFile("src/content/footer.html", resolve(DIST, "footer.html"));

  for (const size of [16, 32, 48, 128]) {
    const src = resolve("icons", `${size}.png`);
    if (existsSync(src)) await copyFile(src, resolve(DIST, "icons", `${size}.png`));
  }

  console.log("built dist/");
}

run().catch((e) => { console.error(e); process.exit(1); });
