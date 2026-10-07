import { describe, expect, it } from 'vitest';
import { CodexIngestor, classifyCodexPath, patchFiles } from './ingest-codex';
import { classifyAll } from './parse';
import { costOf } from './pricing';

const SID = '019c77b7-e090-7ab1-afda-3b18ef2ccd69';
const CWD = '/Users/me/dev/app';
const PROJECT = '-Users-me-dev-app';
const FILE = `sessions/2026/02/19/rollout-2026-02-19T22-04-25-${SID}.jsonl`;

const at = (sec: number) => new Date(Date.UTC(2026, 1, 19, 10, 0, sec)).toISOString();
const rec = (sec: number, type: string, payload: object) => ({ timestamp: at(sec), type, payload });
const ev = (sec: number, payload: object) => rec(sec, 'event_msg', payload);
const item = (sec: number, payload: object) => rec(sec, 'response_item', payload);

let total = 0;
const usage = (input: number, cached: number, output: number, reasoning = 0) => {
  total += input + output;
  return {
    total_token_usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: total },
    last_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output },
    model_context_window: 258400,
  };
};
const limits = (fiveHour: number, weekly: number) => ({
  limit_id: 'codex',
  primary: { used_percent: fiveHour, window_minutes: 300, resets_at: 1771500000 },
  secondary: { used_percent: weekly, window_minutes: 10080, resets_at: 1772000000 },
});
// Codex writes each token_count twice; the copy only refreshes rate limits.
const tokenCount = (sec: number, info: object, rl: object) => [ev(sec, { type: 'token_count', info, rate_limits: rl }), ev(sec + 0.5, { type: 'token_count', info, rate_limits: rl })];

function run(lines: object[], history: object[] = []) {
  total = 0;
  const ing = new CodexIngestor('codex.zip');
  ing.beginFile({ kind: 'rollout', sid: SID });
  for (const l of lines) ing.line(JSON.stringify(l));
  ing.endFile();
  for (const h of history) ing.historyLine(JSON.stringify(h));
  return ing.finalize();
}

const PATCH = '*** Begin Patch\n*** Update File: src/a.ts\n@@\n-x\n+y\n*** Add File: src/b.ts\n+z\n*** End Patch';

function session() {
  return [
    rec(0, 'session_meta', { id: SID, cwd: CWD, originator: 'codex_cli_rs', cli_version: '0.104.0', git: { branch: 'main' } }),
    rec(1, 'turn_context', { cwd: CWD, model: 'gpt-5.3-codex', collaboration_mode: { settings: { reasoning_effort: 'high' } } }),
    ev(1, { type: 'task_started' }),
    ev(1, { type: 'user_message', message: 'Fix the build', images: [] }),
    item(2, { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd: 'cd app && npm test -- --run' }), call_id: 'c1' }),
    ...tokenCount(2, usage(10_000, 8_000, 500, 200), limits(10, 40)),
    item(3, { type: 'function_call_output', call_id: 'c1', output: 'Chunk ID: 1\nWall time: 1s\nProcess exited with code 1\nOutput:\n' + 'x'.repeat(400) }),
    item(4, { type: 'custom_tool_call', name: 'apply_patch', input: PATCH, call_id: 'c2', status: 'completed' }),
    ...tokenCount(4, usage(12_000, 10_000, 300), limits(12, 40)),
    item(5, { type: 'custom_tool_call_output', call_id: 'c2', output: JSON.stringify({ output: 'Success.', metadata: { exit_code: 0 } }) }),
    item(5, { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd: 'cat ~/.codex/skills/pdf/SKILL.md' }), call_id: 'c3' }),
    rec(6, 'compacted', { message: 'summary' }),
    ev(6, { type: 'context_compacted' }),
    ...tokenCount(7, usage(3_000, 0, 100), limits(12, 41)),
    ev(10, { type: 'task_complete' }),
    ev(11, { type: 'user_message', message: '', images: ['data:image/png;base64,'] }),
    item(12, { type: 'function_call', name: 'shell_command', arguments: JSON.stringify({ command: 'rm -rf build' }), call_id: 'c4' }),
    item(13, { type: 'function_call_output', call_id: 'c4', output: 'aborted by user after 2.0s' }),
  ];
}

