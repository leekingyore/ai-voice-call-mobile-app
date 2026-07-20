export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "只支持 POST 请求。" });
  }

  const apiKey = String(req.body?.apiKey || "").trim();
  const model = String(req.body?.model || "gpt-realtime").trim();
  const voice = String(req.body?.voice || "alloy").trim();
  const instructions = String(req.body?.instructions || "").trim();

  if (!apiKey) {
    return res.status(400).json({ error: "请先填写 API Key。" });
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
      return res.status(response.status).json({
        error: data?.error?.message || "创建实时会话失败，请检查 API Key、模型名或账户权限。"
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "服务器请求失败。"
    });
  }
}
