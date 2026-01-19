'use strict';

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 10000;

// ====== ENV ======
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || '';
const WA_TOKEN = process.env.WA_TOKEN || '';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || ''; // ex: 979665701887805

// ====== DEBUG STATE ======
const debugState = {
  ok: true,
  now: new Date().toISOString(),
  lastWebhookAt: null,
  lastWebhookMethod: null,
  lastWebhookQuery: null,
  lastWebhookBody: null,
  verifyTokenConfigured: Boolean(WA_VERIFY_TOKEN),

  lastSendAt: null,
  lastSendPayload: null,
  lastSendResult: null,
  lastSendError: null
};

// ====== Helpers ======
function setNow() {
  debugState.now = new Date().toISOString();
}

function normalizeText(s) {
  return String(s || '').trim();
}

async function sendTextMessage(toWaId, text) {
  if (!WA_TOKEN) throw new Error('WA_TOKEN vazio (env não configurada)');
  if (!WA_PHONE_NUMBER_ID) throw new Error('WA_PHONE_NUMBER_ID vazio (env não configurada)');

  const url = `https://graph.facebook.com/v20.0/${WA_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: toWaId,
    text: { body: text }
  };

  debugState.lastSendAt = new Date().toISOString();
  debugState.lastSendPayload = payload;
  debugState.lastSendError = null;
  debugState.lastSendResult = null;

  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    debugState.lastSendResult = { status: res.status, data: res.data };
    return res.data;
  } catch (err) {
    debugState.lastSendError = {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data
    };
    throw err;
  }
}

// ====== Routes ======
app.get('/', (req, res) => {
  setNow();
  res.status(200).json({ ok: true, message: 'OK' });
});

// Debug endpoint
app.get('/debug', (req, res) => {
  setNow();
  debugState.verifyTokenConfigured = Boolean(process.env.WA_VERIFY_TOKEN);
  res.status(200).json(debugState);
});

// Webhook verification (Meta)
app.get('/webhook', (req, res) => {
  setNow();

  debugState.lastWebhookAt = new Date().toISOString();
  debugState.lastWebhookMethod = 'GET';
  debugState.lastWebhookQuery = req.query;
  debugState.lastWebhookBody = null;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && WA_VERIFY_TOKEN && token === WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Forbidden (token mismatch or missing)');
});

// Webhook receiver
app.post('/webhook', async (req, res) => {
  setNow();

  debugState.lastWebhookAt = new Date().toISOString();
  debugState.lastWebhookMethod = 'POST';
  debugState.lastWebhookQuery = req.query || {};
  debugState.lastWebhookBody = req.body;

  // Responde rápido pra Meta não considerar timeout
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const msg = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    if (!msg) return; // pode ser status update etc.

    const from = msg.from; // wa_id do remetente (ex: 5518997642880)
    const name = contact?.profile?.name || 'amigo';

    // Só trata texto por enquanto
    const text = normalizeText(msg.text?.body);
    const textLower = text.toLowerCase();

    let reply = null;

    if (!text) {
      reply = `Oi ${name}! 🙂 Me manda uma mensagem em texto (ex: "ajuda").`;
    } else if (textLower === 'ajuda' || textLower === 'menu') {
      reply =
        `🤖 Bot Cartola (teste)\n\n` +
        `Comandos:\n` +
        `• ajuda / menu\n` +
        `• rodada\n` +
        `• ranking\n` +
        `• mensal\n\n` +
        `Dica: por enquanto estou em modo básico.`;
    } else if (textLower === 'rodada') {
      reply = `📌 Rodada: (placeholder)\nAssim que integrarmos a API do Cartola eu monto o resumo da rodada.`;
    } else if (textLower === 'ranking') {
      reply = `🏆 Ranking geral: (placeholder)\nVou gerar ranking geral e também o "quem subiu/quem caiu" (no geral e no mensal).`;
    } else if (textLower === 'mensal') {
      reply = `📅 Mensal por rodadas: (placeholder)\nVocê vai definir quantas rodadas compõem o "mês" e eu comparo sobe/desce + zoeira.`;
    } else {
      reply = `Recebi: "${text}".\nDigite "ajuda" para ver comandos.`;
    }

    // Envia resposta
    await sendTextMessage(from, reply);
  } catch (err) {
    // O erro já fica gravado em debugState.lastSendError
    console.error('Webhook processing error:', err?.message || err);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
