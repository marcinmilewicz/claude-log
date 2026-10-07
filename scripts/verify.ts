// Runs the parser in Node on a real zip and compares the computed cost
// with the cost Claude Code itself recorded in cost-state records.
// Usage: npm run verify -- path/to/claude-data.zip
import { openAsBlob } from 'node:fs';
import { parseZip } from '../src/core/zip';

const path = process.argv[2];
if (!path) {
  console.error('Pass the path to the zip.');
  process.exit(1);
}

const t0 = Date.now();
const blob = await openAsBlob(path);
const ds = await parseZip(blob, path, () => {});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const calls = ds.calls;
console.log(`parse time: ${secs} s`);
console.log('files', ds.files);
console.log('API calls', calls.length, 'tools', ds.tools.length, 'prompts', ds.prompts.length, 'sessions', ds.sessions.length, 'subagents', ds.subagents.length);
console.log('tokens', {
  input: sum(calls.map((c) => c.input)),
  cacheWrite: sum(calls.map((c) => c.cw5 + c.cw1h)),
  cacheRead: sum(calls.map((c) => c.cr)),
  output: sum(calls.map((c) => c.out)),
  thinking: sum(calls.map((c) => c.think)),
});
console.log('computed cost (USD)', sum(calls.map((c) => c.cost)).toFixed(2));
console.log('unknown models', ds.unknownModels);

// Per-session comparison: only sessions with cost-state, main thread + their subagents.
const bySession = new Map<string, number>();
for (const c of calls) bySession.set(c.sid, (bySession.get(c.sid) ?? 0) + c.cost);
let reported = 0;
let computed = 0;
let n = 0;
for (const s of ds.sessions) {
  if (!s.reported) continue;
  n++;
  reported += s.reported.cost;
  computed += bySession.get(s.id) ?? 0;
}
if (n > 0) console.log(`sessions with cost-state: ${n}; reported cost ${reported.toFixed(2)} vs computed ${computed.toFixed(2)} (${((computed / reported - 1) * 100).toFixed(1)}%)`);
else console.log('sessions with cost-state: 0');

const top = new Map<string, number>();
for (const t of ds.tools) top.set(t.name, (top.get(t.name) ?? 0) + 1);
console.log('top tools', [...top].sort((a, b) => b[1] - a[1]).slice(0, 8));
const sk = new Map<string, number>();
for (const s of ds.skills) sk.set(`${s.name} (${s.source})`, (sk.get(`${s.name} (${s.source})`) ?? 0) + 1);
console.log('skills', [...sk].sort((a, b) => b[1] - a[1]).slice(0, 12));
console.log('projects', Object.entries(ds.projects).slice(0, 6));
console.log('most expensive prompts', [...ds.prompts].sort((a, b) => b.cost - a.cost).slice(0, 3).map((p) => [p.cost.toFixed(2), p.calls, p.text.slice(0, 60)]));
console.log('live', ds.live.length, 'history', ds.history.length, 'stats', ds.stats);
