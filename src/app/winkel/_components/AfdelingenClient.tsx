'use client';

/**
 * Het tegelscherm van de winkel. Elke tegel is een afdeling: omzet van de
 * laatste 7 dagen met een pijl tegen de week ervoor, hoeveel producten er
 * liggen, en een rood bolletje met het aantal stuks dat bijna (of al) over de
 * datum is. Geen verzonnen getallen: zonder verkoop staat er "nog geen
 * verkoop", niet € 0 met een pijl.
 */
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Beef, Beer, CalendarClock, Cookie, LayoutGrid, Minus, Nut, Package, Salad, Sandwich, Snowflake, Sparkles, Wine } from 'lucide-react';
import { formatEur } from '@/lib/format';
import type { AfdelingTegel, Trend } from '@/lib/winkel/afdelingen';

const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, color: 'var(--text)' };

/** Een icoon en kleur per afdeling, op naam (de afdelingen heten zoals Mathijs ze noemde). */
function stijlVan(naam: string): { Icoon: typeof Beer; kleur: string } {
    const n = naam.toLowerCase();
    if (n.includes('bier')) return { Icoon: Beer, kleur: '#C4A35A' };
    if (n.includes('wijn')) return { Icoon: Wine, kleur: '#9B3D5A' };
    if (n.includes('noot')) return { Icoon: Nut, kleur: '#B8862B' };
    if (n.includes('kaas') || n.includes('kazen')) return { Icoon: Salad, kleur: '#D9A520' };
    if (n.includes('vlees') || n.includes('slager')) return { Icoon: Beef, kleur: '#B5483B' };
    if (n.includes('beleg') || n.includes('brood')) return { Icoon: Sandwich, kleur: '#6B7A3F' };
    if (n.includes('koek') || n.includes('cracker') || n.includes('zoet')) return { Icoon: Cookie, kleur: '#A0673A' };
    if (n.includes('vriez') || n.includes('diepvries')) return { Icoon: Snowflake, kleur: '#4A8FB8' };
    if (n.includes('rub') || n.includes('zout') || n.includes('kruid')) return { Icoon: Sparkles, kleur: '#C26A3D' };
    return { Icoon: Package, kleur: '#6B7685' };
}

const euro = (cents: number) => formatEur(cents / 100);

function TrendPijl({ trend }: { trend: Trend }) {
    if (trend === 'op') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--green, #2E9E6B)', fontSize: 12.5, fontWeight: 600 }}><ArrowUpRight size={14} /> meer</span>;
    if (trend === 'neer') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--red, #dc2626)', fontSize: 12.5, fontWeight: 600 }}><ArrowDownRight size={14} /> minder</span>;
    if (trend === 'gelijk') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--muted)', fontSize: 12.5 }}><Minus size={14} /> gelijk</span>;
    return null;
}

