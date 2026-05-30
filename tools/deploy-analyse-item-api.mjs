/**
 * Deploy analyse-item via Supabase Management API.
 * Requires: SUPABASE_ACCESS_TOKEN env (from https://supabase.com/dashboard/account/tokens)
 * Usage: set SUPABASE_ACCESS_TOKEN=sbp_... && node tools/deploy-analyse-item-api.mjs
 */
import fs from "fs";

const token = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set. Run: supabase login");
  process.exit(1);
}

const argsPath =
  process.env.MCP_ARGS_PATH ??
  "C:/Users/JMHru/.cursor/projects/empty-window/mcp-args-analyse-item.json";
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));

const ref = args.project_id ?? "nuvizoiozourydaqwvqp";
const url = `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=analyse-item`;

const body = {
  metadata: {
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt ?? true,
  },
  file: args.files.map((f) => ({
    name: f.name,
    content: f.content,
  })),
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
if (!res.ok) {
  console.error("Deploy failed", res.status, text.slice(0, 800));
  process.exit(1);
}
console.log("Deploy OK:", text.slice(0, 500));
