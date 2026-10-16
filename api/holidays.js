import { getHolidaysPayload, HOLIDAYS_REFRESH_INTERVAL_SECONDS } from '../src/server/holidays.js';

export default async function handler(request, response) {
  if (request.method && request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const payload = await getHolidaysPayload();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    // The CDN keeps it for a day; browsers for six hours. Holidays change rarely.
    response.setHeader(
      'Cache-Control',
      `public, max-age=21600, s-maxage=${HOLIDAYS_REFRESH_INTERVAL_SECONDS}, stale-while-revalidate=604800`
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
