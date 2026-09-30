// Generates a synthetic ~/.claude export (fictional projects, prompts and paths)
// that goes through the real parser. Used for the landing page screenshots.
//
//   npx tsx scripts/demo-data.ts ~/Desktop/demo-claude-data.zip
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { costOf } from '../src/core/pricing';

const out = resolve(process.argv[2] ?? 'demo-claude-data.zip');

// ---------- deterministic randomness

let seed = 20260928;
function rnd(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;
const skew = (a: number, b: number, k = 2) => a + Math.floor(Math.pow(rnd(), k) * (b - a + 1));
// Earlier items are picked more often, like real hot files and commands.
const pickHot = <T>(xs: readonly T[]): T => xs[skew(0, xs.length - 1, 1.8)];
function weighted<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}
const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

// ---------- fictional workspace

const HOME = '/Users/alex';
const VERSION = '2.3.12';

interface Task {
  title: string;
  prompts: string[];
}
interface Project {
  dir: string;
  weight: number;
  files: string[];
  bash: string[];
  mcp: string[];
  tasks: Task[];
}

const PROJECTS: Project[] = [
  {
    dir: 'dev/storefront',
    weight: 6,
    files: ['src/app/checkout/page.tsx', 'src/components/CartDrawer.tsx', 'src/lib/cart.ts', 'src/lib/pricing.ts', 'src/app/layout.tsx', 'src/components/ProductCard.tsx', 'src/hooks/useCart.ts', 'src/app/api/orders/route.ts', 'tailwind.config.ts', 'package.json'],
    bash: ['pnpm test --run', 'pnpm lint', 'pnpm build', 'git status', 'git diff --stat', 'pnpm dev', 'npx tsc --noEmit', 'git log --oneline -10', 'npx playwright test'],
    mcp: ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_take_screenshot', 'mcp__playwright__browser_click', 'mcp__context7__query-docs'],
    tasks: [
      { title: 'Fix cart total rounding on checkout', prompts: ['the cart total on checkout is off by a cent when a discount code is applied, find out why and fix it', 'add a regression test for that'] },
      { title: 'Add skeleton loading to product grid', prompts: ['add skeleton placeholders to the product grid while products load', 'the skeleton jumps when images load, keep the aspect ratio fixed'] },
      { title: 'Migrate checkout to server actions', prompts: ['migrate the checkout form from the API route to a server action', 'keep the old route working until mobile is updated'] },
      { title: 'Dark mode for product pages', prompts: ['add dark mode to product pages using the existing color tokens', 'check contrast of the price badges in dark mode'] },
      { title: 'Debug flaky e2e checkout test', prompts: ['the checkout e2e test fails about 1 in 5 runs on CI, figure out why', 'make the wait deterministic instead of adding a timeout'] },
      { title: 'Refactor CartDrawer state', prompts: ['CartDrawer re-renders on every keystroke in the search box, profile it and fix it'] },
    ],
  },
  {
    dir: 'dev/billing-api',
    weight: 5,
    files: ['src/invoices/service.ts', 'src/invoices/service.test.ts', 'src/webhooks/stripe.ts', 'src/db/schema.ts', 'src/db/migrations/0042_credit_notes.sql', 'src/routes/subscriptions.ts', 'src/lib/money.ts', 'README.md'],
    bash: ['npm test', 'npm run migrate', 'docker compose up -d', 'git status', 'git diff', 'npm run typecheck', 'curl -s localhost:3000/health', 'gh pr view', 'gh pr create'],
    mcp: ['mcp__supabase__execute_sql', 'mcp__supabase__list_tables', 'mcp__supabase__apply_migration', 'mcp__linear__get_issue'],
    tasks: [
      { title: 'Add credit notes to invoices', prompts: ['add credit notes: a credit note references an invoice and reduces the amount due', 'write the migration and update the invoice PDF totals'] },
      { title: 'Handle duplicate Stripe webhooks', prompts: ['we sometimes process the same stripe webhook twice, make the handler idempotent', 'add a test that replays the same event'] },
      { title: 'Proration for mid-cycle upgrades', prompts: ['implement proration when a customer upgrades mid-cycle', 'show the proration line on the next invoice'] },
      { title: 'Investigate slow subscription list query', prompts: ['GET /subscriptions takes 4s for large accounts, find the slow query', 'add the index and check the query plan again'] },
      { title: 'Review PR #318 currency rounding', prompts: ['/code-review 318'] },
    ],
  },
  {
    dir: 'dev/mobile-app',
    weight: 3,
    files: ['app/(tabs)/index.tsx', 'app/(tabs)/orders.tsx', 'components/OrderRow.tsx', 'lib/api.ts', 'lib/auth.ts', 'app.json', 'eas.json'],
    bash: ['npx expo start', 'npx expo-doctor', 'npm test', 'git status', 'npx tsc --noEmit', 'eas build --platform ios --profile preview'],
    mcp: ['mcp__context7__query-docs', 'mcp__context7__resolve-library-id'],
    tasks: [
      { title: 'Pull to refresh on orders list', prompts: ['add pull to refresh to the orders tab', 'the list flickers after refresh, keep the old data until the new data arrives'] },
      { title: 'Fix token refresh race', prompts: ['two requests refresh the auth token at the same time and one of them logs the user out, fix the race'] },
      { title: 'Upgrade to Expo SDK 56', prompts: ['upgrade the app to Expo SDK 56 and fix what breaks', 'run expo-doctor and fix the warnings'] },
    ],
  },
  {
    dir: 'dev/infra',
    weight: 2,
    files: ['terraform/main.tf', 'terraform/rds.tf', 'terraform/variables.tf', '.github/workflows/deploy.yml', 'k8s/api-deployment.yaml'],
    bash: ['terraform plan', 'terraform fmt', 'kubectl get pods -n prod', 'kubectl logs deploy/api -n prod --tail=200', 'gh run list', 'git status'],
    mcp: [],
    tasks: [
      { title: 'Speed up deploy workflow', prompts: ['the deploy workflow takes 14 minutes, find where the time goes and cut it down', 'cache the docker layers between runs'] },
      { title: 'Add read replica for reporting', prompts: ['add an RDS read replica for the reporting service in terraform'] },
      { title: 'API pods restarting in prod', prompts: ['api pods in prod restart every few hours, look at the logs and the memory limits'] },
    ],
  },
  {
    dir: 'dev/docs-site',
    weight: 1.5,
    files: ['content/guides/getting-started.mdx', 'content/api/invoices.mdx', 'astro.config.mjs', 'src/components/CodeTabs.astro'],
    bash: ['npm run build', 'npm run dev', 'git status', 'npx vale content'],
    mcp: ['mcp__context7__query-docs'],
    tasks: [
      { title: 'Document credit notes API', prompts: ['write the API reference page for credit notes based on the billing-api routes'] },
      { title: 'Fix broken links after restructure', prompts: ['find and fix all broken internal links after the docs restructure'] },
    ],
  },
];

