// Wiring for the Track C implementations of §3.8. The backend never edits
// those folders; it only imports them if they exist.
//
//   src/briefing/index.ts        -> renderTemplateBriefing  (else: stand-in)
//   src/adapters/grok/index.ts   -> grokBriefing            (else: TEMPLATE only)
//   src/adapters/relay/index.ts  -> relaySend               (else: UPSTREAM_UNAVAILABLE)
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GrokBriefing, RelaySend, RenderTemplateBriefing } from '@ch4se/contracts';
import { standinTemplateBriefing } from './standins/briefing.ts';

export interface Ports {
  renderTemplateBriefing: RenderTemplateBriefing;
  /** null: Grok disabled or not implemented yet; briefings come from the template. */
  grokBriefing: GrokBriefing | null;
  /** null: Relay disabled or not implemented yet; notify_operator is UPSTREAM_UNAVAILABLE. */
  relaySend: RelaySend | null;
  /** Human-readable wiring summary for /health and the startup log. */
  describe: { template: string; grok: string; relay: string };
}

export async function importIfPresent<T>(
  relativePath: string,
  exportName: string,
  base: string = import.meta.url
): Promise<{ value: T | null; note: string }> {
  const url = new URL(relativePath, base);
  if (!existsSync(fileURLToPath(url))) return { value: null, note: 'not implemented yet' };
  try {
    const module = (await import(url.href)) as Record<string, unknown>;
    if (typeof module[exportName] !== 'function') {
      return { value: null, note: `${relativePath} has no export named ${exportName}` };
    }
    return { value: module[exportName] as T, note: 'loaded' };
  } catch (error) {
    return { value: null, note: `failed to load: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function loadPorts(flags: { grokEnabled: boolean; relayEnabled: boolean }): Promise<Ports> {
  const template = await importIfPresent<RenderTemplateBriefing>('./briefing/index.ts', 'renderTemplateBriefing');
  const grok = flags.grokEnabled
    ? await importIfPresent<GrokBriefing>('./adapters/grok/index.ts', 'grokBriefing')
    : { value: null, note: 'disabled (GROK_ENABLED=false)' };
  const relay = flags.relayEnabled
    ? await importIfPresent<RelaySend>('./adapters/relay/index.ts', 'relaySend')
    : { value: null, note: 'disabled (RELAY_ENABLED=false)' };
  return {
    renderTemplateBriefing: template.value ?? standinTemplateBriefing,
    grokBriefing: grok.value,
    relaySend: relay.value,
    describe: {
      template: template.value ? 'track-c' : `backend stand-in (${template.note})`,
      grok: grok.value ? 'track-c' : grok.note,
      relay: relay.value ? 'track-c' : relay.note,
    },
  };
}
