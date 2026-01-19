import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;

// ENV
const WA_VERIFY_TOKEN = (process.env.WA_VERIFY_TOKEN || "").trim();
const WA_TOKEN = (process.env.WA_TOKEN || "").trim();

// DEBUG
let lastWebhookAt = null;
let lastWebhookMethod = null;
let lastWebhookQuery = null;
let lastWebhookBody = null;

// ========= ROTAS ÚTEIS =========
app.get("/", (req, res) => res.status(200).send("OK"));

app.get("/debug", (req, res) => {
  res.json({
    ok: true,
    now: new Date().toISOString(),
    lastWebhookAt,
    lastWebhookMethod,
    lastWebhookQuery,
    lastWebhookBody,
    verifyTokenConfigured: WA_VERIFY_TOKEN.length > 0,
    waTokenConfigured: WA_TOKEN.length > 0
  });
});

// ========= 1) VERIFICAÇÃO DO WEBHOOK (GET) =========
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("[GET /webhook] mode=", mode, "tokenPresent=", !!token, "challengePresent=", !!challenge);

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    console.log("[GET /webhook] ✅ Verified OK");
    return res.status(200).send(challenge);
  }

  console.log("[GET /webhook] ❌ Forbidden");
  return res.sendStatus(403);
});

// ========= HELPERS =========
function normalizeText(s = "") {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function helpText() {
  return (
    "🤖 Bot SHOW DE BOLA ARAÇA F.C\n\n" +
    "Comandos:\n" +
    "• ajuda\n" +
    "• status\n" +
    "• rodada\n\n" +
    "Obs: por enquanto o comando 'rodada' está em implantação."
  );
}

async function sendTextMessage({ phoneNumberId, to, body }) {
  if (!WA_TOKEN) throw new Error("WA_TOKEN não configurado no Render.");

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.log("[SEND] ❌ Erro Graph:", resp.status, data);
    throw new Error(`Graph error ${resp.status}`);
  }
  console.log("[SEND] ✅ OK:", data);
}

// ========= 2) RECEBIMENTO DE EVENTOS (POST) =========
app.post("/webhook", async (req, res) => {
  // salva para debug
  lastWebhookAt = new Date().toISOString();
  lastWebhookMethod = "POST";
  lastWebhookQuery = req.query || {};
  lastWebhookBody = req.body || {};

  // responde 200 rápido para Meta
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Só processa mensagens
    if (change?.field !== "messages") return;

    const phoneNumberId = value?.metadata?.phone_number_id;
    const msg = value?.messages?.[0];
    if (!phoneNumberId || !msg) return;

    const from = msg.from;

    // Apenas texto por enquanto
    if (msg.type !== "text") {
      console.log("[MSG] tipo não-texto ignorado:", msg.type);
      return;
    }

    const text = msg.text?.body || "";
    const cmd = normalizeText(text);

    console.log(`[MSG] from=${from} text="${text}" cmd="${cmd}" phoneNumberId=${phoneNumberId}`);

    // ===== COMANDOS =====
    if (!cmd || cmd === "ajuda" || cmd === "help" || cmd === "menu") {
      await sendTextMessage({ phoneNumberId, to: from, body: helpText() });
      return;
    }

    if (cmd === "status") {
      await sendTextMessage({
        phoneNumberId,
        to: from,
        body: "✅ Status OK. Webhook e envio funcionando."
      });
      return;
    }

    if (cmd === "rodada") {
      await sendTextMessage({
        phoneNumberId,
        to: from,
        body: "🛠️ Rodada (ranking real) será ativado na próxima etapa. Por enquanto: tudo OK no WhatsApp."
      });
      return;
    }

    // fallback: eco
    await sendTextMessage({
      phoneNumberId,
      to: from,
      body: `Recebi: ${text}\n\nDigite "ajuda" para comandos.`
    });
  } catch (err) {
    console.log("[WEBHOOK] ❌ erro:", err?.message || err);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
