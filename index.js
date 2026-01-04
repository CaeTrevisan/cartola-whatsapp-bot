/****************************************************
 * BOT CARTOLA WHATSAPP - INDEX.JS COMPLETO
 * Compatível com Render (Postgres SSL)
 ****************************************************/

const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

/* ==================================================
   BANCO DE DADOS (POSTGRES - RENDER)
================================================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      phone TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT NOW(),
      active BOOLEAN DEFAULT TRUE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      phone TEXT PRIMARY KEY REFERENCES users(phone),
      team_id TEXT,
      team_name TEXT,
      linked_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      ref TEXT NOT NULL,
      posted_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(type, ref)
    );
  `);
}

/* ==================================================
   HELPERS DE BANCO
================================================== */
async function setConfig(key, value) {
  await pool.query(
    `INSERT INTO config(key, value)
     VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}

async function getConfig(key) {
  const r = await pool.query(`SELECT value FROM config WHERE key=$1`, [key]);
  return r.rowCount ? r.rows[0].value : null;
}

async function upsertUser(phone) {
  await pool.query(
    `INSERT INTO users(phone)
     VALUES ($1)
     ON CONFLICT(phone) DO UPDATE SET active=TRUE`,
    [phone]
  );
}

async function setLink(phone, teamId, teamName) {
  await pool.query(
    `INSERT INTO links(phone, team_id, team_name)
     VALUES ($1,$2,$3)
     ON CONFLICT(phone)
     DO UPDATE SET team_id=EXCLUDED.team_id,
                   team_name=EXCLUDED.team_name,
                   linked_at=NOW()`,
    [phone, teamId, teamName]
  );
}

async function getLink(phone) {
  const r = await pool.query(
    `SELECT team_id, team_name FROM links WHERE phone=$1`,
    [phone]
  );
  return r.rowCount ? r.rows[0] : null;
}

/* ==================================================
   WHATSAPP - ENVIO DE MENSAGEM
================================================== */
async function sendText(to, body) {
  if (!process.env.WA_TOKEN || !process.env.WA_PHONE_NUMBER_ID) {
    console.log("⚠️ WhatsApp vars ausentes. Mensagem simulada:", body);
    return;
  }

  await axios.post(
    `https://graph.facebook.com/v20.0/${process.env.WA_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WA_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

/* ==================================================
   UTILIDADES
================================================== */
function extractInbound(reqBody) {
  const entry = reqBody.entry?.[0];
  const change = entry?.changes?.[0];
  const msg = change?.value?.messages?.[0];

  return {
    from: msg?.from,
    text: msg?.text?.body
  };
}

/* ==================================================
   ROTAS
================================================== */

// Health check
app.get("/", (req, res) => {
  res.send("Bot Cartola WhatsApp rodando ✅");
});

// Webhook verify (Meta)
app.get("/webhook", (req, res) => {
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (token === process.env.WA_VERIFY_TOKEN && challenge) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Webhook mensagens
app.post("/webhook", async (req, res) => {
  try {
    const { from, text } = extractInbound(req.body);
    if (!from || !text) return res.sendStatus(200);

    const msg = text.trim();
    const lower = msg.toLowerCase();

    console.log("📩 Mensagem recebida:", msg, "de", from);

    await upsertUser(from);

    // COMANDOS
    if (lower === "ajuda") {
      await sendText(
        from,
        "🤖 *Bot Cartola*\n\n" +
          "Comandos disponíveis:\n" +
          "• entrar\n" +
          "• vincular meu time: NOME DO TIME\n" +
          "• meu_time\n" +
          "• admin +55SEUNUMERO\n" +
          "• config_liga NOME DA LIGA\n" +
          "• selecionar_liga 1\n"
      );
      return res.sendStatus(200);
    }

    if (lower === "entrar") {
      await sendText(
        from,
        "✅ Você entrou no bolão!\nAgora envie:\n*vincular meu time: NOME DO TIME*"
      );
      return res.sendStatus(200);
    }

    if (lower.startsWith("admin ")) {
      const phone = msg.replace(/\D/g, "");
      await setConfig("admin_phone", phone);
      await sendText(from, `✅ Admin configurado: ${phone}`);
      return res.sendStatus(200);
    }

    if (lower === "meu_time") {
      const link = await getLink(from);
      if (!link) {
        await sendText(
          from,
          "❌ Você ainda não vinculou um time.\nUse:\n*vincular meu time: NOME*"
        );
      } else {
        await sendText(
          from,
          `✅ Seu time:\n${link.team_name}\n(ID: ${link.team_id})`
        );
      }
      return res.sendStatus(200);
    }

    if (lower.startsWith("vincular meu time:")) {
      const teamName = msg.split(":").slice(1).join(":").trim();
      await setLink(from, "PENDENTE", teamName);
      await sendText(
        from,
        `✅ Time recebido:\n${teamName}\n\n(Em breve vincularemos ao Cartola automaticamente)`
      );
      return res.sendStatus(200);
    }

    if (lower.startsWith("config_liga ")) {
      const liga = msg.split(" ").slice(1).join(" ");
      await setConfig("liga_nome", liga);
      await setConfig(
        "pending_leagues",
        JSON.stringify([
          { id: "111", nome: liga },
          { id: "222", nome: liga },
          { id: "333", nome: liga }
        ])
      );

      await sendText(
        from,
        `🔎 Encontrei estas ligas:\n\n` +
          `1️⃣ ${liga} (ID 111)\n` +
          `2️⃣ ${liga} (ID 222)\n` +
          `3️⃣ ${liga} (ID 333)\n\n` +
          `Responda com:\n*selecionar_liga 1*`
      );
      return res.sendStatus(200);
    }

    if (lower.startsWith("selecionar_liga ")) {
      const n = parseInt(msg.split(" ")[1], 10);
      const pending = JSON.parse(await getConfig("pending_leagues") || "[]");
      const chosen = pending[n - 1];

      if (!chosen) {
        await sendText(from, "❌ Opção inválida.");
      } else {
        await setConfig("liga_id", chosen.id);
        await sendText(from, `✅ Liga configurada: ${chosen.nome}`);
      }
      return res.sendStatus(200);
    }

    await sendText(from, "Não entendi. Envie *ajuda*.");
    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro no webhook:", err);
    return res.sendStatus(200);
  }
});

/* ==================================================
   BOOT
================================================== */
(async () => {
  try {
    await initDb();
    console.log("DB OK ✅");
  } catch (e) {
    console.error("DB ERROR ❌", e.message);
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`Servidor rodando na porta ${PORT}`)
  );
})();
