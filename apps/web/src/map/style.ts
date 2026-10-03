import type { StyleSpecification } from 'maplibre-gl';
import { config } from '../config';

const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0d1117' } }],
};

const RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`),
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0d1117' } },
    { id: 'basemap', type: 'raster', source: 'basemap' },
  ],
};

export function mapStyle(): string | StyleSpecification {
  if (config.mapOffline) return OFFLINE_STYLE;
  return config.mapStyleUrl || RASTER_STYLE;
}
