import { getFoodTrucksPayload, FOOD_TRUCKS_REFRESH_INTERVAL_SECONDS } from '../src/server/food-trucks.js';

export default async function handler(request, response) {
  if (request.method && request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const source = new URL(request.url || '/', 'http://localhost').searchParams.get('source');
    const payload = await getFoodTrucksPayload(source === 'nomnom' ? { source } : {});
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader(
      'Cache-Control',
      `public, max-age=0, s-maxage=${FOOD_TRUCKS_REFRESH_INTERVAL_SECONDS}, stale-while-revalidate=300`
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
