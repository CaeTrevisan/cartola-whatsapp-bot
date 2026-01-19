import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;

// ENV
const WA_VERIFY_TOKEN = (process.env.WA_VERIFY_TOKEN || "").trim();
const WA_TOKEN = (process.env.WA_TOKEN || "").trim();

// DEBUG: webhook
let lastWebhookAt = null;
let lastWebhookMethod = null;
let lastWebhookQuery = null;
let lastWebhookBody = null;

// DEBUG: envio
let lastSendAt = null;
let lastSendTo = null;
let lastSendPhoneNumberId = null;
let lastSendOk = null;
let lastSendStatus = null;
let lastSendResponse = null;
let lastSendError = null;

app.get("/", (_, res) => res.status(200).send("OK"));

app.get("/debug", (_, res) => {
  res.json({
    ok: true,
    now: new Date().toISOString(),

    verifyTokenConfigured: WA_VERIFY_TOKEN.length > 0,
    waTokenConfigured: WA_TOKEN.length > 0,

    lastWebhookAt,
    lastWebhookMethod,
    lastWebhookQuery,
    lastWebhookBody,

    lastSendAt,
    lastSendTo,
    lastSendPhoneNumberId,
    lastSendOk,
    lastSendStatus,
    lastSendResponse,
    lastSendError
  });
});

// Webhook verification (GET)
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
    "✅ Se você está lendo isso, o bot já consegue responder."
  );
}

async function sendTextMessage({ phoneNumberId, to, body }) {
  lastSendAt = new Date().toISOString();
  lastSendTo = to;
  lastSendPhoneNumberId = phoneNumberId;
  lastSendOk = null;
  lastSendStatus = null;
  lastSendResponse = null;
  lastSendError = null;

  if (!WA_TOKEN) {
    lastSendOk = false;
    lastSendError = "WA_TOKEN vazio ou não configurado no Render";
    throw new Error(lastSendError);
  }

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json().catch(() => ({}));
  lastSendStatus = resp.status;
  lastSendResponse = data;
  lastSendOk = resp.ok;

  if (!resp.ok) {
    lastSendError = `Graph API error ${resp.status}`;
    throw new Error(lastSendError);
  }

  return data;
}

// Webhook events (POST)
app.post("/webhook", async (req, res) => {
  // salva para debug
  lastWebhookAt = new Date().toISOString();
  lastWebhookMethod = "POST";
  lastWebhookQuery = req.query || {};
  lastWebhookBody = req.body || {};

  // responde 200 rápido
  res.sendStatus(200);

  try {
    const change = req.body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    if (change?.field !== "messages") return;

    const phoneNumberId = value?.metadata?.phone_number_id;
    const msg = value?.messages?.[0];
    if (!phoneNumberId || !msg) return;

    const from = msg.from;

    if (msg.type !== "text") return;

    const text = msg.text?.body || "";
    const cmd = normalizeText(text);

    console.log(`[MSG] from=${from} text="${text}" cmd="${cmd}" phoneNumberId=${phoneNumberId}`);

    // comandos
    if (!cmd || cmd === "ajuda" || cmd === "help" || cmd === "menu") {
      await sendTextMessage({ phoneNumberId, to: from, body: helpText() });
      return;
    }

    if (cmd === "status") {
      await sendTextMessage({ phoneNumberId, to: from, body: "✅ Status OK. Webhook e envio ativos." });
      return;
    }

    if (cmd === "rodada") {
      await sendTextMessage({
        phoneNumberId,
        to: from,
        body: "🛠️ Rodada (ranking real) será ativado na próxima etapa. Por enquanto, WhatsApp OK."
      });
      return;
    }

    // fallback
    await sendTextMessage({ phoneNumberId, to: from, body: `Recebi: ${text}\nDigite "ajuda" para comandos.` });
  } catch (err) {
    console.log("[ERROR webhook/send]", err?.message || err);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
