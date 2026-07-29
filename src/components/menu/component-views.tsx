'use client';
/* ═══════════════════════════════════════════════════════════════
   Componenten in de GERECHTEN-taal.

   De componenten-pagina voelde inferieur omdat het letterlijk een andere
   design-taal was: gerechten draaien op de mr-*-klassen uit menu-hub.css
   (glazen kaart, gouden haarlijn, display-font, beeldvlak van ~46% van de
   kaart), componenten tekenden zichzelf met losse Tailwind-waarden en een
   icoon-tegel van 34 px — een postzegel in plaats van beeld.

   Hier hergebruiken we exact dezelfde klassen en dezelfde kaart-anatomie.
   Een component heeft geen foto, dus het beeldvlak komt uit de soort
   (component-visuals.ts): gradient + ruis + icoon + naam, net als een gerecht
   zonder foto.
   ═══════════════════════════════════════════════════════════════ */

import {
    Beef, Fish, Leaf, Milk, Droplet, Wheat, Candy, Package, Boxes,
    ChevronDown, ChevronUp, ShoppingBag, ChefHat, AlertTriangle,
} from 'lucide-react';
import { getComponentVisual } from './component-visuals';
import { unitPriceLabel, normalizeYield, effectiveBaseCostCents } from '@/lib/unitPrice';

const SOORT_ICONS: Record<string, typeof Beef> = { Beef, Fish, Leaf, Milk, Droplet, Wheat, Candy, Package, Boxes };

export interface ComponentViewRow {
    id: number;
    name: string;
    description?: string | null;
    type: 'prepared' | 'bought_in';
    category?: string | null;
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
    yield_factor?: number | null;
    flavor_tags?: string[] | null;
    ai_suggested?: boolean | null;
}

interface ViewProps {
    componenten: ComponentViewRow[];
    /** component_id → in hoeveel gerechten hij zit */
    usage: Record<number, number>;
    onSelect: (c: ComponentViewRow) => void;
    density?: 'comfortable' | 'compact';
}

function euro(cents: number): string {
    return `€ ${((cents || 0) / 100).toFixed(2).replace('.', ',')}`;
}

/* ── Het beeldvlak ─────────────────────────────────────────────
   Zelfde opbouw als MRCardVisual voor een gerecht zonder foto:
   soort-gradient + ruis-textuur + icoon + cursieve naam. */
export function MRComponentVisual({
    component, style, iconSize = 48, showName = false,
}: {
    component: Pick<ComponentViewRow, 'name' | 'category'>;
    style?: React.CSSProperties;
    iconSize?: number;
    showName?: boolean;
}) {
    const v = getComponentVisual(component.name, component.category);
    const Icon = SOORT_ICONS[v.icon] ?? Boxes;
    return (
        <div
            style={{
                ...style,
                background: v.gradient,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                position: 'relative', overflow: 'hidden',
                gap: showName ? 8 : 0,
                padding: showName ? '12px 10px' : 0,
            }}
        >
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%270 0 200 200%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.65%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")',
                opacity: 0.08, pointerEvents: 'none', mixBlendMode: 'overlay',
            }} />
            <Icon
                size={showName ? Math.round(iconSize * 0.6) : iconSize}
                color={showName ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.7)'}
                strokeWidth={1.75}
                style={{ flexShrink: 0, position: 'relative' }}
            />
            {showName && (
                <div style={{
                    position: 'relative',
                    fontFamily: 'var(--font-display, Georgia, serif)',
                    fontStyle: 'italic',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,.92)',
                    textAlign: 'center',
                    lineHeight: 1.25,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textShadow: '0 1px 3px rgba(0,0,0,.35)',
                }}>
                    {component.name}
                </div>
            )}
        </div>
    );
}

/* Signaal-regel rechtsonder op de kaart: wat is er met dit onderdeel aan de
   hand? Geen prijs weegt zwaarder dan ongebruikt — een component zonder prijs
   maakt élk gerecht waarin hij zit stilzwijgend te goedkoop. */
