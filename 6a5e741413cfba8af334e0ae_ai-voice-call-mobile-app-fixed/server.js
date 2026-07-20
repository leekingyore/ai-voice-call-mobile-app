import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function safePublicPath(urlPath) {
  const pathname = new URL(urlPath, "http://localhost").pathname;
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  return join(publicDir, normalized);
}

async function createRealtimeSession(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "请求体不是有效 JSON。" });
  }

  const apiKey = String(payload.apiKey || "").trim();
  const model = String(payload.model || "gpt-realtime").trim();
  const voice = String(payload.voice || "alloy").trim();
  const instructions = String(payload.instructions || "").trim();

  if (!apiKey) {
    return sendJson(res, 400, { error: "请先填写 API Key。" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        voice,
        instructions: instructions || "你是一个自然、友好、简洁的中文语音助手。优先使用中文回答。",
        modalities: ["audio", "text"],
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 650
        }
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data?.error?.message || "创建实时会话失败，请检查 API Key、模型名或账户权限。"
      });
    }

    return sendJson(res, 200, data);
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "服务器请求失败。"
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/realtime/session") {
    return createRealtimeSession(req, res);
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  try {
    const filePath = safePublicPath(req.url || "/");
    const file = await readFile(filePath);
    const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(port, () => {
  console.log(`AI voice call app is running at http://localhost:${port}`);
});
