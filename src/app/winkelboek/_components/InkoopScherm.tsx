import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import KpiTegel, { type KpiStaat } from '@/components/chassis/KpiTegel';
import { formatPercent } from '@/lib/format';
import type { Levering } from '@/lib/winkelboek/inkoop';
import type { Periode } from '@/lib/winkelboek/periode';
import { inkoopVerhouding, voorraadOnderschrift } from '@/lib/winkelboek/weergave';
import PeriodeKiezer from './PeriodeKiezer';
import { aantal, euro, korteDag } from '../_lib/tekst';

const KOLOMMEN = '92px minmax(0, 1fr) minmax(0, 1.4fr) 112px 104px 176px';
const GETAL: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const LINK: React.CSSProperties = { color: 'var(--brand-hover)', textDecoration: 'none', fontWeight: 600 };

/**
 * Inkoop van de winkel: elke levering met bedrag, een geschatte btw en of de
 * bon erbij is. De echte voorbelasting komt van de bonnen en staat in de
 * btw-aangifte; die tonen we hier bewust niet als eigen getal.
 */
export default function InkoopScherm({ periode, leveringen, voorraadwaarde, omzetCents, fout, bonFout = null, basis = '/winkelboek/inkoop', extra }: {
    periode: Periode;
    /** Nieuwste eerst. */
    leveringen: Levering[];
    voorraadwaarde: { cents: number; producten: number; zonder: number; onder_nul?: number; fout?: string | null };
    /** Omzet excl. btw van de winkelkassa in dezelfde periode; null als die niet te laden was. */
    omzetCents: number | null;
    fout: string | null;
    /** De inkoopbonnen waren niet te laden: dan is van geen levering te zeggen of de bon er is. */
    bonFout?: string | null;
    basis?: string;
    extra?: Record<string, string | undefined>;
}) {
    const bekend = leveringen.filter((l) => l.bedrag_cents !== null);
    const ingekocht = bekend.reduce((s, l) => s + (l.bedrag_cents ?? 0), 0);
    const zonderBedrag = leveringen.length - bekend.length;
    const zonderBon = leveringen.filter((l) => l.bon.soort === 'ontbreekt').length;

    const ingekochtStaat: KpiStaat = leveringen.length === 0 ? { soort: 'leeg', wanneer: 'Verschijnt zodra je een ontvangst boekt.' }
        : { soort: 'waarde', waarde: euro(ingekocht), onder: zonderBedrag > 0 ? `${aantal(zonderBedrag, 'levering', 'leveringen')} zonder bedrag niet meegeteld` : `${aantal(leveringen.length, 'levering', 'leveringen')}, excl. btw` };
    const bonStaat: KpiStaat = bonFout ? { soort: 'onbepaald', reden: 'De bonnen konden niet geladen worden.' }
        : leveringen.length === 0 ? { soort: 'leeg', wanneer: 'Verschijnt zodra je een ontvangst boekt.' }
        : { soort: 'waarde', waarde: String(zonderBon), onder: zonderBon === 0 ? 'Bij elke levering is een bon gevonden' : 'Scan de bon, dan klopt je voorbelasting', alarm: zonderBon > 0 };
    const waardeStaat: KpiStaat = voorraadwaarde.fout ? { soort: 'onbepaald', reden: 'De voorraad kon niet geladen worden.' }
        : voorraadwaarde.producten === 0 ? { soort: 'onbepaald', reden: 'Nog geen product met een telling én een inkoopprijs.' }
        : { soort: 'waarde', waarde: euro(voorraadwaarde.cents), onder: voorraadOnderschrift({ zonder: voorraadwaarde.zonder, onder_nul: voorraadwaarde.onder_nul ?? 0 }), alarm: (voorraadwaarde.onder_nul ?? 0) > 0 };
    const verhouding = inkoopVerhouding({ ingekocht_cents: ingekocht, omzet_cents: omzetCents, leveringen: leveringen.length, zonder_bedrag: zonderBedrag });
    const verhoudingStaat: KpiStaat = verhouding.soort === 'onbekend' ? { soort: 'onbepaald', reden: verhouding.reden }
        : { soort: 'waarde', waarde: `${verhouding.minstens ? 'Minstens ' : ''}${formatPercent(verhouding.pct)}`, onder: verhouding.onder };

    return (
        <>
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Inkoop</h1>
                    <div className="wk-onder">Elke levering van de winkel, met het bedrag en of de bon erbij is.</div>
                </div>
            </div>

            <PeriodeKiezer periode={periode} basis={basis} extra={extra} />

            {[fout, bonFout, voorraadwaarde.fout].filter(Boolean).map((f) => (
                <p key={f} role="alert" style={{ fontSize: 13, color: 'var(--status-danger-text)', marginTop: 14 }}>{f}</p>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, margin: '18px 0' }}>
                <KpiTegel label="Ingekocht deze periode" staat={ingekochtStaat} />
                <KpiTegel label="Leveringen zonder bon" staat={bonStaat} />
                <KpiTegel label="Voorraadwaarde nu" staat={waardeStaat} />
                <KpiTegel label="Inkoop tegenover omzet" staat={verhoudingStaat} />
            </div>

            {leveringen.length === 0 ? (
                /* Bij een laadfout weten we niet of er niets is: dan staat alleen de fout er. */
                fout ? null : <div className="kf-empty"><p>Geen ontvangsten in deze periode.</p></div>
            ) : (
                <div className="wk-lijst">
                    <div style={{ overflowX: 'auto' }}>
                        <div style={{ minWidth: 860 }}>
                            <div className="wk-rij wk-rij-kop" style={{ gridTemplateColumns: KOLOMMEN }}>
                                <span>Datum</span>
                                <span>Leverancier</span>
                                <span>Wat kwam binnen</span>
                                <span style={{ textAlign: 'right' }}>Bedrag excl.</span>
                                <span style={{ textAlign: 'right' }}>Btw, geschat</span>
                                <span>Bon</span>
                            </div>
                            {leveringen.map((l) => (
                                <div key={`${l.datum}-${l.leverancier_id ?? 'geen'}`} className="wk-rij" style={{ gridTemplateColumns: KOLOMMEN, cursor: 'default' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{korteDag(l.datum)}</span>
                                    <span className="wk-naam">
                                        {l.leverancier_id === null ? <span style={{ color: 'var(--muted)' }}>Onbekend</span>
                                            : <Link href={`/leveranciers/${l.leverancier_id}/winkel`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{l.leverancier}</Link>}
                                    </span>
                                    <span style={{ minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.wat}</span>
                                        <span className="wk-klein" style={{ display: 'block' }}>{aantal(l.producten, 'product', 'producten')}</span>
                                    </span>
                                    <span style={{ ...GETAL, fontWeight: 600 }}>{l.bedrag_cents === null ? <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: 12, color: 'var(--status-warning-text)' }}>Nog geen inkoopprijs</span> : euro(l.bedrag_cents)}</span>
                                    <span style={{ ...GETAL, color: 'var(--muted)' }}>{l.btw_geschat_cents === null ? '–' : euro(l.btw_geschat_cents)}</span>
                                    <span style={{ fontSize: 12.5, minWidth: 0 }}>
                                        {bonFout ? (
                                            <span style={{ color: 'var(--muted)' }}>Niet te laden</span>
                                        ) : l.bon.soort === 'gevonden' ? (
                                            <Link href="/archief" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text)', textDecoration: 'none' }}>
                                                <CheckCircle2 size={14} style={{ color: 'var(--status-success-text)', flexShrink: 0 }} aria-hidden="true" />
                                                <span>Bon gevonden{l.bon.netto_cents !== null ? ` · ${euro(l.bon.netto_cents)}` : ''}</span>
                                            </Link>
                                        ) : l.bon.soort === 'meerdere' ? (
                                            <Link href="/archief" style={LINK}>{l.bon.aantal} bonnen gevonden, bekijk ze</Link>
                                        ) : (
                                            <Link href="/bonnen" style={LINK}>Bon scannen</Link>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '12px 4px 0' }}>
                Boek je een ontvangst in Assortiment of sticker je een levering, dan staat hij hier vanzelf, op de dag van inboeken.
                De btw is geschat met het tarief van het product; het echte bedrag staat op de bon.
            </p>
        </>
    );
}
