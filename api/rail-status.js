import { getRailStatusPayload, RAIL_STATUS_REFRESH_INTERVAL_SECONDS } from '../src/server/rail-status.js';

export default async function handler(request, response) {
  if (request.method && request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const payload = await getRailStatusPayload();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader(
      'Cache-Control',
      `public, max-age=0, s-maxage=${RAIL_STATUS_REFRESH_INTERVAL_SECONDS}, stale-while-revalidate=300`
    );
    response.end(JSON.stringify(payload));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
