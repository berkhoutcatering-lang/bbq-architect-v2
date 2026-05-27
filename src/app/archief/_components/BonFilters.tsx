/**
 * BonFilters — collapsible filter-sidebar voor Bonnenkistje (P0.1).
 *
 * Design DNA uit Claude archief-filter.jsx (240px sidebar).
 *
 * Secties:
 *   1. Datum  (chips: maand/kwartaal/jaar/alles + date-range)
 *   2. Leverancier (search + checkboxes met counts)
 *   3. Status (chips: pending/bevestigd/twijfel/vergrendeld)
 *   4. Type (chips: PDF/Foto/E-mail)
 *   5. Tags (chips top-10)
 *   6. Geavanceerd (collapse): RGS-categorie + Bedrag range
 *   7. Footer: Art. 52 AWR bewaarplicht
 *
 * Alle state via nuqs (URL share-baar).
 */
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck, X, FileText, Image as ImageIcon, Mail, Clock, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { useQueryStates, parseAsString, parseAsArrayOf, parseAsStringEnum, parseAsInteger } from 'nuqs';
import { FILTER_STATUS_OPTIONS, STATUS_VISUAL, type DisplayStatus } from '../_lib/statusMap';

interface Leverancier {
    id: number;
    naam: string;
    count: number;
}

interface RgsCategory {
    code: string;
    label: string | null;
    count: number;
}

interface Props {
    leveranciers: Leverancier[];
    tags: string[];
    rgs: RgsCategory[];
    onClose?: () => void;
    isMobile?: boolean;
}

const STATUS_ICON_MAP: Record<DisplayStatus, React.ComponentType<{ size?: number }>> = {
    pending: Clock,
    bevestigd: CheckCircle2,
    twijfel: AlertTriangle,
    vergrendeld: Lock,
};

