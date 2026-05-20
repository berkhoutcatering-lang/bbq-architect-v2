'use client';
import { useEffect, useRef, useState } from 'react';
import { Filter, X, Check } from 'lucide-react';
import type { AgendaFilterState, AgendaStatus } from '../_lib/types';

interface CalendarOption { id: string; label: string; color: string }

interface FilterPopoverProps {
    calendars: CalendarOption[];
    value: AgendaFilterState;
    onChange: (next: AgendaFilterState) => void;
}

const STATUS_OPTIONS: { id: AgendaStatus; label: string }[] = [
    { id: 'live', label: 'Live / Bevestigd' },
    { id: 'optie', label: 'Optie' },
    { id: 'aanvraag', label: 'Aanvraag' },
    { id: 'other', label: 'Overig' },
];

export default function FilterPopover({ calendars, value, onChange }: FilterPopoverProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    /* Outside-click sluit popover. Capture-listener zodat clicks binnen
       het popover-paneel zelf niet sluiten — we checken contains(). */
    useEffect(function () {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        return function () { document.removeEventListener('mousedown', onDoc); };
    }, [open]);

    const activeCount =
        (calendars.length - value.cals.length) +
        (STATUS_OPTIONS.length - value.statuses.length) +
        (value.from ? 1 : 0) +
        (value.to ? 1 : 0);

    function toggleCal(id: string) {
        const has = value.cals.includes(id);
        const next = has ? value.cals.filter(x => x !== id) : [...value.cals, id];
        onChange({ ...value, cals: next });
    }

    function toggleStatus(id: AgendaStatus) {
        const has = value.statuses.includes(id);
        const next = has ? value.statuses.filter(x => x !== id) : [...value.statuses, id];
        onChange({ ...value, statuses: next });
    }

    function clearAll() {
        onChange({
            cals: calendars.map(c => c.id),
            statuses: STATUS_OPTIONS.map(s => s.id),
            from: undefined,
            to: undefined,
        });
    }

    return (
        <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setOpen(v => !v)}
                aria-haspopup="dialog"
                aria-expanded={open}
                style={{
                    padding: '7px 12px', borderRadius: 8,
                    background: activeCount > 0 ? 'rgba(255,191,0,.08)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${activeCount > 0 ? 'rgba(255,191,0,.35)' : 'var(--border)'}`,
                    color: activeCount > 0 ? '#FFBF00' : 'var(--muted)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
            >
                <Filter size={11} /> Filter
                {activeCount > 0 && (
                    <span style={{
                        marginLeft: 2, padding: '1px 6px', borderRadius: 999,
                        background: '#FFBF00', color: '#000',
                        fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    }}>{activeCount}</span>
                )}
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Agenda-filters"
                    style={{
                        position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                        width: 320, zIndex: 50,
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        boxShadow: '0 20px 40px rgba(0,0,0,.45)',
                        padding: 16,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <strong style={{ fontSize: 12, color: 'var(--text)' }}>Filter agenda</strong>
                        <button
                            onClick={clearAll}
                            style={{
                                fontSize: 10, color: 'var(--muted)', background: 'transparent',
                                border: 'none', cursor: 'pointer', padding: 4,
                            }}
                            aria-label="Alle filters resetten"
                        >Reset</button>
                    </div>

                    <Section title="Agenda's">
                        {calendars.map(c => {
                            const checked = value.cals.includes(c.id);
                            return (
                                <CheckRow
                                    key={c.id}
                                    label={c.label}
                                    color={c.color}
                                    checked={checked}
                                    onClick={() => toggleCal(c.id)}
                                />
                            );
                        })}
                    </Section>

                    <Section title="Status">
                        {STATUS_OPTIONS.map(s => {
                            const checked = value.statuses.includes(s.id);
                            return (
                                <CheckRow
                                    key={s.id}
                                    label={s.label}
                                    checked={checked}
                                    onClick={() => toggleStatus(s.id)}
                                />
                            );
                        })}
                    </Section>

                    <Section title="Datumbereik">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: 'var(--muted)' }}>
                                Van
                                <input
                                    type="date"
                                    value={value.from || ''}
                                    onChange={e => onChange({ ...value, from: e.target.value || undefined })}
                                    style={inputStyle}
                                />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: 'var(--muted)' }}>
                                Tot
                                <input
                                    type="date"
                                    value={value.to || ''}
                                    onChange={e => onChange({ ...value, to: e.target.value || undefined })}
                                    style={inputStyle}
                                />
                            </label>
                        </div>
                    </Section>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <button
                            onClick={() => setOpen(false)}
                            style={{
                                padding: '6px 14px', borderRadius: 7,
                                background: '#FFBF00', color: '#000',
                                border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            <Check size={12} /> Klaar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 6 }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
        </div>
    );
}

function CheckRow({ label, color, checked, onClick }: { label: string; color?: string; checked: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 8px', borderRadius: 6,
                background: 'transparent', border: 'none',
                color: 'var(--text)', fontSize: 12, cursor: 'pointer',
                textAlign: 'left', width: '100%',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.04)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
            <span style={{
                width: 14, height: 14, borderRadius: 3,
                border: `1px solid ${checked ? '#FFBF00' : 'var(--border)'}`,
                background: checked ? '#FFBF00' : 'transparent',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                {checked && <Check size={10} color="#000" strokeWidth={3} />}
            </span>
            {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />}
            <span style={{ flex: 1 }}>{label}</span>
        </button>
    );
}

const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 6,
    background: 'rgba(0,0,0,.25)',
    border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 12,
    fontFamily: 'inherit',
    colorScheme: 'dark',
};

export { type CalendarOption };
