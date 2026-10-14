import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { foodDataAssetsPlugin } from './scripts/vite-food-data-plugin.mjs';
import { searchDataAssetsPlugin } from './scripts/vite-search-data-plugin.mjs';
import { getRailStatusPayload, RAIL_STATUS_REFRESH_INTERVAL_SECONDS } from './src/server/rail-status.js';
import { getFoodTrucksPayload, FOOD_TRUCKS_REFRESH_INTERVAL_SECONDS } from './src/server/food-trucks.js';
import { getCoopHoursPayload, COOP_HOURS_REFRESH_INTERVAL_SECONDS } from './src/server/coop-hours.js';

function railStatusDevApi() {
  return {
    name: 'rits-oic-rail-status-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/rail-status', async (request, response) => {
        if (request.method !== 'GET') {
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
      });
    }
  };
}

function foodTrucksDevApi() {
  return {
    name: 'rits-oic-food-trucks-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/food-trucks', async (request, response) => {
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const payload = await getFoodTrucksPayload();
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
      });
    }
  };
}

function coopHoursDevApi() {
  return {
    name: 'rits-oic-coop-hours-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/coop-hours', async (request, response) => {
        if (request.method !== 'GET') {
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
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [searchDataAssetsPlugin(), foodDataAssetsPlugin(), railStatusDevApi(), foodTrucksDevApi(), coopHoursDevApi()],
  build: {
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, 'index.html'),
        viewerEn: resolve(__dirname, 'en/index.html'),
        editor: resolve(__dirname, 'editor/index.html'),
        editorLogin: resolve(__dirname, 'editor/login/index.html'),
        terms: resolve(__dirname, 'terms/index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
        access: resolve(__dirname, 'access/index.html'),
        food: resolve(__dirname, 'food/index.html'),
        timetable: resolve(__dirname, 'timetable/index.html'),
        hiddenTimetable: resolve(__dirname, 'hidden/timetable/index.html'),
        enTerms: resolve(__dirname, 'en/terms/index.html'),
        enPrivacy: resolve(__dirname, 'en/privacy/index.html'),
        enAccess: resolve(__dirname, 'en/access/index.html'),
        enFood: resolve(__dirname, 'en/food/index.html'),
        enTimetable: resolve(__dirname, 'en/timetable/index.html')
      }
    }
  }
});
