import { GEOREFERENCE, METERS_PER_LATITUDE, METERS_PER_LONGITUDE } from './geolocation-model.js';

// Accuracy/time-weighted local-metre filter, independent of displayed floor.
// Process noise is a pedestrian tuning parameter, not a speed prohibition.
// Device fixes are correlated; never advertise a reduced confidence radius.
export function createLocationEstimator() {
  let state = null, timestamp = -Infinity, candidate = null;
  const metres = c => [(c.longitude - GEOREFERENCE.longitude) * METERS_PER_LONGITUDE,
    (c.latitude - GEOREFERENCE.latitude) * METERS_PER_LATITUDE];
  const coords = () => state && ({ longitude: GEOREFERENCE.longitude + state.x / METERS_PER_LONGITUDE,
    latitude: GEOREFERENCE.latitude + state.y / METERS_PER_LATITUDE, accuracy: state.accuracy });
  function reset(point, fix, variance) {
    state = { x: point[0], y: point[1], time: fix.timestamp, variance, accuracy: fix.coords.accuracy };
    candidate = null;
  }
  return {
    update(fix) {
      const c = fix?.coords, t = fix?.timestamp;
      if (!c || ![t, c.latitude, c.longitude, c.accuracy].every(Number.isFinite)
        || Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180 || c.accuracy <= 0)
        return { status: 'invalid', coords: coords() };
      if (t <= timestamp) return { status: 'old', coords: coords() };
      timestamp = t;
      if (c.accuracy > 100) return { status: 'imprecise', coords: coords() };
      const point = metres(c);
      // Gaussian-equivalent scale only for weighting. The API's 95% radius
      // stays intact for display; this is not a newly certified covariance.
      const variance = Math.max(3, c.accuracy / 2.448) ** 2;
      if (!state || t - state.time >= 15_000) {
        reset(point, fix, variance);
        return { status: 'reset', coords: coords() };
      }
      const dt = Math.max(0.001, (t - state.time) / 1000);
      const distance = Math.hypot(point[0] - state.x, point[1] - state.y);
      if (distance > state.accuracy + c.accuracy + 3 * dt + 5) {
        const coherent = candidate && t - candidate.time <= 5000
          && Math.hypot(point[0] - candidate.x, point[1] - candidate.y) <= candidate.accuracy + c.accuracy + 3 * (t - candidate.time) / 1000;
        candidate = { x: point[0], y: point[1], time: t, accuracy: c.accuracy, count: coherent ? candidate.count + 1 : 1 };
        // Three consistent, increasing-time observations can reacquire a real
        // changed position. One isolated jump must not drag the marker away.
        if (candidate.count < 3) return { status: 'outlier', coords: coords() };
        reset(point, fix, variance);
        return { status: 'reacquired', coords: coords() };
      }
      candidate = null;
      const predictedVariance = state.variance + (1.8 * dt) ** 2;
      const gain = predictedVariance / (predictedVariance + variance);
      state = { x: state.x + gain * (point[0] - state.x), y: state.y + gain * (point[1] - state.y),
        variance: (1 - gain) * predictedVariance, time: t, accuracy: c.accuracy };
      return { status: 'filtered', coords: coords() };
    },
  };
}