const FOLLOWUPS = [
  'run the tests',
  'looks good, commit it',
  'now handle the empty state',
  'that broke the build, check the type errors',
  'can you simplify this? it feels like too much code',
  'add a test for the edge case with zero items',
  'what does the rest of the codebase do for this?',
  'ok, open a PR',
  'use the existing helper instead of writing a new one',
  'why did you change that file?',
  'revert the change to the config, it was fine',
  'check it in the browser',
  'good. now update the docs',
  'the linter is complaining, fix it',
];

const SLASH_SKILLS = ['code-review', 'commit', 'simplify', 'security-review'];
const TOOL_SKILLS = ['frontend-design', 'supabase', 'code-review', 'pdf', 'webapp-testing'];
const BRANCHES = ['main', 'feat/credit-notes', 'fix/cart-rounding', 'chore/sdk-56', 'feat/dark-mode', 'fix/webhook-dedupe'];

// ---------- output

const root = mkdtempSync(join(tmpdir(), 'claude-demo-'));
const write = (rel: string, text: string) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};
const history: object[] = [];

let reqN = 0;
let toolN = 0;

const LAST_DAY = new Date(2026, 8, 28);
const DAYS = 30;

type Line = Record<string, unknown>;

interface Ctx {
  lines: Line[];
  base: (ts: number) => Line;
  model: string;
  effort: string;
  fast: boolean;
  ctx: number;
  cost: number;
}

