const express = require('express');
const mysql = require('mysql2/promise');
const { getApiKey, reprioritizeTasksWithMistral } = require('./mistral');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

const log = (...args) => console.log('[devsecops-api]', ...args);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'apppassword',
  database: process.env.DB_NAME || 'devsecops_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Valide une date ISO AAAA-MM-JJ (jour civil, fuseau neutre). */
function normalizeDueDate(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => Number.parseInt(x, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return s;
}

function todayLocalDateString() {
  const n = new Date();
  return (
    n.getFullYear() +
    '-' +
    String(n.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(n.getDate()).padStart(2, '0')
  );
}

async function ensureItemsTable() {
  const maxAttempts = Number(process.env.DB_INIT_RETRIES || 30);
  const delayMs = Number(process.env.DB_INIT_RETRY_MS || 2000);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const conn = await pool.getConnection();
      await conn.query(`
      CREATE TABLE IF NOT EXISTS items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        due_date DATE NOT NULL DEFAULT (CURRENT_DATE),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
      try {
        await conn.query(`
          ALTER TABLE items
          ADD COLUMN due_date DATE NOT NULL DEFAULT (CURRENT_DATE)
        `);
        log('Column due_date added (migration)');
      } catch (alterErr) {
        if (alterErr.errno !== 1060 && alterErr.code !== 'ER_DUP_FIELDNAME') {
          log('ALTER due_date:', alterErr.code, alterErr.message);
        }
      }
      conn.release();
      log(`Database table initialized (attempt ${attempt}/${maxAttempts})`);
      return;
    } catch (err) {
      log(
        'Database init attempt',
        attempt + '/' + maxAttempts,
        'failed:',
        err.code || err.errno || '',
        err.message
      );
      if (attempt === maxAttempts) {
        console.error('[devsecops-api] Giving up waiting for database.');
        process.exit(1);
      }
      await sleep(delayMs);
    }
  }
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/items', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query(
      `SELECT id, name, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, created_at
       FROM items ORDER BY due_date ASC, id ASC`
    );
    conn.release();
    log('GET /items rows count:', Array.isArray(rows) ? rows.length : 'n/a', 'ids:', Array.isArray(rows) ? rows.map((r) => r.id) : []);
    res.json(rows);
  } catch (err) {
    console.error('[devsecops-api] Error fetching items:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/items', async (req, res) => {
  try {
    const { name, due_date: dueRaw } = req.body;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) return res.status(400).json({ error: 'name required' });
    const dueDate = normalizeDueDate(dueRaw);
    if (!dueDate) return res.status(400).json({ error: 'due_date required (YYYY-MM-DD)' });

    const conn = await pool.getConnection();
    const [result] = await conn.query(
      'INSERT INTO items (name, due_date) VALUES (?, ?)',
      [trimmed, dueDate]
    );
    conn.release();

    res.status(201).json({ id: result.insertId, name: trimmed, due_date: dueDate });
  } catch (err) {
    console.error('[devsecops-api] Error creating item:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/items/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: 'invalid id' });
    }
    const { name, due_date: dueRaw } = req.body;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) return res.status(400).json({ error: 'name required' });
    const dueDate = normalizeDueDate(dueRaw);
    if (!dueDate) return res.status(400).json({ error: 'due_date required (YYYY-MM-DD)' });

    const conn = await pool.getConnection();
    const [result] = await conn.query(
      'UPDATE items SET name = ?, due_date = ? WHERE id = ?',
      [trimmed, dueDate, id]
    );
    conn.release();
    log('PATCH affectedRows:', result.affectedRows, 'id:', id);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    res.json({ id, name: trimmed, due_date: dueDate });
  } catch (err) {
    console.error('[devsecops-api] Error updating item:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Replanifie les echeances via Mistral (priorisation). */
app.post('/items/reprioritize-ai', async (req, res) => {
  if (!getApiKey()) {
    return res.status(503).json({ error: 'Clé Mistral non configurée (MISTRAL_API_KEY)' });
  }

  const referenceDate = normalizeDueDate(req.body?.reference_date) || todayLocalDateString();
  const maxTasks = Number(process.env.MISTRAL_MAX_TASKS || 80);

  let conn;
  let inTx = false;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query(
      `SELECT id, name, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
       FROM items ORDER BY id ASC`
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Aucune tâche à replanifier' });
    }
    if (rows.length > maxTasks) {
      return res.status(400).json({
        error: `Trop de tâches (${rows.length}). Limite : ${maxTasks}.`
      });
    }

    const payload = rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      due_date: String(r.due_date)
    }));

    const { tasks: aiList, rationale } = await reprioritizeTasksWithMistral(
      payload,
      referenceDate
    );

    const expectedIds = new Set(payload.map((p) => p.id));
    if (!Array.isArray(aiList) || aiList.length !== expectedIds.size) {
      return res.status(502).json({
        error: 'Réponse IA : nombre de tâches incorrect',
        expected: expectedIds.size,
        got: Array.isArray(aiList) ? aiList.length : 0
      });
    }

    const seen = new Set();
    const updates = [];
    for (const t of aiList) {
      const id = Number(t.id);
      if (!Number.isFinite(id) || !expectedIds.has(id) || seen.has(id)) {
        return res.status(502).json({ error: 'Réponse IA : id invalide ou dupliqué' });
      }
      seen.add(id);
      const due = normalizeDueDate(t.due_date);
      if (!due) {
        return res.status(502).json({ error: 'Réponse IA : due_date invalide pour id ' + id });
      }
      updates.push({ id, due_date: due });
    }

    if (seen.size !== expectedIds.size) {
      return res.status(502).json({ error: 'Réponse IA : tâches manquantes' });
    }

    await conn.beginTransaction();
    inTx = true;
    for (const u of updates) {
      const [result] = await conn.query('UPDATE items SET due_date = ? WHERE id = ?', [
        u.due_date,
        u.id
      ]);
      if (result.affectedRows !== 1) {
        throw new Error('Échec mise à jour id ' + u.id);
      }
    }
    await conn.commit();
    inTx = false;

    log('reprioritize-ai OK, updated:', updates.length);
    res.json({
      ok: true,
      updated: updates.length,
      rationale: rationale || ''
    });
  } catch (err) {
    if (inTx && conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }
    if (err.code === 'NO_API_KEY') {
      return res.status(503).json({ error: 'Mistral absent' });
    }
    if (err.code === 'MISTRAL_HTTP') {
      log('Mistral API error:', err.message, err.detail ? err.detail.slice(0, 200) : '');
      return res.status(502).json({ error: 'Erreur API Mistral' });
    }
    console.error('[devsecops-api] reprioritize-ai:', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/items/:id', async (req, res) => {
  const rawParam = req.params.id;
  log('DELETE /items/:id raw param:', rawParam, 'typeof:', typeof rawParam);
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      log('DELETE rejected: invalid id after parseInt', id);
      return res.status(400).json({ error: 'invalid id' });
    }
    const conn = await pool.getConnection();
    const [result] = await conn.query('DELETE FROM items WHERE id = ?', [id]);
    conn.release();
    log('DELETE query ok affectedRows:', result.affectedRows, 'for id:', id);
    if (result.affectedRows === 0) {
      log('DELETE no row matched id:', id);
      return res.status(404).json({ error: 'not found' });
    }
    log('DELETE success id:', id);
    res.json({ deleted: id });
  } catch (err) {
    console.error('[devsecops-api] Error deleting item:', err);
    res.status(500).json({ error: err.message });
  }
});

(async () => {
  await ensureItemsTable();
  app.listen(3000, () => console.log('App running on port 3000'));
})();
