import Link from 'next/link';
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Clock, Download, Wallet } from 'lucide-react';
import Panel, { PanelError } from '@/components/chassis/Panel';
import KpiTegel, { type KpiStaat } from '@/components/chassis/KpiTegel';
import type { KassaDag } from '@/lib/btwAangifteBronnen';
import type { KassaRegel } from '@/lib/financeAnalytics';
import { formatPercent } from '@/lib/format';
import { verzamelPunten } from '@/lib/winkelboek/aandacht';
import { maakDagboeking, type BonMin, type DagstaatKort } from '@/lib/winkelboek/dagboeking';
import { maakKasboek, type KasBegin, type KasMutatie } from '@/lib/winkelboek/kasboek';
import type { Periode } from '@/lib/winkelboek/periode';
import { periodeMarge, verkoopPerArtikel, type VerkoopRegel } from '@/lib/winkelboek/verkoop';
import { inkoopOnderschrift, kasVakje, kassaCijfers, pinVakje, type Toon } from '@/lib/winkelboek/weergave';
import DagBalken from './DagBalken';
import DagHokjes from './DagHokjes';
import PeriodeKiezer from './PeriodeKiezer';
import { aantal, euro, hoofdletter, langeDag, tijd } from '../_lib/tekst';

export interface OverzichtGegevens {
    periode: Periode;
    /** Een lader die faalde; dan staat er een foutmelding boven de cijfers. */
    fout: string | null;
    /** Zonder proefdagen. */
    bonnen: (BonMin & { bedrijfsdag: string })[];
    /** Zonder proefdagen. */
    dagstaten: DagstaatKort[];
    kasMutaties: KasMutatie[];
    /** Wat er vóór de periode in de la lag; null als er nog nooit eerder is afgesloten. */
    kasBegin?: KasBegin | null;
    verkoopRegels: VerkoopRegel[];
    afdelingen: ReadonlyMap<string, string>;
    /** Uit laadToonbank: euro's als kommagetal, proefdagen er al uit. */
    kassaRegels: KassaRegel[];
    /** Uit laadToonbank: bevat ook proefdagen (vlag `uitgesloten`). */
    kassaDagen: KassaDag[];
    derving: { cents: number; aantal: number; zonder_waarde: number };
    /** Waar de periodekiezer naartoe linkt; de testpagina geeft zijn eigen pad. */
    basis?: string;
}

const VLAK: Record<Toon, { klasse: string; kleur: string }> = {
    goed: { klasse: 'status-surface-success', kleur: 'var(--status-success-text)' },
    let_op: { klasse: 'status-surface-warning', kleur: 'var(--status-warning-text)' },
    neutraal: { klasse: 'status-surface-neutral', kleur: 'var(--muted)' },
};

