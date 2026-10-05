import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.js";

const dist = path.resolve(ROOT, "dist");
if (path.dirname(dist) !== ROOT || path.basename(dist) !== "dist") {
  throw new Error("Refusing to build outside the project dist directory.");
}

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await fs.cp(path.join(ROOT, "public"), path.join(dist, "public"), { recursive: true });
await fs.cp(path.join(ROOT, "src"), path.join(dist, "src"), { recursive: true });
await fs.copyFile(path.join(ROOT, "package.json"), path.join(dist, "package.json"));
await fs.copyFile(path.join(ROOT, "LICENSE"), path.join(dist, "LICENSE"));

const manifest = {
  name: "TasteCheckout",
  builtAt: new Date().toISOString(),
  runtime: "Node.js >=20",
  entry: "src/server.js",
  adapters: ["Qloo", "Channel3 discovery", "PayPal Sandbox Orders v2"]
};
await fs.writeFile(path.join(dist, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Build complete: ${dist}`);
