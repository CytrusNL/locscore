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
  try { data = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  const host      = process.env.DATABRICKS_HOST;
  const token     = process.env.DATABRICKS_TOKEN;
  const warehouse = process.env.DATABRICKS_WAREHOUSE_ID;
  const catalog   = process.env.DATABRICKS_CATALOG || 'cytrus';
  const schema    = process.env.DATABRICKS_SCHEMA  || 'locscore';

  if (!host || !token || !warehouse) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'Missing env vars', host: !!host, token: !!token, warehouse: !!warehouse })
    };
  }

  const s = (v) => String(v || '').replace(/'/g, "''").substring(0, 500);
  const n = (v) => isFinite(v) ? Number(v) : 0;

  const sql = `INSERT INTO ${catalog}.${schema}.location_scores VALUES (
    '${s(data.id)}',
    CAST('${s(data.timestamp)}' AS TIMESTAMP),
    ${n(data.lat)}, ${n(data.lon)},
    '${s(data.address)}',
    ${n(data.radius)}, ${n(data.total_score)},
    '${s(data.grade)}',
    ${n(data.ai_lat)}, ${n(data.ai_lon)}, ${n(data.ai_score)},
    ${n(data.cat_supermarket)}, ${n(data.cat_transit)}, ${n(data.cat_health)},
    ${n(data.cat_park)}, ${n(data.cat_pharmacy)}, ${n(data.cat_library)},
    ${n(data.cat_cycling)}, ${n(data.cat_childcare)}, ${n(data.cat_noise)},
    ${n(data.cat_sports)}, ${n(data.cat_otherschools)}, ${n(data.cat_airquality)},
    ${n(data.cat_community)}, ${n(data.nearby_count)},
    '${s(data.user_agent)}'
  )`;

  try {
    // Submit statement — fire and forget approach
    // We return ok:true as soon as Databricks accepts the statement
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
        wait_timeout: '0s',        // return immediately with statement_id
        on_wait_timeout: 'CONTINUE' // keep running async
      })
    });

    const result = await resp.json();
    const statementId = result.statement_id;
    const state = result?.status?.state;
    const errorMsg = result?.status?.error?.message || null;

    // Any of these states means Databricks accepted it
    const accepted = ['PENDING', 'RUNNING', 'SUCCEEDED'].includes(state);

    return {
      statusCode: accepted ? 200 : 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        ok: accepted,
        state: state,
        statement_id: statementId,
        error: errorMsg,
        note: accepted ? 'INSERT accepted by Databricks — runs async' : 'Databricks rejected the statement',
        sql_preview: sql.substring(0, 300)
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
