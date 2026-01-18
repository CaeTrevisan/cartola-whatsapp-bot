const axios = require("axios");

const API = "https://api.cartola.globo.com";

async function getStatus() {
  const { data } = await axios.get(`${API}/mercado/status`);
  return data; // {rodada_atual, status_mercado, ...}
}

async function getTimesLiga(slug) {
  // lista times da liga
  const { data } = await axios.get(`${API}/liga/${slug}/times`);

  // o retorno tem um array de times; vamos normalizar
  // cada item costuma ter: time_id, nome, ...
  return (data.times || []).map(t => ({
    time_id: t.time_id,
    nome: t.nome
  }));
}

async function getPontosTimeRodada(timeId) {
  const { data } = await axios.get(`${API}/time/${timeId}`);
  // em geral vem pontos da rodada no campo "pontos" ou similar; varia.
  // fallback seguro:
  const pontos = typeof data.pontos === "number" ? data.pontos : (data.pontos_rodada ?? 0);
  return Number(pontos) || 0;
}

module.exports = { getStatus, getTimesLiga, getPontosTimeRodada };
