import { describe, expect, it } from 'vitest';
import { Ingestor, bashHead, classifyPath, projectKeyFromCwd } from './ingest';
import { costOf } from './pricing';

const SID = '11111111-2222-3333-4444-555555555555';
const PROJECT = '-Users-me-dev-app';
const CWD = '/Users/me/dev/app';

const at = (sec: number) => new Date(Date.UTC(2026, 8, 1, 10, 0, sec)).toISOString();
const base = (sec: number) => ({ timestamp: at(sec), cwd: CWD, sessionId: SID, gitBranch: 'main', version: '2.1.284' });

const user = (sec: number, content: unknown, extra: object = {}) => ({ type: 'user', ...base(sec), message: { role: 'user', content }, ...extra });

const assistant = (sec: number, requestId: string, content: unknown[], usage: object = {}) => ({
  type: 'assistant',
  ...base(sec),
  requestId,
  effort: 'high',
  message: {
    model: 'claude-opus-5-5',
    content,
    usage: { input_tokens: 10, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000, output_tokens: 200, cache_creation: { ephemeral_1h_input_tokens: 1000, ephemeral_5m_input_tokens: 0 }, ...usage },
  },
});

function run(files: { kind: 'transcript' | 'subagent'; lines: object[]; agentId?: string }[]) {
  const ing = new Ingestor('test.zip');
  for (const f of files) {
    ing.beginFile(f.kind === 'transcript' ? { kind: 'transcript', project: PROJECT, sid: SID } : { kind: 'subagent', project: PROJECT, sid: SID, agentId: f.agentId ?? 'a1' });
    for (const l of f.lines) ing.line(JSON.stringify(l));
    ing.endFile();
  }
  return ing.finalize();
}

describe('classifyPath', () => {
  it('recognizes transcripts regardless of which directory was zipped', () => {
    expect(classifyPath(`.claude/projects/${PROJECT}/${SID}.jsonl`)).toEqual({ kind: 'transcript', project: PROJECT, sid: SID });
    expect(classifyPath(`${PROJECT}/${SID}.jsonl`)).toEqual({ kind: 'transcript', project: PROJECT, sid: SID });
  });

  it('recognizes subagents and their metadata', () => {
    expect(classifyPath(`projects/${PROJECT}/${SID}/subagents/agent-abc.jsonl`)).toEqual({ kind: 'subagent', project: PROJECT, sid: SID, agentId: 'abc' });
    expect(classifyPath(`projects/${PROJECT}/${SID}/subagents/agent-abc.meta.json`)?.kind).toBe('subagent-meta');
    expect(classifyPath(`projects/${PROJECT}/${SID}/subagents/agent-abc.forked-skill.json`)?.kind).toBe('subagent-skill');
    expect(classifyPath(`projects/${PROJECT}/${SID}/subagents/agent-abc.forked-skill.marker.json`)).toBeNull();
  });

  it('skips tool-results, macOS junk and unknown files', () => {
    expect(classifyPath(`projects/${PROJECT}/${SID}/tool-results/x.txt`)).toBeNull();
    expect(classifyPath(`__MACOSX/projects/${PROJECT}/._${SID}.jsonl`)).toBeNull();
    expect(classifyPath('projects/README.md')).toBeNull();
  });

  it('recognizes history, stats-cache and live sessions', () => {
    expect(classifyPath('history.jsonl')).toEqual({ kind: 'history' });
    expect(classifyPath('.claude/stats-cache.json')).toEqual({ kind: 'stats' });
    expect(classifyPath('sessions/47869.json')).toEqual({ kind: 'live' });
    expect(classifyPath('sessions/2026-01-21-session.tmp')).toBeNull();
  });
});

describe('bashHead', () => {
  it('skips cd and env vars, keeps the subcommand for runners', () => {
    expect(bashHead('cd /tmp && git status')).toBe('git status');
    expect(bashHead('cd "/a b" && FOO=1 BAR="x y" pnpm test --run')).toBe('pnpm test');
    expect(bashHead('/usr/bin/grep -rn foo .')).toBe('grep');
    expect(bashHead('npx -y something')).toBe('npx');
  });
});

describe('projectKeyFromCwd', () => {
  it('encodes cwd the way Claude Code names project directories', () => {
    expect(projectKeyFromCwd('/Users/me/Library/Mobile Documents/iCloud~md~obsidian/x')).toBe('-Users-me-Library-Mobile-Documents-iCloud-md-obsidian-x');
  });
});

describe('costOf', () => {
  it('prices a 1h cache write at 2× input and cache reads at the model rate', () => {
    const c = costOf('claude-opus-5-5', { input: 1e6, cw5: 0, cw1h: 1e6, cr: 1e6, out: 1e6 }, false)!;
    expect(c.costIn).toBeCloseTo(4);
    expect(c.costCw).toBeCloseTo(8);
    expect(c.costCr).toBeCloseTo(0.2);
    expect(c.costOut).toBeCloseTo(20);
  });

  it('handles the date suffix and [1m], and returns null for an unknown model', () => {
    expect(costOf('claude-haiku-4-5-20251001', { input: 1e6, cw5: 0, cw1h: 0, cr: 0, out: 0 }, false)?.cost).toBeCloseTo(1);
    expect(costOf('claude-opus-5[1m]', { input: 1e6, cw5: 0, cw1h: 0, cr: 0, out: 0 }, false)?.cost).toBeCloseTo(5);
    expect(costOf('gpt-9', { input: 1, cw5: 0, cw1h: 0, cr: 0, out: 0 }, false)).toBeNull();
  });
});

