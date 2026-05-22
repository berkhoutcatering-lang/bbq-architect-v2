'use client';
import { X } from 'lucide-react';
import type { AgendaFilterState, AgendaStatus } from '../_lib/types';

interface CalendarOption { id: string; label: string; color: string }

interface FilterPillsBarProps {
    calendars: CalendarOption[];
    value: AgendaFilterState;
    onChange: (next: AgendaFilterState) => void;
}

const ALL_STATUSES: AgendaStatus[] = ['live', 'optie', 'aanvraag', 'other'];
const STATUS_LABEL: Record<AgendaStatus, string> = {
    live: 'Live',
    optie: 'Optie',
    aanvraag: 'Aanvraag',
    other: 'Overig',
};

const NL_MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function fmtDateNl(iso: string): string {
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    const mi = parseInt(m, 10) - 1;
    return `${parseInt(d, 10)} ${NL_MONTHS_SHORT[mi] || m}`;
}

/* Open de FilterPopover door op de knop in MonthNav te klikken. We
   gebruiken een data-attribute zodat we geen ref-drilling nodig hebben
   tussen sibling components. */
function openFilterPopover() {
    const btn = document.querySelector<HTMLButtonElement>('[data-agenda-filter-trigger]');
    if (btn) {
        btn.click();
        btn.focus();
    }
}

interface Pill {
    key: string;
    label: string;
    accent?: string;
    onRemove: () => void;
}

export default function FilterPillsBar({ calendars, value, onChange }: FilterPillsBarProps) {
    const pills: Pill[] = [];

    /* Calendar-filter pill: alleen tonen als niet alles aan staat. Toon
       het aantal geselecteerd uit het totaal — bondiger dan een pill per cal. */
    const allCalsActive = value.cals.length === calendars.length
        && calendars.every(c => value.cals.includes(c.id));
    if (!allCalsActive) {
        if (value.cals.length === 1) {
            const only = calendars.find(c => c.id === value.cals[0]);
            pills.push({
                key: 'cals',
                label: `Agenda: ${only?.label ?? '—'}`,
                accent: only?.color,
                onRemove: () => onChange({ ...value, cals: calendars.map(c => c.id) }),
            });
        } else {
            pills.push({
                key: 'cals',
                label: `Agenda's: ${value.cals.length}/${calendars.length}`,
                onRemove: () => onChange({ ...value, cals: calendars.map(c => c.id) }),
            });
        }
    }

    /* Status-pill per actieve status — toont concreet wat door mag. */
    const allStatusesActive = value.statuses.length === ALL_STATUSES.length
        && ALL_STATUSES.every(s => value.statuses.includes(s));
    if (!allStatusesActive) {
        for (const s of value.statuses) {
            pills.push({
                key: `status:${s}`,
                label: `Status: ${STATUS_LABEL[s]}`,
                onRemove: () => {
                    const next = value.statuses.filter(x => x !== s);
                    /* Lege selectie = niets zichtbaar — niet wat user wil als
                       hij gewoon één pill weghaalt. Reset dan naar alles. */
                    onChange({ ...value, statuses: next.length === 0 ? ALL_STATUSES : next });
                },
            });
        }
    }

    if (value.from) {
        pills.push({
            key: 'from',
            label: `Vanaf ${fmtDateNl(value.from)}`,
            onRemove: () => onChange({ ...value, from: undefined }),
        });
    }
    if (value.to) {
        pills.push({
            key: 'to',
            label: `Tot ${fmtDateNl(value.to)}`,
            onRemove: () => onChange({ ...value, to: undefined }),
        });
    }

    if (pills.length === 0) return null;

    return (
        <div
            className="agenda-filter-pills"
            role="region"
            aria-label="Actieve filters"
            style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px',
                background: 'rgba(28,28,32,.5)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflowX: 'auto',
                marginBottom: 18,
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'thin',
            }}
        >
            <span style={{
                fontSize: 10, color: 'var(--muted-light)', letterSpacing: '.18em',
                textTransform: 'uppercase', fontWeight: 700, flexShrink: 0,
                marginRight: 2,
            }}>
                Filter
            </span>
            {pills.map(p => (
                <div
                    key={p.key}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 4px 6px 10px',
                        background: p.accent ? `${p.accent}1f` : 'rgba(255,191,0,.08)',
                        border: `1px solid ${p.accent ? `${p.accent}55` : 'rgba(255,191,0,.35)'}`,
                        borderRadius: 999,
                        flexShrink: 0,
                        minHeight: 28,
                    }}
                >
                    <button
                        type="button"
                        onClick={openFilterPopover}
                        aria-label={`Bewerk filter: ${p.label}`}
                        style={{
                            background: 'transparent', border: 'none',
                            color: p.accent || '#FFBF00', fontSize: 11, fontWeight: 600,
                            padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        {p.accent && (
                            <span style={{
                                display: 'inline-block', width: 7, height: 7,
                                borderRadius: '50%', background: p.accent,
                                marginRight: 6, verticalAlign: 'middle',
                            }} />
                        )}
                        {p.label}
                    </button>
                    <button
                        type="button"
                        onClick={p.onRemove}
                        aria-label={`Verwijder filter: ${p.label}`}
                        style={{
                            width: 22, height: 22, borderRadius: '50%',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: 'none',
                            color: p.accent || 'var(--muted)',
                            cursor: 'pointer', padding: 0,
                            opacity: 0.7,
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.opacity = '1';
                            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.06)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.opacity = '0.7';
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                        }}
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => onChange({
                    cals: calendars.map(c => c.id),
                    statuses: ALL_STATUSES,
                    from: undefined,
                    to: undefined,
                })}
                style={{
                    marginLeft: 'auto',
                    background: 'transparent', border: 'none',
                    color: 'var(--muted)', fontSize: 11, fontWeight: 500,
                    cursor: 'pointer', padding: '4px 8px', flexShrink: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
            >
                Reset alles
            </button>
        </div>
    );
}
