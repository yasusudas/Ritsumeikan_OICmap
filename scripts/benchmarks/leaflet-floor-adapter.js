// Prototype renderer only. Existing Dev gesture, zoom, selection and overlay state
// drive the public Leaflet API; Leaflet manages PNG tiles and viewport culling.
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './leaflet-floor-adapter.css';

let map, container, layer, floorUrl, lastSnapshot;
const counts = { requested: 0, loaded: 0, errors: [] };
function info() {
  return { ready: Boolean(layer && !layer.isLoading() && container.querySelector('.leaflet-tile-loaded')),
    loading: Boolean(layer?.isLoading()), loadedTiles: container?.querySelectorAll('.leaflet-tile-loaded').length ?? 0,
    totalTiles: container?.querySelectorAll('.leaflet-tile').length ?? 0,
    zoom: map?.getZoom(), floorUrl, requested: counts.requested, loaded: counts.loaded, errors: [...counts.errors] };
}
function draw(canvas, viewer) {
  const context = canvas.getContext('2d'), origin = viewer.getBoundingClientRect();
  const groups = [...container.querySelectorAll('.leaflet-tile-container')].sort((a,b) => Number(a.style.zIndex)-Number(b.style.zIndex));
  for (const group of groups) for (const image of group.querySelectorAll('img.leaflet-tile-loaded')) {
    if (!image.complete || !image.naturalWidth) continue;
    const rect = image.getBoundingClientRect();
    context.drawImage(image, rect.left-origin.left, rect.top-origin.top, rect.width, rect.height);
  }
}
window.__leafletBenchmark = { info, draw, get snapshot() { return lastSnapshot; } };

export function renderLeafletFloor(snapshot) {
  if (!snapshot.width || !snapshot.height || !snapshot.url) return;
  const viewer = document.querySelector('#viewer');
  if (!map) {
    viewer.classList.add('leaflet-floor');
    container = document.createElement('div');
    container.className = 'leaflet-floor-map';
    container.setAttribute('aria-hidden', 'true');
    viewer.prepend(container);
    map = L.map(container, { crs: L.CRS.Simple, zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, zoomSnap: 0, minZoom: -8, maxZoom: 8,
      zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
  }
  const width = viewer.clientWidth, height = viewer.clientHeight;
  if (map.getSize().x !== width || map.getSize().y !== height) map.invalidateSize({ animate: false, pan: false });
  const scale = snapshot.width / 1024, worldHeight = 1024 * snapshot.height / snapshot.width;
  const center = [-(height/2-snapshot.y)/scale, (width/2-snapshot.x)/scale];
  const zoom = Math.log2(scale);
  if (floorUrl !== snapshot.url) {
    if (layer) map.removeLayer(layer);
    floorUrl = snapshot.url;
    const filename = new URL(floorUrl, location.href).pathname.split('/').at(-1);
    layer = L.tileLayer(`${location.origin}/tiles/${filename}/{z}/{x}/{y}.png`, {
      tileSize: 256, minZoom: -8, maxZoom: 8, minNativeZoom: 0, maxNativeZoom: 4,
      bounds: [[-worldHeight,0],[0,1024]], noWrap: true, keepBuffer: 1,
      updateWhenIdle: false, updateWhenZooming: true, updateInterval: 0,
    });
    layer.on('tileloadstart', () => counts.requested++);
    layer.on('tileload', () => counts.loaded++);
    layer.on('tileerror', event => counts.errors.push(event.tile.src));
    map.setView(center, zoom, { animate: false });
    layer.addTo(map);
  } else map.setView(center, zoom, { animate: false });
  lastSnapshot = { ...snapshot, center, leafletZoom: zoom, viewerWidth: width, viewerHeight: height };
}
