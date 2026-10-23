// This transformation is intentionally limited to the two known 1F exports.
// Their sole mask is constant white * alpha, so the masked group's opacity
// represents the same effect without a mask/filter evaluation over the floor.
import assert from 'node:assert/strict';

export function firstFloorWithoutMaskFilter(source) {
  const filters = [...source.matchAll(/<filter\b[\s\S]*?<\/filter>/g)];
  const masks = [...source.matchAll(/<mask\b[\s\S]*?<\/mask>/g)];
  assert.equal(filters.length, 1, 'Expected exactly one 1F filter');
  assert.equal(masks.length, 1, 'Expected exactly one 1F mask');
  const filter = filters[0][0], mask = masks[0][0];
  const filterId = filter.match(/\bid="([^"]+)"/)[1];
  const maskId = mask.match(/\bid="([^"]+)"/)[1];
  const matrix = filter.match(/\bvalues="([^"]+)"/)[1].trim().replace(/\s+/g, ' ');
  assert.equal(matrix, '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0', 'Expected white RGB with unchanged alpha');
  assert.equal((filter.match(/<fe\w+/g) ?? []).length, 1, 'No additional filter primitives');
  assert.ok(mask.includes(`filter="url(#${filterId})"`));
  assert.equal((mask.match(/<(?:path|rect)\b/g) ?? []).length, 1, 'Expected one constant mask shape');
  // The mask paint must cover the complete viewBox, rather than cut a silhouette.
  if (mask.includes('<path')) {
    assert.equal(mask.match(/\bd="([^"]+)"/)[1], 'M-119.055-84.189h1428.66V926.079h-1428.66z');
  } else {
    for (const [key, value] of Object.entries({ x: -119.055, y: -84.189, width: 1428.66, height: 1010.268 })) {
      const attributeValue = mask.match(new RegExp(`\\b${key}="([^"]+)"`))[1];
      assert.equal(Number(attributeValue), value, `Unexpected mask rectangle ${key}`);
    }
  }
  const opacity = mask.match(/\bfill-opacity="([^"]+)"/)[1];
  assert.ok(Math.abs(Number(opacity) - 0.1) < 0.00001, 'Expected the known approximately 10% alpha');
  const attribute = `mask="url(#${maskId})"`;
  assert.equal(source.split(attribute).length - 1, 1, 'Expected one masked group');
  assert.ok(source.includes(`<g ${attribute}>`), 'Do not overwrite an existing group opacity');
  const svg = source.replace(filter, '').replace(mask, '').replace(attribute, `opacity="${opacity}"`);
  assert.doesNotMatch(svg, /<(?:filter|mask)\b|\b(?:filter|mask)="/, 'No mask or filter definitions/references remain');
  return { svg, details: { filterId, maskId, opacity, removedFilterDefinitions: 1, removedMaskDefinitions: 1, replacedMaskReferences: 1 } };
}
