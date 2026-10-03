/** Mirror of packages/contracts BriefingInput — backend should canonicalize in contracts. */

export type BriefingKind = "operator" | "sms" | "summary";

export type MatchResult = "MATCHED" | "AMBIGUOUS" | "NO_REGISTERED_ASSET";

export interface BriefingInput {
  incident_id: string;
  match_result: MatchResult;
  asset_id?: string;
  facility_type?: string;
  operator_name?: string;
  is_replay: boolean;
  /** Preformatted display strings from packages/contracts/format.ts — quote verbatim only. */
  display: {
    emission?: string;
    uncertainty?: string;
    emission_with_uncertainty?: string;
    scene_timestamp?: string;
    persistence?: string;
    wind?: string;
    plume_quality?: string;
    history?: string;
    priority?: string;
    policy_action?: string;
    distance?: string;
    candidates?: string;
  };
  /** True when relative uncertainty is wide or match is not MATCHED. */
  evidence_caveats?: string[];
}
