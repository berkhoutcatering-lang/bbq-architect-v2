'use client';

import type { LucideIcon } from 'lucide-react';

/* De cijfer-strook boven de componenten.
 *
 * Stond eerder als vier LOSSE grijze doosjes naast elkaar, met alle getallen in
 * dezelfde witte kleur. Dat las als een spreadsheet, terwijl de gerechten-pagina
 * ernaast één aaneengesloten strook heeft met haarlijn-naden, een icoon per cel
 * en een waarde die kleur krijgt naar betekenis. Dit is die strook — vorm en
 * maatvoering bewust letterlijk gelijk aan GerechtenKpiTiles.tsx.
 *
 * Het verschil met die van gerechten: hier is elke cel een FILTER-knop. Klik
 * "Ongebruikt" en de lijst eronder toont alleen die. Een cijfer dat je kunt
 * oplossen hoort een deur te zijn, geen decoratie.
 */

export type KpiTone = 'default' | 'green' | 'warn';

export interface ComponentKpi {
    key: string;
    label: string;
    value: string;
    sub: string;
    Icon: LucideIcon;
    tone: KpiTone;
    onClick: () => void;
    active: boolean;
}

export default function ComponentKpiStrip({ stats }: { stats: ComponentKpi[] }) {
    return (
        <div
            className="comp-kpi-strip"
            style={{
                /* display + grid-template-columns staan BEWUST in het style-blok
                   onderaan en niet hier: een inline-stijl wint altijd van een
                   media-query, waardoor de strook op een smal scherm vier kolommen
                   bleef en de cijfers samenknepen. */
                /* De 1px gap OP een --border achtergrond ís de haarlijn tussen de
                   cellen. Geef een cel dus nooit een eigen border — dan wordt het
                   weer een doosje. */
                gap: 1,
                background: 'var(--border)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: 22,
            }}
        >
            {stats.map(t => {
                const { Icon } = t;
                const valueColor =
                    t.tone === 'green' ? 'var(--green)'
                    : t.tone === 'warn' ? 'var(--amber, #f59e0b)'
                    : 'var(--text)';
                const subColor = t.tone === 'warn' ? 'var(--amber, #f59e0b)' : 'var(--muted)';
                const iconColor = t.tone === 'warn' ? 'var(--amber, #f59e0b)' : 'var(--muted-light)';

                return (
                    <button
                        key={t.key}
                        type="button"
                        onClick={t.onClick}
                        aria-pressed={t.active}
                        className="comp-kpi-cell"
                        style={{
                            /* Expliciete reset: zonder deze vier erft de knop de
                               browser-default en dát is letterlijk de grijze
                               Windows-look. */
                            border: 'none',
                            width: '100%',
                            textAlign: 'left',
                            font: 'inherit',
                            cursor: 'pointer',
                            padding: '18px 20px',
                            transition: 'background .12s',
                            background: t.active ? 'var(--brand-tint-subtle)' : 'var(--card)',
                            /* Actief via inset-schaduw, niet via border — een border
                               zou de haarlijn van de gap verstoren. */
                            boxShadow: t.active ? 'inset 0 -2px 0 var(--brand)' : 'none',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span
                                style={{
                                    fontSize: 10,
                                    letterSpacing: '.18em',
                                    textTransform: 'uppercase',
                                    color: 'var(--muted)',
                                    fontWeight: 700,
                                }}
                            >
                                {t.label}
                            </span>
                            <Icon size={13} color={iconColor} />
                        </div>
                        <div
                            style={{
                                fontSize: 26,
                                fontWeight: 500,
                                color: valueColor,
                                fontVariantNumeric: 'tabular-nums',
                                lineHeight: 1.1,
                            }}
                        >
                            {t.value}
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                color: subColor,
                                marginTop: 4,
                                fontWeight: t.tone === 'warn' ? 600 : 400,
                            }}
                        >
                            {t.sub}
                        </div>
                    </button>
                );
            })}
            <style jsx>{`
                :global(.comp-kpi-strip) {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                }
                .comp-kpi-cell:hover {
                    background: var(--brand-tint-subtle) !important;
                }
                @media (max-width: 900px) {
                    :global(.comp-kpi-strip) {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
                @media (max-width: 480px) {
                    :global(.comp-kpi-strip) {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    );
}