describe('Ingestor', () => {
  it('counts one API call per requestId even when the response spans several lines', () => {
    const ds = run([
      {
        kind: 'transcript',
        lines: [
          user(0, 'fix the test'),
          assistant(1, 'req_1', [{ type: 'thinking', thinking: '' }]),
          assistant(1, 'req_1', [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'cd /x && pnpm test' } }]),
        ],
      },
    ]);
    expect(ds.calls).toHaveLength(1);
    expect(ds.tools).toHaveLength(1);
    expect(ds.tools[0].detail).toBe('pnpm test');
  });

  it('assigns the cost of calls to the prompt that triggered them', () => {
    const ds = run([
      {
        kind: 'transcript',
        lines: [
          user(0, 'first'),
          assistant(1, 'r1', []),
          assistant(2, 'r2', []),
          user(3, 'second'),
          assistant(4, 'r3', []),
          user(5, [{ type: 'text', text: '<local-command-stdout>ok</local-command-stdout>' }]),
          assistant(6, 'r4', []),
        ],
      },
    ]);
    expect(ds.prompts.map((p) => [p.text, p.calls])).toEqual([
      ['first', 2],
      ['second', 2],
    ]);
    expect(ds.prompts[0].cost).toBeCloseTo(ds.calls[0].cost * 2);
  });

  it('recognizes a skill invoked by a slash command and by the Skill tool', () => {
    const ds = run([
      {
        kind: 'transcript',
        lines: [
          user(0, '<command-message>bugfix</command-message>\n<command-name>/bugfix</command-name>\n<command-args>CU-12</command-args>'),
          user(1, [{ type: 'text', text: 'Base directory for this skill: /x/.claude/skills/bugfix' }], { isMeta: true }),
          assistant(2, 'r1', [{ type: 'tool_use', id: 'tu_s', name: 'Skill', input: { skill: 'code-review' } }]),
          user(3, '<command-name>/clear</command-name>'),
        ],
      },
    ]);
    expect(ds.skills.map((s) => [s.name, s.source])).toEqual([
      ['bugfix', 'slash'],
      ['code-review', 'tool'],
    ]);
    expect(ds.commands.map((c) => c.name)).toEqual(['bugfix', 'clear']);
    expect(ds.prompts[0].text).toBe('/bugfix CU-12');
    expect(ds.prompts[0].skills).toEqual(['bugfix', 'code-review']);
  });

  it('assigns subagent cost to the parent session prompt by time', () => {
    const ds = run([
      { kind: 'transcript', lines: [user(0, 'do a review'), assistant(1, 'r1', []), user(100, 'next'), assistant(101, 'r2', [])] },
      { kind: 'subagent', agentId: 'ag1', lines: [assistant(50, 'rs1', []), assistant(60, 'rs2', [])] },
    ]);
    const first = ds.prompts[0];
    expect(first.calls).toBe(3);
    expect(first.subCost).toBeCloseTo(ds.calls[0].cost * 2);
    expect(ds.calls.filter((c) => c.sub)).toHaveLength(2);
    expect(ds.subagents[0].agentId).toBe('ag1');
  });

  it('estimates the cost of carrying a tool result until the next compaction', () => {
    const ds = run([
      {
        kind: 'transcript',
        lines: [
          user(0, 'read it'),
          assistant(1, 'r1', [{ type: 'tool_use', id: 'tu_r', name: 'Read', input: { file_path: `${CWD}/src/a.ts` } }]),
          user(2, [{ type: 'tool_result', tool_use_id: 'tu_r', content: 'x'.repeat(4000) }]),
          assistant(3, 'r2', []),
          assistant(4, 'r3', []),
          { type: 'system', subtype: 'compact_boundary', ...base(5), compactMetadata: { trigger: 'auto', preTokens: 100, postTokens: 10, durationMs: 1000 } },
          assistant(6, 'r4', []),
        ],
      },
    ]);
    const read = ds.tools[0];
    expect(read.detail).toBe('src/a.ts');
    expect(read.resTok).toBe(1000);
    expect(read.carriedTok).toBe(2000);
    expect(read.carriedCost).toBeCloseTo((2000 * 0.2) / 1e6);
    expect(ds.compactions).toHaveLength(1);
  });

  it('does not count an API error message as a call and records the error', () => {
    const ds = run([
      {
        kind: 'transcript',
        lines: [{ type: 'assistant', ...base(1), isApiErrorMessage: true, message: { model: '<synthetic>', content: [{ type: 'text', text: 'API Error: 529' }], usage: { input_tokens: 0, output_tokens: 0 } } }],
      },
    ]);
    expect(ds.calls).toHaveLength(0);
    expect(ds.apiErrors[0].text).toBe('API Error: 529');
  });
});
