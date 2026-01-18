const sqlite3 = require("sqlite3").verbose();

let db;

function initDb() {
  db = new sqlite3.Database("./cartola.sqlite");
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS round_points (
        rodada INTEGER NOT NULL,
        time_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        pontos REAL NOT NULL,
        PRIMARY KEY (rodada, time_id)
      )
    `);
  });
}

function saveRoundPoints(rodada, rows) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO round_points (rodada, time_id, nome, pontos)
      VALUES (?, ?, ?, ?)
    `);

    db.serialize(() => {
      for (const r of rows) {
        stmt.run([rodada, r.time_id, r.nome, r.pontos]);
      }
      stmt.finalize(err => (err ? reject(err) : resolve()));
    });
  });
}

function sumPointsBetweenRounds(fromRound, toRound) {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT time_id, nome, SUM(pontos) as total
      FROM round_points
      WHERE rodada BETWEEN ? AND ?
      GROUP BY time_id, nome
      `,
      [fromRound, toRound],
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    );
  });
}

module.exports = { initDb, saveRoundPoints, sumPointsBetweenRounds };
