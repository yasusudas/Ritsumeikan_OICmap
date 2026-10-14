export const KNOWN_FLOOR_IDS = new Set(['1F', '2F', '3F', '4F', '5F', 'A-6-9F', 'H-6-9F']);
export const KNOWN_FACILITY_KEYS = new Set([
  'toilet',
  'waterServer',
  'vendingMachine',
  'printer',
  'stairs',
  'escalator',
  'elevator',
  'aed',
  'atm',
  'nursingRoom'
]);

const STATIC_HASH_ROUTES = new Set(['about', 'contact']);
const TOILET_COLOR_VARIANTS = new Set(['red', 'blue', 'yellow']);
const DEFAULT_COLOR_VARIANTS = new Set(['red']);
const RATIO_EPSILON = 1e-9;

function createIssue(code, path, message, details = undefined) {
  return details === undefined ? { code, path, message } : { code, path, message, details };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSearchValue(value) {
  return String(value ?? '').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export function normalizeHashRouteId(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function createHashSlugPart(value, fallback = '') {
  return normalizeHashRouteId(value) || normalizeHashRouteId(fallback) || 'location';
}

function validateRatio(value, path, errors, { positive = false } = {}) {
  if (!Number.isFinite(value)) {
    errors.push(createIssue('invalid-coordinate', path, '座標は有限の数値である必要があります。'));
    return false;
  }

  const minimum = positive ? 0 : -RATIO_EPSILON;
  const validMinimum = positive ? value > 0 : value >= minimum;
  if (!validMinimum || value > 1 + RATIO_EPSILON) {
    errors.push(
      createIssue(
        'coordinate-out-of-range',
        path,
        positive ? 'サイズ比は0より大きく1以下である必要があります。' : '座標比は0以上1以下である必要があります。',
        { value }
      )
    );
    return false;
  }

  return true;
}

function collectHashRouteErrors(entries, errors) {
  const usableEntries = entries
    .map((entry, index) => ({ entry, index, ownerKey: `${index}:${entry?.id ?? ''}` }))
    .filter(({ entry }) => isRecord(entry) && String(entry.id ?? '').trim() && String(entry.label ?? '').trim());
  const baseCounts = new Map();

  const getHashBase = ({ entry }) => {
    const floorSlug = createHashSlugPart(entry.floorId, entry.floorId);
    const labelSlug = createHashSlugPart(entry.label, entry.id);
    return `${floorSlug}-${labelSlug}`;
  };

  usableEntries.forEach((item) => {
    const base = getHashBase(item);
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
  });

  const seenBaseCounts = new Map();
  const entriesWithHash = usableEntries.map((item) => {
    const base = getHashBase(item);
    const seenCount = (seenBaseCounts.get(base) ?? 0) + 1;
    seenBaseCounts.set(base, seenCount);
    return {
      ...item,
      hashId: baseCounts.get(base) > 1 ? `${base}-${seenCount}` : base
    };
  });

  const routeOwners = new Map();
  const reportedCollisions = new Set();

  const addRoute = (rawRoute, item, kind) => {
    const route = normalizeHashRouteId(rawRoute);
    if (!route) {
      errors.push(
        createIssue('empty-hash-route', `entries[${item.index}].${kind}`, 'ハッシュURLへ正規化できません。')
      );
      return;
    }

    if (STATIC_HASH_ROUTES.has(route)) {
      const signature = `static:${route}:${item.ownerKey}`;
      if (!reportedCollisions.has(signature)) {
        reportedCollisions.add(signature);
        errors.push(
          createIssue(
            'reserved-hash-route',
            `entries[${item.index}].${kind}`,
            `予約済みハッシュURL「${route}」と衝突します。`,
            { route, entryId: item.entry.id }
          )
        );
      }
      return;
    }

    const existing = routeOwners.get(route);
    if (existing && existing.ownerKey !== item.ownerKey) {
      const ownerPair = [existing.ownerKey, item.ownerKey].sort().join('|');
      const signature = `${route}:${ownerPair}`;
      if (!reportedCollisions.has(signature)) {
        reportedCollisions.add(signature);
        errors.push(
          createIssue(
            'hash-route-collision',
            `entries[${item.index}].${kind}`,
            `ハッシュURL「${route}」が別の検索項目と衝突します。`,
            {
              route,
              firstEntryId: existing.entry.id,
              secondEntryId: item.entry.id
            }
          )
        );
      }
      return;
    }

    routeOwners.set(route, item);
  };

  entriesWithHash.forEach((item) => {
    addRoute(item.hashId, item, 'hashId');
    addRoute(item.entry.id, item, 'id');
  });

  const labelOwners = new Map();
  entriesWithHash.forEach((item) => {
    const values = [item.entry.label, item.entry.labelEn, ...(Array.isArray(item.entry.aliases) ? item.entry.aliases : [])];
    values.forEach((value) => {
      const route = normalizeHashRouteId(value);
      if (!route || STATIC_HASH_ROUTES.has(route)) {
        return;
      }

      const existing = labelOwners.get(route);
      if (existing === undefined) {
        labelOwners.set(route, item);
      } else if (existing?.ownerKey !== item.ownerKey) {
        labelOwners.set(route, null);
      }
    });
  });

  labelOwners.forEach((item, route) => {
    if (item) {
      addRoute(route, item, 'label');
    }
  });
}

export function validateSearchData(payload) {
  const errors = [];
  const warnings = [];
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const facilityRings = Array.isArray(payload?.facilityRings) ? payload.facilityRings : [];
  const stats = {
    version: payload?.version,
    entries: entries.length,
    facilityRings: facilityRings.length,
    sameFloorLabelGroups: 0,
    legacyWhiteRings: 0
  };

  if (!isRecord(payload)) {
    errors.push(createIssue('invalid-root', '$', '検索データのルートはオブジェクトである必要があります。'));
    return { errors, warnings, stats };
  }

  if (!Number.isInteger(payload.version) || payload.version < 1) {
    errors.push(createIssue('invalid-version', 'version', 'versionは1以上の整数である必要があります。'));
  }

  if (!Array.isArray(payload.entries)) {
    errors.push(createIssue('invalid-entries', 'entries', 'entriesは配列である必要があります。'));
  }

  if (!Array.isArray(payload.facilityRings)) {
    errors.push(createIssue('invalid-facility-rings', 'facilityRings', 'facilityRingsは配列である必要があります。'));
  }

  const idOwners = new Map();
  const entryCoordinateOwners = new Map();
  const ringCoordinateOwners = new Map();
  const sameFloorLabelOwners = new Map();
  const legacyWhiteRings = [];

  const registerId = (id, path, collection) => {
    if (typeof id !== 'string' || !id.trim()) {
      errors.push(createIssue('invalid-id', path, 'IDは空でない文字列である必要があります。'));
      return;
    }

    const existing = idOwners.get(id);
    if (existing) {
      errors.push(
        createIssue('duplicate-id', path, `ID「${id}」が重複しています。`, {
          firstPath: existing.path,
          firstCollection: existing.collection,
          secondCollection: collection
        })
      );
      return;
    }

    idOwners.set(id, { path, collection });
  };

  entries.forEach((entry, entryIndex) => {
    const path = `entries[${entryIndex}]`;
    if (!isRecord(entry)) {
      errors.push(createIssue('invalid-entry', path, '検索項目はオブジェクトである必要があります。'));
      return;
    }

    registerId(entry.id, `${path}.id`, 'entries');

    if (!KNOWN_FLOOR_IDS.has(entry.floorId)) {
      errors.push(
        createIssue('unknown-floor', `${path}.floorId`, `存在しない階「${String(entry.floorId)}」です。`)
      );
    }

    if (typeof entry.label !== 'string' || !entry.label.trim()) {
      errors.push(createIssue('invalid-label', `${path}.label`, 'labelは空でない文字列である必要があります。'));
    } else {
      const labelKey = `${entry.floorId}\u0000${normalizeSearchValue(entry.label)}`;
      const owners = sameFloorLabelOwners.get(labelKey) ?? [];
      owners.push({ id: entry.id, label: entry.label, index: entryIndex,
        locationHint: entry.locationHint, locationHintEn: entry.locationHintEn });
      sameFloorLabelOwners.set(labelKey, owners);
    }

    if (entry.labelEn !== undefined && typeof entry.labelEn !== 'string') {
      errors.push(createIssue('invalid-label-en', `${path}.labelEn`, 'labelEnは文字列である必要があります。'));
    }

    if (entry.locationHint !== undefined || entry.locationHintEn !== undefined) {
      for (const key of ['locationHint', 'locationHintEn']) {
        if (typeof entry[key] !== 'string' || !entry[key].trim()) {
          errors.push(createIssue('invalid-location-hint', `${path}.${key}`, '場所の補足は日英とも空でない文字列にしてください。'));
        }
      }
    }

    if (entry.aliases !== undefined && (!Array.isArray(entry.aliases) || entry.aliases.some((alias) => typeof alias !== 'string'))) {
      errors.push(createIssue('invalid-aliases', `${path}.aliases`, 'aliasesは文字列の配列である必要があります。'));
    }

    if (!Array.isArray(entry.rects) || entry.rects.length === 0) {
      errors.push(createIssue('invalid-rects', `${path}.rects`, 'rectsには1件以上の座標が必要です。'));
    } else {
      entry.rects.forEach((rect, rectIndex) => {
        const rectPath = `${path}.rects[${rectIndex}]`;
        if (!isRecord(rect)) {
          errors.push(createIssue('invalid-rect', rectPath, 'rectはオブジェクトである必要があります。'));
          return;
        }

        const xValid = validateRatio(rect.xRatio, `${rectPath}.xRatio`, errors);
        const yValid = validateRatio(rect.yRatio, `${rectPath}.yRatio`, errors);
        const widthValid = validateRatio(rect.widthRatio, `${rectPath}.widthRatio`, errors, { positive: true });
        const heightValid = validateRatio(rect.heightRatio, `${rectPath}.heightRatio`, errors, { positive: true });

        if (xValid && widthValid && rect.xRatio + rect.widthRatio > 1 + RATIO_EPSILON) {
          errors.push(createIssue('rectangle-out-of-bounds', rectPath, 'rectの右端が座標範囲を超えています。'));
        }
        if (yValid && heightValid && rect.yRatio + rect.heightRatio > 1 + RATIO_EPSILON) {
          errors.push(createIssue('rectangle-out-of-bounds', rectPath, 'rectの下端が座標範囲を超えています。'));
        }

        if (xValid && yValid && widthValid && heightValid) {
          const coordinateKey = [entry.floorId, rect.xRatio, rect.yRatio, rect.widthRatio, rect.heightRatio].join('|');
          const existing = entryCoordinateOwners.get(coordinateKey);
          if (existing) {
            errors.push(
              createIssue('duplicate-entry-coordinate', rectPath, '検索項目の完全重複座標があります。', {
                firstPath: existing.path,
                firstEntryId: existing.entryId,
                secondEntryId: entry.id
              })
            );
          } else {
            entryCoordinateOwners.set(coordinateKey, { path: rectPath, entryId: entry.id });
          }
        }
      });
    }

    if (entry.polygons !== undefined) {
      if (!Array.isArray(entry.polygons)) {
        errors.push(createIssue('invalid-polygons', `${path}.polygons`, 'polygonsは配列である必要があります。'));
      } else {
        entry.polygons.forEach((polygon, polygonIndex) => {
          const polygonPath = `${path}.polygons[${polygonIndex}]`;
          if (!Array.isArray(polygon) || polygon.length < 3) {
            errors.push(createIssue('invalid-polygon', polygonPath, 'polygonには3点以上が必要です。'));
            return;
          }

          const distinctPoints = new Set();
          polygon.forEach((point, pointIndex) => {
            const pointPath = `${polygonPath}[${pointIndex}]`;
            if (!isRecord(point)) {
              errors.push(createIssue('invalid-polygon-point', pointPath, 'polygonの点はオブジェクトである必要があります。'));
              return;
            }

            const xValid = validateRatio(point.xRatio, `${pointPath}.xRatio`, errors);
            const yValid = validateRatio(point.yRatio, `${pointPath}.yRatio`, errors);
            if (xValid && yValid) {
              distinctPoints.add(`${point.xRatio}|${point.yRatio}`);
            }
          });

          if (distinctPoints.size < 3) {
            errors.push(createIssue('degenerate-polygon', polygonPath, 'polygonには異なる3点以上が必要です。'));
          }
        });
      }
    }
  });

  facilityRings.forEach((ring, ringIndex) => {
    const path = `facilityRings[${ringIndex}]`;
    if (!isRecord(ring)) {
      errors.push(createIssue('invalid-facility-ring', path, '施設リングはオブジェクトである必要があります。'));
      return;
    }

    registerId(ring.id, `${path}.id`, 'facilityRings');

    if (!KNOWN_FLOOR_IDS.has(ring.floorId)) {
      errors.push(
        createIssue('unknown-floor', `${path}.floorId`, `存在しない階「${String(ring.floorId)}」です。`)
      );
    }

    if (!KNOWN_FACILITY_KEYS.has(ring.facilityKey)) {
      errors.push(
        createIssue(
          'unknown-facility',
          `${path}.facilityKey`,
          `未知の施設種別「${String(ring.facilityKey)}」です。`
        )
      );
    }

    const xValid = validateRatio(ring.xRatio, `${path}.xRatio`, errors);
    const yValid = validateRatio(ring.yRatio, `${path}.yRatio`, errors);
    if (xValid && yValid) {
      const coordinateKey = [ring.floorId, ring.facilityKey, ring.xRatio, ring.yRatio].join('|');
      const existing = ringCoordinateOwners.get(coordinateKey);
      if (existing) {
        errors.push(
          createIssue('duplicate-ring-coordinate', path, '施設リングの完全重複座標があります。', {
            firstPath: existing.path,
            firstRingId: existing.ringId,
            secondRingId: ring.id
          })
        );
      } else {
        ringCoordinateOwners.set(coordinateKey, { path, ringId: ring.id });
      }
    }

    if (ring.facilityKey === 'toilet' && ring.colorVariant === 'white') {
      legacyWhiteRings.push(ring.id);
    } else {
      const allowedColors = ring.facilityKey === 'toilet' ? TOILET_COLOR_VARIANTS : DEFAULT_COLOR_VARIANTS;
      if (!allowedColors.has(ring.colorVariant)) {
        errors.push(
          createIssue(
            'unknown-color-variant',
            `${path}.colorVariant`,
            `施設種別「${String(ring.facilityKey)}」では色名「${String(ring.colorVariant)}」を使用できません。`
          )
        );
      }
    }
  });

  sameFloorLabelOwners.forEach((owners) => {
    if (owners.length < 2) {
      return;
    }

    stats.sameFloorLabelGroups += 1;
    const hasDistinctHints = ['locationHint', 'locationHintEn'].every((key) => {
      const hints = owners.map((owner) => typeof owner[key] === 'string' ? normalizeSearchValue(owner[key]) : '');
      return hints.every(Boolean) && new Set(hints).size === owners.length;
    });
    if (hasDistinctHints) {
      return;
    }
    warnings.push(
      createIssue(
        'same-floor-label',
        `entries[${owners[0].index}].label`,
        `同一階・同一ラベル「${owners[0].label}」が${owners.length}件あり、場所の補足で区別できません。`,
        { ids: owners.map((owner) => owner.id) }
      )
    );
  });

  if (legacyWhiteRings.length > 0) {
    stats.legacyWhiteRings = legacyWhiteRings.length;
    warnings.push(
      createIssue(
        'legacy-color-white',
        'facilityRings',
        `旧形式の色名「white」が${legacyWhiteRings.length}件あります（閲覧時はyellowへ正規化されます）。`,
        { ids: legacyWhiteRings }
      )
    );
  }

  collectHashRouteErrors(entries, errors);
  return { errors, warnings, stats };
}
