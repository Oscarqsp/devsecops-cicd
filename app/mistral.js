/**
 * Repriorisation des échéances via Mistral (sortie structurée JSON Schema).
 */

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

function getApiKey() {
  const k = process.env.MISTRAL_API_KEY;
  if (k == null || k === '') return '';
  return String(k).replace(/^["']|["']$/g, '').trim();
}

function buildResponseFormatSchema() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'task_reprioritization',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            description: 'Une entrée par tâche fournie, avec une nouvelle échéance.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer', description: 'Identifiant de la tâche (inchangé).' },
                due_date: {
                  type: 'string',
                  description: 'Nouvelle date d’échéance au format YYYY-MM-DD.'
                }
              },
              required: ['id', 'due_date'],
              additionalProperties: false
            }
          },
          rationale: {
            type: 'string',
            description: 'Brève explication en français du classement (1–3 phrases).'
          }
        },
        required: ['tasks', 'rationale'],
        additionalProperties: false
      }
    }
  };
}

/**
 * @param {Array<{id:number,name:string,due_date:string}>} tasks
 * @param {string} referenceDate YYYY-MM-DD (ex. aujourd’hui côté utilisateur)
 */
async function reprioritizeTasksWithMistral(tasks, referenceDate) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('MISTRAL_API_KEY manquante');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const model = process.env.MISTRAL_MODEL || 'ministral-8b-latest';

  const userPayload = {
    instruction:
      'Pour chaque tâche ci-dessous, propose une nouvelle date due_date (YYYY-MM-DD) qui reflète la priorité : urgentes / importantes / bloquantes en premier, puis le reste. Étale les échéances de façon réaliste à partir de la date de référence. Conserve exactement les mêmes ids. Ne change pas les titres — seules les dates sont replanifiées.',
    reference_date: referenceDate,
    tasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      due_date: t.due_date
    }))
  };

  const body = {
    model,
    temperature: 0.2,
    max_tokens: 2048,
    response_format: buildResponseFormatSchema(),
    messages: [
      {
        role: 'system',
        content:
          'Tu planifies des tâches pour un utilisateur francophone. Tu réponds uniquement via le schéma JSON imposé : tableau tasks avec id et due_date pour chaque tâche, plus rationale en français.'
      },
      {
        role: 'user',
        content: JSON.stringify(userPayload)
      }
    ]
  };

  const res = await fetch(MISTRAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const rawText = await res.text();
  if (!res.ok) {
    const err = new Error(`Mistral HTTP ${res.status}`);
    err.code = 'MISTRAL_HTTP';
    err.detail = rawText.slice(0, 800);
    throw err;
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    const err = new Error('Réponse Mistral invalide (JSON)');
    err.code = 'MISTRAL_PARSE';
    throw err;
  }

  const content = data.choices?.[0]?.message?.content;
  let raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((p) => (typeof p === 'string' ? p : p?.text || p?.content || ''))
            .join('')
        : '';
  if (raw == null || raw === '') {
    const err = new Error('Réponse Mistral sans contenu');
    err.code = 'MISTRAL_EMPTY';
    throw err;
  }

  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    const err = new Error('JSON structuré Mistral illisible');
    err.code = 'MISTRAL_SCHEMA';
    throw err;
  }

  const list = parsed.tasks;
  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : '';

  if (!Array.isArray(list)) {
    const err = new Error('Champ tasks absent ou invalide');
    err.code = 'MISTRAL_SCHEMA';
    throw err;
  }

  return { tasks: list, rationale };
}

module.exports = {
  getApiKey,
  reprioritizeTasksWithMistral
};
