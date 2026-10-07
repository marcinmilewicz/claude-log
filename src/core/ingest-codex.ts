import { CHARS_PER_TOKEN, IMAGE_TOKENS, Ingestor, bashHead, prettyCwd, projectKeyFromCwd, type FileKind } from './ingest';
import { cacheReadPrice, costOf } from './pricing';
import type { Compaction, Dataset, LimitSample, Source, ToolCall } from './types';

// Codex CLI writes one rollout file per session:
// ~/.codex/sessions/YYYY/MM/DD/rollout-<datetime>-<sessionId>.jsonl
// (and archived_sessions/rollout-*.jsonl). Each line is { timestamp, type, payload }.
const ROLLOUT = /^rollout-.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const SHELL_TOOLS = new Set(['exec_command', 'shell_command', 'shell', 'local_shell', 'container.exec']);
const SKILL_PATH = /skills\/(?:\.system\/)?([\w.-]+)\/SKILL\.md/;
const WRAPPED_PROMPT = /^<(user_shell_command|environment_context|user_instructions|turn_aborted|subagent_notification)\b/;
const PROMPT_TEXT_LIMIT = 200;
const NO_PROJECT = '(no project)';

export function classifyCodexPath(rawPath: string): FileKind | null {
  const path = rawPath.replace(/\\/g, '/');
  if (path.endsWith('/') || path.includes('__MACOSX/')) return null;
  const base = path.split('/').pop() ?? '';
  if (base === 'history.jsonl') return { kind: 'history' };
  const m = base.match(ROLLOUT);
  return m ? { kind: 'rollout', sid: m[1].toLowerCase() } : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = any;

interface PendingCarry {
  tool: ToolCall;
  count: number;
  price: number;
}

interface RolloutState {
  sid: string;
  project: string;
  cwd: string;
  hasMeta: boolean;
  model: string;
  effort: string;
  fast: boolean;
  lastTotal: number;
  lastCtx: number;
  callCount: number;
  priceSum: number;
  pending: PendingCarry[];
  toolById: Map<string, ToolCall>;
  prompt: number;
  turnStart: number;
  compaction: Compaction | null;
  limits: Map<string, LimitSample>;
}

// The shell command as one string: `cmd` for exec_command, `command` as a
// string (shell_command) or an argv array (shell, often ["bash", "-lc", "..."]).
function shellCommand(input: Rec): string {
  if (typeof input?.cmd === 'string') return input.cmd;
  const c = input?.command;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    const argv = c.map(String);
    if (argv.length === 3 && /(^|\/)(ba|z)?sh$/.test(argv[0]) && /^-l?c$/.test(argv[1])) return argv[2];
    return argv.join(' ');
  }
  return '';
}

