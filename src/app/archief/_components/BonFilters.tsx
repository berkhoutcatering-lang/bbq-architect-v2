/**
 * BonFilters — collapsible filter-sidebar voor het Bonnenkistje.
 *
 * Visuele DNA: secties krijgen elk een eigen goud-getinte header met
 * icoon, ruimere padding en duidelijke scheiding. Status- en Type-chips
 * dragen hun semantische kleur al in rust (groen/blauw/amber/grijs),
 * niet pas wanneer geselecteerd. Filtersamenstelling is identiek aan
 * eerdere versie — alleen layout en visuele richness veranderen.
 *
 * Secties (van boven naar onder):
 *   – "Wis alles" header (alleen zichtbaar als 1+ filter actief)
 *   – Periode  (kalender-icoon)        chips + datumrange
 *   – Status   (activity-icoon)        vertikale lijst met colored pills
 *   – Type     (file-icoon)            3 chips met semantische kleuren
 *   – Leverancier (building-icoon)     search + checkbox-lijst
 *   – Tags     (tag-icoon)             flex-wrap chips, top-12 + "meer"
 *   – RGS      (book-icoon, collapse)  checkbox-lijst
 *   – Bedrag   (euro-icoon)            chips + min/max
 *   – Footer   (gold callout)          Art. 52 AWR
 *
 * URL-state via nuqs, share-baar.
 */
'use client';

import { useMemo, useState } from 'react';
import {
    Calendar,
    Activity,
    FileText,
    Building2,
    Tag as TagIcon,
    BookOpen,
    Euro,
    ChevronDown,
    ChevronUp,
    ShieldCheck,
    X,
    Search,
    Image as ImageIcon,
    Mail,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Lock,
    Trash2,
} from 'lucide-react';
import {
    useQueryStates,
    parseAsString,
    parseAsArrayOf,
    parseAsStringEnum,
    parseAsInteger,
} from 'nuqs';
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

/* Semantische kleuren voor Type-chips — match badge-kleuren in BonReceiptThumb. */
const TYPE_VISUAL: Record<
    'pdf' | 'image' | 'email',
    { label: string; bg: string; color: string; border: string; Icon: React.ComponentType<{ size?: number }> }
> = {
    pdf: {
        label: 'PDF',
        bg: 'rgba(59,130,246,.10)',
        color: 'var(--blue)',
        border: 'rgba(59,130,246,.30)',
        Icon: FileText,
    },
    image: {
        label: 'Foto',
        bg: 'rgba(249,115,22,.10)',
        color: 'var(--orange)',
        border: 'rgba(249,115,22,.30)',
        Icon: ImageIcon,
    },
    email: {
        label: 'E-mail',
        bg: 'rgba(168,85,247,.10)',
        color: '#c084fc',
        border: 'rgba(168,85,247,.30)',
        Icon: Mail,
    },
};

