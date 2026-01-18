const express = require("express");
const axios = require("axios");
const { getRodadaRankingTexto, getMensalRankingTexto } = require("./cartola");

const app = express();
app.use(express.json());

/**
 * ENV VARS (Render -> Environment):
 * VERIFY_TOKEN       = um texto seu (ex: "meu_token_verificacao_123")
 * WA_ACCESS_TOKEN    = token do WhatsApp Cloud API (permanente, recomendado)
 * WA_PHONE_NUMBER_ID = Phone Number ID (da Cloud API)
 * LIGA_NOME          = "SHOW DE BOLA ARAÇA F.C" (opcional, só para texto)
 */
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const LIGA_NOME = process.env.LIGA_NOME || "SHOW DE BOLA ARAÇA F.C";

if (!VERIFY_TOKEN || !WA_ACCESS_TOKEN || !WA_PHONE_NUMBER_ID) {
  console.log("⚠️ Variáveis faltando. Configure no Render:");
  console.log("VERIFY_TOKEN, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID");
}

/**
 * 1) Verificação do Webhook (Meta chama GET)
 */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/**
 * 2) Recebimento de mensagens (Meta chama POST)
 */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Status delivery etc
    if (!value?.messages?.length) {
      return res.sendStatus(200);
    }

    const msg = value.messages[0];
    const from = msg.from; // telefone do usuário (ex: 5518997...)
    const text = msg.text?.body?.trim() || "";

    console.log("📩 Mensagem recebida de:", from, "texto:", text);

    const resposta = await processCommand(text);

    if (resposta) {
      await sendTextMessage(from, resposta);
      console.log("✅ Resposta enviada para:", from);
    } else {
      // se quiser ignorar silenciosamente, deixe assim
      console.log("ℹ️ Sem resposta (comando não reconhecido).");
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro no webhook:", err?.response?.data || err.message);
    return res.sendStatus(200); // importante responder 200 pra Meta não ficar re-tentando
  }
});

/**
 * Processa comandos do bot privado
 */
async function processCommand(text) {
  const t = text.toLowerCase();

  // comandos curtos
  if (t === "ajuda" || t === "help" || t === "/ajuda") {
    return (
      `🏆 *${LIGA_NOME}* — Bot Cartola (Privado)\n\n` +
      `Comandos:\n` +
      `• *ajuda* — mostra comandos\n` +
      `• *rodada* — ranking da rodada (texto pronto pro grupo)\n` +
      `• *mensal* — ranking mensal (texto pronto pro grupo)\n\n` +
      `📌 Dica: copie e cole o retorno no grupo.`
    );
  }

  if (t === "rodada" || t === "/rodada") {
    // ⚠️ Aqui você vai plugar seu “ranking por rodada”
    return await getRodadaRankingTexto();
  }

  if (t === "mensal" || t === "/mensal") {
    // ⚠️ Aqui você vai plugar seu “ranking mensal”
    return await getMensalRankingTexto();
  }

  // fallback simples
  if (t.length > 0) {
    return `Não entendi 😅\nDigite *ajuda* para ver os comandos.`;
  }

  return null;
}

/**
 * Envia mensagem via WhatsApp Cloud API
 */
async function sendTextMessage(to, body) {
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
      timeout: 15000
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server ON port", PORT));