// Files touched by an apply_patch body.
export function patchFiles(patch: string): string[] {
  const out: string[] = [];
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)) {
    const p = (m[1] ?? m[2]).trim();
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

const relPath = (p: string, cwd: string) => (cwd && p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : prettyCwd(p));

const tsOf = (r: Rec): number => (typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : 0);

// Same dataset as for Claude Code, built from Codex rollouts. What Codex
// doesn't record (subagents, hooks, cost-state, live sessions) stays empty.
export class CodexIngestor extends Ingestor {
  protected readonly tool: Source = 'codex';
  private rollout: RolloutState | null = null;
  private seenEvents = new Set<string>();
  private limitSamples: LimitSample[] = [];
  private historyRows: { ts: number; sid: string; command: boolean; len: number }[] = [];

  beginFile(k: FileKind) {
    if (k.kind !== 'rollout') return;
    this.files.transcripts++;
    this.rollout = {
      sid: k.sid,
      project: NO_PROJECT,
      cwd: '',
      hasMeta: false,
      model: 'unknown',
      effort: '(default)',
      fast: false,
      lastTotal: -1,
      lastCtx: 0,
      callCount: 0,
      priceSum: 0,
      pending: [],
      toolById: new Map(),
      prompt: -1,
      turnStart: 0,
      compaction: null,
      limits: new Map(),
    };
  }

  endFile() {
    if (this.rollout) this.flush(this.rollout);
    this.rollout = null;
  }

  line(raw: string) {
    const f = this.rollout;
    if (!f || raw.length === 0) return;
    let r: Rec;
    try {
      r = JSON.parse(raw);
    } catch {
      this.files.badLines++;
      return;
    }
    const ts = tsOf(r);
    const p = r.payload ?? {};
    if (r.type === 'session_meta') {
      this.meta(f, p);
      return;
    }
    const session = this.session(f.sid, f.project);
    if (ts) {
      if (!session.firstTs || ts < session.firstTs) session.firstTs = ts;
      if (ts > session.lastTs) session.lastTs = ts;
    }

    switch (r.type) {
      case 'turn_context':
        if (typeof p.model === 'string' && p.model) f.model = p.model;
        f.effort = String(p.effort ?? p.collaboration_mode?.settings?.reasoning_effort ?? '(default)');
        f.fast = /^(fast|priority)$/.test(String(p.service_tier ?? ''));
        if (typeof p.cwd === 'string' && p.cwd) this.noteCwd(f.project, p.cwd);
        break;
      case 'response_item':
        if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call' || p.type === 'web_search_call') {
          this.toolCall(f, p, r, ts);
        } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
          this.toolResult(f, p, ts);
        }
        break;
      case 'compacted':
        this.compact(f, ts);
        break;
      case 'event_msg':
        this.event(f, p, r, ts);
        break;
    }
  }

  private meta(f: RolloutState, p: Rec) {
    // A forked session repeats its parent's session_meta; only the first one is this file's.
    if (f.hasMeta) return;
    f.hasMeta = true;
    const cwd = typeof p.cwd === 'string' ? p.cwd : '';
    if (cwd) {
      f.cwd = cwd;
      f.project = projectKeyFromCwd(cwd);
      this.noteCwd(f.project, cwd);
    }
    const s = this.session(f.sid, f.project);
    s.project = f.project;
    s.cwd = cwd;
    if (typeof p.git?.branch === 'string') s.branch = p.git.branch;
    if (typeof p.cli_version === 'string') s.version = p.cli_version;
    if (typeof p.originator === 'string') s.entrypoint = p.originator;
  }

  private event(f: RolloutState, p: Rec, r: Rec, ts: number) {
    switch (p.type) {
      case 'user_message': {
        const images = (Array.isArray(p.images) ? p.images.length : 0) + (Array.isArray(p.local_images) ? p.local_images.length : 0);
        const text = (typeof p.message === 'string' ? p.message.trim() : '') || (images ? '[image]' : '');
        if (!text || WRAPPED_PROMPT.test(text) || !this.once(`u|${r.timestamp}|${text.length}|${f.project}`)) return;
        f.prompt = this.addPrompt(ts, f.sid, f.project, text.length > PROMPT_TEXT_LIMIT ? text.slice(0, PROMPT_TEXT_LIMIT) + '…' : text, 'text');
        const s = this.session(f.sid, f.project);
        // Codex sessions have no title, so the first typed prompt stands in for one.
        if (!s.title && text !== '[image]') s.title = text.split('\n')[0].slice(0, 80);
        break;
      }
      case 'token_count':
        this.tokenCount(f, p, r, ts);
        break;
      case 'task_started':
        f.turnStart = ts;
        break;
      case 'task_complete':
      case 'turn_aborted':
        if (f.turnStart && ts >= f.turnStart) this.turns.push({ ts: f.turnStart, sid: f.sid, project: f.project, durationMs: ts - f.turnStart });
        f.turnStart = 0;
        break;
      case 'context_compacted':
        this.compact(f, ts);
        break;
      case 'entered_review_mode':
        this.commands.push({ ts, sid: f.sid, project: f.project, name: 'review' });
        break;
      case 'error':
      case 'stream_error':
        this.apiErrors.push({ ts, sid: f.sid, project: f.project, text: String(p.message ?? p.type).slice(0, 200) });
        break;
    }
  }

  // One token_count per model response. Codex writes most of them twice (the
  // second copy only updates rate limits), so a call counts only when the
  // session's running total moves.
  private tokenCount(f: RolloutState, p: Rec, r: Rec, ts: number) {
    if (p.rate_limits) this.limits(f, p.rate_limits, ts);
    const info = p.info;
    const last = info?.last_token_usage;
    if (!last) return;
    const total = Number(info.total_token_usage?.total_tokens) || 0;
    if (total === f.lastTotal) return;
    f.lastTotal = total;
    if (!this.once(`t|${r.timestamp}|${total}`)) return;

    const inputAll = Number(last.input_tokens) || 0;
    const cached = Math.min(inputAll, Number(last.cached_input_tokens) || 0);
    const tokens = { input: inputAll - cached, cw5: 0, cw1h: 0, cr: cached, out: Number(last.output_tokens) || 0 };
    const c = costOf(f.model, tokens, f.fast);
    if (!c) this.unknownModels.add(f.model);
    this.calls.push({
      ts,
      sid: f.sid,
      project: f.project,
      model: f.model,
      effort: f.effort,
      fast: f.fast,
      ...tokens,
      think: Number(last.reasoning_output_tokens) || 0,
      costIn: c?.costIn ?? 0,
      costCw: 0,
      costCr: c?.costCr ?? 0,
      costOut: c?.costOut ?? 0,
      cost: c?.cost ?? 0,
      stop: '(n/a)',
      sub: false,
      agentId: null,
      prompt: f.prompt,
    });
    f.callCount++;
    f.priceSum += cacheReadPrice(f.model);
    if (f.compaction) {
      f.compaction.post = inputAll;
      f.compaction = null;
    }
    f.lastCtx = inputAll;
  }

  private limits(f: RolloutState, rl: Rec, ts: number) {
    const limit = String(rl.limit_id ?? 'codex');
    for (const w of [rl.primary, rl.secondary]) {
      if (!w || typeof w.used_percent !== 'number') continue;
      const windowMinutes = Number(w.window_minutes) || 0;
      const resetsAt = w.resets_at != null ? Number(w.resets_at) * 1000 : w.resets_in_seconds != null ? ts + Number(w.resets_in_seconds) * 1000 : 0;
      const key = `${limit}|${windowMinutes}`;
      const prev = f.limits.get(key);
      if (prev && prev.usedPercent === w.used_percent && Math.abs(prev.resetsAt - resetsAt) < 60_000) continue;
      const sample: LimitSample = { ts, limit, windowMinutes, usedPercent: w.used_percent, resetsAt };
      f.limits.set(key, sample);
      this.limitSamples.push(sample);
    }
  }

  // Codex logs a compaction twice (a `compacted` item and a context_compacted
  // event), so only the first one between two API calls counts.
  private compact(f: RolloutState, ts: number) {
    if (f.compaction) return;
    const c: Compaction = { ts, sid: f.sid, project: f.project, trigger: 'unknown', pre: f.lastCtx, post: 0, durationMs: 0 };
    this.compactions.push(c);
    f.compaction = c;
    this.flush(f);
  }

  private toolCall(f: RolloutState, p: Rec, r: Rec, ts: number) {
    const id: string = p.call_id ?? p.id ?? '';
    if (!this.once(id ? `c|${id}` : `c|${r.timestamp}|${p.type}`)) return;

    let name = String(p.name ?? '');
    let input: Rec = {};
    if (p.type === 'function_call') {
      try {
        input = JSON.parse(p.arguments ?? '{}');
      } catch {
        input = {};
      }
    } else if (p.type === 'custom_tool_call') {
      input = { input: String(p.input ?? '') };
    } else if (p.type === 'local_shell_call') {
      name = 'local_shell';
      input = { command: p.action?.command };
    } else if (p.type === 'web_search_call') {
      name = 'web_search';
    }
    if (!name) name = String(p.type);

    let server: string | null = null;
    if (name.startsWith('mcp__')) server = name.split('__')[1] ?? null;
    else if (name.includes('__')) {
      // Older Codex versions name MCP tools "<server>__<tool>".
      server = name.split('__')[0];
      name = `mcp__${name}`;
    }

    let detail = '';
    let files: string[] | undefined;
    const cmd = SHELL_TOOLS.has(name) ? shellCommand(input) : '';
    if (cmd) {
      // apply_patch also comes as a shell command in some Codex versions.
      if (/^apply_patch\b/.test(cmd.trim())) {
        name = 'apply_patch';
        files = patchFiles(cmd);
      } else detail = bashHead(cmd);
    } else if (name === 'apply_patch') {
      files = patchFiles(typeof input.input === 'string' ? input.input : typeof input.patch === 'string' ? input.patch : '');
    } else if (name === 'view_image' && typeof input.path === 'string') {
      detail = relPath(input.path, f.cwd);
    } else if (name === 'web_search') {
      detail = String(p.action?.query ?? '');
    }
    if (files) {
      files = files.map((x) => relPath(x.startsWith('/') ? x : (f.cwd ? `${f.cwd}/${x}` : x), f.cwd));
      detail = files[0] ?? '';
    }

    const tool: ToolCall = {
      ts,
      sid: f.sid,
      project: f.project,
      name,
      server,
      detail,
      ...(files && files.length > 1 ? { files } : {}),
      sub: false,
      error: p.status === 'failed',
      resTok: 0,
      images: 0,
      carriedTok: 0,
      carriedCost: 0,
      prompt: f.prompt,
    };
    this.tools.push(tool);
    if (id) f.toolById.set(id, tool);

    const skill = cmd.match(SKILL_PATH)?.[1];
    if (skill) this.addSkill(ts, f.sid, f.project, skill, 'tool', f.prompt);
  }

  private toolResult(f: RolloutState, p: Rec, ts: number) {
    const tool = f.toolById.get(p.call_id);
    if (!tool) return;
    f.toolById.delete(p.call_id);

    let text = '';
    let images = tool.name === 'view_image' ? 1 : 0;
    let exitCode: number | null = null;
    const out = p.output;
    if (typeof out === 'string') {
      text = out;
      if (out.startsWith('{')) {
        try {
          const j = JSON.parse(out);
          if (typeof j?.output === 'string') {
            text = j.output;
            if (j.metadata?.exit_code != null) exitCode = Number(j.metadata.exit_code);
          }
        } catch {
          // plain text that happens to start with "{"
        }
      }
    } else if (Array.isArray(out)) {
      for (const b of out as Rec[]) {
        if (b?.type === 'input_image') images++;
        else if (typeof b?.text === 'string') text += b.text;
      }
    } else if (out && typeof out === 'object') {
      text = typeof out.content === 'string' ? out.content : JSON.stringify(out);
      if (out.success === false) tool.error = true;
    }

    const head = text.slice(0, 300);
    if (exitCode == null) {
      const m = head.match(/^Exit code: (\d+)/m) ?? head.match(/Process exited with code (\d+)/);
      if (m) exitCode = Number(m[1]);
    }
    if (exitCode != null && exitCode !== 0) tool.error = true;
    if (/^[\w ]*\bfailed\b/.test(head)) tool.error = true;
    const denial = /^aborted by user/i.test(head) ? 'interrupted' : /rejected by (the )?user/i.test(head) ? 'user-rejected' : null;
    if (denial) {
      tool.error = true;
      this.denials.push({ ts, sid: f.sid, project: f.project, kind: denial, tool: tool.name });
    }

    tool.images = images;
    tool.resTok = Math.ceil(text.length / CHARS_PER_TOKEN) + images * IMAGE_TOKENS;
    f.pending.push({ tool, count: f.callCount, price: f.priceSum });
  }

  // Same carry estimate as for Claude Code: result tokens × the API calls
  // that read them, until a compaction or the end of the session.
  private flush(f: RolloutState) {
    for (const x of f.pending) {
      x.tool.carriedTok += x.tool.resTok * (f.callCount - x.count);
      x.tool.carriedCost += x.tool.resTok * (f.priceSum - x.price);
    }
    f.pending = [];
  }

  private once(key: string): boolean {
    if (this.seenEvents.has(key)) return false;
    this.seenEvents.add(key);
    return true;
  }

  // ~/.codex/history.jsonl: { session_id, ts (seconds), text }. The project
  // comes from the session, which may be parsed later, so it's resolved in finalize.
  historyLine(raw: string) {
    if (!raw) return;
    let d: Rec;
    try {
      d = JSON.parse(raw);
    } catch {
      this.files.badLines++;
      return;
    }
    const text = String(d.text ?? '');
    this.historyRows.push({ ts: (Number(d.ts) || 0) * 1000, sid: String(d.session_id ?? ''), command: text.startsWith('/'), len: text.length });
  }

  finalize(): Dataset {
    for (const h of this.historyRows) {
      const project = this.sessions.get(h.sid)?.project ?? NO_PROJECT;
      this.history.push({ ts: h.ts, source: 'codex', project, command: h.command, len: h.len });
    }
    // Limits are account-wide, so readings from parallel sessions are merged
    // in time order and only changes are kept.
    const limits: LimitSample[] = [];
    const last = new Map<string, LimitSample>();
    for (const s of [...this.limitSamples].sort((a, b) => a.ts - b.ts)) {
      const key = `${s.limit}|${s.windowMinutes}`;
      const prev = last.get(key);
      if (prev && prev.usedPercent === s.usedPercent && Math.abs(prev.resetsAt - s.resetsAt) < 60_000) continue;
      last.set(key, s);
      limits.push(s);
    }
    return { ...super.finalize(), limits };
  }
}
