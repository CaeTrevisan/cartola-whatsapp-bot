const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// ---------- DB ----------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      phone TEXT PRIMARY KEY REFERENCES users(phone),
      team_id TEXT,
      team_name TEXT,
      linked_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      ref TEXT NOT NULL,
      posted_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(type, ref)
    );
  `);
}

async function setConfig(key, value) {
  await pool.query(
    `INSERT INTO config(key, value) VALUES($1, $2)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
    [key, String(value)]
  );
}

async function getConfig(key) {
  const r = await pool.query(`SELECT value FROM config WHERE key=$1`, [key]);
  return r.rowCount ? r.rows[0].value : null;
}

async function upsertUser(phone) {
  await pool.query(
    `INSERT INTO users(phone) VALUES($1)
     ON CONFLICT(phone) DO UPDATE SET active=TRUE`,
    [phone]
  );
}

async function setLink(phone, teamId, teamName) {
  await pool.query(
    `INSERT INTO links(phone, team_id, team_name) VALUES($1,$2,$3)
     ON CONFLICT(phone) DO UPDATE SET team_id=EXCLUDED.team_id, team_name=EXCLUDED.team_name, linked_at=NOW()`,
    [phone, String(teamId), String(teamName)]
  );
}

async function getLink(phone) {
  const r = await pool.query(`SELECT team_id, team_name FROM links WHERE phone=$1`, [phone]);
  return r.rowCount ? r.rows[0] : null;
}

// ---------- WhatsApp send ----------
async function sendText(to, body) {
  if (!process.env.WA_TOKEN || !process.env.WA_PHONE_NUMBER_ID) {
    console.log("WA vars missing; would send to:", to, "msg:", body);
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

// ---------- Helpers ----------
function normalizeCommand(text) {
  return text.trim().replace(/^\//, "");
}

function extractInbound(reqBody) {
  const entry = reqBody.entry?.[0];
  const change = entry?.changes?.[0];
  const msg = change?.value?.messages?.[0];
  const from = msg?.from;
  const text = msg?.text?.body;
  return { from, text };
}

// ---------- Routes ----------
app.get("/", (req, res) => res.send("Bot Cartola WhatsApp rodando ✅"));

app.get("/webhook", (req, res) => {
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (token && token === process.env.WA_VERIFY_TOKEN && challenge) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const { from, text } = extractInbound(req.body);
    if (!from || !text) return res.sendStatus(200);

    const cmd = normalizeCommand(text);
    const lower = cmd.toLowerCase();

    // registra usuário sempre que falar com o bot
    await upsertUser(from);

    if (lower === "ajuda") {
      await sendText(from,
        "🤖 Bot Cartola - Comandos:\n" +
        "• entrar\n" +
        "• vincular meu time: NOME DO SEU TIME\n" +
        "• meu_time\n" +
        "• admin +55SEUNUMERO (admin)\n" +
        "• config_liga Show de Bola F. C (admin)\n" +
        "• selecionar_liga 2 (admin)\n"
      );
      return res.sendStatus(200);
    }

    if (lower === "entrar") {
      await sendText(from, "✅ Você entrou! Agora envie:\nvincular meu time: NOME DO SEU TIME");
      return res.sendStatus(200);
    }

    if (lower.startsWith("admin ")) {
      const adminPhone = cmd.split(" ").slice(1).join(" ").trim().replace(/\D/g, "");
      if (!adminPhone) {
        await sendText(from, "Use: admin +55SEUNUMERO");
      } else {
        await setConfig("admin_phone", adminPhone);
        await sendText(from, `✅ Admin configurado: ${adminPhone}`);
      }
      return res.sendStatus(200);
    }

    if (lower === "meu_time") {
      const link = await getLink(from);
      if (!link?.team_id) {
        await sendText(from, "Você ainda não vinculou seu time. Envie:\nvincular meu time: NOME DO SEU TIME");
      } else {
        await sendText(from, `✅ Seu time vinculado:\n${link.team_name} (ID ${link.team_id})`);
      }
      return res.sendStatus(200);
    }

    if (lower.startsWith("vincular meu time:")) {
      const teamName = cmd.split(":").slice(1).join(":").trim();
      if (!teamName) {
        await sendText(from, "Use: vincular meu time: NOME DO SEU TIME");
      } else {
        // por enquanto salvamos ID como PENDENTE; depois ligamos busca real no Cartola
        await setLink(from, "PENDENTE", teamName);
        await sendText(from, `✅ Recebido! Time para vincular:\n${teamName}\n(Em seguida vamos ligar a busca do ID real no Cartola.)`);
      }
      return res.sendStatus(200);
    }

    // modo assistido da liga (mock por enquanto)
    if (lower.startsWith("config_liga ")) {
      const ligaNome = cmd.split(" ").slice(1).join(" ").trim();
      await setConfig("liga_nome", ligaNome);
      await setConfig("pending_leagues", JSON.stringify([
        { id: "111", nome: ligaNome, criador: "Exemplo 1", times: 18 },
        { id: "222", nome: ligaNome, criador: "Exemplo 2", times: 24 },
        { id: "333", nome: ligaNome, criador: "Exemplo 3", times: 12 }
      ]));
      await sendText(from,
        `🔎 Encontrei estas ligas com o nome "${ligaNome}".\nResponda com: selecionar_liga N\n\n` +
        `1) ${ligaNome} — Criador: Exemplo 1 — Times: 18 — ID: 111\n` +
        `2) ${ligaNome} — Criador: Exemplo 2 — Times: 24 — ID: 222\n` +
        `3) ${ligaNome} — Criador: Exemplo 3 — Times: 12 — ID: 333`
      );
      return res.sendStatus(200);
    }

    if (lower.startsWith("selecionar_liga ")) {
      const n = parseInt(cmd.split(" ")[1], 10);
      const pending = await getConfig("pending_leagues");
      if (!pending) {
        await sendText(from, "Não há busca pendente. Use: config_liga Show de Bola F. C");
        return res.sendStatus(200);
      }
      const leagues = JSON.parse(pending);
      const chosen = leagues[n - 1];
      if (!chosen) {
        await sendText(from, "Opção inválida. Use: selecionar_liga 1, 2 ou 3.");
        return res.sendStatus(200);
      }
      await setConfig("liga_id", chosen.id);
      await setConfig("liga_nome", chosen.nome);
      await sendText(from, `✅ Liga configurada: ${chosen.nome} (ID ${chosen.id})`);
      return res.sendStatus(200);
    }

    await sendText(from, "Não entendi. Envie: ajuda");
    return res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err.response?.data || err);
    return res.sendStatus(200);
  }
});

// Boot
(async () => {
  await initDb();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log("Servidor rodando na porta", PORT));
})();
