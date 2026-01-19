/**
 * Opção A: Gerar texto pronto para colar no grupo (sem WhatsApp).
 * Rodar:
 *   node gerar.js geral
 *   node gerar.js rodada 1
 *   node gerar.js mensal 1
 */

const PERIODOS_MENSAIS = [
  { nome: "Rodadas 1–4 (jan/fev)", ini: 1, fim: 4 },
  { nome: "Rodadas 5–8 (mar)", ini: 5, fim: 8 },
  { nome: "Rodadas 9–13 (abr)", ini: 9, fim: 13 },
  { nome: "Rodadas 14–18 (mai)", ini: 14, fim: 18 },
  { nome: "Rodadas 19–21 (jul)", ini: 19, fim: 21 },
  { nome: "Rodadas 22–25 (ago)", ini: 22, fim: 25 },
  { nome: "Rodadas 26–28 (set)", ini: 26, fim: 28 },
  { nome: "Rodadas 29–33 (out)", ini: 29, fim: 33 },
  { nome: "Rodadas 34–38 (nov/dez)", ini: 34, fim: 38 },
];

// ⚠️ Você vai preencher com o que capturar no DevTools (Copy as cURL / URL)
const CONFIG = {
  ligaId: "COLE_AQUI",
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
    // Se tiver Authorization no cURL, cola aqui:
    // "Authorization": "Bearer ...",
    // Se tiver cookie no cURL, cola aqui:
    // "Cookie": "..."
  },
  endpoints: {
    liga: (ligaId) => `COLE_AQUI_URL_LIGA/${ligaId}`,
    participantes: (ligaId) => `COLE_AQUI_URL_PARTICIPANTES/${ligaId}`,
    rankingGeral: (ligaId) => `COLE_AQUI_URL_RANKING_GERAL/${ligaId}`,
    rankingRodada: (ligaId, rodada) => `COLE_AQUI_URL_RANKING_RODADA/${ligaId}?rodada=${rodada}`,
  }
};

async function getJSON(url) {
  const res = await fetch(url, { headers: CONFIG.headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}\n${text}`);
  return JSON.parse(text);
}

function fmt(n) {
  if (n === null || n === undefined) return "-";
  return Number(n).toFixed(2).replace(".", ",");
}

function extrairRanking(json) {
  // Ajustaremos isso quando você mandar o Response real:
  return json?.ranking || json?.data || json?.times || [];
}

function extrairParticipantes(json) {
  // Ajustaremos isso quando você mandar o Response real:
  return json?.times || json?.data || json || [];
}

function linha(pos, time, dono, pontos) {
  const p = String(pos).padStart(2, "0");
  return `${p}) ${time} (${dono}) — ${fmt(pontos)}`;
}

async function gerarGeral() {
  const liga = await getJSON(CONFIG.endpoints.liga(CONFIG.ligaId));
  const ranking = await getJSON(CONFIG.endpoints.rankingGeral(CONFIG.ligaId));

  const nomeLiga = liga?.nome || "Liga";
  const lista = extrairRanking(ranking);

  let out = `🏆 *${nomeLiga}* — *Ranking Geral*\n\n`;
  lista.forEach((item, idx) => {
    const pos = item?.posicao ?? (idx + 1);
    const time = item?.time?.nome || item?.nome || "Time";
    const dono = item?.time?.nome_cartola || item?.nome_cartola || "";
    const pontos = item?.pontos ?? item?.pontuacao ?? item?.total ?? null;
    out += linha(pos, time, dono, pontos) + "\n";
  });
  return out.trim();
}

async function gerarRodada(rodada) {
  const liga = await getJSON(CONFIG.endpoints.liga(CONFIG.ligaId));
  const ranking = await getJSON(CONFIG.endpoints.rankingRodada(CONFIG.ligaId, rodada));

  const nomeLiga = liga?.nome || "Liga";
  const lista = extrairRanking(ranking);

  let out = `⚽ *${nomeLiga}* — *Ranking da Rodada ${rodada}*\n\n`;
  lista.forEach((item, idx) => {
    const pos = item?.posicao ?? (idx + 1);
    const time = item?.time?.nome || item?.nome || "Time";
    const dono = item?.time?.nome_cartola || item?.nome_cartola || "";
    const pontos = item?.pontos ?? item?.pontuacao ?? null;
    out += linha(pos, time, dono, pontos) + "\n";
  });
  return out.trim();
}

async function gerarMensal(indice) {
  const periodo = PERIODOS_MENSAIS[indice - 1];
  if (!periodo) throw new Error("Índice mensal inválido. Use 1..9");

  const liga = await getJSON(CONFIG.endpoints.liga(CONFIG.ligaId));
  const participantesJson = await getJSON(CONFIG.endpoints.participantes(CONFIG.ligaId));
  const participantes = extrairParticipantes(participantesJson);

  // Mapa id-> dados
  const mapa = new Map();
  for (const t of participantes) {
    const id = String(t?.time_id || t?.id || t?.time?.id || "");
    const nome = t?.nome || t?.time?.nome || "Time";
    const dono = t?.nome_cartola || t?.time?.nome_cartola || "";
    if (id) mapa.set(id, { id, nome, dono, soma: 0 });
  }

  // Soma pontos por rodada no período (pegando ranking de cada rodada)
  for (let r = periodo.ini; r <= periodo.fim; r++) {
    const rankRod = await getJSON(CONFIG.endpoints.rankingRodada(CONFIG.ligaId, r));
    const lista = extrairRanking(rankRod);

    for (const item of lista) {
      const id = String(item?.time_id || item?.time?.id || item?.id || "");
      if (!id || !mapa.has(id)) continue;
      const pts = Number(item?.pontos ?? item?.pontuacao ?? 0) || 0;
      mapa.get(id).soma += pts;
    }
  }

  const ordenado = [...mapa.values()].sort((a, b) => b.soma - a.soma);
  const premiados = ordenado.slice(0, 3);

  const nomeLiga = liga?.nome || "Liga";
  let out = `📅 *${nomeLiga}* — *Mensal (personalizado)*\n`;
  out += `🧾 Período: *${periodo.nome}*\n\n`;

  out += `🏅 *Premiados do período*\n`;
  premiados.forEach((p, i) => out += linha(i + 1, p.nome, p.dono, p.soma) + "\n");

  out += `\n📊 *Classificação completa do período*\n`;
  ordenado.forEach((p, i) => out += linha(i + 1, p.nome, p.dono, p.soma) + "\n");

  return out.trim();
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);

  if (!cmd) {
    console.log("Uso: node gerar.js geral | rodada <N> | mensal <N>");
    process.exit(0);
  }

  if (cmd === "geral") console.log(await gerarGeral());
  else if (cmd === "rodada") console.log(await gerarRodada(Number(arg)));
  else if (cmd === "mensal") console.log(await gerarMensal(Number(arg)));
  else throw new Error("Comando inválido");
}

main().catch(e => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
