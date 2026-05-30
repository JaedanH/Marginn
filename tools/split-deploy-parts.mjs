import fs from "fs";
import path from "path";

const p = "C:/Users/JMHru/.cursor/projects/empty-window/mcp-args-analyse-item.json";
const a = JSON.parse(fs.readFileSync(p, "utf8"));
const dir = "D:/Marginn/project/tools/deploy-parts";
fs.mkdirSync(dir, { recursive: true });
for (const f of a.files) {
  const safe = f.name.replace(/\//g, "__");
  fs.writeFileSync(path.join(dir, safe), f.content);
}
console.log("parts", a.files.length);
