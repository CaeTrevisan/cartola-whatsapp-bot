'use strict';

const express = require('express');
const app = express();

const PORT = process.env.PORT || 10000;

// ====== CONFIG BÁSICA ======
const LIGA_NOME = process.env.LIGA_NOME || 'SHOW DE BOLA ARAÇA F.C';

// Você pode editar esses nomes livremente (até 30)
const PARTICIPANTES = [
  'Carlos', 'João', 'Ana', 'Marcos', 'Pedro', 'Rafa', 'Bruno', 'Gabi',
  'Diego', 'Lucas', 'Bia', 'Renato', 'Igor', 'Paula', 'Thiago'
];

// ====== ZOEIRAS PESADAS (ROTATIVAS) ======
const ZOEIRAS_PESADAS = [
  'Hoje teve gente que pontuou igual Wi-Fi de sítio: some toda hora. 📶😵',
  'Se ponto fosse vergonha, alguns estavam milionários. 🫣💸',
  'Teve time que veio só pra cumprir tabela… e olhe lá. 😮‍💨',
  'Rodada boa pra quem gosta de sofrimento e placar feio. 🥀',
  'A pontuação de alguns foi tão baixa que o app deveria pedir desculpa. 🙃',
  'Tem gente que escala com o coração… e erra com a alma. ❤️➡️🗑️',
  'Hoje o “mito” foi mito. E o resto foi figurante. 🎬',
  'Se isso aí foi estratégia, eu sou astronauta. 🚀🤡',
  'A rodada passou e alguns participantes nem perceberam. 🫥',
  'A diferença entre o líder e o pelotão de baixo tá parecendo Série A x várzea. 🥶'
];

function pickZoeira(seedStr) {
  // determinístico por rodada (pra não mudar toda hora)
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return ZOEIRAS_PESADAS[h % ZOEIRAS_PESADAS.length];
}

function fmtPts(n) {
  return n.toFixed(2).replace('.', ',');
}

function medal(i) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `${i + 1}️⃣`;
}

// ====== DADOS (MODO MOCK) ======
// Nesta etapa, vamos gerar pontos “realistas” por rodada.
// Depois, isso será substituído por dados reais do Cartola.
function gerarPontuacoesMock(rodada) {
  // usa rodada como seed para gerar sempre o mesmo ranking daquela rodada
  let seed = Number(rodada) * 9301 + 49297;
  function rnd() {
    seed = (seed * 233280 + 12345) % 1000000;
    return seed / 1000000;
  }

  return PARTICIPANTES.map((nome) => {
    const base = 45 + rnd() * 50; // 45 a 95
    const variacao = (rnd() - 0.5) * 12; // -6 a +6
    const pts = Math.max(0, base + variacao);
    return { nome, pts: Number(pts.toFixed(2)) };
  }).sort((a, b) => b.pts - a.pts);
}

// ====== GERADOR DE MENSAGEM ======
function montarMensagemRodada({ rodada, top }) {
  const ranking = gerarPontuacoesMock(rodada).slice(0, top);

  const lines = [];
  lines.push(`🏆 ${LIGA_NOME}`);
  lines.push(`📊 RANKING DA RODADA ${rodada}`);
  lines.push('');

  ranking.forEach((p, i) => {
    lines.push(`${medal(i)} ${p.nome} — ${fmtPts(p.pts)} pts`);
  });

  lines.push('');
  lines.push('😈 Resenha da rodada:');
  lines.push(pickZoeira(`${LIGA_NOME}|rodada|${rodada}`));

  return lines.join('\n');
}

// ====== ROTAS ======
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, liga: LIGA_NOME, participantes: PARTICIPANTES.length });
});

// Texto puro pra copiar/colar no WhatsApp
app.get('/rodada', (req, res) => {
  const rodada = req.query.rodada ? String(req.query.rodada) : '1';
  const top = req.query.top ? Math.max(3, Math.min(30, Number(req.query.top))) : 10;

  const msg = montarMensagemRodada({ rodada, top });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send(msg);
});

// Home simples (pra você ver que subiu)
app.get('/', (req, res) => {
  res.status(200).send('OK — Gerador de mensagens (use /rodada?rodada=12)');
});

app.listen(PORT, () => {
  console.log(`✅ Server ON port ${PORT}`);
});
