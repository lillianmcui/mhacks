import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTemplateBriefing } from "./template.ts";
import type { BriefingInput } from "./types.ts";

function sample(overrides: Partial<BriefingInput> = {}): BriefingInput {
  const base: BriefingInput = {
    incident: {
      incident_id: "inc-1",
      status: "ANALYZED",
      priority: "HIGH",
      match_result: "MATCHED",
      distance_m: 42,
      candidates: [{ asset_id: "TX-184", distance_m: 42 }],
    },
    event: {
      event_id: "EVT-1",
      plume_id: "plume-1",
      scene_id: "scene-1",
      scene_timestamp: "2026-08-13T19:04:01Z",
      plume_latitude: 31.85,
      plume_longitude: -103.45,
      instrument: "tan",
      ipcc_sector: "1B2",
      emission_auto: 120,
      emission_uncertainty_auto: 40,
      wind_speed_avg_auto: null,
      wind_direction_avg_auto: null,
      wind_source_auto: null,
      plume_quality: "good",
      plume_png: "plume.png",
      source_name: "src-1",
      provider: "Carbon Mapper",
      is_replay: true,
      ingested_at: "2026-10-03T00:00:00Z",
    },
    asset: {
      asset_id: "TX-184",
      facility_type: "compressor_station",
      operator_name: "Basin Midstream Co.",
      area_id: "permian-north",
    },
    assigned_contact: { name: "Ops Lead", role: "site_manager" },
    policy_rule: {
      policy_id: "policy-default",
      rule_id: "high-emission",
      priority: "HIGH",
      notify_role: "site_manager",
    },
    history: { source: null, previous_incident_count: 0 },
    display: {
      emission: "120 ± 40 kg CH4/hr (Carbon Mapper estimate)",
      provenance: "Carbon Mapper · Tanager · 2026-08-13 19:04 UTC",
      scene_timestamp: "2026-08-13 19:04 UTC",
      asset: "Associated asset: TX-184 compressor_station (42 m from plume origin)",
      distance: "42 m from plume origin",
      history: "no provider observation history available",
      persistence: null,
      wind: null,
      previous_incidents: "0 previous CH4SE incidents",
      replay_notice: "This is a replayed historical observation.",
      attribution: "Data: Carbon Mapper",
    },
  };
  return { ...base, ...overrides };
}

test("quotes display strings and associated asset wording", () => {
  const text = renderTemplateBriefing(sample(), "operator");
  assert.match(text, /replayed historical observation/);
  assert.match(text, /Associated asset: TX-184/);
  assert.ok(text.includes("120 ± 40 kg CH4/hr (Carbon Mapper estimate)"));
  assert.equal(text.includes("caused by"), false);
});

test("sms includes priority and emission display", () => {
  const text = renderTemplateBriefing(sample(), "sms");
  assert.match(text, /CH4SE HIGH/);
  assert.match(text, /120 ± 40/);
});

test("states uncertain match when not MATCHED", () => {
  const text = renderTemplateBriefing(
    sample({
      incident: {
        incident_id: "inc-1",
        status: "ANALYZED",
        priority: "HIGH",
        match_result: "AMBIGUOUS",
        distance_m: 40,
        candidates: [
          { asset_id: "TX-184", distance_m: 40 },
          { asset_id: "TX-185", distance_m: 90 },
        ],
      },
      display: {
        ...sample().display,
        asset: "Nearest registered asset: TX-184 compressor_station (40 m from plume origin)",
      },
    }),
    "summary",
  );
  assert.match(text, /asset match is uncertain/i);
  assert.match(text, /Nearest registered asset/);
});
