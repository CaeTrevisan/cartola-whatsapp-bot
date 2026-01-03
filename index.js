const express = require("express");
const app = express();

// Permite receber JSON do WhatsApp
app.use(express.json());

// Rota raiz (teste no navegador)
app.get("/", (req, res) => {
  res.send("Bot Cartola WhatsApp rodando ✅");
});

// Rota de verificação do Webhook (Meta)
app.get("/webhook", (req, res) => {
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (token && token === process.env.WA_VERIFY_TOKEN && challenge) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Rota que recebe mensagens do WhatsApp (TESTE DEFINITIVO)
app.post("/webhook", (req, res) => {
  console.log("🚨🚨🚨 WEBHOOK CHAMADO 🚨🚨🚨");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Inicializa servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
