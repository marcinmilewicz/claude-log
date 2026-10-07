import { describe, expect, it } from 'vitest';
import { buildPalette, buildView, type Filter } from './aggregate';
import { Ingestor } from './ingest';
import { CodexIngestor } from './ingest-codex';
import { mergeDatasets } from './merge';

const CWD = '/Users/me/dev/app';
const PROJECT = '-Users-me-dev-app';
const CLAUDE_SID = '11111111-2222-3333-4444-555555555555';
const CODEX_SID = '019c77b7-e090-7ab1-afda-3b18ef2ccd69';
const at = (sec: number) => new Date(Date.UTC(2026, 8, 1, 10, 0, sec)).toISOString();

function claude() {
  const ing = new Ingestor('~/.claude');
  ing.beginFile({ kind: 'transcript', project: PROJECT, sid: CLAUDE_SID });
  const base = { cwd: CWD, sessionId: CLAUDE_SID };
  ing.line(JSON.stringify({ type: 'user', timestamp: at(0), ...base, message: { role: 'user', content: 'Claude prompt' } }));
  ing.line(
    JSON.stringify({
      type: 'assistant',
      timestamp: at(1),
      ...base,
      requestId: 'r1',
      message: { model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'git status' } }], usage: { input_tokens: 10, output_tokens: 10 } },
    }),
  );
  ing.endFile();
  ing.historyLine(JSON.stringify({ timestamp: Date.parse(at(0)), project: CWD, display: 'Claude prompt' }));
  return ing.finalize();
}

function codex() {
  const ing = new CodexIngestor('~/.codex');
  ing.beginFile({ kind: 'rollout', sid: CODEX_SID });
  const line = (sec: number, type: string, payload: object) => ing.line(JSON.stringify({ timestamp: at(sec), type, payload }));
  line(10, 'session_meta', { id: CODEX_SID, cwd: CWD });
  line(10, 'turn_context', { cwd: CWD, model: 'gpt-5.3-codex' });
  line(11, 'event_msg', { type: 'user_message', message: 'Codex prompt' });
  line(12, 'response_item', { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd: 'rg foo' }), call_id: 'c1' });
  const u = { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100, reasoning_output_tokens: 0, total_tokens: 1100 };
  line(12, 'event_msg', { type: 'token_count', info: { total_token_usage: u, last_token_usage: u } });
  ing.endFile();
  ing.historyLine(JSON.stringify({ session_id: CODEX_SID, ts: Date.parse(at(11)) / 1000, text: 'Codex prompt' }));
  return ing.finalize();
}

describe('mergeDatasets', () => {
  const ds = mergeDatasets([claude(), codex()]);

  it('keeps prompt references pointing at the right prompt', () => {
    expect(ds.sources).toEqual(['claude', 'codex']);
    expect(ds.prompts.map((p) => [p.id, p.text])).toEqual([
      [0, 'Claude prompt'],
      [1, 'Codex prompt'],
    ]);
    expect(ds.calls.map((c) => [c.model, ds.prompts[c.prompt].text])).toEqual([
      ['claude-opus-5-5', 'Claude prompt'],
      ['gpt-5.3-codex', 'Codex prompt'],
    ]);
    expect(ds.tools.map((t) => ds.prompts[t.prompt].text)).toEqual(['Claude prompt', 'Codex prompt']);
  });

  it('puts both tools of the same directory in one project', () => {
    expect(Object.keys(ds.projects)).toEqual([PROJECT]);
    expect(new Set(ds.calls.map((c) => c.project))).toEqual(new Set([PROJECT]));
  });

  it('filters the view by tool', () => {
    const palette = buildPalette(ds);
    const view = (source: Filter['source']) => buildView(ds, { from: null, to: null, project: null, source }, palette, 'model');
    expect(view(null).kpi.calls).toBe(2);
    expect(view(null).bySource.map((r) => r.label).sort()).toEqual(['Claude Code', 'Codex']);
    expect(view('codex').byModel.map((r) => r.label)).toEqual(['gpt-5.3-codex']);
    expect(view('codex').byBash.map((r) => r.label)).toEqual(['rg']);
    expect(view('claude').byBash.map((r) => r.label)).toEqual(['git status']);
    expect(view('claude').historyDaily.series[0].values.reduce((a, b) => a + b, 0)).toBe(1);
    expect(view('codex').byTokenType.map((r) => r.key)).not.toContain('costCw');
    expect(view(null).byTokenType.map((r) => r.key)).toContain('costCw');
  });
});
