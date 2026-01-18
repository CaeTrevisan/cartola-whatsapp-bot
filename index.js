require("dotenv").config();
const express = require("express");
const { handleWebhookVerify, handleWebhookEvent } = require("./whatsapp");
const { initDb } = require("./db");

const app = express();
app.use(express.json());

initDb();

// Verificação do webhook (Meta chama via GET)
app.get("/webhook", handleWebhookVerify);

// Recebimento de eventos (mensagens chegam via POST)
app.post("/webhook", handleWebhookEvent);

app.get("/", (_, res) => res.send("OK"));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
