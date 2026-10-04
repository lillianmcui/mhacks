import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type ImageSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Asset, MethaneEvent } from '@ch4se/contracts';
import { DEMO_BBOX } from '../config';
import { circlePolygon, EMPTY_FC } from './geo';
import { mapStyle } from './style';

/** `plume_bounds` ([west, south, east, north]) is not in the backend contract yet; the P1 overlay stays off without it. */
type MapEvent = MethaneEvent & { plume_bounds?: [number, number, number, number] | null };

interface Props {
  assets: Asset[];
  events: MethaneEvent[];
  focusEvent?: MethaneEvent;
  highlightAssetId?: string | null;
  candidateAssetIds?: string[];
  radiusM: number;
}

const FOCUS_ZOOM = 15;
const FIT_PADDING = 40;

/**
 * Event map (TRACK_FRONTEND §2.1.2). Markers are HTML so no glyph/sprite server
 * is needed for labels (helps the offline demo laptop).
 */
export function EventMap({ assets, events, focusEvent, highlightAssetId, candidateAssetIds = [], radiusM }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const assetMarkers = useRef(new Map<string, maplibregl.Marker>());
  const plumeMarkers = useRef(new Map<string, maplibregl.Marker>());
  const flownTo = useRef<string | null>(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: mapStyle(),
      bounds: DEMO_BBOX,
      fitBoundsOptions: { padding: FIT_PADDING },
      attributionControl: { compact: false, customAttribution: 'Data: Carbon Mapper' },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('radius', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#ff5a36', 'fill-opacity': 0.12 } });
      map.addLayer({
        id: 'radius-line',
        type: 'line',
        source: 'radius',
        paint: { 'line-color': '#ff5a36', 'line-width': 2, 'line-dasharray': [2, 2] },
      });
      loadedRef.current = true;
      map.fire('ch4se:ready');
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      assetMarkers.current.clear();
      plumeMarkers.current.clear();
    };
  }, []);

  // Asset markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const a of assets) {
      seen.add(a.asset_id);
      let m = assetMarkers.current.get(a.asset_id);
      if (!m) {
        const el = document.createElement('div');
        el.innerHTML = `<span class="asset-marker__dot"></span><span class="asset-marker__label"></span>`;
        m = new maplibregl.Marker({ element: el }).setLngLat([a.longitude, a.latitude]).addTo(map);
        assetMarkers.current.set(a.asset_id, m);
      }
      const el = m.getElement();
      // Toggle classes only: MapLibre positions markers via its own classes on this element.
      el.classList.add('asset-marker');
      el.classList.toggle('asset-marker--highlight', a.asset_id === highlightAssetId);
      el.classList.toggle('asset-marker--candidate', candidateAssetIds.includes(a.asset_id));
      el.querySelector('.asset-marker__label')!.textContent = a.asset_id;
      el.title = `${a.asset_id} · ${a.facility_type}`;
      m.setLngLat([a.longitude, a.latitude]);
    }
    for (const [id, m] of assetMarkers.current) {
      if (!seen.has(id)) {
        m.remove();
        assetMarkers.current.delete(id);
      }
    }
  }, [assets, highlightAssetId, candidateAssetIds]);

  // Plume markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const e of events) {
      seen.add(e.event_id);
      let m = plumeMarkers.current.get(e.event_id);
      if (!m) {
        const el = document.createElement('div');
        el.innerHTML = `<span class="plume-marker__pulse"></span><span class="plume-marker__core"></span>`;
        m = new maplibregl.Marker({ element: el }).setLngLat([e.plume_longitude, e.plume_latitude]).addTo(map);
        plumeMarkers.current.set(e.event_id, m);
      }
      const el = m.getElement();
      el.classList.add('plume-marker');
      el.classList.toggle('plume-marker--focus', e.event_id === focusEvent?.event_id);
      el.title = e.plume_id;
    }
    for (const [id, m] of plumeMarkers.current) {
      if (!seen.has(id)) {
        m.remove();
        plumeMarkers.current.delete(id);
      }
    }
  }, [events, focusEvent?.event_id]);

  // Radius circle, plume_png overlay (P1), and fly-to on first appearance
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource('radius') as GeoJSONSource | undefined;
      src?.setData(
        focusEvent ? circlePolygon(focusEvent.plume_latitude, focusEvent.plume_longitude, radiusM) : EMPTY_FC,
      );
      syncPlumeImage(map, focusEvent);
      if (focusEvent && flownTo.current !== focusEvent.event_id) {
        flownTo.current = focusEvent.event_id;
        map.flyTo({ center: [focusEvent.plume_longitude, focusEvent.plume_latitude], zoom: FOCUS_ZOOM, essential: true });
      }
    };
    if (loadedRef.current) apply();
    else map.once('ch4se:ready', apply);
  }, [focusEvent, radiusM]);

  return <div ref={containerRef} className="map" />;
}

function syncPlumeImage(map: maplibregl.Map, ev: MapEvent | undefined) {
  const has = map.getSource('plume-png') as ImageSource | undefined;
  if (!ev?.plume_png || !ev.plume_bounds) {
    if (has) {
      map.removeLayer('plume-png');
      map.removeSource('plume-png');
    }
    return;
  }
  const [w, s, e, n] = ev.plume_bounds;
  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
  if (has) {
    has.updateImage({ url: ev.plume_png, coordinates });
  } else {
    map.addSource('plume-png', { type: 'image', url: ev.plume_png, coordinates });
    map.addLayer({ id: 'plume-png', type: 'raster', source: 'plume-png', paint: { 'raster-opacity': 0.85 } }, 'radius-fill');
  }
}
