import type { Dataset } from './types';

// Combines datasets parsed from different sources (e.g. ~/.claude and ~/.codex)
// into one report. Prompt ids are indexes into `prompts`, so the rows that
// point at a prompt are shifted by the number of prompts before them.
export function mergeDatasets(list: Dataset[]): Dataset {
  if (list.length === 1) return list[0];
  const out: Dataset = {
    sources: [],
    sourceName: list.map((d) => d.sourceName).join(' + '),
    generatedAt: Math.max(...list.map((d) => d.generatedAt)),
    projects: {},
    sessions: [],
    calls: [],
    tools: [],
    prompts: [],
    skills: [],
    commands: [],
    compactions: [],
    turns: [],
    denials: [],
    hooks: [],
    apiErrors: [],
    subagents: [],
    history: [],
    live: [],
    stats: null,
    limits: [],
    unknownModels: [],
    files: { transcripts: 0, subagents: 0, skipped: 0, badLines: 0 },
  };
  for (const d of list) {
    const offset = out.prompts.length;
    const shift = <T extends { prompt: number }>(x: T): T => (x.prompt >= 0 ? { ...x, prompt: x.prompt + offset } : x);
    for (const s of d.sources) if (!out.sources.includes(s)) out.sources.push(s);
    // The same directory has the same project key in both tools, so its rows end up in one project.
    for (const [k, label] of Object.entries(d.projects)) out.projects[k] ??= label;
    out.sessions.push(...d.sessions);
    out.calls.push(...d.calls.map(shift));
    out.tools.push(...d.tools.map(shift));
    out.prompts.push(...d.prompts.map((p) => ({ ...p, id: p.id + offset })));
    out.skills.push(...d.skills.map(shift));
    out.commands.push(...d.commands);
    out.compactions.push(...d.compactions);
    out.turns.push(...d.turns);
    out.denials.push(...d.denials);
    out.hooks.push(...d.hooks);
    out.apiErrors.push(...d.apiErrors);
    out.subagents.push(...d.subagents);
    out.history.push(...d.history);
    out.live.push(...d.live);
    out.stats ??= d.stats;
    out.limits.push(...d.limits);
    for (const m of d.unknownModels) if (!out.unknownModels.includes(m)) out.unknownModels.push(m);
    for (const k of Object.keys(out.files) as (keyof Dataset['files'])[]) out.files[k] += d.files[k];
  }
  return out;
}
