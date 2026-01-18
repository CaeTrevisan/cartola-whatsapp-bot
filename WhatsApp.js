const axios = require("axios");
const { getStatus, getTimesLiga, getPontosTimeRodada } = require("./cartola");
const { saveRoundPoints, sumPointsBetweenRounds } = require("./db");

function handleWebhookVerify(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function sendText(toE164digitsOnly, text) {
  const url = `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: toE164digitsOnly,
    type: "text",
    text: { body: text }
  };

  await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
  });
}

function extractText(body) {
  try {
    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return null;
    const from = msg.from; // numero do usuário
    const text = msg.text?.body?.trim() || "";
    return { from, text };
  } catch {
    return null;
  }
}

function helpText() {
  return [
    "🤖 Bot Cartola (privado)",
    "",
    "Comandos:",
    "• status  → rodada atual e mercado",
    "• rodada  → ranking da rodada atual (parciais/fechada conforme mercado)",
    "• mensal X Y → ranking somando rodadas X até Y",
    "",
    "Exemplos:",
    "mensal 1 8",
    "mensal 9 16",
  ].join("\n");
}

// Monta ranking da rodada e (opcional) salva no banco
async function buildRoundRanking() {
  const st = await getStatus();
  const rodada = st.rodada_atual;

  const times = await getTimesLiga(process.env.LIGA_SLUG); // [{time_id, nome}]
  const rows = [];

  for (const t of times) {
    const pts = await getPontosTimeRodada(t.time_id);
    rows.push({ ...t, pontos: pts });
  }

  rows.sort((a, b) => b.pontos - a.pontos);

  // salva snapshot dessa rodada (garante mensal depois)
  await saveRoundPoints(rodada, rows);

  const header = `🏆 ${process.env.LIGA_SLUG}\n📅 Rodada ${rodada}`;
  const lines = rows.map((r, i) => `${String(i+1).padStart(2,"0")}) ${r.nome} — ${r.pontos.toFixed(2)} pts`);
  return `${header}\n\n${lines.join("\n")}`;
}

async function buildMonthlyRanking(fromRound, toRound) {
  const totals = await sumPointsBetweenRounds(fromRound, toRound);

  if (!totals.length) {
    return [
      "⚠️ Ainda não tenho histórico salvo dessas rodadas.",
      "Dica: use o comando 'rodada' pelo menos uma vez em cada rodada (ou rode um coletor automático).",
      `Você pediu: mensal ${fromRound} ${toRound}`
    ].join("\n");
  }

  totals.sort((a, b) => b.total - a.total);

  const header = `📊 Mensal (rodadas ${fromRound} a ${toRound})`;
  const lines = totals.map((r, i) => `${String(i+1).padStart(2,"0")}) ${r.nome} — ${r.total.toFixed(2)} pts`);
  return `${header}\n\n${lines.join("\n")}`;
}

async function handleWebhookEvent(req, res) {
  // responder rápido para Meta
  res.sendStatus(200);

  const parsed = extractText(req.body);
  if (!parsed) return;

  const { from, text } = parsed;
  const cmd = text.toLowerCase();

  try {
    if (cmd === "ajuda" || cmd === "help" || cmd === "menu") {
      await sendText(from, helpText());
      return;
    }

    if (cmd === "status") {
      const st = await getStatus();
      const msg = `📌 Status\nRodada atual: ${st.rodada_atual}\nMercado: ${st.status_mercado === 1 ? "ABERTO" : "FECHADO"}`;
      await sendText(from, msg);
      return;
    }

    if (cmd === "rodada") {
      const msg = await buildRoundRanking();
      await sendText(from, msg);

      // opcional: mandar também para admin (pra encaminhar no grupo)
      if (process.env.ADMIN_PHONE) {
        await sendText(process.env.ADMIN_PHONE, `✅ Pronto para encaminhar:\n\n${msg}`);
      }
      return;
    }

    // mensal X Y
    if (cmd.startsWith("mensal")) {
      const parts = cmd.split(/\s+/);
      if (parts.length !== 3) {
        await sendText(from, "Use assim: mensal X Y\nEx: mensal 1 8");
        return;
      }
      const x = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0 || x > y) {
        await sendText(from, "Intervalo inválido. Ex: mensal 1 8 (onde 1 <= 8)");
        return;
      }
      const msg = await buildMonthlyRanking(x, y);
      await sendText(from, msg);

      if (process.env.ADMIN_PHONE) {
        await sendText(process.env.ADMIN_PHONE, `✅ Pronto para encaminhar:\n\n${msg}`);
      }
      return;
    }

    // fallback
    await sendText(from, `Não entendi.\n\n${helpText()}`);
  } catch (e) {
    await sendText(from, "⚠️ Deu erro ao processar. Me diga qual comando você enviou (rodada/mensal/status).");
  }
}

module.exports = { handleWebhookVerify, handleWebhookEvent };