export function BonFilters({ leveranciers, tags, rgs, onClose, isMobile }: Props) {
    // Design ordering: Datum / Leverancier / Status / Type / Tags / RGS (collapsible) / Bedrag / footer
    const [rgsOpen, setRgsOpen] = useState(false);
    const [leverancierSearch, setLeverancierSearch] = useState('');

    const [filters, setFilters] = useQueryStates({
        datum: parseAsString,
        dateFrom: parseAsString,
        dateTo: parseAsString,
        leverancier: parseAsArrayOf(parseAsString).withDefault([]),
        status: parseAsArrayOf(parseAsString).withDefault([]),
        type: parseAsArrayOf(parseAsString).withDefault([]),
        tags: parseAsArrayOf(parseAsString).withDefault([]),
        rgs: parseAsArrayOf(parseAsString).withDefault([]),
        bedrag: parseAsStringEnum(['lt50', '50-500', 'gt500']),
        bedragMin: parseAsInteger,
        bedragMax: parseAsInteger,
    });

    const toggle = <K extends 'leverancier' | 'status' | 'type' | 'tags' | 'rgs'>(
        key: K,
        val: string,
    ) => {
        const current = (filters[key] as string[] | null) ?? [];
        const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
        void setFilters({ [key]: next.length ? next : null } as Record<string, string[] | null>);
    };

    const filteredLev = leveranciers.filter((l) =>
        l.naam.toLowerCase().includes(leverancierSearch.toLowerCase()),
    );

    const wrapperClass = isMobile
        ? 'h-full overflow-y-auto px-5 py-5'
        : 'sticky top-14 h-[calc(100vh-56px)] w-[240px] flex-shrink-0 overflow-y-auto border-r px-4';

    return (
        <aside
            className={wrapperClass}
            style={isMobile ? { background: 'var(--bg-elevated)' } : { borderColor: 'var(--border)' }}
        >
            {isMobile && (
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-[16px] font-semibold">Filters</span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Sluit filter-paneel"
                        className="text-[var(--muted)] hover:text-[var(--text)]"
                    >
                        <X size={20} />
                    </button>
                </div>
            )}

            {/* DATUM */}
            <FilterSection title="Datum">
                <div className="flex flex-wrap gap-1.5">
                    {[
                        { id: 'month', label: 'Deze maand' },
                        { id: 'quarter', label: 'Vorig kwartaal' },
                        { id: '2025', label: '2025' },
                        { id: 'all', label: 'Alles' },
                    ].map((d) => (
                        <Chip
                            key={d.id}
                            active={filters.datum === d.id}
                            onClick={() => void setFilters({ datum: filters.datum === d.id ? null : d.id })}
                        >
                            {d.label}
                        </Chip>
                    ))}
                </div>
                <div className="mt-2.5 flex items-center gap-1.5">
                    <DateInput
                        value={filters.dateFrom ?? ''}
                        onChange={(v) => void setFilters({ dateFrom: v || null })}
                        aria-label="Vanaf datum"
                    />
                    <span className="text-[11px] text-[var(--muted)]">—</span>
                    <DateInput
                        value={filters.dateTo ?? ''}
                        onChange={(v) => void setFilters({ dateTo: v || null })}
                        aria-label="Tot datum"
                    />
                </div>
            </FilterSection>

            {/* LEVERANCIER */}
            <FilterSection title="Leverancier">
                <input
                    type="search"
                    placeholder="Zoek leverancier…"
                    value={leverancierSearch}
                    onChange={(e) => setLeverancierSearch(e.target.value)}
                    className="mb-2 w-full rounded-[6px] border bg-transparent px-2.5 py-1.5 text-[12px] text-[var(--text)] outline-none focus:border-[var(--brand)]"
                    style={{ borderColor: 'var(--border)' }}
                />
                <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                    {filteredLev.map((l) => {
                        const active = filters.leverancier.includes(l.naam);
                        return (
                            <label
                                key={l.id}
                                className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12px] transition hover:bg-white/[0.03]"
                                style={{ color: active ? 'var(--text)' : 'var(--muted)' }}
                            >
                                <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggle('leverancier', l.naam)}
                                    style={{ accentColor: 'var(--brand)' }}
                                />
                                <span className="flex-1">{l.naam}</span>
                                <span className="font-mono text-[10px] tabular-nums text-[var(--muted-light)]">
                                    {l.count}
                                </span>
                            </label>
                        );
                    })}
                    {filteredLev.length === 0 && (
                        <span className="px-1.5 py-1 text-[11px] text-[var(--muted-light)]">Geen treffers</span>
                    )}
                </div>
            </FilterSection>

            {/* STATUS */}
            <FilterSection title="Status">
                <div className="flex flex-wrap gap-1.5">
                    {FILTER_STATUS_OPTIONS.map((key) => {
                        const visual = STATUS_VISUAL[key];
                        const Icon = STATUS_ICON_MAP[key];
                        const active = filters.status.includes(key);
                        return (
                            <button
                                type="button"
                                key={key}
                                onClick={() => toggle('status', key)}
                                className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-1 text-[11px] font-semibold transition ${active ? visual.pillClass : ''}`}
                                style={
                                    active
                                        ? undefined
                                        : {
                                              background: 'rgba(130,130,130,.06)',
                                              color: 'var(--muted)',
                                              borderColor: 'var(--border)',
                                          }
                                }
                            >
                                <Icon size={11} />
                                {visual.label}
                            </button>
                        );
                    })}
                </div>
            </FilterSection>

            {/* TYPE */}
            <FilterSection title="Type">
                <div className="flex gap-1.5">
                    {[
                        { id: 'pdf', label: 'PDF', icon: FileText },
                        { id: 'image', label: 'Foto', icon: ImageIcon },
                        { id: 'email', label: 'E-mail', icon: Mail },
                    ].map((t) => (
                        <Chip
                            key={t.id}
                            active={filters.type.includes(t.id)}
                            onClick={() => toggle('type', t.id)}
                            icon={<t.icon size={11} />}
                        >
                            {t.label}
                        </Chip>
                    ))}
                </div>
            </FilterSection>

            {/* TAGS */}
            {tags.length > 0 && (
                <FilterSection title="Tags">
                    <div className="flex flex-wrap gap-1">
                        {tags.slice(0, 12).map((tag) => (
                            <Chip
                                key={tag}
                                active={filters.tags.includes(tag)}
                                onClick={() => toggle('tags', tag)}
                                small
                            >
                                {tag}
                            </Chip>
                        ))}
                    </div>
                </FilterSection>
            )}

            {/* RGS-categorie — design heeft 'm als collapsible top-level sectie */}
            {rgs.length > 0 && (
                <div className="border-b border-[var(--border)] py-3.5">
                    <button
                        type="button"
                        onClick={() => setRgsOpen((v) => !v)}
                        className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-[.15em] text-[var(--muted)]"
                    >
                        RGS-categorie
                        {rgsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {rgsOpen && (
                        <div className="mt-2.5 flex flex-col gap-0.5">
                            {rgs.map((r) => {
                                const active = filters.rgs.includes(r.code);
                                return (
                                    <label
                                        key={r.code}
                                        className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1 text-[11px]"
                                        style={{ color: active ? 'var(--text)' : 'var(--muted)' }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={active}
                                            onChange={() => toggle('rgs', r.code)}
                                            style={{ accentColor: 'var(--brand)' }}
                                        />
                                        <span className="flex-1">{r.label ?? r.code}</span>
                                        <span className="font-mono text-[10px] tabular-nums text-[var(--muted-light)]">
                                            {r.count}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Bedrag */}
            <FilterSection title="Bedrag">
                <div className="flex flex-wrap gap-1.5">
                    {[
                        { id: 'lt50' as const, label: '< €50' },
                        { id: '50-500' as const, label: '€50 – €500' },
                        { id: 'gt500' as const, label: '> €500' },
                    ].map((b) => (
                        <Chip
                            key={b.id}
                            active={filters.bedrag === b.id}
                            onClick={() => void setFilters({ bedrag: filters.bedrag === b.id ? null : b.id })}
                        >
                            {b.label}
                        </Chip>
                    ))}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                    <NumberInput
                        placeholder="Min"
                        value={filters.bedragMin ?? ''}
                        onChange={(v) => void setFilters({ bedragMin: v ?? null })}
                    />
                    <span className="text-[11px] text-[var(--muted)]">—</span>
                    <NumberInput
                        placeholder="Max"
                        value={filters.bedragMax ?? ''}
                        onChange={(v) => void setFilters({ bedragMax: v ?? null })}
                    />
                </div>
            </FilterSection>

            {/* FOOTER: Art. 52 AWR */}
            <div className="flex items-start gap-2 pt-4 pb-2">
                <ShieldCheck size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-gold)' }} />
                <div className="text-[10px] leading-[1.5] text-[var(--muted-light)]">
                    7-jaar bewaarplicht
                    <br />
                    <span className="text-[var(--muted)]">Art. 52 AWR</span>
                </div>
            </div>
        </aside>
    );
}

// ── helpers ────────────────────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="border-b border-[var(--border)] py-3.5">
            <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[.15em] text-[var(--muted)]">
                {title}
            </div>
            {children}
        </div>
    );
}

interface ChipProps {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    icon?: React.ReactNode;
    small?: boolean;
}

function Chip({ active, onClick, children, icon, small }: ChipProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-1 rounded-[6px] border font-semibold transition ${
                small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
            }`}
            style={
                active
                    ? {
                          background: 'rgba(255,191,0,.1)',
                          color: 'var(--brand)',
                          borderColor: 'rgba(255,191,0,.3)',
                      }
                    : {
                          background: 'rgba(130,130,130,.06)',
                          color: 'var(--muted)',
                          borderColor: 'var(--border)',
                      }
            }
        >
            {icon}
            {children}
        </button>
    );
}

function DateInput({
    value,
    onChange,
    'aria-label': ariaLabel,
}: {
    value: string;
    onChange: (v: string) => void;
    'aria-label': string;
}) {
    return (
        <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={ariaLabel}
            className="flex-1 rounded-[6px] border bg-transparent px-2 py-1 text-[11px] text-[var(--text)] outline-none focus:border-[var(--brand)]"
            style={{ borderColor: 'var(--border)' }}
        />
    );
}

function NumberInput({
    value,
    onChange,
    placeholder,
}: {
    value: number | '';
    onChange: (v: number | null) => void;
    placeholder: string;
}) {
    return (
        <input
            type="number"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
                const v = e.target.value;
                onChange(v === '' ? null : Number(v));
            }}
            className="flex-1 rounded-[6px] border bg-transparent px-2 py-1 text-[11px] text-[var(--text)] outline-none focus:border-[var(--brand)]"
            style={{ borderColor: 'var(--border)' }}
        />
    );
}
