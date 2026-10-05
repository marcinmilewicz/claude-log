import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Theme } from '../theme';
import { GitHubIcon, icons, LinkedInIcon } from './icons';

// ---------- Footer ----------

export const REPO_URL = 'https://github.com/marcinmilewicz/claude-log';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-cta">
        <p>
          <strong>Finding claude-log useful?</strong> Give it a star on GitHub. It takes one click and helps other Claude Code users find it.
        </p>
        <a className="star-btn" href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <span className="star-btn-icon">{icons.star}</span>
          Star claude-log on GitHub
        </a>
      </div>
      <div className="footer-credit">
        Made by{' '}
        <a href="https://www.linkedin.com/in/marcinmilewicz/" target="_blank" rel="noopener noreferrer">
          <LinkedInIcon />
          Marcin Milewicz
        </a>
        <span aria-hidden="true">·</span>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <GitHubIcon />
          Open source on GitHub
        </a>
      </div>
    </footer>
  );
}

// ---------- Theme toggle ----------

export function ThemeToggle({ theme, onChange, className = '' }: { theme: Theme; onChange: (t: Theme) => void; className?: string }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;
  return (
    <button className={`btn theme-toggle ${className}`} onClick={() => onChange(next)} aria-label={label} title={label}>
      {theme === 'dark' ? icons.sun : icons.moon}
    </button>
  );
}

// ---------- Tooltip (one for the whole app) ----------

export interface TipRow {
  name: string;
  value: string;
  color?: string;
}

interface Tip {
  x: number;
  y: number;
  title?: string;
  rows: TipRow[];
}

const TipContext = createContext<(t: Tip | null) => void>(() => {});

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let left = tip.x + 14;
    let top = tip.y + 14;
    if (left + r.width > window.innerWidth - 8) left = tip.x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = tip.y - r.height - 14;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [tip]);

  return (
    <TipContext.Provider value={setTip}>
      {children}
      {tip && (
        <div className="tooltip" ref={ref} style={pos} role="tooltip">
          {tip.title && <div className="tt-title">{tip.title}</div>}
          {tip.rows.map((r, i) => (
            <div className="tt-row" key={i}>
              {r.color && <span className="tt-key" style={{ background: r.color }} />}
              <span className="tt-value">{r.value}</span>
              <span className="tt-name">{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </TipContext.Provider>
  );
}

export function useTip() {
  const set = useContext(TipContext);
  return useMemo(
    () => ({
      show: (e: { clientX: number; clientY: number }, title: string | undefined, rows: TipRow[]) => set({ x: e.clientX, y: e.clientY, title, rows }),
      showAt: (el: Element, title: string | undefined, rows: TipRow[]) => {
        const r = el.getBoundingClientRect();
        set({ x: r.right, y: r.top, title, rows });
      },
      hide: () => set(null),
    }),
    [set],
  );
}

// ---------- Card with a chart/table toggle ----------

export function Card({
  title,
  sub,
  span = 6,
  table,
  tools,
  note,
  children,
}: {
  title: string;
  sub?: ReactNode;
  span?: 3 | 4 | 6 | 8 | 12;
  table?: TableProps<any>;
  tools?: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`card span-${span}`}>
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
        <div className="card-tools">
          {tools}
          {table && children && (
            <button className="btn-link" onClick={() => setAsTable((v) => !v)}>
              {asTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </div>
      {table && (asTable || !children) ? <DataTable {...table} /> : children}
      {note && <div className="note">{note}</div>}
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- KPI tile ----------

// span={null}: a tile inside its own nested grid.
export function StatTile({ label, value, sub, hero, span = 3 }: { label: string; value: string; sub?: ReactNode; hero?: boolean; span?: 3 | 4 | 6 | null }) {
  return (
    <div className={`card tile${span ? ` span-${span}` : ''}${hero ? ' hero' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// ---------- Horizontal bar list ----------

export interface BarItem {
  key: string;
  label: string;
  value: number;
}

export function BarList<T extends BarItem>({
  rows,
  format,
  limit = 10,
  tip,
  display,
}: {
  rows: T[];
  format: (v: number) => string;
  limit?: number;
  tip?: (r: T) => TipRow[];
  display?: (r: T) => string;
}) {
  const [all, setAll] = useState(false);
  const t = useTip();
  const visible = all ? rows : rows.slice(0, limit);
  const max = Math.max(...visible.map((r) => r.value), 0);
  if (rows.length === 0) return <div className="empty">No data in the selected range.</div>;
  return (
    <>
      <div className="barlist">
        {visible.map((r) => {
          const rowsTip = [{ name: '', value: format(r.value) }, ...(tip ? tip(r) : [])];
          return (
            <div
              className="bl-row"
              key={r.key}
              tabIndex={0}
              onPointerMove={(e) => t.show(e, r.label, rowsTip)}
              onPointerLeave={t.hide}
              onFocus={(e) => t.showAt(e.currentTarget.children[1] ?? e.currentTarget, r.label, rowsTip)}
              onBlur={t.hide}
            >
              <div className="bl-label" title={r.label}>
                {display ? display(r) : r.label}
              </div>
              <div className="bl-track">
                <div className="bl-bar" style={{ width: max > 0 ? `${(r.value / max) * 100}%` : 0 }} />
              </div>
              <div className="bl-value">{format(r.value)}</div>
            </div>
          );
        })}
      </div>
      {rows.length > limit && (
        <button className="btn-link" style={{ marginTop: 8 }} onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show all (${rows.length})`}
        </button>
      )}
    </>
  );
}

// ---------- Sortable table ----------

export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  wrap?: boolean;
  value?: (r: T) => number | string;
  render?: (r: T) => ReactNode;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  sortKey?: string;
  limit?: number;
}

export function DataTable<T extends object>({ columns, rows, sortKey, limit = 200 }: TableProps<T>) {
  const [sort, setSort] = useState<{ key: string; asc: boolean }>({ key: sortKey ?? '', asc: false });
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.value ?? ((r: T) => (r as Record<string, unknown>)[col.key] as number | string);
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'en');
      return sort.asc ? cmp : -cmp;
    });
  }, [rows, columns, sort]);
  if (rows.length === 0) return <div className="empty">No data in the selected range.</div>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.num ? 'num' : ''} ${sort.key === c.key ? 'sorted' : ''} ${sort.key === c.key && sort.asc ? 'asc' : ''}`}
                onClick={() => setSort((s) => ({ key: c.key, asc: s.key === c.key ? !s.asc : false }))}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : c.wrap ? 'wrap' : ''}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Container size ----------

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