function assistantLine(c: Ctx, ts: number, content: unknown[], stop: string, sidechain = false): number {
  const cw = c.ctx === 0 ? int(16000, 22000) : 0;
  const out = c.effort === 'max' ? int(400, 4000) : c.effort === 'medium' ? int(80, 1200) : int(120, 2600);
  const think = Math.round(out * (0.2 + rnd() * 0.45));
  const input = int(3, 60);
  const cr = c.ctx;
  const newCw = cw || int(600, 5000);
  const tokens = { input, cw5: 0, cw1h: newCw, cr, out };
  c.cost += costOf(c.model, tokens, c.fast)?.cost ?? 0;
  c.ctx += newCw + out;
  c.lines.push({
    type: 'assistant',
    ...c.base(ts),
    isSidechain: sidechain,
    requestId: `req_${(++reqN).toString(36).padStart(8, '0')}`,
    effort: c.effort,
    message: {
      model: c.model,
      role: 'assistant',
      content,
      stop_reason: stop,
      usage: {
        input_tokens: input,
        cache_creation_input_tokens: newCw,
        cache_read_input_tokens: cr,
        output_tokens: out,
        output_tokens_details: { thinking_tokens: think },
        cache_creation: { ephemeral_1h_input_tokens: newCw, ephemeral_5m_input_tokens: 0 },
        ...(c.fast ? { speed: 'fast' } : {}),
      },
    },
  });
  return newCw;
}

function toolInput(p: Project, cwd: string, name: string): { input: Record<string, unknown>; chars: number; images: number } {
  const file = () => `${cwd}/${pickHot(p.files)}`;
  switch (name) {
    case 'Read':
      return { input: { file_path: file() }, chars: skew(800, 16000, 2.4), images: 0 };
    case 'Edit':
      return { input: { file_path: file(), old_string: 'a', new_string: 'b' }, chars: int(120, 400), images: 0 };
    case 'Write':
      return { input: { file_path: file(), content: '' }, chars: int(80, 200), images: 0 };
    case 'Bash':
      return { input: { command: pickHot(p.bash) }, chars: skew(150, 7000, 2.4), images: 0 };
    case 'Grep':
      return { input: { pattern: 'x' }, chars: skew(200, 5000), images: 0 };
    case 'Glob':
      return { input: { pattern: '**/*.ts' }, chars: int(200, 1500), images: 0 };
    case 'TodoWrite':
      return { input: {}, chars: int(100, 300), images: 0 };
    case 'WebFetch':
      return { input: { url: pick(['https://docs.stripe.com/webhooks', 'https://nextjs.org/docs/app', 'https://docs.expo.dev/versions/latest/', 'https://www.postgresql.org/docs/current/indexes.html']) }, chars: int(3000, 16000), images: 0 };
    case 'mcp__playwright__browser_take_screenshot':
      return { input: {}, chars: 60, images: 1 };
    default:
      return { input: {}, chars: skew(300, 8000), images: 0 };
  }
}

