const express = require("express");
const app = express();

app.use(express.json());

// Página raiz (só pra você testar no navegador)
app.get("/", (req, res) => {
  res.send("Bot Cartola WhatsApp rodando ✅");
});

// 1) Webhook de verificação (Meta chama aqui no 'Verify and Save')
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2) Webhook de mensagens (WhatsApp envia mensagens aqui)
app.post("/webhook", (req, res) => {
  console.log("📩 Webhook recebeu:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
