const http = require('http');
const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

let testsPassed = 0;
let testsFailed = 0;

/**
 * Effectue une requête HTTP
 */
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode,
            body: parsed,
            rawBody: data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: null,
            rawBody: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Exécute un test
 */
async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  Erreur: ${err.message}`);
    testsFailed++;
  }
}

/**
 * Tests
 */
async function runTests() {
  console.log('\n=== Tests de l\'API devsecops ===\n');

  // Test 1: Health check
  await test('GET /health retourne status ok', async () => {
    const res = await makeRequest('GET', '/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
  });

  // Test 2: GET /items (vide initialement)
  await test('GET /items retourne un tableau', async () => {
    const res = await makeRequest('GET', '/items');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body));
  });

  // Test 3: POST /items - créer un item valide
  let itemId = null;
  await test('POST /items crée un item valide', async () => {
    const res = await makeRequest('POST', '/items', {
      name: 'Test task',
      due_date: '2026-05-20'
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.name, 'Test task');
    assert.strictEqual(res.body.due_date, '2026-05-20');
    assert(res.body.id);
    itemId = res.body.id;
  });

  // Test 4: POST /items - validation du nom manquant
  await test('POST /items rejette un nom vide', async () => {
    const res = await makeRequest('POST', '/items', {
      name: '',
      due_date: '2026-05-20'
    });
    assert.strictEqual(res.status, 400);
    assert(res.body.error);
  });

  // Test 5: POST /items - validation de la date
  await test('POST /items rejette une date invalide', async () => {
    const res = await makeRequest('POST', '/items', {
      name: 'Task',
      due_date: 'invalid-date'
    });
    assert.strictEqual(res.status, 400);
    assert(res.body.error);
  });

  // Test 6: POST /items - sanitization XSS
  await test('POST /items sanitize les contenus XSS', async () => {
    const res = await makeRequest('POST', '/items', {
      name: '<script>alert("xss")</script>Tâche',
      due_date: '2026-05-20'
    });
    assert.strictEqual(res.status, 201);
    // Le contenu XSS doit être supprimé
    assert(!res.body.name.includes('<script>'));
    assert(!res.body.name.includes('</script>'));
  });

  // Test 7: GET /items - vérifier les items créés
  await test('GET /items retourne les items créés', async () => {
    const res = await makeRequest('GET', '/items');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body));
    assert(res.body.length >= 1);
  });

  // Test 8: PATCH /items/:id - mettre à jour un item
  await test('PATCH /items/:id met à jour un item', async () => {
    const res = await makeRequest('PATCH', `/items/${itemId}`, {
      name: 'Updated task',
      due_date: '2026-06-01'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'Updated task');
    assert.strictEqual(res.body.due_date, '2026-06-01');
  });

  // Test 9: PATCH /items/:id - sanitization XSS
  await test('PATCH /items/:id sanitize les contenus XSS', async () => {
    const res = await makeRequest('PATCH', `/items/${itemId}`, {
      name: '<img src=x onerror=alert("xss")>Task',
      due_date: '2026-06-01'
    });
    assert.strictEqual(res.status, 200);
    // Le contenu XSS doit être supprimé
    assert(!res.body.name.includes('<img'));
    assert(!res.body.name.includes('onerror'));
  });

  // Test 10: PATCH /items/:id avec ID invalide
  await test('PATCH /items/invalid rejette un ID invalide', async () => {
    const res = await makeRequest('PATCH', '/items/invalid', {
      name: 'Task',
      due_date: '2026-06-01'
    });
    assert.strictEqual(res.status, 400);
    assert(res.body.error);
  });

  // Test 11: DELETE /items/:id
  await test('DELETE /items/:id supprime un item', async () => {
    const res = await makeRequest('DELETE', `/items/${itemId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.deleted, itemId);
  });

  // Test 12: DELETE /items/:id - item inexistant
  await test('DELETE /items/:id retourne 404 si l\'item n\'existe pas', async () => {
    const res = await makeRequest('DELETE', `/items/99999`);
    assert.strictEqual(res.status, 404);
    assert(res.body.error);
  });

  // Test 13: Création de plusieurs items pour tester la liste
  let item1Id = null;
  await test('POST /items - créer plusieurs items', async () => {
    const res1 = await makeRequest('POST', '/items', {
      name: 'Item 1',
      due_date: '2026-05-15'
    });
    const res2 = await makeRequest('POST', '/items', {
      name: 'Item 2',
      due_date: '2026-05-10'
    });
    assert.strictEqual(res1.status, 201);
    assert.strictEqual(res2.status, 201);
    item1Id = res1.body.id;
  });

  // Test 14: GET /items - vérifier l'ordre (tri par due_date)
  await test('GET /items retourne les items triés par due_date', async () => {
    const res = await makeRequest('GET', '/items');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body));
    if (res.body.length > 1) {
      for (let i = 0; i < res.body.length - 1; i++) {
        assert(res.body[i].due_date <= res.body[i + 1].due_date);
      }
    }
  });

  // Nettoyage
  if (item1Id) {
    await makeRequest('DELETE', `/items/${item1Id}`);
  }

  console.log(`\n=== Résultats ===`);
  console.log(`Passés: ${testsPassed}`);
  console.log(`Échoués: ${testsFailed}`);
  console.log(`Total: ${testsPassed + testsFailed}\n`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Attendre que le serveur soit prêt et lancer les tests
setTimeout(runTests, 1000);
