const env = import.meta.env;

export const config = {
  dataSource: (env.VITE_DATA_SOURCE ?? 'mock') as 'mock' | 'live',
  coreApi: (env.VITE_CORE_API ?? 'mock') as 'mock' | 'http',
  stdbUri: env.VITE_STDB_URI ?? 'ws://localhost:3000',
  stdbModule: env.VITE_STDB_MODULE ?? 'ch4se',
  coreApiUrl: env.VITE_CORE_API_URL ?? 'http://localhost:8787',
  coreApiToken: env.VITE_CORE_API_TOKEN ?? '',
  mapStyleUrl: env.VITE_MAP_STYLE_URL || '',
  mapOffline: env.VITE_MAP_OFFLINE === '1',
};

/** Permian Delaware Basin, [west, south, east, north]. */
export const DEMO_BBOX: [number, number, number, number] = [-104.5, 31.0, -103.0, 32.5];
