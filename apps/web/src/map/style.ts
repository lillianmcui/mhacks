import type { StyleSpecification } from 'maplibre-gl';
import { config } from '../config';

const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0d1117' } }],
};

// Keyless satellite imagery: well pads and pipelines are visible, which suits the demo.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0d1117' } },
    { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-brightness-max': 0.75, 'raster-saturation': -0.3 } },
  ],
};

export function mapStyle(): string | StyleSpecification {
  if (config.mapOffline) return OFFLINE_STYLE;
  return config.mapStyleUrl || SATELLITE_STYLE;
}