function subagentRun(p: Project, cwd: string, sid: string, key: string, parent: Ctx, start: number, type: string, skill: string | null): number {
  const agentId = hex(16);
  const model = type === 'Explore' ? 'claude-haiku-4-5-20251001' : parent.model;
  const lines: Line[] = [];
  const c: Ctx = { lines, base: parent.base, model, effort: parent.effort, fast: false, ctx: 0, cost: 0 };
  let ts = start;
  lines.push({ type: 'user', ...parent.base(ts), isSidechain: true, message: { role: 'user', content: 'Investigate and report back.' } });
  const steps = skew(4, type === 'Explore' ? 18 : 28);
  for (let i = 0; i < steps; i++) {
    ts += int(2, 20) * 1000;
    const last = i === steps - 1;
    const name = pick(['Read', 'Read', 'Grep', 'Glob', 'Bash']);
    const t = toolInput(p, cwd, name);
    const id = `toolu_${(++toolN).toString(36)}`;
    assistantLine(c, ts, last ? [{ type: 'text', text: 'Done.' }] : [{ type: 'tool_use', id, name, input: t.input }], last ? 'end_turn' : 'tool_use', true);
    if (!last) {
      ts += int(1, 6) * 1000;
      lines.push({ type: 'user', ...parent.base(ts), isSidechain: true, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'x'.repeat(t.chars) }] } });
      c.ctx += Math.ceil(t.chars / 4);
    }
  }
  const dir = `projects/${key}/${sid}/subagents`;
  write(`${dir}/agent-${agentId}.jsonl`, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const desc: Record<string, string> = {
    Explore: 'Find where the pricing logic lives',
    'general-purpose': 'Research the failing test',
    'code-reviewer': 'Review the diff for bugs',
    Plan: 'Plan the migration steps',
  };
  write(`${dir}/agent-${agentId}.meta.json`, JSON.stringify({ agentType: type, description: desc[type] ?? 'Subtask' }));
  if (skill) write(`${dir}/agent-${agentId}.forked-skill.json`, JSON.stringify({ skillName: skill }));
  parent.cost += c.cost;
  return ts;
}

