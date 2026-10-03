import { describe, expect, it } from "vitest";
import { assertNumbersGroundedInInput } from "./numberCheck.js";

describe("assertNumbersGroundedInInput", () => {
  const input = {
    display: { emission_with_uncertainty: "120 ± 40 kg CH4/hr" },
    asset_id: "TX-184",
  };

  it("passes when output numbers appear in input JSON", () => {
    expect(() =>
      assertNumbersGroundedInInput(
        "Release estimate 120 ± 40 kg CH4/hr for asset TX-184.",
        input,
      ),
    ).not.toThrow();
  });

  it("throws when output introduces a new number", () => {
    expect(() =>
      assertNumbersGroundedInInput("Estimated 999 kg CH4/hr.", input),
    ).toThrow(/number-check failed/);
  });
});
