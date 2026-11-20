import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Publish only website assets; dependencies and backend code stay private.
for (const path of [
  "index.html",
  "admin",
  "images",
  "content",
  "PremiumProjects",
  "manifest.json",
  "assets-manifest.json"
]) {
  await cp(new URL(path, root), new URL(path, output), { recursive: true });
}

console.log(`Prepared website assets in ${fileURLToPath(output)}`);
