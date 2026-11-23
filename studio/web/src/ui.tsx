// Small shared building blocks. Colours come only from the tokens in index.css.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';
import type { JobStatus } from './api';

export function Card({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="glass rounded-3xl p-5 sm:p-7">
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = 'primary', busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary'; busy?: boolean }) {
  const look = variant === 'primary'
    ? 'bg-ink text-white hover:bg-accent-strong active:bg-accent-strong'
    : 'border border-line bg-white/70 text-ink hover:bg-white active:bg-white';
  return (
    <button {...rest} disabled={rest.disabled || busy}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-6 font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${look}`}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const note = error ?? hint;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children(id, note ? `${id}-note` : undefined)}
      {note && <p id={`${id}-note`} className={`mt-1 text-sm ${error ? 'text-bad' : 'text-muted'}`}>{note}</p>}
    </div>
  );
}

export const inputClass = 'block min-h-11 w-full rounded-xl border border-line bg-white/70 px-3.5 py-2 transition-colors duration-150 focus:bg-white text-base text-ink placeholder:text-muted';

const STATUS: Record<string, { label: string; look: string; Icon: typeof CheckCircle2 }> = {
  queued: { label: 'Queued', look: 'bg-soft text-muted', Icon: CircleDashed },
  running: { label: 'Running', look: 'bg-warnbg text-warn', Icon: Loader2 },
  done: { label: 'Done', look: 'bg-okbg text-ok', Icon: CheckCircle2 },
  failed: { label: 'Failed', look: 'bg-badbg text-bad', Icon: XCircle },
};
// Status is shown with an icon and a word, never by colour alone.
export function StatusChip({ status }: { status: JobStatus | string }) {
  const s = STATUS[status] ?? { label: status, look: 'bg-soft text-muted', Icon: CircleDashed };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${s.look}`}>
      <s.Icon className={`size-4 ${status === 'running' ? 'animate-spin' : ''}`} aria-hidden />
      {s.label}
    </span>
  );
}

export function Notice({ kind, children }: { kind: 'bad' | 'warn' | 'info'; children: ReactNode }) {
  const look = kind === 'bad' ? 'border-bad bg-badbg text-bad' : kind === 'warn' ? 'border-warn bg-warnbg text-warn' : 'border-line bg-white/60 text-body';
  return <div role={kind === 'bad' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-sm ${look}`}>{children}</div>;
}

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export function duration(from: string | null, to: string | null, now = Date.now()) {
  if (!from) return '';
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : now) - Date.parse(from)) / 1000));
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}