describe('classifyCodexPath', () => {
  it('recognizes rollouts and history', () => {
    expect(classifyCodexPath(`.codex/${FILE}`)).toEqual({ kind: 'rollout', sid: SID });
    expect(classifyCodexPath(`archived_sessions/rollout-2026-01-01T00-00-00-${SID}.jsonl`)).toEqual({ kind: 'rollout', sid: SID });
    expect(classifyCodexPath('history.jsonl')).toEqual({ kind: 'history' });
    expect(classifyCodexPath('config.toml')).toBeNull();
  });
});

describe('classifyAll', () => {
  it('picks Codex only when there are no Claude Code transcripts', () => {
    expect(classifyAll([FILE, 'history.jsonl']).source).toBe('codex');
    expect(classifyAll([`projects/${PROJECT}/11111111-2222-3333-4444-555555555555.jsonl`, 'history.jsonl']).source).toBe('claude');
  });
});

describe('patchFiles', () => {
  it('lists every file a patch touches', () => {
    expect(patchFiles(PATCH)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(patchFiles('*** Update File: a.ts\n*** Move to: b.ts\n*** Delete File: a.ts')).toEqual(['a.ts', 'b.ts']);
  });
});

describe('CodexIngestor', () => {
  const ds = run(session(), [{ session_id: SID, ts: 1771495201, text: 'Fix the build' }]);

  it('builds the session from session_meta', () => {
    expect(ds.sources).toEqual(['codex']);
    expect(ds.sessions[0].source).toBe('codex');
    expect(ds.projects[PROJECT]).toBe('~/dev/app');
    expect(ds.sessions[0]).toMatchObject({ id: SID, project: PROJECT, branch: 'main', version: '0.104.0', entrypoint: 'codex_cli_rs', title: 'Fix the build' });
  });

  it('counts each model response once, with cached input as cache reads', () => {
    expect(ds.calls).toHaveLength(3);
    const c = ds.calls[0];
    expect(c).toMatchObject({ model: 'gpt-5.3-codex', effort: 'high', input: 2_000, cr: 8_000, cw5: 0, cw1h: 0, out: 500, think: 200, prompt: 0 });
    expect(c.cost).toBeCloseTo((2_000 * 1.75 + 8_000 * 0.175 + 500 * 14) / 1e6, 10);
  });

  it('records tools, shell commands, patched files, errors and skills', () => {
    const [test, patch, skill, rm] = ds.tools;
    expect(test).toMatchObject({ name: 'exec_command', detail: 'npm test', error: true });
    expect(patch).toMatchObject({ name: 'apply_patch', detail: 'src/a.ts', files: ['src/a.ts', 'src/b.ts'], error: false });
    expect(skill.detail).toBe('cat');
    expect(ds.skills).toEqual([expect.objectContaining({ name: 'pdf', source: 'tool', prompt: 0 })]);
    expect(rm).toMatchObject({ name: 'shell_command', error: true, prompt: 1 });
    expect(ds.denials).toEqual([expect.objectContaining({ kind: 'interrupted', tool: 'shell_command' })]);
  });

  it('carries a tool result until the compaction', () => {
    // The exec_command result was read by one later call (the second one), then the context was compacted.
    expect(ds.tools[0].carriedTok).toBe(ds.tools[0].resTok);
    expect(ds.tools[0].resTok).toBeGreaterThan(100);
  });

  it('records one compaction with the context before and after', () => {
    expect(ds.compactions).toEqual([expect.objectContaining({ pre: 12_000, post: 3_000 })]);
  });

  it('counts image-only prompts and turn durations', () => {
    expect(ds.prompts.map((p) => p.text)).toEqual(['Fix the build', '[image]']);
    expect(ds.prompts[0].calls).toBe(3);
    expect(ds.turns).toEqual([expect.objectContaining({ durationMs: 9_000 })]);
  });

  it('keeps only changes of the plan usage limits', () => {
    expect(ds.limits.map((l) => [l.windowMinutes, l.usedPercent])).toEqual([
      [300, 10],
      [10080, 40],
      [300, 12],
      [10080, 41],
    ]);
  });

  it('assigns history entries to the session project', () => {
    expect(ds.history).toEqual([{ ts: 1771495201000, source: 'codex', project: PROJECT, command: false, len: 13 }]);
  });
});

describe('costOf for OpenAI models', () => {
  it('prices dated snapshots like the base model', () => {
    expect(costOf('gpt-5-2025-08-07', { input: 1e6, cw5: 0, cw1h: 0, cr: 1e6, out: 1e6 }, false)?.cost).toBeCloseTo(1.25 + 0.125 + 10, 10);
  });
});
