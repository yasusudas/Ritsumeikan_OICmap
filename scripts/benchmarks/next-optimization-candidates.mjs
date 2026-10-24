// Isolated prototypes on the published Version3.1; not adopted app changes.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
export function candidateSource(source, file, candidate) {
  let code = source;
  function change(before, after) {
    assert.equal(code.split(before).length - 1, 1, `${candidate}: ${file}: ${before}`);
    code = code.replace(before, after);
  }
  if (candidate === 'ui-cache') {
    if (file === 'src/main.js') {
      change('    statusElement.textContent = message;', '    if (statusElement.textContent !== message) statusElement.textContent = message;');
    }
    if (file === 'src/food-guide-viewer.js') {
      change(`    const points = this.places.map((place) => ({
      id: place.entryId,
      order: place.order,
      x: map.x + map.width * place.anchor[displayLang].xRatio,
      y: map.y + map.height * place.anchor[displayLang].yRatio,
    }));
    this.layout = placeFoodMarkers(points, map.width, this.sizeReferenceId);`, `    const key = displayLang + '|' + map.width + '|' + map.height + '|' + this.sizeReferenceId;
    if (this.localLayoutKey !== key || this.localLayoutPlaces !== this.places) {
      const points = this.places.map(place => ({
        id: place.entryId, order: place.order,
        x: map.width * place.anchor[displayLang].xRatio,
        y: map.height * place.anchor[displayLang].yRatio,
      }));
      this.localLayout = placeFoodMarkers(points, map.width, this.sizeReferenceId);
      this.localLayoutKey = key;
      this.localLayoutPlaces = this.places;
    }
    this.layout = { ...this.localLayout, markers: this.localLayout.markers.map(marker => ({
      ...marker, x: marker.x + map.x, y: marker.y + map.y,
    })) };
    const hoveredPins = new Set(this.hoverPins());`);
      change(`        setAttribute(
          button,
          'aria-label',
          t('food.pin', {
            name: local(place.name),
            building: local(place.building),
          }),
        );`, `        if (drawn.labelPlace !== place || drawn.labelLanguage !== getLang()) {
          setAttribute(button, 'aria-label', t('food.pin', {
            name: local(place.name), building: local(place.building),
          }));
          drawn.labelPlace = place;
          drawn.labelLanguage = getLang();
        }`);
      change("      button.classList.toggle('is-hovered', this.hoverPins().includes(marker.id));", "      button.classList.toggle('is-hovered', hoveredPins.has(marker.id));");
    }
  } else if (candidate === 'geometry-cache') {
    if (file === 'src/main.js') {
      // Keep every input and every clamp. Cache only geometry reads within a frame.
      const reads = code.split('viewer.getBoundingClientRect()').length - 1;
      assert.ok(reads >= 3 && reads <= 10, reads);
      code = code.replaceAll('viewer.getBoundingClientRect()', 'getMapRectForFrame()');
      change(`  function getViewportSize() {
    return {
      width: viewer.clientWidth,
      height: viewer.clientHeight
    };
  }`, `  function frameMapMeasurements() {
    if (!viewer.__frameMapMeasurements) {
      const value = {};
      viewer.__frameMapMeasurements = value;
      window.requestAnimationFrame(() => {
        if (viewer.__frameMapMeasurements === value) delete viewer.__frameMapMeasurements;
      });
    }
    return viewer.__frameMapMeasurements;
  }

  function invalidateMapMeasurements() {
    delete viewer.__frameMapMeasurements;
  }

  function getMapRectForFrame() {
    const value = frameMapMeasurements();
    return value.rect ?? (value.rect = viewer.getBoundingClientRect());
  }

  function getViewportSize() {
    const value = frameMapMeasurements();
    return value.size ?? (value.size = { width: viewer.clientWidth, height: viewer.clientHeight });
  }

  window.addEventListener('resize', invalidateMapMeasurements);
  window.addEventListener('scroll', invalidateMapMeasurements, { capture: true, passive: true });
  window.visualViewport?.addEventListener('resize', invalidateMapMeasurements);
  window.visualViewport?.addEventListener('scroll', invalidateMapMeasurements);`);
    }
  } else if (candidate === 'adaptive-raster') {
    if (file === 'src/main.js') {
      change(`    if (defer && state.zoom !== state.lastFlushedZoom) {
      state.zoomFramesSinceRaster += 1;
      defer = state.zoomFramesSinceRaster < ZOOM_RASTER_EVERY_FRAMES;
    }`, `    if (defer && state.zoom !== state.lastFlushedZoom) {
      const scale = state.zoom / state.renderedZoom;
      const stretch = Math.max(scale, 1 / scale);
      const elapsed = performance.now() - (state.adaptiveRasterAt ?? -Infinity);
      // Bound blur by 1.21x and refresh continuing fine gestures after 80ms.
      defer = stretch < 1.21 - 1e-9 && elapsed < 80;
    }`);
      change('      state.renderedZoom = state.zoom;', '      state.renderedZoom = state.zoom;\n      state.adaptiveRasterAt = performance.now();');
    }
  } else if (candidate === 'hybrid') {
    if (file === 'src/main.js') {
      change(`  function recordMapInput() {
    if (isEditorSite) return;`, `  function recordMapInput() {
    if (isEditorSite) return;
    noteHybridInput();`);
      change('    const percent = Math.round(state.zoom * 100);', `    if (!isEditorSite) renderHybridMap({ x: state.x, y: state.y,
      width: state.baseWidth * state.zoom, height: state.baseHeight * state.zoom,
      url: getFloorSvgUrl(getRenderedFloorDefinition()) });
    const percent = Math.round(state.zoom * 100);`);
      code = `import { noteHybridInput, renderHybridMap } from ${JSON.stringify(fileURLToPath(new URL('./hybrid-map-adapter.js', import.meta.url)))};\n` + code;
    }
  } else throw new Error(`Unimplemented prototype ${candidate}`);
  return code;
}