export default function AfdelingenClient({ tegels, heeftWinkel, plekkenOntbreken, zonderPlek, urgent, pakketOmzet7_cents, heeftVerkoop }: {
    tegels: AfdelingTegel[];
    heeftWinkel: boolean;
    plekkenOntbreken: boolean;
    zonderPlek: number;
    urgent: { over: number; bijna: number };
    pakketOmzet7_cents: number;
    heeftVerkoop: boolean;
}) {
    const stil = useReducedMotion();
    const totaal7 = tegels.reduce((s, t) => s + t.omzet7_cents, 0) + pakketOmzet7_cents;

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 48px', maxWidth: 1180, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                    <div className="kf-eyebrow">Winkel</div>
                    <h1 className="chassis-titel" style={{ margin: '4px 0 0' }}>Afdelingen</h1>
                    <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>
                        {heeftVerkoop ? `Laatste 7 dagen aan de toonbank: ${euro(totaal7)}.` : 'Zodra de kassa verkoopt, zie je hier per afdeling wat het opbrengt.'}
                    </div>
                </div>
                <Link href="/winkel/binnen" className="btn btn-brand btn-touch" style={{ textDecoration: 'none' }}>Levering binnenmelden</Link>
            </div>

            {(urgent.over > 0 || urgent.bijna > 0) && (
                <motion.div initial={stil ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/winkel/datums" style={{ ...kaart, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 18, textDecoration: 'none',
                        borderColor: urgent.over > 0 ? 'rgba(220,38,38,.45)' : 'rgba(217,165,32,.45)', background: urgent.over > 0 ? 'rgba(220,38,38,.07)' : 'rgba(217,165,32,.08)' }}>
                        <AlertTriangle size={18} style={{ color: urgent.over > 0 ? 'var(--red, #dc2626)' : '#D9A520', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 14 }}>
                            {urgent.over > 0 && <strong>{urgent.over} {urgent.over === 1 ? 'stuk is' : 'stuks zijn'} over de datum. </strong>}
                            {urgent.bijna > 0 && <>{urgent.bijna} {urgent.bijna === 1 ? 'stuk gaat' : 'stuks gaan'} binnen twee dagen over de datum.</>}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Bekijken <ArrowRight size={14} /></span>
                    </Link>
                </motion.div>
            )}

            {plekkenOntbreken ? (
                <div className="kf-empty"><p>De winkel heeft nog geen afdelingen in de database. Eerst moet de update voor plekken in de winkel draaien (migratie 20261102120000).</p></div>
            ) : !heeftWinkel || tegels.length === 0 ? (
                <div style={{ ...kaart, padding: '28px 26px', display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'rgba(196,163,90,.16)', color: 'var(--brand-gold, #c4a35a)' }}><LayoutGrid size={30} /></div>
                    <div style={{ flex: '1 1 280px' }}>
                        <div style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 24, fontWeight: 300 }}>Nog geen afdelingen</div>
                        <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6 }}>Maak ze aan op de winkelvloer: Bier, Wijn, Nootjes, Kazen, Vlees en Broodbeleg.</div>
                    </div>
                    <Link href="/voorraad/winkel/vloer" className="btn btn-brand btn-touch" style={{ textDecoration: 'none' }}>Naar de winkelvloer</Link>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))', gap: 14 }}>
                    {tegels.map((t, i) => {
                        const { Icoon, kleur } = stijlVan(t.afdeling.naam);
                        const rood = t.over + t.bijna;
                        return (
                            <motion.div key={t.afdeling.id} initial={stil ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(i * 0.05, 0.35), type: 'spring', stiffness: 260, damping: 24 }}
                                whileHover={stil ? undefined : { y: -3 }}>
                                <Link href={`/winkel/afdeling/${t.afdeling.id}`} style={{ ...kaart, display: 'block', padding: 18, textDecoration: 'none', position: 'relative', overflow: 'hidden', minHeight: 168 }}>
                                    <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 80% at 100% 0%, ${kleur}22, transparent 60%)`, pointerEvents: 'none' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
                                        <div style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: `${kleur}26`, color: kleur, flexShrink: 0 }}>
                                            <Icoon size={24} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 21, fontWeight: 400, lineHeight: 1.15 }}>{t.afdeling.naam}</div>
                                            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{t.producten} {t.producten === 1 ? 'product' : 'producten'}</div>
                                        </div>
                                        {rood > 0 && (
                                            <span title={`${t.over} over de datum, ${t.bijna} bijna`} style={{ minWidth: 26, height: 26, padding: '0 7px', borderRadius: 13, display: 'grid', placeItems: 'center',
                                                background: t.over > 0 ? 'var(--red, #dc2626)' : '#D9A520', color: '#fff', fontSize: 12.5, fontWeight: 700 }}>{rood}</span>
                                        )}
                                    </div>
                                    <div style={{ marginTop: 20, position: 'relative' }}>
                                        {t.omzet7_cents !== 0 || t.omzetVorige7_cents !== 0 ? (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                                                    <span style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 28, fontWeight: 300 }}>{euro(t.omzet7_cents)}</span>
                                                    <TrendPijl trend={t.trend} />
                                                </div>
                                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                                                    laatste 7 dagen · {t.verkocht7} verkocht · week ervoor {euro(t.omzetVorige7_cents)}
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nog geen verkoop in de laatste twee weken.</div>
                                        )}
                                    </div>
                                    {rood > 0 && (
                                        <div style={{ marginTop: 12, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, color: t.over > 0 ? 'var(--red, #dc2626)' : '#B8862B', position: 'relative' }}>
                                            <CalendarClock size={13} />
                                            {t.over > 0 && `${t.over} over de datum`}{t.over > 0 && t.bijna > 0 && ' · '}{t.bijna > 0 && `${t.bijna} bijna`}
                                        </div>
                                    )}
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {(zonderPlek > 0 || pakketOmzet7_cents !== 0) && heeftWinkel && (
                <div style={{ marginTop: 18, fontSize: 13, color: 'var(--muted)', display: 'grid', gap: 4 }}>
                    {zonderPlek > 0 && (
                        <span>{zonderPlek} {zonderPlek === 1 ? 'product dat los te koop is, staat' : 'producten die los te koop zijn, staan'} op geen enkele afdeling. <Link href="/voorraad/winkel/vloer" style={{ color: 'var(--brand-gold, #c4a35a)' }}>Geef ze een plek</Link>.</span>
                    )}
                    {pakketOmzet7_cents !== 0 && <span>Pakketten (meerdere producten in één artikel) tellen niet bij een afdeling: {euro(pakketOmzet7_cents)} in de laatste 7 dagen.</span>}
                </div>
            )}
        </div>
    );
}
