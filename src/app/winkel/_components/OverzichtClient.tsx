'use client';

/**
 * Het overzicht van de winkel: bovenaan wat er nu moet gebeuren (alleen als
 * er iets is), daaronder de afdelingen als rustige lijst met de omzet van de
 * laatste 7 dagen en een pijl tegen de week ervoor. Geen verzonnen getallen:
 * zonder verkoop staat er een streepje, niet € 0 met een pijl.
 */
import Link from 'next/link';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Beef, Beer, ChevronRight, ClipboardList, Cookie, MapPinned, Minus, Nut, Package, Salad, Sandwich, Snowflake, Sparkles, Wine } from 'lucide-react';
import '@/styles/menu-hub.css';
import '@/styles/winkel.css';
import VoorraadBel from '@/components/voorraad/VoorraadBel';
import { formatEur } from '@/lib/format';
import type { AfdelingTegel, Trend } from '@/lib/winkel/afdelingen';

/** Een icoon per afdeling, op naam (de afdelingen heten zoals Mathijs ze noemde). */
function icoonVan(naam: string): typeof Beer {
    const n = naam.toLowerCase();
    if (n.includes('bier')) return Beer;
    if (n.includes('wijn')) return Wine;
    if (n.includes('noot')) return Nut;
    if (n.includes('kaas') || n.includes('kazen')) return Salad;
    if (n.includes('vlees') || n.includes('slager')) return Beef;
    if (n.includes('beleg') || n.includes('brood')) return Sandwich;
    if (n.includes('koek') || n.includes('cracker') || n.includes('zoet')) return Cookie;
    if (n.includes('vriez') || n.includes('diepvries')) return Snowflake;
    if (n.includes('rub') || n.includes('zout') || n.includes('kruid')) return Sparkles;
    return Package;
}

const euro = (cents: number) => formatEur(cents / 100);

function TrendPijl({ trend }: { trend: Trend }) {
    if (trend === 'op') return <ArrowUpRight size={14} aria-label="meer dan de week ervoor" style={{ color: 'var(--green, #2E9E6B)', verticalAlign: -2, marginLeft: 4 }} />;
    if (trend === 'neer') return <ArrowDownRight size={14} aria-label="minder dan de week ervoor" style={{ color: 'var(--red, #dc2626)', verticalAlign: -2, marginLeft: 4 }} />;
    if (trend === 'gelijk') return <Minus size={14} aria-label="gelijk aan de week ervoor" style={{ color: 'var(--muted)', verticalAlign: -2, marginLeft: 4 }} />;
    return null;
}

function Taak({ href, Icoon, kleur, children }: { href: string; Icoon: typeof Beer; kleur?: string; children: React.ReactNode }) {
    return (
        <Link href={href} className="wk-rij wk-taak">
            <Icoon size={17} style={{ color: kleur ?? 'var(--muted)' }} />
            <span style={{ minWidth: 0 }}>{children}</span>
            <ChevronRight size={15} style={{ color: 'var(--muted)' }} />
        </Link>
    );
}

