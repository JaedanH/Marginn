import fs from "fs";
import path from "path";

const root = path.resolve("D:/Marginn/project/supabase/functions");
const fnDir = path.join(root, "analyse-item");
const sharedDir = path.join(root, "_shared");

const entryPath = path.join(fnDir, "index.ts");
const entry = fs.readFileSync(entryPath, "utf8");

const files = new Map();
files.set("index.ts", entry);

function addShared(rel) {
  const name = rel.replace(/^\.\.\/_shared\//, "_shared/");
  if (files.has(name)) return;
  const full = path.join(root, rel.replace(/^\.\.\//, ""));
  if (!fs.existsSync(full)) return;
  const content = fs.readFileSync(full, "utf8");
  files.set(name, content);
  for (const m of content.matchAll(/from\s+["'](\.\/[^"']+)["']/g)) {
    const sub = path.join(path.dirname(full), m[1]);
    const subName = "_shared/" + path.basename(sub);
    if (!files.has(subName) && fs.existsSync(sub)) {
      const subContent = fs.readFileSync(sub, "utf8");
      files.set(subName, subContent);
    }
  }
}

for (const m of entry.matchAll(/from\s+["'](\.\.\/_shared\/[^"']+)["']/g)) {
  addShared(m[1]);
}

const payload = {
  project_id: "nuvizoiozourydaqwvqp",
  name: "analyse-item",
  entrypoint_path: "index.ts",
  verify_jwt: true,
  files: [...files.entries()].map(([name, content]) => ({ name, content })),
};

const out =
  "C:/Users/JMHru/.cursor/projects/empty-window/mcp-args-analyse-item.json";
fs.writeFileSync(out, JSON.stringify(payload));
console.log(`wrote ${out} files=${payload.files.length} bytes=${fs.statSync(out).size}`);
