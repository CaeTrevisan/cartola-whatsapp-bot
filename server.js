// server.js (COMPLETO)
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// =====================
// CONFIG (ENV VARS)
// =====================
const PORT = process.env.PORT || 3000;

// Meta Webhook Verify
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// WhatsApp Cloud API
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;

// Texto (opcional)
const LIGA_NOME = process.env.LIGA_NOME || "SHOW DE BOLA ARAÇA F.C";

// =====================
// DEBUG (para ver pelo celular se chegou webhook)
// =====================
let lastWebhook = null;
let lastWebhookAt = null;

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get("/", (_, res) => {
  // Se isso não aparecer como "OK", seu deploy não está rodando este server.js
  res.status(200).send("OK");
});

app.get("/debug", (_, res) => {
  // Abra isso no navegador do celular para ver se o Meta está batendo no webhook
  res.status(200).json({
    ok: true,
    lastWebhookAt,
    lastWebhook
  });
});

// =====================
// HELPERS
// =====================
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
    `🏆 *${LIGA_NOME}* — Bot Cartola (Privado)\n\n` +
    `Comandos:\n` +
    `• *ajuda* — mostra comandos\n` +
    `• *status* — status do Cartola (rodada/mercado)\n\n` +
    `📌 Se isso responder, o webhook e o envio estão OK.`
  );
}

function extractIncomingText(payload) {
  try {
    const entry = payload.entry?.[0];
    const changes = entry.changes?.[0];
    const value = changes.value;

    const msg = value?.messages?.[0];
    if (!msg) return null;

    const from = msg.from;            // ex: "5518999999999"
    const text = msg.text?.body || ""; // texto digitado pelo usuário

    return { from, text };
  } catch (e) {
    return null;
  }
}

async function sendTextMessage(to, body) {
  if (!WA_ACCESS_TOKEN || !WA_PHONE_NUMBER_ID) {
    throw new Error("Falta WA_ACCESS_TOKEN ou WA_PHONE_NUMBER_ID no Render.");
  }

  const url = `https://graph.facebook.com/v22.0/${WA_PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 20000
    }
  );
}

// =====================
// WEBHOOK VERIFY (GET)
// =====================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // Se o token do Meta bater com o VERIFY_TOKEN do Render, devolve o challenge
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// =====================
// WEBHOOK EVENTS (POST)
// =====================
//
// ✅ EXPLICAÇÃO IMPORTANTE (bem prática):
// - Este endpoint é chamado AUTOMATICAMENTE pela Meta quando alguém manda mensagem pro número do bot.
// - Você NÃO “entra” nele manualmente.
// - Ele fica esperando o Meta mandar um POST.
// - Por isso, quando você manda "ajuda" no WhatsApp, este POST é disparado.
// - Aqui dentro nós:
//   1) salvamos lastWebhook* para ver em /debug
//   2) respondemos 200 rápido para a Meta
//   3) extraímos o texto e o número do usuário
//   4) decidimos qual comando é
//   5) enviamos a resposta via Cloud API
//
app.post("/webhook", async (req, res) => {
  // 1) salva para debug (você vê no celular em /debug)
  lastWebhookAt = new Date().toISOString();
  lastWebhook = req.body;

  // 2) responde 200 IMEDIATO para a Meta
  res.sendStatus(200);

  // 3) pega mensagem
  const incoming = extractIncomingText(req.body);

  // Se não for mensagem (às vezes é status de entrega), ignora
  if (!incoming) return;

  const { from, text } = incoming;
  const t = normalizeText(text);

  console.log("📩 Mensagem recebida:", { from, text });

  try {
    // 4) comandos
    if (!t || t === "ajuda" || t === "help" || t === "menu" || t === "/ajuda") {
      await sendTextMessage(from, helpText());
      return;
    }

    if (t === "status") {
      const r = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 15000 });
      const st = r.data;

      const msg =
        `📌 Status Cartola\n` +
        `Rodada atual: ${st?.rodada_atual ?? "?"}\n` +
        `Mercado: ${st?.status_mercado === 1 ? "ABERTO" : "FECHADO"}`;

      await sendTextMessage(from, msg);
      return;
    }

    // fallback
    await sendTextMessage(from, `Não entendi 😅\n\n${helpText()}`);
  } catch (err) {
    console.error("❌ Erro ao responder:", err?.response?.data || err?.message || err);

    // tenta mandar erro amigável pro usuário
    try {
      await sendTextMessage(from, "⚠️ Deu erro ao processar. Tente novamente: ajuda | status");
    } catch {}
  }
});

// =====================
// START
// =====================
app.listen(PORT, () => {
  console.log(`🚀 Server ON port ${PORT}`);
});
