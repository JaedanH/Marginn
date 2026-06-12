// Deploy score-comparables edge function (multipart Management API).
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
  "score-comparables",
);
const sharedDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "functions",
  "_shared",
);

const files = [
  { name: "index.ts", content: fs.readFileSync(path.join(fnDir, "index.ts"), "utf8") },
  { name: "_shared/cors.ts", content: fs.readFileSync(path.join(sharedDir, "cors.ts"), "utf8") },
  { name: "_shared/edgeSecrets.ts", content: fs.readFileSync(path.join(sharedDir, "edgeSecrets.ts"), "utf8") },
];

const form = new FormData();
form.append(
  "metadata",
  JSON.stringify({ name: "score-comparables", entrypoint_path: "index.ts", verify_jwt: true }),
);
for (const f of files) {
  form.append("file", new Blob([f.content], { type: "application/typescript" }), f.name);
}

const res = await fetch(
  "https://api.supabase.com/v1/projects/nuvizoiozourydaqwvqp/functions/deploy?slug=score-comparables",
  { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
);
const text = await res.text();
console.log(res.status, text.slice(0, 500));
process.exit(res.ok ? 0 : 1);
