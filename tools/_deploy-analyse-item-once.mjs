import fs from "fs";

const envPath = new URL("../.env", import.meta.url);
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const token = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
if (!token) {
  console.error("NO_SUPABASE_TOKEN");
  process.exit(2);
}

const payload = JSON.parse(
  fs.readFileSync(new URL("./mcp-deploy-analyse-item-payload.json", import.meta.url), "utf8"),
);
const url =
  "https://api.supabase.com/v1/projects/nuvizoiozourydaqwvqp/functions/deploy?slug=analyse-item";
const body = {
  metadata: {
    name: payload.name,
    entrypoint_path: payload.entrypoint_path,
    verify_jwt: payload.verify_jwt,
  },
  file: payload.files,
};

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(res.status, text.slice(0, 500));
process.exit(res.ok ? 0 : 1);
