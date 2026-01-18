const {
  ZOEIRAS_GERAIS,
  ZOEIRAS_LIDER,
  ZOEIRAS_LANTERNA,
  ZOEIRAS_CAIU,
  ZOEIRAS_SUBIU,
  ZOEIRAS_NAO_ESCALOU
} = require("./zoeiras.data");

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function zoeiraRodada({ lider, lanterna, naoEscalou }) {
  let out = [];

  out.push(random(ZOEIRAS_GERAIS));

  if (lider) out.push("🥇 " + random(ZOEIRAS_LIDER));
  if (lanterna) out.push("🧊 " + random(ZOEIRAS_LANTERNA));
  if (naoEscalou?.length) out.push("❌ " + random(ZOEIRAS_NAO_ESCALOU));

  return out.join("\n");
}

function zoeiraMensal({ subiu, caiu }) {
  let out = [];

  if (subiu?.length) out.push("📈 " + random(ZOEIRAS_SUBIU));
  if (caiu?.length) out.push("📉 " + random(ZOEIRAS_CAIU));

  return out.join("\n");
}

module.exports = { zoeiraRodada, zoeiraMensal };
