import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTemplateBriefing } from "./template.ts";
import type { BriefingInput } from "./types.ts";

const matched: BriefingInput = {
  incident_id: "inc-1",
  match_result: "MATCHED",
  asset_id: "TX-184",
  facility_type: "compressor_station",
  operator_name: "Basin Midstream Co.",
  is_replay: true,
  display: {
    emission_with_uncertainty: "STUB ± STUB kg CH4/hr (Carbon Mapper estimate)",
    scene_timestamp: "2026-08-13T19:04:01Z",
    priority: "HIGH",
    policy_action: "Notify site_manager per high-emission.",
    persistence: "detected on 3 of 5 observation dates since 2024-01-01",
  },
};

test("quotes display strings and says associated asset + replay", () => {
  const text = renderTemplateBriefing(matched, "operator");
  assert.match(text, /replayed historical observation/);
  assert.match(text, /associated asset TX-184/);
  assert.ok(text.includes(matched.display.emission_with_uncertainty!));
  assert.ok(text.includes(matched.display.scene_timestamp!));
  assert.equal(text.includes("caused by"), false);
});

test("sms includes priority display and asset", () => {
  const text = renderTemplateBriefing(matched, "sms");
  assert.match(text, /TX-184/);
  assert.match(text, /Priority: HIGH/);
});

test("states AMBIGUOUS explicitly", () => {
  const text = renderTemplateBriefing(
    {
      ...matched,
      match_result: "AMBIGUOUS",
      asset_id: undefined,
      display: {
        ...matched.display,
        candidates: "Candidates: TX-184 (40 m), TX-185 (90 m).",
      },
    },
    "summary",
  );
  assert.match(text, /match not confirmed/);
  assert.match(text, /Candidates: TX-184/);
});

test("states NO_REGISTERED_ASSET explicitly", () => {
  const text = renderTemplateBriefing(
    { ...matched, match_result: "NO_REGISTERED_ASSET", asset_id: undefined },
    "operator",
  );
  assert.match(text, /No registered asset/);
});
