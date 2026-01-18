// src/whatsapp.js
import axios from "axios";

const GRAPH_VERSION = process.env.GRAPH_VERSION || "v22.0";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const LIGA_SLUG = process.env.LIGA_SLUG || "show-de-bola-araca-f-c";
const CARTOLA_BASE = "https://horizon-track.globoc.com/vent/cartola";

function requireEnv() {
  const missing = [];
  if (!WHATSAPP_TOKEN) missing.push("WHATSAPP_TOKEN");
  if (!PHONE_NUMBER_ID) missing.push("PHONE_NUMBER_ID");
  if (missing.length) {
    console.error("Missing env vars:", missing.join(", "));
  }
}

export async function sendText(to, text) {
  requireEnv();
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };

  const res = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });

  return res.data;
}

async function cartolaGet(path) {
  const url = `${CARTOLA_BASE}${path}`;
  const res = await axios.get(url, {
    headers: {
      // muitos endpoints do Cartola funcionam sem auth; se precisar,
      // você pode colocar headers extras aqui
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
    timeout: 20000,
  });
  return res.data;
}

function normalizeText(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function menuText() {
  return (
    "🤖 Bot Cartola (privado)\n\n" +
    "Comandos:\n" +
    "• rodada → ranking da rodada atual\n" +
    "• ranking → ranking geral do campeonato\n" +
    "• mensal X Y → ranking somando rodadas X até Y\n" +
    "   Ex: mensal 1 8\n" +
    "• ajuda → mostra este menu\n"
  );
}

// Ranking da liga (campeonato) — tentativa 1
async function getRankingLigaCampeonato() {
  // Esse endpoint pode variar conforme o Cartola muda rotas.
  // A ideia é: buscar dados da liga e extrair ranking.
  // Se der erro, a gente ajusta depois.
  const data = await cartolaGet(`/ligas/${encodeURIComponent(LIGA_SLUG)}`);

  // Alguns retornos comuns:
  // data.liga, data.times, data.ranking, etc.
  // Vamos tentar descobrir de forma defensiva:
  const liga = data?.liga || data;
  const ranking =
    data?.ranking ||
    data?.pontuacao ||
    data?.times ||
    data?.liga?.times ||
    data?.liga?.ranking;

  return { liga, ranking, raw: data };
}

// Ranking por rodada — tentativa 1
async function getRankingRodadaAtual() {
  const status = await cartolaGet("/mercado/status");
  const rodada = status?.rodada_atual;

  if (!rodada) {
    return { rodada: null, status, ranking: null };
  }

  const data = await cartolaGet(
    `/ligas/${encodeURIComponent(LIGA_SLUG)}/rodadas/${rodada}`
  );

  return { rodada, ranking: data, status };
}

function formatTopFromList(list, opts = {}) {
  const limit = opts.limit || 10;

  if (!Array.isArray(list) || !list.length) return "Sem dados para exibir.";

  const top = list.slice(0, limit);

  let out = "";
  top.forEach((item, idx) => {
    // Tentativas de campos comuns:
    const nome =
      item?.nome ||
      item?.time?.nome ||
      item?.time?.nome_cartola ||
      item?.nome_cartola ||
      item?.apelido ||
      item?.time?.apelido ||
      "Time";

    const pontos =
      item?.pontos ||
      item?.pontuacao ||
      item?.pontuacao_total ||
      item?.pontos_total ||
      item?.pontos_rodada ||
      item?.pontuacao_rodada ||
      item?.total ||
      item?.score;

    const pontosFmt =
      typeof pontos === "number" ? pontos.toFixed(2) : pontos ?? "-";

    out += `${idx + 1}º ${nome} — ${pontosFmt}\n`;
  });

  return out.trim();
}

// Mensal (somar rodadas X..Y)
// Aqui vamos buscar rodada a rodada e somar por time (chave defensiva)
async function getMensalSum(x, y) {
  const start = Number(x);
  const end = Number(y);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) {
    throw new Error("intervalo_invalido");
  }
  if (end < start) {
    throw new Error("intervalo_invertido");
  }

  const totals = new Map(); // key -> { nome, pontos }

  for (let r = start; r <= end; r++) {
    const data = await cartolaGet(
      `/ligas/${encodeURIComponent(LIGA_SLUG)}/rodadas/${r}`
    );

    // Tenta localizar lista de times pontuados.
    // Esse retorno pode ser objeto com array em algum campo.
    const list =
      data?.ranking ||
      data?.times ||
      data?.pontuacao ||
      data?.pontos ||
      data?.rodada ||
      data;

    const arr = Array.isArray(list)
      ? list
      : Array.isArray(list?.times)
        ? list.times
        : Array.isArray(list?.ranking)
          ? list.ranking
          : null;

    if (!arr) continue;

    for (const item of arr) {
      const nome =
        item?.nome ||
        item?.time?.nome ||
        item?.time?.nome_cartola ||
        item?.nome_cartola ||
        item?.apelido ||
        item?.time?.apelido ||
        "Time";

      const id =
        item?.time_id ||
        item?.time?.time_id ||
        item?.id ||
        item?.time?.id ||
        nome; // fallback

      const pontos =
        item?.pontos ||
        item?.pontuacao ||
        item?.pontos_rodada ||
        item?.pontuacao_rodada ||
        item?.total ||
        item?.score;

      const p = typeof pontos === "number" ? pontos : Number(pontos);
      if (!Number.isFinite(p)) continue;

      const key = String(id);
      if (!totals.has(key)) totals.set(key, { nome, pontos: 0 });
      totals.get(key).pontos += p;
    }
  }

  const result = Array.from(totals.values()).sort((a, b) => b.pontos - a.pontos);
  return result;
}

/**
 * Processa mensagens recebidas do WhatsApp
 * events: payload do webhook (Cloud API)
 */
export async function handleWebhookEvent(body) {
  // Retorna lista de respostas para enviar
  const responses = [];

  try {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const messages = value?.messages;
    if (!messages || !messages.length) return responses;

    for (const msg of messages) {
      const from = msg.from; // telefone do usuário
      const type = msg.type;

      // Só vamos lidar com texto por enquanto
      const text =
        type === "text" ? msg?.text?.body : type === "button" ? msg?.button?.text : "";

      const cmd = normalizeText(text);

      if (!cmd || cmd === "ajuda" || cmd === "menu") {
        responses.push({ to: from, text: menuText() });
        continue;
      }

      if (cmd === "rodada") {
        try {
          const { rodada, ranking } = await getRankingRodadaAtual();

          if (!rodada) {
            responses.push({
              to: from,
              text: "Não consegui identificar a rodada atual no momento.",
            });
            continue;
          }

          // tenta achar lista no retorno
          const list =
            ranking?.ranking ||
            ranking?.times ||
            ranking?.pontuacao ||
            ranking?.pontos ||
            ranking;

          const arr = Array.isArray(list)
            ? list
            : Array.isArray(list?.times)
              ? list.times
              : Array.isArray(list?.ranking)
                ? list.ranking
                : null;

          const topText = arr ? formatTopFromList(arr, { limit: 10 }) : "Sem dados para exibir.";

          responses.push({
            to: from,
            text: `🏆 Ranking da rodada ${rodada}\n\n${topText}`,
          });
        } catch (e) {
          console.error("rodada error:", e?.response?.data || e);
          responses.push({ to: from, text: "Erro ao buscar ranking da rodada." });
        }
        continue;
      }

      if (cmd === "ranking") {
        try {
          const { ranking, raw } = await getRankingLigaCampeonato();

          // tenta achar lista
          const list =
            raw?.ranking ||
            raw?.times ||
            raw?.pontuacao ||
            raw?.pontos ||
            ranking;

          const arr = Array.isArray(list)
            ? list
            : Array.isArray(list?.times)
              ? list.times
              : Array.isArray(list?.ranking)
                ? list.ranking
                : null;

          const topText = arr ? formatTopFromList(arr, { limit: 10 }) : "Sem dados para exibir.";

          responses.push({
            to: from,
            text: `🏆 Ranking geral (top 10)\n\n${topText}`,
          });
        } catch (e) {
          console.error("ranking error:", e?.response?.data || e);
          responses.push({ to: from, text: "Erro ao buscar ranking geral." });
        }
        continue;
      }

      // ✅ ITEM C: Mensal com orientação quando não informar intervalo
      if (cmd === "mensal") {
        responses.push({
          to: from,
          text: "📊 Mensal: informe o intervalo.\nUse assim: mensal X Y\nEx: mensal 1 8",
        });
        continue;
      }

      if (cmd.startsWith("mensal")) {
        const parts = cmd.split(/\s+/);

        if (parts.length !== 3) {
          responses.push({
            to: from,
            text: "Use assim: mensal X Y\nEx: mensal 1 8",
          });
          continue;
        }

        const [, x, y] = parts;

        try {
          const list = await getMensalSum(x, y);

          if (!list.length) {
            responses.push({
              to: from,
              text: `📊 Mensal (${x} a ${y})\n\nSem dados para exibir.`,
            });
            continue;
          }

          const top = list.slice(0, 10);
          let out = "";
          top.forEach((t, idx) => {
            out += `${idx + 1}º ${t.nome} — ${t.pontos.toFixed(2)}\n`;
          });

          responses.push({
            to: from,
            text: `📊 Mensal (${x} a ${y}) — Top 10\n\n${out.trim()}`,
          });
        } catch (e) {
          console.error("mensal error:", e?.response?.data || e);

          if (e?.message === "intervalo_invertido") {
            responses.push({
              to: from,
              text: "Intervalo inválido: Y precisa ser maior ou igual a X.\nEx: mensal 1 8",
            });
            continue;
          }

          responses.push({
            to: from,
            text: "Erro ao calcular o mensal. Tente novamente.\nEx: mensal 1 8",
          });
        }
        continue;
      }

      // fallback
      responses.push({
        to: from,
        text: `Não entendi. Digite "ajuda" para ver os comandos.`,
      });
    }
  } catch (e) {
    console.error("handleWebhookEvent error:", e?.response?.data || e);
  }

  return responses;
}
