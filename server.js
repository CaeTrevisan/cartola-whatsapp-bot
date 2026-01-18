const express = require("express");

const app = express();

// Captura JSON do webhook
app.use(express.json({ limit: "2mb" }));

// Memória simples para debug
let lastWebhookAt = null;
let lastWebhookMethod = null;
let lastWebhookQuery = null;
let lastWebhookBody = null;

// Helpers
function safeStr(v) {
  if (v === undefined || v === null) return null;
  return String(v);
}

function getVerifyToken() {
  // Aceita 2 nomes para evitar dor de cabeça
  // (use WA_VERIFY_TOKEN no Render)
  return (
    process.env.WA_VERIFY_TOKEN ||
    process.env.VERIFY_TOKEN ||
    ""
  ).trim();
}

// Health check
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// Debug
app.get("/debug", (req, res) => {
  const token = getVerifyToken();
  res.json({
    ok: true,
    now: new Date().toISOString(),
    lastWebhookAt,
    lastWebhookMethod,
    lastWebhookQuery,
    lastWebhookBody,
    verifyTokenConfigured: token.length > 0
  });
});

// Webhook verification (Meta chama isso no "Verificar e salvar")
app.get("/webhook", (req, res) => {
  lastWebhookAt = new Date().toISOString();
  lastWebhookMethod = "GET";
  lastWebhookQuery = req.query;
  lastWebhookBody = null;

  const mode = safeStr(req.query["hub.mode"]);
  const tokenFromMeta = safeStr(req.query["hub.verify_token"]);
  const challenge = safeStr(req.query["hub.challenge"]);

  const configured = getVerifyToken();

  // Logs úteis no Render (sem expor token)
  console.log(`[GET /webhook] mode=${mode} tokenPresent=${!!tokenFromMeta} challengePresent=${!!challenge} configuredLen=${configured.length}`);

  // Regras do Meta webhook verify
  if (mode === "subscribe" && tokenFromMeta && challenge) {
    if (configured.length === 0) {
      console.log("[GET /webhook] Forbidden: verify token NOT configured in env");
      return res.sendStatus(403);
    }

    if (tokenFromMeta === configured) {
      console.log("[GET /webhook] Verified OK");
      return res.status(200).send(challenge);
    }

    console.log("[GET /webhook] Forbidden: token mismatch");
    return res.sendStatus(403);
  }

  console.log("[GET /webhook] Bad request: missing hub params");
  return res.sendStatus(400);
});

// Webhook events (mensagens/status chegam aqui)
app.post("/webhook", (req, res) => {
  lastWebhookAt = new Date().toISOString();
  lastWebhookMethod = "POST";
  lastWebhookQuery = req.query;
  lastWebhookBody = req.body;

  // Log resumido (evita estourar log)
  console.log("[POST /webhook] received event");

  // IMPORTANTE: responder rápido 200
  res.sendStatus(200);

  // Aqui você processa eventos (mensagens recebidas, status, etc.)
  // Exemplo: imprimir texto de mensagens recebidas (quando existir)
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const messages = value?.messages;
    if (Array.isArray(messages) && messages.length > 0) {
      for (const msg of messages) {
        const from = msg.from;
        const text = msg?.text?.body;
        console.log(`[INCOMING] from=${from} text=${text}`);
      }
    }
  } catch (e) {
    console.log("Error parsing webhook body:", e?.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
