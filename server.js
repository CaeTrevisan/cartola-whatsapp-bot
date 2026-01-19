'use strict';

const express = require('express');
const app = express();

const PORT = process.env.PORT || 10000;

// ====== CONFIG ======
const LIGA_NOME = process.env.LIGA_NOME || 'SHOW DE BOLA ARAÇA F.C';

// Edite com os nomes reais (até 30)
const PARTICIPANTES = [
  'Carlos', 'João', 'Ana', 'Marcos', 'Pedro', 'Rafa', 'Bruno', 'Gabi',
  'Diego', 'Lucas', 'Bia', 'Renato', 'Igor', 'Paula', 'Thiago'
];

// Zoeiras (rotativas)
const ZOEIRAS = [
  'Hoje teve gente que pontuou igual Wi-Fi de sítio: some toda hora. 📶😵',
  'Se ponto fosse vergonha, alguns estavam milionários. 🫣💸',
  'Tem participante que escala com o coração… e erra com a alma. ❤️➡️🗑️',
  'A rodada passou e alguns nem perceberam. 🫥',
  'Teve time que veio só pra cumprir tabela… e olhe lá. 😮‍💨',
  'A diferença do topo pro pelotão de baixo tá parecendo Série A x várzea. 🥶',
  'Hoje o “mito” foi mito. E o resto foi figurante. 🎬',
  'Se isso aí foi estratégia, eu sou astronauta. 🚀🤡',
];

function pickZoeira(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return ZOEIRAS[h % ZOEIRAS.length];
}

function fmtPts(n) {
  return n.toFixed(2).replace('.', ',');
}

function medal(i) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `${i + 1}º`;
}

// ====== DADOS MOCK (determinístico por rodada) ======
// Gera pontuação por participante por rodada, sempre igual para a mesma rodada.
function pontuacaoMock(nome, rodada) {
  // hash simples + rodada
  const s = `${nome}|${rodada}|${LIGA_NOME}`;
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 33 + s.charCodeAt(i)) >>> 0;

  // distribui em faixa "realista"
  const r1 = (x % 100000) / 100000;           // 0..1
  const r2 = ((x >>> 3) % 100000) / 100000;   // 0..1

  const base = 42 + r1 * 55;                  // 42..97
  const variacao = (r2 - 0.5) * 10;           // -5..+5
  const pts = Math.max(0, base + variacao);
  return Number(pts.toFixed(2));
}

function rankingRodada(rodada) {
  const arr = PARTICIPANTES.map((nome) => ({ nome, pts: pontuacaoMock(nome, rodada) }));
  arr.sort((a, b) => b.pts - a.pts);
  return arr;
}

function rankingPeriodo(inicio, fim) {
  const arr = PARTICIPANTES.map((nome) => {
    let total = 0;
    for (let r = inicio; r <= fim; r++) total += pontuacaoMock(nome, r);
    return { nome, pts: Number(total.toFixed(2)) };
  });
  arr.sort((a, b) => b.pts - a.pts);
  return arr;
}

// ====== FORMATADORES DE TEXTO ======
function blocoRankingCompleto(titulo, ranking, { premiados = 0 } = {}) {
  const lines = [];
  lines.push(titulo);
  lines.push('');

  ranking.forEach((p, idx) => {
    const pos = idx + 1;
    const tag = premiados > 0 && idx < premiados ? `${medal(idx)} ` : `${pos}º `;
    lines.push(`${tag}${p.nome} — ${fmtPts(p.pts)} pts`);
  });

  return lines.join('\n');
}

