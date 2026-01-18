function fmtPts(n) {
  if (n === null || n === undefined) return "-";
  // garante 2 casas e vírgula pt-BR
  return Number(n).toFixed(2).replace(".", ",");
}

function medal(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `${i + 1})`;
}

// ====== MOCKS (você vai substituir pelos dados reais depois) ======
async function getRodadaRankingTexto() {
  const liga = "SHOW DE BOLA ARAÇA F.C";
  const rodada = 12;

  const ranking = [
    { nome: "Time A", pontos: 98.45 },
    { nome: "Time B", pontos: 92.10 },
    { nome: "Time C", pontos: 88.33 },
    { nome: "Time D", pontos: 84.70 },
    { nome: "Time E", pontos: 80.12 },
    { nome: "Time F", pontos: 77.05 },
    { nome: "Time G", pontos: 70.90 },
    { nome: "Time H", pontos: 65.44 }
  ];

  const naoEscalou = ["E.C Trevisan"];

  let txt = `🏆 ${liga}\n📊 RANKING DA RODADA — Rodada ${rodada}\n\n`;

  ranking.forEach((t, i) => {
    const prefix = medal(i);
    // para 4º em diante já vem "4)" etc, então ajusta espaçamento
    const linha = (i <= 2)
      ? `${prefix} ${i + 1}) ${t.nome} — ${fmtPts(t.pontos)}`
      : `${prefix} ${t.nome} — ${fmtPts(t.pontos)}`;
    txt += linha + "\n";
  });

  if (naoEscalou.length) {
    txt += `\n❌ Não escalou: ${naoEscalou.join(", ")}\n`;
  }

  txt += `\n📌 Peça no privado: “rodada” ou “mensal”`;
  return txt;
}

async function getMensalRankingTexto() {
  const liga = "SHOW DE BOLA ARAÇA F.C";
  const periodo = "Mês X (ajustar depois)";

  const rankingMensal = [
    { nome: "Time B", pontos: 312.20 },
    { nome: "Time A", pontos: 301.15 },
    { nome: "Time D", pontos: 298.05 },
    { nome: "Time C", pontos: 280.10 },
    { nome: "Time E", pontos: 270.88 },
    { nome: "Time F", pontos: 260.44 },
    { nome: "Time G", pontos: 250.10 },
    { nome: "Time H", pontos: 240.05 }
  ];

  let txt = `📅 ${liga}\n🏁 RANKING MENSAL — Período: ${periodo}\n\n`;

  rankingMensal.forEach((t, i) => {
    const prefix = medal(i);
    const linha = (i <= 2)
      ? `${prefix} ${i + 1}) ${t.nome} — ${fmtPts(t.pontos)}`
      : `${prefix} ${t.nome} — ${fmtPts(t.pontos)}`;
    txt += linha + "\n";
  });

  txt += `\n📌 Peça no privado: “rodada” ou “mensal”`;
  return txt;
}

module.exports = { getRodadaRankingTexto, getMensalRankingTexto };