function session(p: Project, start: number): { cost: number } {
  const cwd = `${HOME}/${p.dir}`;
  const key = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const sid = uuid();
  const branch = pick(BRANCHES);
  const task = pick(p.tasks);
  const base = (ts: number): Line => ({ timestamp: new Date(ts).toISOString(), cwd, sessionId: sid, gitBranch: branch, version: VERSION, entrypoint: 'cli', userType: 'external' });
  const model = weighted([
    ['claude-opus-5-5', 62],
    ['claude-fable-5-1', 12],
    ['claude-sonnet-5-5', 20],
    ['claude-opus-5', 6],
  ] as const);
  const effort = weighted([
    ['high', 50],
    ['xhigh', 24],
    ['medium', 16],
    ['max', 10],
  ] as const);
  const c: Ctx = { lines: [], base, model, effort, fast: chance(0.08), ctx: 0, cost: 0 };
  const L = c.lines;
  let ts = start;
  let linesAdded = 0;
  let linesRemoved = 0;

  L.push({ type: 'attachment', ...base(ts), attachment: { type: 'hook_success', hookName: 'SessionStart:startup' } });

  const nPrompts = task.prompts.length + skew(0, 9);
  for (let pi = 0; pi < nPrompts; pi++) {
    const promptStart = ts;
    let text = task.prompts[pi] ?? pick(FOLLOWUPS);
    let slashSkill: string | null = null;
    if (text.startsWith('/')) slashSkill = text.slice(1).split(' ')[0];
    else if (pi > 0 && chance(0.1)) {
      slashSkill = pick(SLASH_SKILLS);
      text = `/${slashSkill}`;
    } else if (pi > 0 && chance(0.05)) {
      text = '/compact';
    }
    history.push({ display: text, timestamp: ts, project: cwd });

    if (text === '/compact') {
      L.push({ type: 'user', ...base(ts), message: { role: 'user', content: '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>' } });
      ts += int(20, 70) * 1000;
      L.push({ type: 'system', subtype: 'compact_boundary', ...base(ts), compactMetadata: { trigger: 'manual', preTokens: c.ctx, postTokens: int(14000, 24000), durationMs: int(20000, 70000) } });
      c.ctx = int(30000, 42000);
      ts += int(30, 300) * 1000;
      continue;
    }
    if (slashSkill) {
      const [name, ...args] = text.slice(1).split(' ');
      L.push({ type: 'user', ...base(ts), message: { role: 'user', content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>${args.join(' ')}</command-args>` } });
      L.push({ type: 'user', ...base(ts), isMeta: true, message: { role: 'user', content: [{ type: 'text', text: `Base directory for this skill: ${HOME}/.claude/skills/${name}` }] } });
    } else {
      L.push({ type: 'user', ...base(ts), message: { role: 'user', content: text } });
    }

    const nCalls = pi < task.prompts.length || slashSkill ? skew(10, 48, 1.3) : skew(2, 16, 1.8);
    for (let ci = 0; ci < nCalls; ci++) {
      ts += int(3, 35) * 1000;
      if (chance(0.004)) {
        L.push({ type: 'assistant', ...base(ts), isApiErrorMessage: true, message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: pick(['API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', 'API Error: Request timed out.', 'API Error: Connection error.']) }], usage: { input_tokens: 0, output_tokens: 0 } } });
        ts += int(5, 30) * 1000;
      }
      if (ci === nCalls - 1) {
        assistantLine(c, ts, [{ type: 'text', text: 'Done.' }], chance(0.002) ? 'refusal' : 'end_turn');
        break;
      }
      const toolW: [string, number][] = [
        ['Read', 30],
        ['Edit', 17],
        ['Bash', 20],
        ['Grep', 9],
        ['Glob', 4],
        ['Write', 3],
        ['TodoWrite', 3],
        ['Agent', ci > 0 ? 2.2 : 0],
        ['WebFetch', 1.2],
        ['Skill', ci === 0 && !slashSkill ? 5 : 0],
      ];
      for (const m of p.mcp) toolW.push([m, 5 / Math.max(1, p.mcp.length)]);
      const name = weighted(toolW);
      const id = `toolu_${(++toolN).toString(36)}`;

      if (name === 'Agent') {
        const type = weighted([
          ['Explore', 5],
          ['general-purpose', 3],
          ['code-reviewer', 2],
          ['Plan', 1],
        ] as const);
        assistantLine(c, ts, [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: type, description: 'Subtask', prompt: '...' } }], 'tool_use');
        ts = subagentRun(p, cwd, sid, key, c, ts + 1000, type, slashSkill && chance(0.5) ? slashSkill : null);
        L.push({ type: 'user', ...base(ts), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'x'.repeat(int(1500, 6000)) }] } });
        continue;
      }
      if (name === 'Skill') {
        const skill = pick(TOOL_SKILLS);
        assistantLine(c, ts, [{ type: 'tool_use', id, name, input: { skill } }], 'tool_use');
        L.push({ type: 'user', ...base(ts + 500), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'x'.repeat(int(2000, 9000)) }] } });
        continue;
      }

      const t = toolInput(p, cwd, name);
      assistantLine(c, ts, [{ type: 'tool_use', id, name, input: t.input }], 'tool_use');
      if (name === 'Bash' && chance(0.6)) L.push({ type: 'attachment', ...base(ts), attachment: { type: chance(0.97) ? 'hook_success' : 'hook_non_blocking_error', hookName: 'PreToolUse:Bash' } });
      if (name === 'Edit') {
        linesAdded += int(1, 40);
        linesRemoved += int(0, 20);
        if (chance(0.5)) L.push({ type: 'attachment', ...base(ts), attachment: { type: chance(0.95) ? 'hook_success' : 'hook_non_blocking_error', hookName: 'PostToolUse:Edit' } });
      }
      if (name === 'Write') linesAdded += int(20, 180);
      ts += int(1, name === 'Bash' ? 60 : 4) * 1000;

      const denial = (name === 'Bash' || name.startsWith('mcp__')) && chance(0.035);
      const error = !denial && chance(name === 'Bash' ? 0.09 : name === 'Edit' ? 0.05 : 0.015);
      const content = t.images ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: '' } }] : 'x'.repeat(denial ? 90 : t.chars);
      L.push({
        type: 'user',
        ...base(ts),
        ...(denial ? { toolDenialKind: weighted([['permission-rule', 6], ['automode-blocked', 2], ['user-rejected', 1.5]] as const) } : {}),
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: denial || error, content }] },
      });
      c.ctx += t.images ? 1600 : Math.ceil(t.chars / 4);

      if (c.ctx > 185000) {
        ts += int(30, 90) * 1000;
        L.push({ type: 'system', subtype: 'compact_boundary', ...base(ts), compactMetadata: { trigger: 'auto', preTokens: c.ctx, postTokens: int(16000, 28000), durationMs: int(30000, 95000) } });
        L.push({ type: 'attachment', ...base(ts), attachment: { type: 'hook_additional_context', hookName: 'SessionStart:compact' } });
        c.ctx = int(32000, 45000);
      }
    }
    L.push({ type: 'system', subtype: 'turn_duration', ...base(ts), durationMs: ts - promptStart });
    if (chance(0.7)) L.push({ type: 'system', subtype: 'stop_hook_summary', ...base(ts), hookInfos: [{ command: `${HOME}/.claude/hooks/notify.sh` }], hookErrors: chance(0.03) ? ['exit 1'] : [] });
    ts += skew(20, 600) * 1000;
  }

  L.splice(1, 0, { type: 'ai-title', aiTitle: task.title, sessionId: sid });
  if (chance(0.85)) {
    L.push({
      type: 'cost-state',
      ...base(ts),
      totalCostUSD: c.cost * (1.02 + rnd() * 0.04),
      totalLinesAdded: linesAdded,
      totalLinesRemoved: linesRemoved,
      totalAPIDuration: int(200, 3000) * 1000,
      totalToolDuration: int(50, 900) * 1000,
    });
  }
  write(`projects/${key}/${sid}.jsonl`, L.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return { cost: c.cost };
}

// ---------- 30 days of sessions

const HOURS = [0, 0, 0, 0, 0, 0, 0, 0.3, 1.5, 4, 5, 5, 2.5, 3.5, 5, 5, 4.5, 3.5, 1.5, 1, 1.5, 2, 1.2, 0.4];
let total = 0;
let sessions = 0;
for (let d = DAYS - 1; d >= 0; d--) {
  const day = new Date(LAST_DAY);
  day.setDate(day.getDate() - d);
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const ramp = 0.75 + 0.5 * ((DAYS - d) / DAYS);
  const n = Math.round((weekend ? int(0, 3) : int(5, 11)) * ramp);
  for (let i = 0; i < n; i++) {
    const hour = weighted(HOURS.map((w, h) => [h, w] as const));
    const start = new Date(day);
    start.setHours(hour, int(0, 59), int(0, 59));
    const p = weighted(PROJECTS.map((x) => [x, x.weight] as const));
    total += session(p, start.getTime()).cost;
    sessions++;
  }
}

// Prompt history reaches further back than the transcripts (which are cleaned up after 30 days).
for (let d = DAYS; d < 75; d++) {
  const day = new Date(LAST_DAY);
  day.setDate(day.getDate() - d);
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const n = weekend ? int(0, 8) : int(12, 45);
  for (let i = 0; i < n; i++) {
    const t = new Date(day);
    t.setHours(weighted(HOURS.map((w, h) => [h, w] as const)), int(0, 59));
    const p = weighted(PROJECTS.map((x) => [x, x.weight] as const));
    history.push({ display: chance(0.1) ? '/clear' : pick(FOLLOWUPS), timestamp: t.getTime(), project: `${HOME}/${p.dir}` });
  }
}
history.sort((a, b) => (a as { timestamp: number }).timestamp - (b as { timestamp: number }).timestamp);
write('history.jsonl', history.map((h) => JSON.stringify(h)).join('\n') + '\n');

const now = new Date(LAST_DAY);
now.setHours(17, 42);
write('sessions/48213.json', JSON.stringify({ pid: 48213, sessionId: uuid(), cwd: `${HOME}/dev/billing-api`, name: 'credit-notes', status: 'busy', kind: 'interactive', version: VERSION, startedAt: now.getTime() - 3_400_000, updatedAt: now.getTime() }));
write('sessions/51877.json', JSON.stringify({ pid: 51877, sessionId: uuid(), cwd: `${HOME}/dev/storefront`, name: '', status: 'idle', kind: 'interactive', version: VERSION, startedAt: now.getTime() - 9_100_000, updatedAt: now.getTime() - 1_200_000 }));
write('stats-cache.json', JSON.stringify({ firstSessionDate: '2026-03-02T09:14:00.000Z', totalSessions: 1843, totalMessages: 95210, lastComputedDate: '2026-09-28' }));

rmSync(out, { force: true });
execFileSync('zip', ['-qr', out, '.'], { cwd: root });
rmSync(root, { recursive: true, force: true });
console.log(`${sessions} sessions, $${total.toFixed(0)} at API prices -> ${out}`);