export function BonFilters({ leveranciers, tags, rgs, onClose, isMobile }: Props) {
    const [rgsOpen, setRgsOpen] = useState(false);
    const [allTagsOpen, setAllTagsOpen] = useState(false);
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

    const clearAll = () =>
        void setFilters({
            datum: null,
            dateFrom: null,
            dateTo: null,
            leverancier: null,
            status: null,
            type: null,
            tags: null,
            rgs: null,
            bedrag: null,
            bedragMin: null,
            bedragMax: null,
        });

    const filteredLev = useMemo(
        () =>
            leveranciers.filter((l) =>
                l.naam.toLowerCase().includes(leverancierSearch.toLowerCase()),
            ),
        [leveranciers, leverancierSearch],
    );

    const activeCount =
        (filters.datum ? 1 : 0) +
        (filters.dateFrom ? 1 : 0) +
        (filters.dateTo ? 1 : 0) +
        filters.leverancier.length +
        filters.status.length +
        filters.type.length +
        filters.tags.length +
        filters.rgs.length +
        (filters.bedrag ? 1 : 0) +
        (filters.bedragMin != null ? 1 : 0) +
        (filters.bedragMax != null ? 1 : 0);

    const wrapperClass = isMobile
        ? 'h-full overflow-y-auto px-4 py-5'
        : 'sticky top-14 h-[calc(100vh-56px)] w-[260px] flex-shrink-0 overflow-y-auto border-r px-3 py-1';

    return (
        <aside
            className={wrapperClass}
            style={isMobile ? { background: 'var(--bg-elevated)' } : { borderColor: 'var(--border)' }}
        >
            {isMobile && (
                <div className="mb-4 flex items-center justify-between px-1">
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

            {/* ── Header: 'Wis alles' wanneer 1+ filter actief ─────────── */}
            {activeCount > 0 && (
                <div
                    className="mb-2 flex items-center justify-between rounded-[10px] border px-3 py-2"
                    style={{
                        background: 'rgba(255,191,0,.06)',
                        borderColor: 'rgba(255,191,0,.25)',
                    }}
                >
                    <span
                        className="text-[11px] font-semibold"
                        style={{ color: 'var(--brand)' }}
                    >
                        {activeCount} {activeCount === 1 ? 'filter actief' : 'filters actief'}
                    </span>
                    <button
                        type="button"
                        onClick={clearAll}
                        className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-[var(--text)]"
                    >
                        <Trash2 size={11} />
                        Wis alles
                    </button>
                </div>
            )}

            {/* ── PERIODE ──────────────────────────────────────────────── */}
            <FilterSection title="Periode" icon={Calendar} activeCount={(filters.datum ? 1 : 0) + (filters.dateFrom || filters.dateTo ? 1 : 0)}>
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
                            onClick={() =>
                                void setFilters({ datum: filters.datum === d.id ? null : d.id })
                            }
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

            {/* ── STATUS — vertikale lijst met semantische kleuren ─────── */}
            <FilterSection title="Status" icon={Activity} activeCount={filters.status.length}>
                <div className="flex flex-col gap-1">
                    {FILTER_STATUS_OPTIONS.map((key) => {
                        const visual = STATUS_VISUAL[key];
                        const Icon = STATUS_ICON_MAP[key];
                        const active = filters.status.includes(key);
                        return (
                            <button
                                type="button"
                                key={key}
                                onClick={() => toggle('status', key)}
                                className="group flex w-full items-center gap-2 rounded-[8px] border px-2.5 py-2 text-left transition"
                                style={{
                                    background: active
                                        ? 'rgba(255,255,255,.04)'
                                        : 'transparent',
                                    borderColor: active
                                        ? 'rgba(255,191,0,.35)'
                                        : 'transparent',
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-[5px] border ${visual.pillClass}`}
                                >
                                    <Icon size={11} />
                                </span>
                                <span
                                    className="flex-1 text-[12px] font-semibold"
                                    style={{ color: active ? 'var(--text)' : 'var(--muted)' }}
                                >
                                    {visual.label}
                                </span>
                                {active && (
                                    <span
                                        aria-hidden="true"
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-full"
                                        style={{ background: 'var(--brand)', color: '#000' }}
                                    >
                                        <CheckCircle2 size={11} />
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </FilterSection>

            {/* ── TYPE — chips met semantische kleuren ─────────────────── */}
            <FilterSection title="Type" icon={FileText} activeCount={filters.type.length}>
                <div className="grid grid-cols-3 gap-1.5">
                    {(['pdf', 'image', 'email'] as const).map((t) => {
                        const v = TYPE_VISUAL[t];
                        const active = filters.type.includes(t);
                        return (
                            <button
                                type="button"
                                key={t}
                                onClick={() => toggle('type', t)}
                                className="inline-flex items-center justify-center gap-1 rounded-[8px] border px-2 py-1.5 text-[11px] font-semibold transition"
                                style={{
                                    background: active ? v.bg : 'rgba(130,130,130,.04)',
                                    color: active ? v.color : 'var(--muted)',
                                    borderColor: active ? v.border : 'var(--border)',
                                }}
                            >
                                <v.Icon size={11} />
                                {v.label}
                            </button>
                        );
                    })}
                </div>
            </FilterSection>

            {/* ── LEVERANCIER ──────────────────────────────────────────── */}
            <FilterSection title="Leverancier" icon={Building2} activeCount={filters.leverancier.length}>
                <div
                    className="mb-2 flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5"
                    style={{
                        background: 'rgba(130,130,130,.04)',
                        borderColor: 'var(--border)',
                    }}
                >
                    <Search size={12} className="text-[var(--muted-light)]" />
                    <input
                        type="search"
                        placeholder="Zoek leverancier…"
                        value={leverancierSearch}
                        onChange={(e) => setLeverancierSearch(e.target.value)}
                        className="flex-1 border-none bg-transparent text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--muted-light)]"
                    />
                </div>
                <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto pr-1">
                    {filteredLev.map((l) => {
                        const active = filters.leverancier.includes(l.naam);
                        return (
                            <label
                                key={l.id}
                                className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1.5 text-[12px] transition hover:bg-white/[0.03]"
                                style={{
                                    color: active ? 'var(--text)' : 'var(--muted)',
                                    background: active ? 'rgba(255,191,0,.04)' : undefined,
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggle('leverancier', l.naam)}
                                    style={{ accentColor: 'var(--brand)' }}
                                />
                                <span className="flex-1 truncate">{l.naam}</span>
                                <span
                                    className="rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
                                    style={{
                                        background: 'rgba(130,130,130,.08)',
                                        color: 'var(--muted-light)',
                                    }}
                                >
                                    {l.count}
                                </span>
                            </label>
                        );
                    })}
                    {filteredLev.length === 0 && (
                        <span className="px-1.5 py-1.5 text-[11px] text-[var(--muted-light)]">
                            Geen treffers
                        </span>
                    )}
                </div>
            </FilterSection>

            {/* ── TAGS ─────────────────────────────────────────────────── */}
            {tags.length > 0 && (
                <FilterSection title="Tags" icon={TagIcon} activeCount={filters.tags.length}>
                    <div className="flex flex-wrap gap-1">
                        {(allTagsOpen ? tags : tags.slice(0, 10)).map((tag) => (
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
                    {tags.length > 10 && (
                        <button
                            type="button"
                            onClick={() => setAllTagsOpen((v) => !v)}
                            className="mt-1.5 text-[10px] font-semibold text-[var(--brand-gold)] underline decoration-dotted underline-offset-2 hover:text-[var(--brand)]"
                        >
                            {allTagsOpen ? 'Minder' : `+${tags.length - 10} meer`}
                        </button>
                    )}
                </FilterSection>
            )}

            {/* ── RGS — collapsible ────────────────────────────────────── */}
            {rgs.length > 0 && (
                <div className="border-b border-[var(--border)] py-3">
                    <button
                        type="button"
                        onClick={() => setRgsOpen((v) => !v)}
                        className="flex w-full items-center justify-between gap-2 px-1 py-0.5"
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <BookOpen size={12} style={{ color: 'var(--brand-gold)' }} />
                            <span className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--muted)]">
                                RGS-categorie
                            </span>
                            {filters.rgs.length > 0 && (
                                <span
                                    className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold"
                                    style={{
                                        background: 'rgba(255,191,0,.14)',
                                        color: 'var(--brand)',
                                    }}
                                >
                                    {filters.rgs.length}
                                </span>
                            )}
                        </span>
                        {rgsOpen ? (
                            <ChevronUp size={12} className="text-[var(--muted-light)]" />
                        ) : (
                            <ChevronDown size={12} className="text-[var(--muted-light)]" />
                        )}
                    </button>
                    {rgsOpen && (
                        <div className="mt-2 flex flex-col gap-0.5">
                            {rgs.map((r) => {
                                const active = filters.rgs.includes(r.code);
                                return (
                                    <label
                                        key={r.code}
                                        className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1.5 text-[11px]"
                                        style={{
                                            color: active ? 'var(--text)' : 'var(--muted)',
                                            background: active
                                                ? 'rgba(255,191,0,.04)'
                                                : undefined,
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={active}
                                            onChange={() => toggle('rgs', r.code)}
                                            style={{ accentColor: 'var(--brand)' }}
                                        />
                                        <span className="flex-1">{r.label ?? r.code}</span>
                                        <span
                                            className="rounded-[4px] px-1.5 py-0.5 font-mono text-[9px] tabular-nums"
                                            style={{
                                                background: 'rgba(130,130,130,.08)',
                                                color: 'var(--muted-light)',
                                            }}
                                        >
                                            {r.count}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── BEDRAG ───────────────────────────────────────────────── */}
            <FilterSection
                title="Bedrag"
                icon={Euro}
                activeCount={(filters.bedrag ? 1 : 0) + (filters.bedragMin != null ? 1 : 0) + (filters.bedragMax != null ? 1 : 0)}
            >
                <div className="flex flex-wrap gap-1.5">
                    {[
                        { id: 'lt50' as const, label: '< €50' },
                        { id: '50-500' as const, label: '€50 – €500' },
                        { id: 'gt500' as const, label: '> €500' },
                    ].map((b) => (
                        <Chip
                            key={b.id}
                            active={filters.bedrag === b.id}
                            onClick={() =>
                                void setFilters({ bedrag: filters.bedrag === b.id ? null : b.id })
                            }
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

            {/* ── FOOTER: Art. 52 AWR (gold callout) ───────────────────── */}
            <div
                className="mt-3 mb-1 flex items-start gap-2 rounded-[10px] border px-3 py-2.5"
                style={{
                    background: 'rgba(196,163,90,.06)',
                    borderColor: 'rgba(196,163,90,.18)',
                }}
            >
                <ShieldCheck
                    size={14}
                    className="mt-0.5 flex-shrink-0"
                    style={{ color: 'var(--brand-gold)' }}
                />
                <div className="text-[10px] leading-[1.5] text-[var(--muted-light)]">
                    <strong style={{ color: 'var(--brand-gold)' }}>7-jaar bewaarplicht</strong>
                    <br />
                    Art. 52 AWR — bonnen blijven veilig tot mei 2033.
                </div>
            </div>
        </aside>
    );
}

// ── helpers ──────────────────────────────────────────────────────────────

interface SectionProps {
    title: string;
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    activeCount?: number;
    children: React.ReactNode;
}

/* Sectie-wrapper met goud-iconen header + count-badge bij actieve filters.
   Hairline-border onderaan ipv blokkerige cards = rust + ritme. */
function FilterSection({ title, icon: Icon, activeCount = 0, children }: SectionProps) {
    return (
        <div className="border-b border-[var(--border)] py-3">
            <div className="mb-2 flex items-center gap-1.5 px-1">
                <Icon size={12} style={{ color: 'var(--brand-gold)' }} />
                <span className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--muted)]">
                    {title}
                </span>
                {activeCount > 0 && (
                    <span
                        className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold"
                        style={{
                            background: 'rgba(255,191,0,.14)',
                            color: 'var(--brand)',
                        }}
                    >
                        {activeCount}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}

interface ChipProps {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    small?: boolean;
}

function Chip({ active, onClick, children, small }: ChipProps) {
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
                          background: 'rgba(255,191,0,.10)',
                          color: 'var(--brand)',
                          borderColor: 'rgba(255,191,0,.30)',
                      }
                    : {
                          background: 'rgba(130,130,130,.04)',
                          color: 'var(--muted)',
                          borderColor: 'var(--border)',
                      }
            }
        >
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

