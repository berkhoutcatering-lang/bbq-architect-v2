// Format helpers voor de uren-pagina.
// HH:MM:SS, durations, NL-tijdstring.

export function calcHoursMs(ms: number): number {
  return ms / 3_600_000;
}

export function fmtDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return h + 'u ' + (m < 10 ? '0' : '') + m + 'm';
}

export function fmtTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (
    (h < 10 ? '0' : '') + h + ':' +
    (m < 10 ? '0' : '') + m + ':' +
    (s < 10 ? '0' : '') + s
  );
}

export function fmtTimeNL(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
    (d.getMinutes() < 10 ? '0' : '') + d.getMinutes()
  );
}

export function fmtDateNL(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
}

export function fmtDateTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function shiftDurationMs(start: string, end: string | null, fallbackNow: number = Date.now()): number {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : fallbackNow;
  return Math.max(0, endMs - startMs);
}

export function monthLabelNL(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
}
