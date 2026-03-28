const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'ufam-ieaa-secret-key-2026';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Rota explícita para o dashboard principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Atalhos para as outras páginas
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

console.log('Diretório atual:', __dirname);
console.log('Pasta static:', path.join(__dirname));

// Database setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    // Create table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      level REAL NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`);

    // Create users table for authentication
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`, (err) => {
      if (!err) {
        // Default admin user
        db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('admin', 'admin123')`);
      }
    });
  }
});

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acesso negado. Crie uma sessão no login.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Sessão inválida ou expirada.' });
    req.user = user;
    next();
  });
};

// Routes
// 0. Login Admin
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    if (!user) return res.status(401).json({ error: 'Usuário ou senha incorretos' });

    // Gera um token válido por 12 horas
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, message: 'Sucesso!' });
  });
});

// 1. Inserir novo nível (Protegido com authenticateToken)
app.post('/api/levels', authenticateToken, (req, res) => {
  const { city, level } = req.body;

  if (!city || level === undefined) {
    return res.status(400).json({ error: 'City and level are required.' });
  }

  const sql = 'INSERT INTO levels (city, level) VALUES (?, ?)';
  db.run(sql, [city, level], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      message: 'Data saved successfully',
      data: { id: this.lastID, city, level }
    });
  });
});

// 1.1 Listar histórico para o painel Admin
app.get('/api/levels', authenticateToken, (req, res) => {
  const sql = 'SELECT * FROM levels ORDER BY created_at DESC LIMIT 100';
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// 1.2 Atualizar um registro específico
app.put('/api/levels/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { level } = req.body;
  
  if (level === undefined) return res.status(400).json({ error: 'Level is required.' });
  
  const sql = 'UPDATE levels SET level = ? WHERE id = ?';
  db.run(sql, [level, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Record not found.' });
    res.json({ message: 'Record updated successfully.' });
  });
});

// 1.3 Excluir um registro específico
app.delete('/api/levels/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM levels WHERE id = ?';
  
  db.run(sql, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Record not found.' });
    res.json({ message: 'Record deleted successfully.' });
  });
});

// 2. Buscar nível mais recente de uma cidade
app.get('/api/levels/:city', (req, res) => {
  const city = req.params.city;
  const sql = 'SELECT * FROM levels WHERE city = ? ORDER BY created_at DESC LIMIT 1';

  db.get(sql, [city], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'No data found for this city.' });
    }
    res.json({ data: row });
  });
});

// 3. Buscar estatísticas (dia, semana, mês)
app.get('/api/levels/:city/stats', (req, res) => {
  const city = req.params.city;
  const sql = `
    SELECT
      MAX(CASE WHEN date(created_at) = date('now', 'localtime') THEN level END) as max_day,
      MIN(CASE WHEN date(created_at) = date('now', 'localtime') THEN level END) as min_day,
      MAX(CASE WHEN strftime('%W-%Y', created_at, '+1 day') = strftime('%W-%Y', 'now', 'localtime', '+1 day') THEN level END) as max_week,
      MIN(CASE WHEN strftime('%W-%Y', created_at, '+1 day') = strftime('%W-%Y', 'now', 'localtime', '+1 day') THEN level END) as min_week,
      MAX(CASE WHEN strftime('%m-%Y', created_at) = strftime('%m-%Y', 'now', 'localtime') THEN level END) as max_month,
      MIN(CASE WHEN strftime('%m-%Y', created_at) = strftime('%m-%Y', 'now', 'localtime') THEN level END) as min_month
    FROM levels
    WHERE city = ?
  `;

  db.get(sql, [city], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Formata o resultado caso tudo venha nulo (se não tiver registros)
    const stats = row || {
      max_day: null, min_day: null, max_week: null, 
      min_week: null, max_month: null, min_month: null 
    };
    res.json({ data: stats });
  });
});

// 4. Buscar histórico de 30 dias
app.get('/api/levels/:city/history', (req, res) => {
  const city = req.params.city;
  const sql = `
    SELECT
      date(created_at) as day,
      ROUND(AVG(level), 2) as avg_level
    FROM levels
    WHERE city = ? AND created_at >= date('now', 'localtime', '-30 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `;

  db.all(sql, [city], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ data: rows });
  });
});

// Start server
app.listen(port, () => {
  console.log(`River levels API running at http://localhost:${port}`);
});