export default function OverzichtClient({ tegels, heeftWinkel, plekkenOntbreken, zonderPlek, nietGeteld, nietsGeteld, urgent, pakketOmzet7_cents, heeftVerkoop }: {
    tegels: AfdelingTegel[];
    heeftWinkel: boolean;
    plekkenOntbreken: boolean;
    zonderPlek: number;
    nietGeteld: number;
    nietsGeteld: boolean;
    urgent: { over: number; bijna: number };
    pakketOmzet7_cents: number;
    heeftVerkoop: boolean;
}) {
    const totaal7 = tegels.reduce((s, t) => s + t.omzet7_cents, 0) + pakketOmzet7_cents;
    const heeftTaken = urgent.over > 0 || urgent.bijna > 0 || nietGeteld > 0 || zonderPlek > 0;

    return (
        <div className="wk-pagina mobile-safe-bottom">
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Overzicht</h1>
                    <div className="wk-onder">
                        {heeftVerkoop ? `Laatste 7 dagen aan de toonbank: ${euro(totaal7)}.` : 'Zodra de kassa verkoopt, zie je hier wat het opbrengt.'}
                    </div>
                </div>
                <VoorraadBel />
            </div>

            {heeftTaken && (
                <>
                    <div className="wk-sectie" style={{ marginTop: 0 }}>Nu te doen</div>
                    <div className="wk-lijst">
                        {urgent.over > 0 && <Taak href="/winkel/leveringen" Icoon={AlertTriangle} kleur="var(--red, #dc2626)">{urgent.over} {urgent.over === 1 ? 'stuk is' : 'stuks zijn'} over de datum</Taak>}
                        {urgent.bijna > 0 && <Taak href="/winkel/leveringen" Icoon={AlertTriangle} kleur="#D9A520">{urgent.bijna} {urgent.bijna === 1 ? 'stuk gaat' : 'stuks gaan'} binnen twee dagen over de datum</Taak>}
                        {nietGeteld > 0 && <Taak href="/voorraad/winkel/tellen" Icoon={ClipboardList}>{nietsGeteld ? 'De winkel tellen' : `${nietGeteld} ${nietGeteld === 1 ? 'product' : 'producten'} nog tellen`}</Taak>}
                        {zonderPlek > 0 && <Taak href="/voorraad/winkel/vloer" Icoon={MapPinned}>{zonderPlek} {zonderPlek === 1 ? 'product' : 'producten'} een plek geven</Taak>}
                    </div>
                </>
            )}

            <div className="wk-sectie">Afdelingen</div>
            {plekkenOntbreken ? (
                <div className="kf-empty"><p>De winkel heeft nog geen afdelingen in de database. Eerst moet de update voor plekken in de winkel draaien (migratie 20261102120000).</p></div>
            ) : !heeftWinkel || tegels.length === 0 ? (
                <div className="kf-empty">
                    <p>Nog geen afdelingen. Maak ze aan: Bier, Wijn, Nootjes, Kazen, Vlees en Broodbeleg.</p>
                    <Link href="/voorraad/winkel/vloer" className="btn btn-brand" style={{ textDecoration: 'none' }}>Afdelingen indelen</Link>
                </div>
            ) : (
                <div className="wk-lijst">
                    <div className="wk-rij wk-rij-kop wk-afdeling">
                        <span>Afdeling</span>
                        <span className="wk-getal wk-alleen-breed" style={{ fontSize: 12 }}>Producten</span>
                        <span className="wk-getal" style={{ fontSize: 12 }}>Laatste 7 dagen</span>
                    </div>
                    {tegels.map((t) => {
                        const Icoon = icoonVan(t.afdeling.naam);
                        const datum = t.over + t.bijna;
                        const verkoop = t.omzet7_cents !== 0 || t.omzetVorige7_cents !== 0;
                        return (
                            <Link key={t.afdeling.id} href={`/voorraad/winkel?afdeling=${t.afdeling.id}`} className="wk-rij wk-afdeling">
                                <Icoon size={18} style={{ color: 'var(--muted)' }} />
                                <span style={{ minWidth: 0 }}>
                                    <span className="wk-naam" style={{ display: 'block' }}>{t.afdeling.naam}</span>
                                    {datum > 0 && <span className="wk-klein" style={{ display: 'block', color: t.over > 0 ? 'var(--red, #dc2626)' : '#D9A520' }}>{t.over > 0 ? `${t.over} over de datum` : `${t.bijna} bijna over de datum`}</span>}
                                </span>
                                <span className="wk-getal wk-stil wk-alleen-breed">{t.producten}</span>
                                <span className={`wk-getal${verkoop ? '' : ' wk-stil'}`} title={verkoop ? `${t.verkocht7} verkocht · week ervoor ${euro(t.omzetVorige7_cents)}` : undefined}>
                                    {verkoop ? <>{euro(t.omzet7_cents)}<TrendPijl trend={t.trend} /></> : '–'}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            )}

            {pakketOmzet7_cents !== 0 && heeftWinkel && (
                <div className="wk-klein" style={{ marginTop: 12, whiteSpace: 'normal' }}>Pakketten tellen niet bij een afdeling: {euro(pakketOmzet7_cents)} in de laatste 7 dagen.</div>
            )}
        </div>
    );
}