function Vakje({ toon, kop, waarde, onder }: { toon: Toon; kop: string; waarde: string; onder: string }) {
    const v = VLAK[toon];
    const Icoon = toon === 'goed' ? CheckCircle2 : toon === 'let_op' ? AlertTriangle : Clock;
    return (
        <div className={v.klasse} style={{ flex: '1 1 240px', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
            <Icoon size={18} style={{ color: v.kleur, marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: v.kleur }}>{kop}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{waarde}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{onder}</div>
            </div>
        </div>
    );
}

const STAPPEN = ['Dag nagerekend uit de bonnen', 'Omzet en btw in de hokjes', 'Kasboek bijgewerkt', 'Pin naast myPOS gelegd', 'Voorraad en marge bijgewerkt'];

/**
 * Het Overzicht van Boekhouding winkel: of kas en pin kloppen, de laatste dag
 * in hokjes, de cijfers van de periode en wat er nog aandacht vraagt. Alles
 * wordt bij het openen uit de bonnen en dagstaten van de kassa gerekend; er
 * hoeft niets geboekt te worden.
 */
export default function OverzichtScherm({ periode, fout, bonnen, dagstaten, kasMutaties, kasBegin, verkoopRegels, afdelingen, kassaRegels, kassaDagen: alleDagen, derving, basis = '/winkelboek' }: OverzichtGegevens) {
    const { start } = periode;

    /* Wat je per dag zelf uit of in de la deed terwijl de kassa open was. */
    const eigenTijdens = (dag: string) => kasMutaties.filter((m) => m.datum === dag && m.moment === 'tijdens').reduce((s, m) => s + m.bedrag_cents, 0);

    /* Elke dag met bonnen of een dagstaat, oplopend. */
    const dagen = [...new Set([...bonnen.filter((b) => b.status === 'afgerond').map((b) => b.bedrijfsdag), ...dagstaten.map((s) => s.bedrijfsdag)])].sort();
    const boekingen = dagen.map((d) => maakDagboeking(d, bonnen.filter((b) => b.bedrijfsdag === d), dagstaten.filter((s) => s.bedrijfsdag === d), eigenTijdens(d)));
    const laatste = boekingen.at(-1) ?? null;
    const kasboek = maakKasboek(dagstaten, kasMutaties, undefined, kasBegin);

    const artikelen = verkoopPerArtikel(verkoopRegels, afdelingen);
    const marge = periodeMarge(artikelen);
    const punten = verzamelPunten(boekingen, kasboek, marge.zonder_inkoopprijs);

    const kassa = kassaCijfers(kassaRegels, alleDagen);
    const kassaDagen = kassa.dagen;
    const omzetCents = kassa.omzet_cents;
    const btwCents = kassa.btw_cents;
    const aantalBonnen = kassa.bonnen;
    const heeftVerkoop = kassaRegels.length > 0;

    /* De drie vakjes gaan over de laatste dag. */
    const statenLaatste = laatste ? dagstaten.filter((s) => s.bedrijfsdag === laatste.datum) : [];
    const afgesloten = statenLaatste.length > 0;
    const kasRegels = laatste ? kasboek.regels.filter((r) => r.datum === laatste.datum && r.soort === 'kasverschil') : [];
    const onverklaard = kasRegels.filter((r) => !r.goedgekeurd).map((r) => r.bedrag_cents);
    const kas = kasVakje({
        afgesloten,
        in_de_la_cents: kasboek.in_de_la_cents,
        onverklaard,
        verklaard_open: onverklaard.length === 0 && statenLaatste.some((s) => s.contant_verschil_cents !== 0 && !s.goedgekeurd_at),
        goedgekeurd: statenLaatste.some((s) => s.contant_verschil_cents !== 0 && !!s.goedgekeurd_at),
    });
    const pin = pinVakje({
        afgesloten,
        pin_cents: statenLaatste.reduce((s, x) => s + x.pin_toonbank_cents, 0),
        verschillen: statenLaatste.filter((s) => !s.goedgekeurd_at).map((s) => s.pin_verschil_cents),
        goedgekeurd: statenLaatste.some((s) => s.pin_verschil_cents !== 0 && !!s.goedgekeurd_at),
    });

    const kpi = (waarde: string, onder?: string, alarm?: boolean): KpiStaat => ({ soort: 'waarde', waarde, onder, alarm });
    const leeg: KpiStaat = { soort: 'leeg', wanneer: 'Verschijnt zodra de kassa verkoopt.' };
    const margeStaat: KpiStaat = !heeftVerkoop ? leeg
        : !marge.dekking_pct ? { soort: 'onbepaald', reden: 'Nog geen inkoopprijzen bij wat er verkocht is.' }
        : kpi(euro(marge.marge_cents), `${formatPercent(marge.marge_pct)} · over ${marge.dekking_pct}% van de omzet`);
    const inkoopStaat: KpiStaat = !heeftVerkoop ? leeg
        : !marge.dekking_pct ? { soort: 'onbepaald', reden: 'Nog geen inkoopprijzen bij wat er verkocht is.' }
        : kpi(euro(marge.inkoop_cents), inkoopOnderschrift(marge));
    const dervingStaat: KpiStaat = derving.aantal === 0 ? { soort: 'leeg', wanneer: 'Geen breuk of over datum geboekt in deze periode.' }
        : kpi(euro(derving.cents), derving.zonder_waarde > 0 ? `${aantal(derving.zonder_waarde, 'regel', 'regels')} zonder inkoopprijs niet meegeteld` : aantal(derving.aantal, 'regel', 'regels'));

    const [jaar, maand] = start.split('-');

    return (
        <>
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Boekhouding winkel</h1>
                    <div className="wk-onder">Sluit de kassa af en alles staat vanzelf in het juiste hokje: omzet, btw, kas, pin en voorraad.</div>
                </div>
                <a className="btn btn-brand" href={`/api/boekhouder/maandstaat?jaar=${jaar}&maand=${Number(maand)}&pdf=1`} style={{ textDecoration: 'none' }}>
                    <Download size={14} aria-hidden="true" /> Maandstaat downloaden
                </a>
            </div>

            <PeriodeKiezer periode={periode} basis={basis} />

            {fout && <div style={{ marginTop: 16 }}><PanelError titel="De kassagegevens konden niet geladen worden" uitleg={fout} /></div>}

            {!laatste ? (
                <div className="kf-empty" style={{ marginTop: 18 }}>
                    <p>Geen kassadagen in deze periode. Zodra je de kassa afsluit, staat de dag hier.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        <Vakje {...kas} />
                        <Vakje {...pin} />
                        <Vakje toon="neutraal" kop="Afgeroomd deze periode" waarde={euro(kasboek.afgeroomd_cents)} onder="Uit de la gehaald voor de bank" />
                    </div>

                    <div className="wk-sectie" style={{ margin: 0 }}>Laatste kassadag</div>
                    <Panel
                        title={hoofdletter(langeDag(laatste.datum))}
                        actions={laatste.stand === 'geboekt'
                            ? <span className="pill pill-green">Sluit op de cent</span>
                            : <span className="pill pill-amber">{laatste.stand === 'open' ? 'Nog niet afgesloten' : 'Te controleren'}</span>}
                    >
                        <DagHokjes dag={laatste} />
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 18px', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                            {laatste.stand === 'geboekt' && laatste.gesloten_at && (
                                <>
                                    <div style={{ flex: '1 1 100%', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                                        Dit deed het systeem om {tijd(laatste.gesloten_at)}, toen je de kassa sloot
                                    </div>
                                    {STAPPEN.map((s) => (
                                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                            <Check size={14} style={{ color: 'var(--status-success-text)' }} aria-hidden="true" />{s}
                                        </div>
                                    ))}
                                </>
                            )}
                            <Link href={`/winkelboek/dag/${laatste.datum}`} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'inline-flex', alignItems: 'center', color: 'var(--brand-hover)', textDecoration: 'none' }}>
                                Bekijk de dag ({aantal(laatste.aantal_bonnen, 'bon', 'bonnen')}) →
                            </Link>
                        </div>
                    </Panel>

                    <div>
                        <div className="wk-sectie" style={{ marginTop: 0 }}>{periode.label}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                            <KpiTegel label="Omzet excl. btw" staat={!heeftVerkoop ? leeg : kpi(euro(omzetCents), aantalBonnen > 0 ? `${aantal(aantalBonnen, 'bon', 'bonnen')} · gemiddeld ${euro(Math.round((omzetCents + btwCents) / aantalBonnen))}` : undefined)} />
                            <KpiTegel label="Inkoopwaarde" staat={inkoopStaat} />
                            <KpiTegel label="Marge" staat={margeStaat} />
                            <KpiTegel label="Derving" staat={dervingStaat} />
                            <KpiTegel label="Btw af te dragen" staat={!heeftVerkoop ? leeg : kpi(euro(btwCents), 'Zelfde bron als de btw-aangifte')} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'stretch' }}>
                        <Panel title="Omzet per dag" actions={<span style={{ fontSize: 12, color: 'var(--muted)' }}>Excl. btw</span>} style={{ flex: '2 1 440px', minWidth: 0 }}>
                            {kassaDagen.length === 0 ? (
                                <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Nog geen omzet in deze periode.</p>
                            ) : (
                                <DagBalken dagen={kassaDagen} />
                            )}
                        </Panel>

                        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                            <div className="wk-sectie" style={{ marginTop: 0 }}>Om naar te kijken</div>
                            {punten.length === 0 ? (
                                <div className="kf-empty"><p>Niets om naar te kijken.</p></div>
                            ) : (
                                <div className="wk-lijst">
                                    {punten.map((punt) => (
                                        <Link key={punt.tekst} href={punt.href} className="wk-rij wk-taak">
                                            <Wallet size={17} style={{ color: 'var(--status-warning-text)' }} aria-hidden="true" />
                                            <span style={{ minWidth: 0 }}>{punt.tekst}</span>
                                            <ChevronRight size={15} style={{ color: 'var(--muted)' }} aria-hidden="true" />
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
