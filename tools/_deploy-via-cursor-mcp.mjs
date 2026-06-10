/**
 * Deploy analyse-item by calling Supabase MCP HTTP with token from env.
 * Usage: SUPABASE_ACCESS_TOKEN=sbp_... node tools/_deploy-via-cursor-mcp.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsPath = path.join(__dirname, "_mcp-deploy-args.json");
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));

async function mcpCall(token, sessionId, method, params, id) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch("https://mcp.supabase.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  return {
    status: res.status,
    text,
    sessionId: res.headers.get("mcp-session-id") || sessionId,
  };
}

function parseSse(text) {
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        /* continue */
      }
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 12000) };
  }
}

const token = (process.env.SUPABASE_ACCESS_TOKEN || "").trim();
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN");
  process.exit(2);
}

const init = await mcpCall(
  token,
  null,
  "initialize",
  {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "marginn-restore-analyse-item", version: "1" },
  },
  1,
);

if (init.status < 200 || init.status >= 300) {
  console.error("init failed", init.status, init.text.slice(0, 500));
  process.exit(1);
}

const deploy = await mcpCall(
  token,
  init.sessionId,
  "tools/call",
  { name: "deploy_edge_function", arguments: args },
  2,
);

const parsed = parseSse(deploy.text);
console.log(JSON.stringify({ status: deploy.status, parsed, body: deploy.text.slice(0, 4000) }, null, 2));
process.exit(deploy.status >= 200 && deploy.status < 300 && !parsed?.error ? 0 : 1);
