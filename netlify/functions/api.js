// Puente entre RecallPro y la API de Notion.
// El token nunca se expone al navegador: vive en las variables de entorno de Netlify.

const NOTION_API = 'https://api.notion.com/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function chunkText(str, size = 1900) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) chunks.push(str.slice(i, i + size));
  return chunks.length ? chunks : [''];
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DB_CARPETAS = process.env.NOTION_DB_CARPETAS;
  const DB_TEMAS = process.env.NOTION_DB_TEMAS;
  const DB_HISTORIAL = process.env.NOTION_DB_HISTORIAL;

  if (!NOTION_TOKEN || !DB_CARPETAS || !DB_TEMAS || !DB_HISTORIAL) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Faltan variables de entorno en Netlify: NOTION_TOKEN, NOTION_DB_CARPETAS, NOTION_DB_TEMAS, NOTION_DB_HISTORIAL.' })
    };
  }

  const headers = {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  const parts = event.path.replace(/^\/(\.netlify\/functions\/api|api)\/?/, '').split('/').filter(Boolean);
  const resource = parts[0];
  const id = parts[1];

  try {
    let result;
    if (resource === 'carpetas') result = await handleCarpetas(event, id, headers, DB_CARPETAS, DB_TEMAS);
    else if (resource === 'temas') result = await handleTemas(event, id, headers, DB_TEMAS);
    else if (resource === 'historial') result = await handleHistorial(event, headers, DB_HISTORIAL);
    else return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Ruta no encontrada' }) };

    return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};

// ---------------- Carpetas ----------------
async function handleCarpetas(event, id, headers, DB_CARPETAS, DB_TEMAS) {
  if (event.httpMethod === 'GET') {
    const res = await fetch(`${NOTION_API}/databases/${DB_CARPETAS}/query`, {
      method: 'POST', headers, body: JSON.stringify({ page_size: 100 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error consultando carpetas en Notion');
    return data.results.map(p => ({
      id: p.id,
      nombre: p.properties.Nombre.title[0]?.plain_text || '(sin nombre)',
      categoria: p.properties.Categoria.select?.name || 'universidad'
    }));
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body);
    const res = await fetch(`${NOTION_API}/pages`, {
      method: 'POST', headers,
      body: JSON.stringify({
        parent: { database_id: DB_CARPETAS },
        properties: {
          Nombre: { title: [{ text: { content: body.nombre } }] },
          Categoria: { select: { name: body.categoria } }
        }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error creando carpeta en Notion');
    return { id: data.id, nombre: body.nombre, categoria: body.categoria };
  }

  if (event.httpMethod === 'PATCH' && id) {
    const body = JSON.parse(event.body); // { categoria }
    const res = await fetch(`${NOTION_API}/pages/${id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ properties: { Categoria: { select: { name: body.categoria } } } })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error actualizando categoría en Notion');
    return { ok: true };
  }

  if (event.httpMethod === 'DELETE' && id) {
    await fetch(`${NOTION_API}/pages/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ archived: true }) });

    const q = await fetch(`${NOTION_API}/databases/${DB_TEMAS}/query`, {
      method: 'POST', headers,
      body: JSON.stringify({ filter: { property: 'Carpeta', relation: { contains: id } } })
    });
    const qd = await q.json();
    for (const tema of qd.results || []) {
      await fetch(`${NOTION_API}/pages/${tema.id}`, { method: 'PATCH', headers, body: JSON.stringify({ archived: true }) });
    }
    return { ok: true };
  }

  return { error: 'Método no soportado' };
}

// ---------------- Temas ----------------
async function handleTemas(event, id, headers, DB_TEMAS) {
  if (event.httpMethod === 'GET') {
    const res = await fetch(`${NOTION_API}/databases/${DB_TEMAS}/query`, {
      method: 'POST', headers, body: JSON.stringify({ page_size: 100 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error consultando temas en Notion');

    const temas = [];
    for (const p of data.results) {
      const blocksRes = await fetch(`${NOTION_API}/blocks/${p.id}/children?page_size=100`, { headers });
      const blocksData = await blocksRes.json();
      const codeBlock = (blocksData.results || []).find(b => b.type === 'code');
      let contenido = { flashcards: [], cuestionario: [] };
      if (codeBlock) {
        const texto = codeBlock.code.rich_text.map(rt => rt.plain_text).join('');
        try { contenido = JSON.parse(texto); } catch (e) { /* ignora si viene corrupto */ }
      }
      temas.push({
        id: p.id,
        carpetaId: p.properties.Carpeta.relation[0]?.id || null,
        nombre: p.properties.Nombre.title[0]?.plain_text || '(sin nombre)',
        proximoRepaso: p.properties.ProximoRepaso.date?.start || new Date().toISOString().split('T')[0],
        box: p.properties.Box.number ?? 0,
        repeticiones: p.properties.Repeticiones.number ?? 0,
        flashcards: contenido.flashcards || [],
        cuestionario: contenido.cuestionario || []
      });
    }
    return temas;
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body); // { nombre, carpetaId, flashcards, cuestionario, proximoRepaso }
    const jsonStr = JSON.stringify({ flashcards: body.flashcards, cuestionario: body.cuestionario });
    const chunks = chunkText(jsonStr);

    const res = await fetch(`${NOTION_API}/pages`, {
      method: 'POST', headers,
      body: JSON.stringify({
        parent: { database_id: DB_TEMAS },
        properties: {
          Nombre: { title: [{ text: { content: body.nombre } }] },
          Carpeta: { relation: [{ id: body.carpetaId }] },
          ProximoRepaso: { date: { start: body.proximoRepaso } },
          Box: { number: 0 },
          Repeticiones: { number: 0 }
        },
        children: [{
          object: 'block',
          type: 'code',
          code: { language: 'json', rich_text: chunks.map(c => ({ type: 'text', text: { content: c } })) }
        }]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error creando tema en Notion');
    return {
      id: data.id, carpetaId: body.carpetaId, nombre: body.nombre,
      proximoRepaso: body.proximoRepaso, box: 0, repeticiones: 0,
      flashcards: body.flashcards, cuestionario: body.cuestionario
    };
  }

  if (event.httpMethod === 'PATCH' && id) {
    const body = JSON.parse(event.body); // { proximoRepaso, box, repeticiones }
    const res = await fetch(`${NOTION_API}/pages/${id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        properties: {
          ProximoRepaso: { date: { start: body.proximoRepaso } },
          Box: { number: body.box },
          Repeticiones: { number: body.repeticiones }
        }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error actualizando tema en Notion');
    return { ok: true };
  }

  if (event.httpMethod === 'DELETE' && id) {
    await fetch(`${NOTION_API}/pages/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ archived: true }) });
    return { ok: true };
  }

  return { error: 'Método no soportado' };
}

// ---------------- Historial ----------------
async function handleHistorial(event, headers, DB_HISTORIAL) {
  if (event.httpMethod === 'GET') {
    const res = await fetch(`${NOTION_API}/databases/${DB_HISTORIAL}/query`, {
      method: 'POST', headers,
      body: JSON.stringify({ sorts: [{ property: 'Fecha', direction: 'descending' }], page_size: 100 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error consultando historial en Notion');
    return data.results.map(p => ({
      id: p.id,
      tema: p.properties.Tema.title[0]?.plain_text || '',
      curso: p.properties.Curso.rich_text[0]?.plain_text || '',
      fecha: p.properties.Fecha.date?.start || '',
      score: p.properties.Score.number ?? 0,
      total: p.properties.Total.number ?? 0
    }));
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body); // { tema, curso, fecha, score, total }
    const res = await fetch(`${NOTION_API}/pages`, {
      method: 'POST', headers,
      body: JSON.stringify({
        parent: { database_id: DB_HISTORIAL },
        properties: {
          Tema: { title: [{ text: { content: body.tema } }] },
          Curso: { rich_text: [{ text: { content: body.curso } }] },
          Fecha: { date: { start: body.fecha } },
          Score: { number: body.score },
          Total: { number: body.total }
        }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error guardando historial en Notion');
    return { id: data.id, ...body };
  }

  return { error: 'Método no soportado' };
}
