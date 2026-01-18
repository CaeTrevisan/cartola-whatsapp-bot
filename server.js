import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Coloque esse mesmo valor lá no campo "Verificar token" do Meta
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "coloque-um-token-aqui";

// Para debug rápido
let lastWebhookAt = null;
let lastWebhookMethod = null;
let lastWebhookQuery = null;
let lastWebhookBody = null;

// Middleware de JSON — precisa vir ANTES do POST /webhook
app.use(express.json({ limit: "2mb" }));

// Home
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// Ping
app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

// Debug
app.get("/debug", (req, res) => {
  res.status(200).json({
    ok: true,
    now: new Date().toISOString(),
    lastWebhookAt,
    lastWebhookMethod,
    lastWebhookQuery,
    lastWebhookBody,
    verifyTokenConfigured: Boolean(process.env.VERIFY_TOKEN),
  });
});

/**
 * ✅ VERIFICAÇÃO DO WEBHOOK (GET)
 * A Meta chama isso para confirmar o endpoint.
 */
app.get("/webhook", (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // Log para aparecer no Render
    console.log("[GET /webhook] mode=", mode, "token=", token ? "***" : null, "challenge=", challenge);

    // Se o mode for subscribe e o token for igual ao VERIFY_TOKEN, responde o challenge
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[GET /webhook] ✅ Verified!");
      return res.status(200).send(challenge);
    }

    console.log("[GET /webhook] ❌ Forbidden (token mismatch or mode invalid)");
    return res.sendStatus(403);
  } catch (err) {
    console.error("[GET /webhook] ERROR:", err);
    return res.sendStatus(500);
  }
});

/**
 * ✅ RECEBIMENTO DE EVENTOS (POST)
 * Aqui chegam mensagens/status quando o webhook está verificado.
 */
app.post("/webhook", (req, res) => {
  lastWebhookAt = new Date().toISOString();
  lastWebhookMethod = "POST";
  lastWebhookQuery = req.query;
  lastWebhookBody = req.body;

  console.log("[POST /webhook] ✅ Received webhook");
  // log resumido
  console.log(JSON.stringify(req.body, null, 2));

  // Sempre responda 200 rápido
  return res.sendStatus(200);
});

// Fallback (para ver se está caindo em rota errada)
app.use((req, res) => {
  console.log("[404]", req.method, req.path);
  res.status(404).json({ error: "Not found", path: req.path });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
