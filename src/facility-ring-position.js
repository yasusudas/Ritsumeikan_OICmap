import floorOffsets from './assets/facility-ring-offsets.json' with { type: 'json' };

// Coordinates are always edited and saved against the Japanese map. English
// offsets belong to pictograms, so deleting/recreating a ring needs no setup.
const MAX_PICTOGRAM_DISTANCE = 6;

export function getFacilityRingDisplayPoint(ring, language) {
  const point = { xRatio: ring.xRatio, yRatio: ring.yRatio };
  if (language !== 'en') {
    return point;
  }

  const floor = floorOffsets[ring.floorId];
  const color = ring.facilityKey === 'toilet' ? ring.colorVariant : 'red';
  const candidates = floor?.points[ring.facilityKey]?.[color] ?? [];
  let nearest = null;
  let nearestDistance = MAX_PICTOGRAM_DISTANCE ** 2;

  for (const candidate of candidates) {
    const dx = (point.xRatio - candidate[0]) * floor.viewBox[2];
    const dy = (point.yRatio - candidate[1]) * floor.viewBox[3];
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest
    ? { xRatio: point.xRatio + nearest[2], yRatio: point.yRatio + nearest[3] }
    : point;
}
