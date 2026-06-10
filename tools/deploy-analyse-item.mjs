// Deploy analyse-item to Supabase from the working tree (multipart Management API).
// Usage: SUPABASE_ACCESS_TOKEN=... node tools/deploy-analyse-item.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const token = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
if (!token) {
  console.error("NO_SUPABASE_TOKEN");
  process.exit(2);
}

const fnDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "functions",
  "analyse-item",
);

const files = [];
function walk(dir, rel) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const relName = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(abs, relName);
    else if (entry.name.endsWith(".ts")) {
      files.push({ name: relName, content: fs.readFileSync(abs, "utf8") });
    }
  }
}
walk(fnDir, "");

console.log("deploying files:", files.map((f) => f.name).join(", "));

const form = new FormData();
form.append(
  "metadata",
  JSON.stringify({ name: "analyse-item", entrypoint_path: "index.ts", verify_jwt: true }),
);
for (const f of files) {
  form.append("file", new Blob([f.content], { type: "application/typescript" }), f.name);
}

const res = await fetch(
  "https://api.supabase.com/v1/projects/nuvizoiozourydaqwvqp/functions/deploy?slug=analyse-item",
  { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
);
const text = await res.text();
console.log(res.status, text.slice(0, 500));
process.exit(res.ok ? 0 : 1);
