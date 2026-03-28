const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

// Generates random level between min and max
const randomLevel = (min, max) => (Math.random() * (max - min) + min).toFixed(2);

db.serialize(() => {
  for (let i = 30; i >= 1; i--) {
    let baseHumaita = 14 + (Math.sin(i / 3) * 2); // Creates a wave pattern
    let baseLabrea  = 10 + (Math.cos(i / 3) * 1.5);
    
    // Inserir para Humaita
    db.run(
      `INSERT INTO levels (city, level, created_at) VALUES (?, ?, datetime('now', 'localtime', '-${i} days'))`,
      ['Humaita', randomLevel(baseHumaita - 0.5, baseHumaita + 0.5)]
    );

    // Inserir para Labrea
    db.run(
      `INSERT INTO levels (city, level, created_at) VALUES (?, ?, datetime('now', 'localtime', '-${i} days'))`,
      ['Labrea', randomLevel(baseLabrea - 0.5, baseLabrea + 0.5)]
    );
  }
});

db.close(() => {
  console.log("Mock data inserido com sucesso!");
});
