// server.js (SUBSTITUIÇÃO COMPLETA)
const express = require("express");
const axios = require("axios");

const { getRodadaRankingDetalhado } = require("./cartola");
const { zoeiraRodada } = require("./zoeiras");

const app = express();
app.use(express.json());

// ===== ENV =====
const PORT = process.env.PORT || 3000;

// Webhook verify token (o mesmo que você cadastrou na Meta)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// WhatsApp Cloud API
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;     // token permanente recomendado
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;

// Liga
const LIGA_NOME = process.env.LIGA_NOME || "SHOW DE BOLA ARAÇA F.C";

// ===== Helpers =====
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
    `• *status* — rodada atual / mercado\n` +
    `• *rodada* — ranking da rodada (detalhado + zoeiras)\n` +
    `• *mensal* — explica como usar\n` +
    `• *mensal X Y* — (em implantação) ranking do período por rodadas\n\n` +
    `📌 Dica: copie e cole o retorno no grupo.`
  );
}

async function sendTextMessage(to, body) {
  if (!WA_ACCESS_TOKEN || !WA_PHONE_NUMBER_ID) {
    console.log("⚠️ Falta WA_ACCESS_TOKEN ou WA_PHONE_NUMBER_ID no ambiente do Render.");
    return;
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

function extractIncomingText(payload) {
  try {
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const msg = value?.messages?.[0];
    if (!msg) return null;

    const from = msg.from; // "5518..."
    const text = msg.text?.body || "";

    return { from, text };
  } catch {
    return null;
  }
}

// ===== Routes =====
app.get("/", (_, res) => res.status(200).send("OK"));

// 1) Verificação do Webhook (Meta chama GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2) Recebimento de mensagens (Meta chama POST)
app.post("/webhook", async (req, res) => {
  // responde rápido pra Meta
  res.sendStatus(200);

  const incoming = extractIncomingText(req.body);
  if (!incoming) return;

  const { from, text } = incoming;
  const t = normalizeText(text);

  console.log("📩 Recebi:", { from, text });

  try {
    // ===== COMANDOS =====
    if (!t || t === "ajuda" || t === "help" || t === "menu" || t === "/ajuda") {
      await sendTextMessage(from, helpText());
      return;
    }

    if (t === "status") {
      // status simples via Cartola (sem depender de cartola.js)
      const r = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 15000 });
      const st = r.data;

      const msg =
        `📌 Status Cartola\n` +
        `Rodada atual: ${st?.rodada_atual ?? "?"}\n` +
        `Mercado: ${st?.status_mercado === 1 ? "ABERTO" : "FECHADO"}`;

      await sendTextMessage(from, msg);
      return;
    }

    if (t === "rodada" || t === "/rodada") {
      const msg = await getRodadaRankingDetalhado({ zoeiraRodada });
      await sendTextMessage(from, msg);
      return;
    }

    if (t === "mensal" || t === "/mensal") {
      await sendTextMessage(
        from,
        "📊 Mensal por rodadas\nUse assim: *mensal X Y*\nEx: *mensal 9 12*\n\n(Esse comando completo será ativado na próxima etapa.)"
      );
      return;
    }

    if (t.startsWith("mensal")) {
      // Já aceitamos o formato e retornamos “em implantação” por enquanto
      const parts = t.split(/\s+/);
      if (parts.length !== 3) {
        await sendTextMessage(from, "Use assim: *mensal X Y*\nEx: *mensal 9 12*");
        return;
      }
      const x = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);

      if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0 || x > y) {
        await sendTextMessage(from, "Intervalo inválido. Ex: *mensal 9 12* (onde 9 ≤ 12)");
        return;
      }

      await sendTextMessage(
        from,
        `🛠️ Mensal (rodadas ${x}–${y}) está em implantação.\nAssim que você confirmar que *rodada* está funcionando, eu libero o mensal completo com sobe/desce e zoeiras 😈`
      );
      return;
    }

    // Fallback
    await sendTextMessage(from, `Não entendi 😅\n\n${helpText()}`);
  } catch (err) {
    console.error("❌ Erro no processamento:", err?.response?.data || err?.message || err);
    try {
      await sendTextMessage(from, "⚠️ Deu erro ao processar. Tente novamente com: ajuda | status | rodada");
    } catch {}
  }
});

// ===== Start =====
app.listen(PORT, () => console.log(`🚀 server ON: ${PORT}`));
