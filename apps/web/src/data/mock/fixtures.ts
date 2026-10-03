import type { Asset, Contact, MethaneEvent, ProviderSource } from '@ch4se/contracts';

/**
 * PLACEHOLDER mock data, shaped like the contracts. Only the plume_id is real
 * (from the track docs); every other value is invented for layout work and
 * MUST be replaced by Track C's fixtures (data/fixtures/) at CP1. The operator
 * is fictional; never put a real OGIM operator name here.
 */

export const MOCK_OPERATOR = 'Basin Midstream Co.';

export const mockContacts: Contact[] = [
  { contact_id: 'C-001', name: 'Jordan Reyes', role: 'Site Manager', phone: '+1-555-0101', area_id: 'AREA-DB-N' },
  { contact_id: 'C-002', name: 'Priya Natarajan', role: 'Area Supervisor', phone: '+1-555-0102', area_id: 'AREA-DB-N' },
  { contact_id: 'C-003', name: 'Sam Okafor', role: 'Environmental Lead', phone: '+1-555-0103', area_id: 'AREA-DB-S' },
];

export const mockAssets: Asset[] = [
  { asset_id: 'TX-184', facility_type: 'Compressor station', latitude: 31.8027, longitude: -103.7461, operator_name: MOCK_OPERATOR, site_manager_contact_id: 'C-001', area_id: 'AREA-DB-N', policy_id: 'POL-1' },
  { asset_id: 'TX-185', facility_type: 'Well pad', latitude: 31.8212, longitude: -103.7105, operator_name: MOCK_OPERATOR, site_manager_contact_id: 'C-001', area_id: 'AREA-DB-N', policy_id: 'POL-1' },
  { asset_id: 'TX-201', facility_type: 'Tank battery', latitude: 31.7640, longitude: -103.7902, operator_name: MOCK_OPERATOR, site_manager_contact_id: 'C-002', area_id: 'AREA-DB-N', policy_id: 'POL-1' },
  { asset_id: 'TX-233', facility_type: 'Gathering pipeline segment', latitude: 31.6205, longitude: -103.9550, operator_name: MOCK_OPERATOR, site_manager_contact_id: 'C-003', area_id: 'AREA-DB-S', policy_id: 'POL-1' },
  { asset_id: 'TX-240', facility_type: 'Processing plant', latitude: 31.9310, longitude: -103.5820, operator_name: MOCK_OPERATOR, site_manager_contact_id: 'C-002', area_id: 'AREA-DB-N', policy_id: 'POL-1' },
];

export const mockProviderSource: ProviderSource = {
  source_name: 'MOCK-SOURCE-0001',
  persistence: 0.5,
  emission_auto: 950,
  emission_uncertainty_auto: 310,
  observation_dates: ['2026-05-02', '2026-06-11', '2026-07-09', '2026-08-13'],
  detection_dates: ['2026-06-11', '2026-08-13'],
  explanation: null,
};

export function mockEvent(ingested_at: string): MethaneEvent {
  return {
    event_id: 'EVT-MOCK-1',
    plume_id: 'tan20260813t190401c96s4001-B',
    scene_id: 'MOCK-SCENE-1',
    scene_timestamp: '2026-08-13T19:04:01Z',
    plume_latitude: 31.8012,
    plume_longitude: -103.7461,
    instrument: 'tan',
    ipcc_sector: '1B2 Oil & Natural Gas',
    emission_auto: 1080,
    emission_uncertainty_auto: 340,
    wind_speed_avg_auto: 3.4,
    wind_direction_avg_auto: 215,
    wind_source_auto: 'HRRR',
    plume_quality: 'good',
    plume_png: '',
    plume_bounds: null,
    source_name: mockProviderSource.source_name,
    provider: 'Carbon Mapper',
    is_replay: true,
    ingested_at,
  };
}

export const MOCK_MATCH = { asset_id: 'TX-184', distance_m: 167 };
