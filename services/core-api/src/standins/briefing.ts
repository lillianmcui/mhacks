// Backend stand-in for Track C's services/core-api/src/briefing/, used ONLY
// while that folder does not exist. Deliberately plain: it strings together
// the display values from BriefingInput and formats nothing itself.
import type { RenderTemplateBriefing } from '@ch4se/contracts';

export const standinTemplateBriefing: RenderTemplateBriefing = (input, kind) => {
  const { display, incident, policy_rule } = input;
  const head = `CH4SE ${incident.priority} methane incident ${incident.incident_id}.`;
  const core = `${display.asset}. Emission estimate: ${display.emission}. ${display.provenance}.`;
  const replay = 'This is a replayed historical observation.';
  if (kind === 'sms') return `${head} ${core} ${replay} Reply to acknowledge.`;
  const lines = [
    head,
    core,
    `Observation history: ${display.history}; ${display.previous_incidents}.`,
    display.wind ? `Wind: ${display.wind}.` : null,
    `Policy rule ${policy_rule.rule_id} routes this to ${policy_rule.notify_role}.`,
    incident.match_result === 'MATCHED' ? null : 'The asset match is uncertain; verify on site before acting.',
    replay,
  ];
  return lines.filter(line => line !== null).join(kind === 'summary' ? ' ' : '\n');
};
