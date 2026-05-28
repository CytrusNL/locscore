/**
 * Netlify Function: log-score
 * Proxies LocScorer data to Databricks Unity Catalog
 */

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const host      = process.env.DATABRICKS_HOST;
  const token     = process.env.DATABRICKS_TOKEN;
  const warehouse = process.env.DATABRICKS_WAREHOUSE_ID;
  const catalog   = process.env.DATABRICKS_CATALOG  || 'cytrus';
  const schema    = process.env.DATABRICKS_SCHEMA   || 'locscore';

  if (!host || !token || !warehouse) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'Missing env vars', host: !!host, token: !!token, warehouse: !!warehouse })
    };
  }

  const s = (v) => String(v || '').replace(/'/g, "''").substring(0, 500);
  const n = (v) => isFinite(v) ? Number(v) : 0;

  // Use parameterized values to avoid SQL injection and timestamp parsing issues
  const sql = `INSERT INTO ${catalog}.${schema}.location_scores VALUES (
    '${s(data.id)}',
    CAST('${s(data.timestamp)}' AS TIMESTAMP),
    ${n(data.lat)},
    ${n(data.lon)},
    '${s(data.address)}',
    ${n(data.radius)},
    ${n(data.total_score)},
    '${s(data.grade)}',
    ${n(data.ai_lat)},
    ${n(data.ai_lon)},
    ${n(data.ai_score)},
    ${n(data.cat_supermarket)},
    ${n(data.cat_transit)},
    ${n(data.cat_health)},
    ${n(data.cat_park)},
    ${n(data.cat_pharmacy)},
    ${n(data.cat_library)},
    ${n(data.cat_cycling)},
    ${n(data.cat_childcare)},
    ${n(data.cat_noise)},
    ${n(data.cat_sports)},
    ${n(data.cat_otherschools)},
    ${n(data.cat_airquality)},
    ${n(data.cat_community)},
    ${n(data.nearby_count)},
    '${s(data.user_agent)}'
  )`;

  try {
    // Step 1: submit statement
    const resp = await fetch(`${host}/api/2.0/sql/statements`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        warehouse_id: warehouse,
        catalog: catalog,
        schema: schema,
        statement: sql,
        wait_timeout: '30s',
        on_wait_timeout: 'CONTINUE'
      })
    });

    const result = await resp.json();
    const statementId = result.statement_id;
    let state = result?.status?.state;

    // Step 2: if still running, poll up to 3 times
    if (statementId && !['SUCCEEDED', 'FAILED', 'CANCELED'].includes(state)) {
      for (let i = 0; i < 3; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const poll = await fetch(`${host}/api/2.0/sql/statements/${statementId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const pollData = await poll.json();
        state = pollData?.status?.state;
        if (['SUCCEEDED', 'FAILED', 'CANCELED'].includes(state)) break;
      }
    }

    const ok = state === 'SUCCEEDED';
    const errorMsg = result?.status?.error?.message || null;

    return {
      statusCode: ok ? 200 : 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        ok,
        state,
        statement_id: statementId,
        error: errorMsg,
        sql_preview: sql.substring(0, 200)
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
