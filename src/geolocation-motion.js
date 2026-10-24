// Interpolate accepted estimates only; never extrapolate beyond the newest target.
export function createLocationMotion() {
  let origin = null, target = null, startedAt = 0, duration = 0, receivedAt = null;
  function sample(now) {
    if (!target) return null;
    if (!duration || now >= startedAt + duration) return { ...target };
    const progress = duration ? Math.max(0, Math.min(1, (now - startedAt) / duration)) : 1;
    const eased = progress * progress * (3 - 2 * progress);
    return {
      latitude: origin.latitude + (target.latitude - origin.latitude) * eased,
      longitude: origin.longitude + (target.longitude - origin.longitude) * eased,
      // Keep the reported uncertainty current, rather than understating it while moving.
      accuracy: target.accuracy,
    };
  }
  return {
    sample,
    update(coords, now, animate = true) {
      origin = sample(now) ?? { latitude: coords.latitude, longitude: coords.longitude };
      target = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
      duration = animate && receivedAt !== null && Number.isFinite(origin.latitude) && Number.isFinite(origin.longitude)
        ? Math.max(100, Math.min(250, (now - receivedAt) * 0.25)) : 0;
      receivedAt = startedAt = now;
      if (origin.latitude === target.latitude && origin.longitude === target.longitude) duration = 0;
    },
    active(now) { return target !== null && now < startedAt + duration; },
    finish() { if (target) { origin = target; duration = 0; } },
  };
}
