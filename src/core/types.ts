// Normalized data model the parser builds from Claude Code transcripts.
// Every row has `ts` (ms) and `project` (the directory key in ~/.claude/projects)
// so the date and project filters work the same way on every table.

export interface ApiCall {
  ts: number;
  sid: string;
  project: string;
  model: string;
  effort: string;
  fast: boolean;
  input: number;
  cw5: number;
  cw1h: number;
  cr: number;
  out: number;
  think: number;
  costIn: number;
  costCw: number;
  costCr: number;
  costOut: number;
  cost: number;
  stop: string;
  sub: boolean;
  agentId: string | null;
  prompt: number;
}

export interface ToolCall {
  ts: number;
  sid: string;
  project: string;
  name: string;
  server: string | null;
  detail: string;
  sub: boolean;
  error: boolean;
  resTok: number;
  images: number;
  carriedTok: number;
  carriedCost: number;
  prompt: number;
}

export interface Prompt {
  id: number;
  ts: number;
  sid: string;
  project: string;
  text: string;
  kind: 'text' | 'command';
  skills: string[];
  calls: number;
  tools: number;
  tokens: number;
  cost: number;
  subCost: number;
}

export interface SkillUse {
  ts: number;
  sid: string;
  project: string;
  name: string;
  source: 'tool' | 'slash' | 'subagent';
  prompt: number;
}

export interface Command {
  ts: number;
  sid: string;
  project: string;
  name: string;
}

export interface Compaction {
  ts: number;
  sid: string;
  project: string;
  trigger: string;
  pre: number;
  post: number;
  durationMs: number;
}

export interface Turn {
  ts: number;
  sid: string;
  project: string;
  durationMs: number;
}

export interface Denial {
  ts: number;
  sid: string;
  project: string;
  kind: string;
  tool: string;
}

export interface HookEvent {
  ts: number;
  sid: string;
  project: string;
  name: string;
  ok: boolean;
}

export interface ApiError {
  ts: number;
  sid: string;
  project: string;
  text: string;
}

export interface Subagent {
  agentId: string;
  sid: string;
  project: string;
  agentType: string;
  description: string;
  skill: string | null;
  firstTs: number;
  lastTs: number;
}

export interface ReportedCost {
  cost: number;
  linesAdded: number;
  linesRemoved: number;
  apiMs: number;
  toolMs: number;
}

export interface Session {
  id: string;
  project: string;
  cwd: string;
  title: string;
  branch: string;
  version: string;
  entrypoint: string;
  firstTs: number;
  lastTs: number;
  reported: ReportedCost | null;
}

export interface HistoryEntry {
  ts: number;
  project: string;
  command: boolean;
  len: number;
}

export interface LiveSession {
  pid: number;
  sessionId: string;
  project: string;
  cwd: string;
  name: string;
  status: string;
  kind: string;
  version: string;
  startedAt: number;
  updatedAt: number;
}

export interface StatsCache {
  firstSessionDate: string | null;
  totalSessions: number;
  totalMessages: number;
  lastComputedDate: string | null;
}

export interface Dataset {
  sourceName: string;
  generatedAt: number;
  projects: Record<string, string>;
  sessions: Session[];
  calls: ApiCall[];
  tools: ToolCall[];
  prompts: Prompt[];
  skills: SkillUse[];
  commands: Command[];
  compactions: Compaction[];
  turns: Turn[];
  denials: Denial[];
  hooks: HookEvent[];
  apiErrors: ApiError[];
  subagents: Subagent[];
  history: HistoryEntry[];
  live: LiveSession[];
  stats: StatsCache | null;
  unknownModels: string[];
  files: { transcripts: number; subagents: number; skipped: number; badLines: number };
}