function signaal(c: ComponentViewRow, gebruikt: number): { tekst: string; kleur: string } {
    if ((c.base_cost_cents ?? 0) <= 0) return { tekst: 'geen prijs', kleur: 'var(--amber, #f59e0b)' };
    if (gebruikt <= 0) return { tekst: 'ongebruikt', kleur: 'var(--muted)' };
    return { tekst: `in ${gebruikt} gerecht${gebruikt === 1 ? '' : 'en'}`, kleur: 'var(--muted)' };
}

/* ── Grid ──────────────────────────────────────────────────── */

export function ComponentCard({
    component, gebruikt, onClick, compact,
}: { component: ComponentViewRow; gebruikt: number; onClick: () => void; compact: boolean }) {
    const w = compact ? 180 : 200;
    const h = compact ? 230 : 260;
    const photoH = compact ? 100 : 120;   // ~46% — zelfde verhouding als een gerecht
    const sig = signaal(component, gebruikt);
    const y = normalizeYield(component.yield_factor);
    const prijs = unitPriceLabel(component.base_cost_cents, component.base_quantity, component.base_unit);

    return (
        <div className="mr-grid-card" onClick={onClick} style={{ width: w, height: h }}>
            <div className="mr-grid-card-photo" style={{ height: photoH }}>
                <MRComponentVisual
                    component={component}
                    style={{ width: '100%', height: '100%' }}
                    iconSize={compact ? 36 : 48}
                    showName
                />
                <div className="mr-grid-card-status">
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                        padding: '3px 7px', borderRadius: 999,
                        background: 'rgba(0,0,0,.42)', color: 'rgba(255,255,255,.88)',
                        backdropFilter: 'blur(4px)',
                    }}>
                        {component.type === 'prepared'
                            ? <><ChefHat size={9} /> Eigen</>
                            : <><ShoppingBag size={9} /> Inkoop</>}
                    </span>
                </div>
            </div>
            <div className="mr-grid-card-body">
                <div className="mr-grid-card-name">{component.name}</div>
                <div className="mr-grid-card-gang">
                    {component.base_quantity} {component.base_unit}
                    {y < 1 ? ` · ${Math.round(y * 100)}% na snijverlies` : ''}
                </div>
                <div className="mr-grid-card-footer">
                    <span className="mr-grid-card-price">
                        {component.base_cost_cents > 0 ? euro(component.base_cost_cents) : '—'}
                    </span>
                    <span className="mr-grid-card-margin" style={{ color: sig.kleur, fontWeight: 500, fontSize: 11 }}>
                        {sig.tekst}
                    </span>
                </div>
                {prijs && component.base_cost_cents > 0 && (
                    <div style={{ fontSize: 10.5, color: 'var(--brand)' }}>
                        {prijs}
                        {y < 1 && (
                            <span style={{ color: 'var(--muted)' }}>
                                {' · na verlies '}
                                {unitPriceLabel(effectiveBaseCostCents(component.base_cost_cents, y), component.base_quantity, component.base_unit)}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Lijst ─────────────────────────────────────────────────── */

/* De sorteervolgorde van de componenten-pagina.
 *
 * Stond eerder ALLEEN in dit bestand, als lokale state op de kolomkoppen — dus
 * in de grid-weergave (die standaard aan staat) was er geen enkele manier om te
 * sorteren en kreeg je gewoon de database-volgorde. De keuze woont nu op de
 * pagina, en de kolomkoppen hieronder bedienen diezelfde keuze. Schakel je van
 * lijst naar grid, dan blijft je volgorde staan. */
export type ComponentSortKey =
    | 'naam_az' | 'naam_za'
    | 'soort_az'
    | 'gebruik_veel' | 'gebruik_weinig'
    | 'prijs_hoog' | 'prijs_laag'
    | 'nieuwste';

type SortCol = 'name' | 'soort' | 'prijs' | 'gebruik';

/* Eén vertaaltabel kolom ⇄ sleutel, zodat de ▲/▼-pijl altijd uit dezelfde
   bron komt als de sortering zelf. Drie losse if-jes lopen vroeg of laat
   uit elkaar. */
const KOLOM_SLEUTELS: Record<SortCol, { asc: ComponentSortKey; desc: ComponentSortKey }> = {
    name: { asc: 'naam_az', desc: 'naam_za' },
    soort: { asc: 'soort_az', desc: 'soort_az' },
    prijs: { asc: 'prijs_laag', desc: 'prijs_hoog' },
    gebruik: { asc: 'gebruik_weinig', desc: 'gebruik_veel' },
};

function kolomStand(sortKey: ComponentSortKey): { col: SortCol | null; dir: 'asc' | 'desc' } {
    for (const col of Object.keys(KOLOM_SLEUTELS) as SortCol[]) {
        const s = KOLOM_SLEUTELS[col];
        if (s.asc === sortKey) return { col, dir: 'asc' };
        if (s.desc === sortKey) return { col, dir: 'desc' };
    }
    return { col: null, dir: 'asc' };
}

interface ListProps extends ViewProps {
    sortKey: ComponentSortKey;
    onSortKeyChange: (k: ComponentSortKey) => void;
}

export function ComponentListView({ componenten, usage, onSelect, density = 'comfortable', sortKey, onSortKeyChange }: ListProps) {
    const compact = density === 'compact';
    const stand = kolomStand(sortKey);

    function th(col: SortCol, label: string, width?: number) {
        const actief = stand.col === col;
        return (
            <div
                className={`mr-list-th sortable ${actief ? 'sorted' : ''}`}
                style={width ? { width } : { flex: 1 }}
                onClick={() => {
                    const s = KOLOM_SLEUTELS[col];
                    /* Tweede klik op dezelfde kop draait om. Bij "Soort" is er maar
                       één richting, dus die blijft staan. */
                    onSortKeyChange(actief && stand.dir === 'asc' ? s.desc : s.asc);
                }}
            >
                {label}
                {actief && (stand.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
            </div>
        );
    }

    if (!componenten.length) return null;

    return (
        <div className="mr-list-wrap">
            <div className="mr-list-header">
                <div style={{ width: 50 }} />
                {th('name', 'Naam')}
                {th('soort', 'Soort', 100)}
                <div className="mr-list-th" style={{ width: 90 }}>Basis</div>
                {th('prijs', 'Prijs', 100)}
                {th('gebruik', 'Gebruik', 110)}
            </div>
            {componenten.map(c => {
                const v = getComponentVisual(c.name, c.category);
                const gebruikt = usage[c.id] ?? 0;
                const sig = signaal(c, gebruikt);
                const thumb = compact ? 32 : 40;
                return (
                    <div key={c.id} className="mr-list-row" onClick={() => onSelect(c)}
                        style={{ padding: compact ? '8px 16px' : '12px 16px' }}>
                        <div style={{ width: 50 }}>
                            <MRComponentVisual
                                component={c}
                                style={{ width: thumb, height: thumb, borderRadius: 8 }}
                                iconSize={compact ? 16 : 20}
                            />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontFamily: 'var(--font-display)', fontSize: compact ? 13 : 14, fontWeight: 500,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{c.name}</div>
                            {!compact && c.description && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.description}
                                </div>
                            )}
                        </div>
                        <div style={{ width: 100, fontSize: 12, color: 'var(--muted)' }}>{v.label}</div>
                        <div style={{ width: 90, fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {c.base_quantity} {c.base_unit}
                        </div>
                        {/* Basisprijs én eenheidsprijs. Alleen de basisprijs tonen
                            maakte de kolom onleesbaar zodra je op prijs sorteert:
                            er wordt op de genormaliseerde eenheidsprijs gesorteerd
                            (€/kg, €/liter, €/stuk), dus €16,29 per stuk hoort onder
                            €2,19 per 100 g — wat als een fout oogt tot je ziet dat
                            die tweede €21,90 per kilo is. */}
                        <div style={{ width: 100, fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                            {c.base_cost_cents > 0 ? euro(c.base_cost_cents) : '—'}
                            {c.base_cost_cents > 0 && (() => {
                                const perEenheid = unitPriceLabel(c.base_cost_cents, c.base_quantity, c.base_unit);
                                return perEenheid ? (
                                    <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--muted)', marginTop: 1 }}>
                                        {perEenheid}
                                    </div>
                                ) : null;
                            })()}
                        </div>
                        <div style={{ width: 110, fontSize: 11.5, color: sig.kleur, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {(c.base_cost_cents ?? 0) <= 0 && <AlertTriangle size={11} />}
                            {sig.tekst}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
