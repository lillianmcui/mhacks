// Reads Track C's fixtures (data/fixtures/) into contract shapes. Values pass
// through untouched: no rounding, no defaults for numbers, no hand-typed
// fallbacks. A missing or mistyped required field is an error, not a guess.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROVIDER_CARBON_MAPPER, type ProviderSource } from '@ch4se/contracts';
import { eventIdFor, type CompanyFixtures, type EventFixtures } from './ingest.ts';

export class FixtureError extends Error {
  override name = 'FixtureError';
}

type Json = Record<string, unknown>;

function readJson(path: string): unknown {
  if (!existsSync(path)) throw new FixtureError(`fixture not found: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new FixtureError(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Accepts `[...]` or `{ "<key>": [...] }`. */
function readArray(path: string, key: string): Json[] {
  const data = readJson(path);
  const rows = Array.isArray(data) ? data : isObject(data) ? data[key] : undefined;
  if (!Array.isArray(rows) || !rows.every(isObject)) {
    throw new FixtureError(`${path} must be an array of objects (or { "${key}": [...] })`);
  }
  return rows;
}

class Reader {
  readonly problems: string[] = [];
  private readonly row: Json;
  private readonly where: string;

  constructor(row: Json, where: string) {
    this.row = row;
    this.where = where;
  }

  private first(keys: string[]): unknown {
    for (const key of keys) {
      const value = this.row[key];
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  string(...keys: string[]): string {
    const value = this.first(keys);
    if (typeof value === 'string' && value !== '') return value;
    this.problems.push(`${this.where}: ${keys.join(' / ')} must be a non-empty string`);
    return '';
  }

  number(...keys: string[]): number {
    const value = this.first(keys);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    this.problems.push(`${this.where}: ${keys.join(' / ')} must be a number`);
    return Number.NaN;
  }

  optionalString(...keys: string[]): string | null {
    const value = this.first(keys);
    if (value === undefined) return null;
    if (typeof value === 'string') return value;
    this.problems.push(`${this.where}: ${keys.join(' / ')} must be a string or null`);
    return null;
  }

  optionalNumber(...keys: string[]): number | null {
    const value = this.first(keys);
    if (value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    this.problems.push(`${this.where}: ${keys.join(' / ')} must be a number or null`);
    return null;
  }

  strings(key: string): string[] {
    const value = this.row[key];
    if (value === undefined || value === null) return [];
    if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value as string[];
    this.problems.push(`${this.where}: ${key} must be an array of strings`);
    return [];
  }
}

function check(problems: string[]): void {
  if (problems.length > 0) throw new FixtureError(`invalid fixtures:\n- ${problems.join('\n- ')}`);
}

/** `<dir>/company/{assets,contacts,policies}.json` */
export function loadCompanyFixtures(fixturesDir: string): CompanyFixtures {
  const dir = join(fixturesDir, 'company');
  const problems: string[] = [];

  const assets = readArray(join(dir, 'assets.json'), 'assets').map((row, index) => {
    const r = new Reader(row, `assets[${index}]`);
    const asset = {
      asset_id: r.string('asset_id'),
      facility_type: r.string('facility_type'),
      latitude: r.number('latitude'),
      longitude: r.number('longitude'),
      operator_name: r.string('operator_name'),
      site_manager_contact_id: r.string('site_manager_contact_id'),
      area_id: r.string('area_id'),
      policy_id: r.string('policy_id'),
    };
    problems.push(...r.problems);
    return asset;
  });

  const contacts = readArray(join(dir, 'contacts.json'), 'contacts').map((row, index) => {
    const r = new Reader(row, `contacts[${index}]`);
    const contact = {
      contact_id: r.string('contact_id'),
      name: r.string('name'),
      role: r.string('role'),
      phone: r.string('phone'),
      area_id: r.string('area_id'),
    };
    problems.push(...r.problems);
    return contact;
  });

  // Policies are validated structurally by packages/rules (validatePolicy)
  // when they are seeded; here only the outer shape is checked.
  const policies = readArray(join(dir, 'policies.json'), 'policies').map((row, index) => {
    if (typeof row.policy_id !== 'string' || !isObject(row.thresholds) || !Array.isArray(row.rules)) {
      problems.push(`policies[${index}]: needs policy_id, thresholds{} and rules[]`);
    }
    return row as unknown as CompanyFixtures['policies'][number];
  });

  check(problems);
  return { assets, contacts, policies };
}

function pickPlume(data: unknown, path: string): Json {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length !== 1 || !isObject(rows[0])) {
    throw new FixtureError(`${path} must hold exactly one plume object (got ${rows.length})`);
  }
  return rows[0];
}

/** Scene timestamp for a plume: joined on scene_id, from the scene's `timestamp`. */
function sceneTimestamp(scenesPath: string, scene_id: string): string | undefined {
  if (!existsSync(scenesPath)) return undefined;
  const data = readJson(scenesPath);
  const features = isObject(data) && Array.isArray(data.features) ? data.features : [];
  for (const feature of features) {
    if (!isObject(feature)) continue;
    const properties = isObject(feature.properties) ? feature.properties : {};
    const ids = [feature.id, properties.id, properties.scene_id, properties.name];
    if (ids.includes(scene_id) && typeof properties.timestamp === 'string') return properties.timestamp;
  }
  return undefined;
}

/**
 * `<dir>/carbon_mapper/<name>/{plume.json,source.json,scenes.geojson}`.
 * Provider field names are Product Direction §5.3's; the only normalization is
 * the one the spec calls for: `datetime` (CSV) or the joined scene `timestamp`
 * become `scene_timestamp`.
 */
export function loadEventFixtures(fixturesDir: string, name = 'main'): EventFixtures {
  const dir = join(fixturesDir, 'carbon_mapper', name);
  const plumePath = join(dir, 'plume.json');
  const plume = pickPlume(readJson(plumePath), plumePath);
  const p = new Reader(plume, 'plume.json');

  const sourcePath = join(dir, 'source.json');
  let source: ProviderSource | null = null;
  const problems: string[] = [];
  if (existsSync(sourcePath)) {
    const raw = readJson(sourcePath);
    if (!isObject(raw)) throw new FixtureError(`${sourcePath} must be a JSON object`);
    const s = new Reader(raw, 'source.json');
    source = {
      source_name: s.string('source_name'),
      persistence: s.optionalNumber('persistence'),
      emission_auto: s.optionalNumber('emission_auto'),
      emission_uncertainty_auto: s.optionalNumber('emission_uncertainty_auto'),
      observation_dates: s.strings('observation_dates'),
      detection_dates: s.strings('detection_dates'),
      explanation: s.optionalString('explanation'),
    };
    problems.push(...s.problems);
  }

  const plume_id = p.string('plume_id');
  const scene_id = p.string('scene_id');
  const joined = sceneTimestamp(join(dir, 'scenes.geojson'), scene_id);
  if (joined !== undefined && plume.scene_timestamp === undefined && plume.datetime === undefined) {
    plume.scene_timestamp = joined;
  }
  const event = {
    event_id: eventIdFor(plume_id),
    plume_id,
    scene_id,
    scene_timestamp: p.string('scene_timestamp', 'datetime'),
    plume_latitude: p.number('plume_latitude'),
    plume_longitude: p.number('plume_longitude'),
    instrument: p.string('instrument'),
    ipcc_sector: p.optionalString('ipcc_sector'),
    emission_auto: p.number('emission_auto'),
    emission_uncertainty_auto: p.optionalNumber('emission_uncertainty_auto'),
    wind_speed_avg_auto: p.optionalNumber('wind_speed_avg_auto'),
    wind_direction_avg_auto: p.optionalNumber('wind_direction_avg_auto'),
    wind_source_auto: p.optionalString('wind_source_auto'),
    plume_quality: p.optionalString('plume_quality'),
    plume_png: p.optionalString('plume_png'),
    source_name: typeof plume.source_name === 'string' ? plume.source_name : (source?.source_name ?? p.string('source_name')),
    provider: PROVIDER_CARBON_MAPPER,
    is_replay: true,
  };
  problems.push(...p.problems);
  if (source && source.source_name !== event.source_name) {
    problems.push(`source.json source_name (${source.source_name}) does not match the plume's (${event.source_name})`);
  }
  check(problems);
  return { event, source };
}
