import { getCoopHoursPayload, COOP_HOURS_REFRESH_INTERVAL_SECONDS } from '../src/server/coop-hours.js';

export default async function handler(request, response) {
  if (request.method && request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const payload = await getCoopHoursPayload();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader(
      'Cache-Control',
      `public, max-age=0, s-maxage=${COOP_HOURS_REFRESH_INTERVAL_SECONDS}, stale-while-revalidate=3600`
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
