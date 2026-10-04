import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canTransition, INCIDENT_STATUSES } from './enums.ts';
import {
  formatAssociatedAsset,
  formatEmission,
  formatHistory,
  formatProvenance,
  formatStatusHeadline,
  formatTimestamp,
  formatWind,
} from './format.ts';

test('formatEmission rounds to whole kg/hr and names the provider', () => {
  assert.equal(formatEmission(1234.56, 321.4), '1235 ± 321 kg CH4/hr (Carbon Mapper estimate)');
});

test('formatEmission says so when uncertainty is missing', () => {
  assert.equal(formatEmission(900, null), '900 kg CH4/hr (Carbon Mapper estimate; uncertainty not reported)');
});

test('formatProvenance labels the instrument and normalizes the timestamp', () => {
  assert.equal(
    formatProvenance({ provider: 'Carbon Mapper', instrument: 'tan', scene_timestamp: '2026-08-13T19:04:01Z' }),
    'Carbon Mapper · Tanager · 2026-08-13 19:04 UTC'
  );
});

test('formatTimestamp leaves unparseable input alone', () => {
  assert.equal(formatTimestamp('not a date'), 'not a date');
});

test('formatHistory counts detections over observations since the first date', () => {
  assert.equal(
    formatHistory({
      observation_dates: ['2026-03-02', '2025-11-20', '2026-08-13'],
      detection_dates: ['2026-03-02', '2026-08-13'],
    }),
    'detected on 2 of 3 observation dates since 2025-11-20'
  );
  assert.equal(formatHistory(null), 'no provider observation history available');
});

test('formatAssociatedAsset never says "source"', () => {
  assert.equal(formatAssociatedAsset('TX-184', 'well', 183.6), 'Associated asset: TX-184 well (184 m from plume origin)');
});

test('formatWind is null without a wind speed', () => {
  assert.equal(formatWind({ wind_speed_avg_auto: null, wind_direction_avg_auto: 10, wind_source_auto: 'HRRR' }), null);
  assert.equal(
    formatWind({ wind_speed_avg_auto: 4.23, wind_direction_avg_auto: 215.4, wind_source_auto: 'HRRR' }),
    '4.2 m/s from 215° (HRRR)'
  );
});

test('formatStatusHeadline follows the dashboard mapping', () => {
  assert.equal(formatStatusHeadline('ALERT_SENT', 'CRITICAL'), 'CRITICAL — UNACKNOWLEDGED');
  assert.equal(formatStatusHeadline('INVESTIGATING', 'CRITICAL'), 'ACKNOWLEDGED — INVESTIGATION UNDERWAY');
});

test('state machine allows exactly the documented transitions', () => {
  const allowed = new Set([
    'DETECTED>ANALYZED',
    'ANALYZED>ALERT_SENT',
    'ANALYZED>ACKNOWLEDGED',
    'ALERT_SENT>ACKNOWLEDGED',
    'ACKNOWLEDGED>INVESTIGATING',
    'INVESTIGATING>RESOLVED',
  ]);
  for (const from of INCIDENT_STATUSES) {
    for (const to of INCIDENT_STATUSES) {
      assert.equal(canTransition(from, to), allowed.has(`${from}>${to}`), `${from} -> ${to}`);
    }
  }
});
