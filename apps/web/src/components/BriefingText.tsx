import type { ReactNode } from 'react';

/**
 * Renders briefing text (Grok or template) as clean, scannable lines.
 * Grok sometimes answers in markdown or echoes JSON paths like `display.emission`,
 * so those are stripped or turned back into words before display.
 */

const FIELD_PATH = /\b(?:display|incident|event|asset|policy_rule|history|assigned_contact|briefing)\.([a-z_]+(?:\.[a-z_]+)*)\b/g;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
// "Release: ..." -> bold "Release". Short, word-only labels so sentences with colons aren't split.
const LABEL = /^([A-Za-z][A-Za-z /-]{0,20}):\s+(.+)$/;

function clean(line: string): string {
  return line
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*>\s?/, '')
    .replace(FIELD_PATH, (_m, path: string) => path.split('.').pop()!.replace(/_/g, ' '))
    .replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|$|[.,;:])/g, '$1$2')
    .trimEnd();
}

function labelled(text: string): ReactNode {
  const m = LABEL.exec(text);
  if (!m) return text;
  return (
    <>
      <span className="briefing__label">{m[1]}</span> {m[2]}
    </>
  );
}

type Block = { kind: 'line'; text: string } | { kind: 'list'; items: string[] } | { kind: 'gap' };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = clean(raw);
    if (!line.trim()) {
      if (blocks.length && blocks[blocks.length - 1].kind !== 'gap') blocks.push({ kind: 'gap' });
      continue;
    }
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '');
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'list') last.items.push(item);
      else blocks.push({ kind: 'list', items: [item] });
      continue;
    }
    blocks.push({ kind: 'line', text: line.trim() });
  }
  while (blocks[blocks.length - 1]?.kind === 'gap') blocks.pop();
  return blocks;
}

export function BriefingText({ text }: { text: string }) {
  return (
    <div className="briefing">
      {toBlocks(text).map((b, i) => {
        if (b.kind === 'gap') return <div key={i} className="briefing__gap" />;
        if (b.kind === 'list')
          return (
            <ul key={i} className="briefing__list">
              {b.items.map((item, j) => (
                <li key={j}>{labelled(item)}</li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="briefing__line">
            {labelled(b.text)}
          </p>
        );
      })}
    </div>
  );
}
