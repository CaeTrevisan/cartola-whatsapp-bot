const axios = require("axios");

const API = "https://api.cartola.globo.com";
const LIGA = process.env.LIGA_SLUG || "show-de-bola-araca-f-c";

function fmtPts(n) {
  if (n === null || n === undefined) return "-";
  return Number(n).toFixed(2).replace(".", ",");
}

function medal(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `${i + 1})`;
}

// ===== STATUS / RODADA =====
async function getStatus() {
  const { data } = await axios.get(`${API}/mercado/status`, { timeout: 15000 });
  return data; // { rodada_atual, status_mercado }
}

// ===== TIMES DA LIGA =====
async function getTimesLiga() {
  const { data } = await axios.get(`${API}/liga/${LIGA}/times`, { timeout: 15000 });
  return data?.times || [];
}

// ===== PONTOS DO TIME NA RODADA =====
async function getPontosTime(timeId) {
  const { data } = await axios.get(`${API}/time/${timeId}`, { timeout: 15000 });
  // campos comuns:
  const pontos = data?.pontos ?? data?.pontos_rodada ?? 0;
  const escalou = data?.escalado !== false; // quando não escalou, costuma vir false
  return { pontos: Number(pontos) || 0, escalou };
}

// ===== RANKING DA RODADA (DETALHADO) =====
async function getRodadaRankingDetalhado({ zoeiraRodada }) {
  const status = await getStatus();
  const rodada = status.rodada_atual;

  const times = await getTimesLiga();

  const ranking = [];
  const naoEscalou = [];

  for (const t of times) {
    const { pontos, escalou } = await getPontosTime(t.time_id);
    ranking.push({ nome: t.nome, pontos });
    if (!escalou) naoEscalou.push(t.nome);
  }

  ranking.sort((a, b) => b.pontos - a.pontos);

  // Monta texto
  let txt = `🏆 SHOW DE BOLA ARAÇA F.C\n📊 RODADA ${rodada} — RESULTADO\n\n`;

  ranking.forEach((t, i) => {
    const prefix = medal(i);
    txt += `${prefix} ${t.nome} — ${fmtPts(t.pontos)}\n`;
  });

  // Destaques
  const lider = ranking[0];
  const lanterna = ranking[ranking.length - 1];

  txt += `\n🔥 Destaque POSITIVO da rodada\n`;
  txt += `✅ ${lider.nome} — maior pontuação\n`;

  txt += `\n🥶 Destaque NEGATIVO da rodada\n`;
  txt += `🧊 ${lanterna.nome} — menor pontuação\n`;

  if (naoEscalou.length) {
    txt += `\n⚠️ Não escalou\n❌ ${naoEscalou.join(", ")}\n`;
  }

  // Zoeiras (injeção)
  if (typeof zoeiraRodada === "function") {
    txt += `\n😂 ZOEIRAS\n`;
    txt += zoeiraRodada({
      lider: lider.nome,
      lanterna: lanterna.nome,
      naoEscalou
    });
  }

  return txt.trim();
}

module.exports = {
  getRodadaRankingDetalhado
};
