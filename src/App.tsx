import { useEffect, useRef, useState } from 'react';
import Dashboard from './Dashboard';
import { icons, Logo } from './components/icons';
import { Footer, ThemeToggle, TooltipProvider } from './components/ui';
import { bytes } from './core/format';
import type { Dataset } from './core/types';
import type { Progress } from './core/zip';
import { applyTheme, currentTheme, type Theme } from './theme';
import type { WorkerMessage } from './worker/parse.worker';

// Screenshots made from synthetic data (scripts/demo-data.ts), one per theme.
const EXAMPLES = [
  { id: 'overview', w: 2000, h: 1135, title: 'Overview', text: 'Cost at API prices, tokens, cache reads, sessions and lines changed at a glance.' },
  { id: 'spend', w: 2000, h: 1491, title: 'Where the money goes', text: 'Daily cost by model, project or token type, plus effort levels and subagents.' },
  { id: 'tools', w: 2000, h: 1579, title: 'Tools and MCP', text: 'The tools, MCP servers, Bash commands and files Claude uses most.' },
  { id: 'prompts', w: 2000, h: 879, title: 'Most expensive prompts', text: 'Every prompt with its cost, API calls, tools and the subagents it started.' },
  { id: 'activity', w: 2000, h: 1149, title: 'Activity', text: 'When you work, how long turns take, and your prompt history over time.' },
] as const;

type Example = (typeof EXAMPLES)[number];

const ZIP_CMD = `cd ~/.claude && zip -r ~/Desktop/claude-data.zip projects history.jsonl stats-cache.json sessions -x '*/tool-results/*'`;

type State =
  | { phase: 'idle'; error?: string }
  | { phase: 'loading'; name: string; progress: Progress | null }
  | { phase: 'ready'; dataset: Dataset };

export default function App() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const changeTheme = (t: Theme) => {
    applyTheme(t);
    setTheme(t);
  };
  const workerRef = useRef<Worker | null>(null);

  const load = (file: File) => {
    if (!/\.zip$/i.test(file.name)) {
      setState({ phase: 'idle', error: `"${file.name}" is not a .zip file.` });
      return;
    }
    workerRef.current?.terminate();
    const worker = new Worker(new URL('./worker/parse.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setState({ phase: 'loading', name: file.name, progress: null });
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      if (m.type === 'progress') setState({ phase: 'loading', name: file.name, progress: m.progress });
      else if (m.type === 'done') {
        setState({ phase: 'ready', dataset: m.dataset });
        worker.terminate();
      } else {
        setState({ phase: 'idle', error: m.message });
        worker.terminate();
      }
    };
    worker.onerror = (e) => setState({ phase: 'idle', error: e.message || 'Failed to process the file.' });
    worker.postMessage({ file });
  };

  return (
    <TooltipProvider>
      {state.phase === 'ready' ? (
        <Dashboard dataset={state.dataset} onReset={() => setState({ phase: 'idle' })} theme={theme} onTheme={changeTheme} />
      ) : (
        <>
          <ThemeToggle theme={theme} onChange={changeTheme} className="landing-toggle" />
          <Landing state={state} onFile={load} />
          {state.phase === 'idle' && <Examples theme={theme} />}
        </>
      )}
      <Footer />
    </TooltipProvider>
  );
}

function Shot({ ex, theme }: { ex: Example; theme: Theme }) {
  return <img src={`/examples/${ex.id}-${theme}.webp`} width={ex.w} height={ex.h} alt={`${ex.title}: ${ex.text}`} loading="lazy" decoding="async" />;
}

function Examples({ theme }: { theme: Theme }) {
  const [open, setOpen] = useState<Example | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <section className="examples" id="examples">
      <div className="examples-head">
        <h2>What you'll see</h2>
        <p>An example dashboard built from sample data. Your own zip gives you the same view of your usage.</p>
      </div>
      <div className="examples-grid">
        {EXAMPLES.map((ex, i) => (
          <figure key={ex.id} className={`example${i === 0 ? ' featured' : ''}`}>
            <button className="example-shot" onClick={() => setOpen(ex)} aria-label={`Enlarge: ${ex.title}`}>
              <Shot ex={ex} theme={theme} />
            </button>
            <figcaption>
              <strong>{ex.title}</strong>
              <span>{ex.text}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={open.title} onClick={() => setOpen(null)}>
          <Shot ex={open} theme={theme} />
        </div>
      )}
    </section>
  );
}

function Landing({ state, onFile }: { state: Exclude<State, { phase: 'ready' }>; onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const p = state.phase === 'loading' ? state.progress : null;
  const ratio = p && p.totalBytes ? p.doneBytes / p.totalBytes : 0;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-hero">
          <Logo size={52} />
          <h1>Claude Code Analytics</h1>
          <p>
            See where tokens and money go, which prompts and sessions cost the most, which tools, skills and subagents you use, and where work gets
            stuck.
          </p>
          <div className="chips">
            <span className="chip">{icons.lock} Stays in your browser</span>
            <span className="chip">{icons.bolt} Parsed locally in a worker</span>
            <span className="chip">{icons.chart} Costs at API prices</span>
          </div>
          {state.phase === 'idle' && (
            <a className="see-example" href="#examples">
              See an example dashboard ↓
            </a>
          )}
        </div>

        {state.phase === 'loading' ? (
          <div className="card loading-card">
            <div className="card-title">Processing {state.name}</div>
            <div className="progress">
              <div style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            <div className="card-sub">
              {p
                ? `${bytes(p.doneBytes)} of ${bytes(p.totalBytes)} · file ${p.filesDone} of ${p.filesTotal}`
                : 'Reading the archive file list…'}
            </div>
            {p?.current && (
              <div className="note" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.current}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`dropzone${over ? ' over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files[0];
              if (f) onFile(f);
            }}
          >
            <span className="dz-icon">{icons.upload}</span>
            <strong>Drop claude-data.zip here</strong>
            <span className="dz-sub">or click to choose a file</span>
            <input
              ref={input}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = '';
              }}
            />
          </div>
        )}
        {state.phase === 'idle' && state.error && <div className="error">{state.error}</div>}

        <div className="card howto">
          <h3>How to prepare the zip</h3>
          <p>Run this in a terminal:</p>
          <div className="cmd">
            <code>{ZIP_CMD}</code>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(ZIP_CMD).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? icons.check : icons.copy}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="fine">
            <code>projects/</code> holds session and subagent transcripts (the source of tokens, costs, tools and skills). <code>history.jsonl</code> is
            the prompt history, which goes further back than the transcripts. <code>sessions/</code> lists the sessions running when the zip was made.{' '}
            <code>tool-results</code> directories are skipped because they are large and not needed. By default Claude Code deletes transcripts older
            than 30 days (<code>cleanupPeriodDays</code>).
          </p>
        </div>
      </div>
    </div>
  );
}
