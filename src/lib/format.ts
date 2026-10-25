import type { ContractStatus } from '../db/types';

const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: 'Draft', sent: 'Sent', signed: 'Signed', active: 'Active', completed: 'Completed', cancelled: 'Cancelled',
};

const groupDigits = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const Fmt = {
  money(amount: number | null | undefined, currency = 'PKR'): string {
    const n = Number(amount) || 0;
    return `${currency} ${n < 0 ? '-' : ''}${groupDigits(Math.abs(n))}`;
  },
  date(ts: number | null | undefined, short = false): string {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const months = short
      ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  },
  /** yyyy-mm-dd in local time, for the date text fields. */
  dateInput(ts: number | null | undefined): string {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  /** Parses yyyy-mm-dd (local midnight). Returns null for empty, undefined for invalid. */
  parseDateInput(s: string): number | null | undefined {
    const t = s.trim();
    if (!t) return null;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (!m) return undefined;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])
      ? d.getTime() : undefined;
  },
  status(s: ContractStatus): string { return STATUS_LABEL[s] ?? s; },
  initials(name: string | null | undefined): string {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  },
};
