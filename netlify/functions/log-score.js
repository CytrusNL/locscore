exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  const data = JSON.parse(event.body);

  const sql = `INSERT INTO cytrus.locscore.location_scores VALUES (
    '${data.id}', '${data.timestamp}', ${data.lat}, ${data.lon},
    '${data.address}', ${data.radius}, ${data.total_score}, '${data.grade}',
    ${data.ai_lat}, ${data.ai_lon}, ${data.ai_score},
    ${data.cat_transit}, ${data.cat_cycling}, ${data.cat_childcare},
    ${data.cat_park}, ${data.cat_health}, ${data.cat_noise},
    ${data.cat_sports}, ${data.cat_community}, ${data.nearby_count},
    '${process.env.DATABRICKS_WAREHOUSE_ID}'
  )`;

  const resp = await fetch(
    `${process.env.DATABRICKS_HOST}/api/2.0/sql/statements`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DATABRICKS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        warehouse_id: process.env.DATABRICKS_WAREHOUSE_ID,
        catalog: 'cytrus',
        schema: 'locscore',
        statement: sql,
        wait_timeout: '10s'
      })
    }
  );

  const result = await resp.json();
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok: true, state: result.status?.state })
  };
};