function montarMensagemMensalEGeral({ inicioMes, fimMes, fimGeral, premios }) {
  const mensal = rankingPeriodo(inicioMes, fimMes);
  const geral = rankingPeriodo(1, fimGeral);

  const lines = [];
  lines.push(`🏆 ${LIGA_NOME}`);
  lines.push(`📅 MENSAL (Rodadas ${inicioMes} a ${fimMes})`);
  lines.push('');

  // Mensal com destaque dos premiados
  lines.push('🎁 Premiados do mês:');
  const top = mensal.slice(0, premios);
  top.forEach((p, i) => lines.push(`${medal(i)} ${p.nome} — ${fmtPts(p.pts)} pts`));
  lines.push('');

  // Mensal completo
  lines.push(blocoRankingCompleto('📊 Ranking mensal (completo):', mensal, { premiados: premios }));
  lines.push('');
  lines.push('😈 Resenha do mês:');
  lines.push(pickZoeira(`${LIGA_NOME}|mensal|${inicioMes}-${fimMes}`));
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  // Geral completo
  lines.push(`🏆 GERAL (Rodadas 1 a ${fimGeral})`);
  lines.push('');
  lines.push(blocoRankingCompleto('📈 Classificação geral (completa):', geral, { premiados: 0 }));
  lines.push('');
  lines.push('🔥 Resenha do geral:');
  lines.push(pickZoeira(`${LIGA_NOME}|geral|1-${fimGeral}`));

  return lines.join('\n');
}

// ====== PARSING DE PARAMS ======
function toInt(v, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.trunc(n);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// ====== ROTAS ======
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, liga: LIGA_NOME, participantes: PARTICIPANTES.length });
});

app.get('/', (req, res) => {
  res.status(200).send('OK — use /mensal?fim=12&tam=4 ou /geral?fim=12');
});

// Lista TODOS na rodada
app.get('/rodada', (req, res) => {
  const rodada = clamp(toInt(req.query.rodada, 1), 1, 500);
  const ranking = rankingRodada(rodada);

  const lines = [];
  lines.push(`🏆 ${LIGA_NOME}`);
  lines.push(`📊 RANKING DA RODADA ${rodada}`);
  lines.push('');
  ranking.forEach((p, i) => lines.push(`${i + 1}º ${p.nome} — ${fmtPts(p.pts)} pts`));
  lines.push('');
  lines.push('😈 Resenha da rodada:');
  lines.push(pickZoeira(`${LIGA_NOME}|rodada|${rodada}`));

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send(lines.join('\n'));
});

// Geral completo (1..fim)
app.get('/geral', (req, res) => {
  const fim = clamp(toInt(req.query.fim, 1), 1, 500);
  const geral = rankingPeriodo(1, fim);

  const msg = [
    `🏆 ${LIGA_NOME}`,
    `📈 CLASSIFICAÇÃO GERAL (Rodadas 1 a ${fim})`,
    '',
    ...geral.map((p, i) => `${i + 1}º ${p.nome} — ${fmtPts(p.pts)} pts`),
    '',
    '🔥 Resenha do geral:',
    pickZoeira(`${LIGA_NOME}|geral|1-${fim}`)
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send(msg);
});

// Mensal + Geral no mesmo texto
// Opção A: /mensal?fim=12&tam=4  -> inicio = fim-tam+1
// Opção B: /mensal?inicio=9&fim=12
// premios: quantos premiados destacar no mensal
app.get('/mensal', (req, res) => {
  const premios = clamp(toInt(req.query.premios, 3), 1, 10);

  let fim = clamp(toInt(req.query.fim, 1), 1, 500);
  let inicio = toInt(req.query.inicio, null);

  if (inicio === null) {
    const tam = clamp(toInt(req.query.tam, 4), 1, 50);
    inicio = Math.max(1, fim - tam + 1);
  } else {
    inicio = clamp(inicio, 1, fim);
  }

  // Geral acumulado até "fim" (mesma rodada final do mensal)
  const msg = montarMensagemMensalEGeral({
    inicioMes: inicio,
    fimMes: fim,
    fimGeral: fim,
    premios
  });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send(msg);
});

app.listen(PORT, () => {
  console.log(`✅ Server ON port ${PORT}`);
});
