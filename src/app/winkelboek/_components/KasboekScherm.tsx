import Link from 'next/link';
import KpiTegel, { type KpiStaat } from '@/components/chassis/KpiTegel';
import type { Kasboek, KasRegel } from '@/lib/winkelboek/kasboek';
import type { Periode } from '@/lib/winkelboek/periode';
import { KasRegelKnop, VerwijderKasRegel } from './KasRegelLade';
import PeriodeKiezer from './PeriodeKiezer';
import { aantal, euro, korteDag } from '../_lib/tekst';

const KOLOMMEN = '92px minmax(0, 1fr) 104px 104px 112px 150px';
const GETAL: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

function toelichting(r: KasRegel): string {
    switch (r.soort) {
        case 'beginstand': return 'Wat er bij de eerste telling in de la lag';
        case 'tussen_dagen': return 'De la veranderde zonder regel';
        case 'eigen': return r.bedrag_cents < 0 ? 'Zelf uit de la gehaald' : 'Zelf in de la gedaan';
        case 'kasverschil': return r.goedgekeurd ? 'Goedgekeurd' : 'Minder of meer geteld dan verwacht';
        case 'afgeroomd': return 'Uit de la gehaald voor de bank';
        default: return 'Uit de dagafsluiting van de kassa';
    }
}

/**
 * Het kasboek: wat erbij kwam, wat eraf ging en wat er in de la ligt. Nieuwste
 * regel bovenaan. Alles komt uit de dagafsluiting van de kassa; alleen geld dat
 * je zelf uit of in de la doet voer je hier in.
 */
export default function KasboekScherm({ periode, kasboek, beschikbaar, vandaag, basis = '/winkelboek/kasboek', extra }: {
    periode: Periode;
    kasboek: Kasboek;
    /** False zolang de tabel voor eigen kasregels er nog niet is. */
    beschikbaar: boolean;
    vandaag: string;
    basis?: string;
    extra?: Record<string, string | undefined>;
}) {
    const regels = [...kasboek.regels].reverse();
    const heeft = kasboek.in_de_la_cents !== null;
    const leeg: KpiStaat = { soort: 'leeg', wanneer: 'Verschijnt zodra de kassa een dag afsluit.' };
    const verschillen = kasboek.regels.filter((r) => r.soort === 'kasverschil').length;

    return (
        <>
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Kasboek</h1>
                    <div className="wk-onder">Elke regel komt uit de dagafsluiting van de kassa. Alleen geld dat je zelf uit of in de la doet, voer je hier in.</div>
                </div>
                <KasRegelKnop beschikbaar={beschikbaar} vandaag={vandaag} />
            </div>

            <PeriodeKiezer periode={periode} basis={basis} extra={extra} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, margin: '18px 0' }}>
                <KpiTegel label="In de la" staat={heeft ? { soort: 'waarde', waarde: euro(kasboek.in_de_la_cents ?? 0), onder: 'Na de laatste regel van deze periode' } : leeg} />
                <KpiTegel label="Afgeroomd deze periode" staat={heeft ? { soort: 'waarde', waarde: euro(kasboek.afgeroomd_cents), onder: 'Uit de la gehaald voor de bank' } : leeg} />
                <KpiTegel label="Kasverschil deze periode" staat={heeft
                    ? { soort: 'waarde', waarde: euro(kasboek.kasverschil_cents), onder: verschillen === 0 ? 'Elke dag gelijk aan verwacht' : aantal(verschillen, 'keer', 'keer'), alarm: kasboek.punten.some((p) => p.startsWith('Kasverschil')) }
                    : leeg} />
            </div>

            {regels.length === 0 ? (
                <div className="kf-empty"><p>Geen kassadagen in deze periode. Zodra je de kassa afsluit, staat de dag hier.</p></div>
            ) : (
                <div className="wk-lijst">
                    <div style={{ overflowX: 'auto' }}>
                        <div style={{ minWidth: 820 }}>
                            <div className="wk-rij wk-rij-kop" style={{ gridTemplateColumns: KOLOMMEN }}>
                                <span>Datum</span>
                                <span>Wat</span>
                                <span style={{ textAlign: 'right' }}>Erbij</span>
                                <span style={{ textAlign: 'right' }}>Eraf</span>
                                <span style={{ textAlign: 'right' }}>In de la</span>
                                <span>Bron</span>
                            </div>
                            {regels.map((r, i) => {
                                const nieuweDag = i === 0 || regels[i - 1].datum !== r.datum;
                                const open = r.soort === 'kasverschil' && !r.goedgekeurd;
                                return (
                                    <div key={`${r.datum}-${r.soort}-${r.mutatie_id ?? i}`} className="wk-rij" style={{ gridTemplateColumns: KOLOMMEN, cursor: 'default', borderTopColor: nieuweDag && i > 0 ? 'var(--border-strong)' : undefined }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{nieuweDag ? korteDag(r.datum) : ''}</span>
                                        <span style={{ minWidth: 0 }}>
                                            <span className="wk-naam" style={{ display: 'block', color: open ? 'var(--status-warning-text)' : undefined }}>{r.wat}</span>
                                            <span className="wk-klein" style={{ display: 'block' }}>
                                                {toelichting(r)}
                                                {open && <> · <Link href="/verkoop/toonbank/dagstaten" style={{ color: 'var(--brand-hover)' }}>Goedkeuren</Link></>}
                                            </span>
                                        </span>
                                        <span style={{ ...GETAL, color: 'var(--status-success-text)' }}>{r.bedrag_cents > 0 ? euro(r.bedrag_cents) : ''}</span>
                                        <span style={GETAL}>{r.bedrag_cents < 0 ? euro(-r.bedrag_cents) : ''}</span>
                                        <span style={{ ...GETAL, fontWeight: 600 }}>{euro(r.saldo_cents)}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                                            {r.bron === 'zelf' ? 'Zelf ingevoerd' : 'Automatisch'}
                                            {r.bron === 'zelf' && r.mutatie_id && <VerwijderKasRegel id={r.mutatie_id} wat={r.wat} />}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
