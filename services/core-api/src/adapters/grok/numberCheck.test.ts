import assert from "node:assert/strict";
import { test } from "node:test";
import { assertNumbersGroundedInInput, extractNumbers } from "./numberCheck.ts";

test("extractNumbers normalizes decimals and integers", () => {
  assert.deepEqual(extractNumbers("120 ± 40.5 kg"), ["120", "40.5"]);
});

test("passes when output numbers appear in input JSON", () => {
  const input = {
    display: { emission_with_uncertainty: "120 ± 40 kg CH4/hr" },
    asset_id: "TX-184",
  };
  assert.doesNotThrow(() =>
    assertNumbersGroundedInInput(
      "Release estimate 120 ± 40 kg CH4/hr for asset TX-184.",
      input,
    ),
  );
});

test("throws when output introduces a new number", () => {
  const input = {
    display: { emission_with_uncertainty: "120 ± 40 kg CH4/hr" },
    asset_id: "TX-184",
  };
  assert.throws(
    () => assertNumbersGroundedInInput("Estimated 999 kg CH4/hr.", input),
    /number-check failed/,
  );
});

test("allows empty numeric output", () => {
  assert.doesNotThrow(() =>
    assertNumbersGroundedInInput("No numeric estimate available.", { note: "none" }),
  );
});
