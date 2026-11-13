import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Receipt, XCircle } from 'lucide-react';
import Panel from '@/components/chassis/Panel';
import type { Dagboeking, DagstaatKort } from '@/lib/winkelboek/dagboeking';
import { dagKop, type DagKopSoort } from '@/lib/winkelboek/weergave';
import DagHokjes from './DagHokjes';
import { aantal, euro, hoofdletter, langeDag, tijd } from '../_lib/tekst';

const RIJ: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 14 };
const BEDRAG: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

const KOP: Record<DagKopSoort, { Icoon: typeof Clock; kleur: string }> = {
    fout: { Icoon: XCircle, kleur: 'var(--status-danger-text)' },
    proefdag: { Icoon: Clock, kleur: 'var(--muted)' },
    geboekt: { Icoon: CheckCircle2, kleur: 'var(--status-success-text)' },
    te_controleren: { Icoon: AlertTriangle, kleur: 'var(--status-warning-text)' },
    open: { Icoon: Clock, kleur: 'var(--muted)' },
    geen_verkoop: { Icoon: Clock, kleur: 'var(--muted)' },
};

/**
 * Eén kassadag, ook het scherm achter de melding "Dag geboekt": één kolom, op
 * een telefoon goed te lezen. Bovenaan de stand in gewone taal, daaronder de
 * dag in hokjes en wat er in de la ligt. Konden de kassagegevens niet geladen
 * worden, dan staat alleen dat er: geen cijfers en geen vinkje.
 */
export default function DagScherm({ dag, dagstaten, eigenTijdens, proefdag, fout = null }: {
    dag: Dagboeking;
    /** De dagafsluitingen van deze dag, oplopend op sluittijd. */
    dagstaten: DagstaatKort[];
    /** Som van wat je die dag zelf uit of in de la deed terwijl de kassa open was. */
    eigenTijdens: number;
    proefdag: boolean;
    /** Een lader die faalde. */
    fout?: string | null;
}) {
    const kop = dagKop(dag, { proefdag, fout });
    const { Icoon, kleur } = KOP[kop.soort];
    const mislukt = kop.soort === 'fout';

    const laatste = dagstaten.at(-1) ?? null;
    const ruw = dagstaten.reduce((s, x) => s + x.contant_verschil_cents, 0);
    const onverklaard = ruw - eigenTijdens;
    const afgeroomd = dagstaten.reduce((s, x) => s + x.afgeroomd_cents, 0);

    return (
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', padding: '8px 0 4px' }}>
                <Icoon size={44} style={{ color: kleur }} aria-hidden="true" />
                <h1 className="chassis-titel" style={{ margin: '4px 0 0' }}>{kop.titel}</h1>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {hoofdletter(langeDag(dag.datum))}{!mislukt && dag.gesloten_at ? ` · kassa gesloten om ${tijd(dag.gesloten_at)}` : ''}
                </div>
                <div role={mislukt ? 'alert' : undefined} style={{ fontSize: 13, fontWeight: 600, color: kleur }}>{kop.regel}</div>
                {mislukt && fout && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fout}</div>}
            </div>

            {!mislukt && !proefdag && dag.stand === 'te_controleren' && (
                <div className="wk-lijst">
                    {dag.punten.map((punt) => (
                        <Link key={punt} href="/verkoop/toonbank/dagstaten" className="wk-rij wk-taak">
                            <AlertTriangle size={17} style={{ color: 'var(--status-warning-text)' }} aria-hidden="true" />
                            <span style={{ minWidth: 0 }}>{punt}</span>
                            <span aria-hidden="true" style={{ color: 'var(--muted)' }}>→</span>
                        </Link>
                    ))}
                </div>
            )}

            {!mislukt && dag.stand !== 'geen_verkoop' && (
                <Panel title="De dag in hokjes" actions={<span style={{ fontSize: 12, color: 'var(--muted)' }}>{aantal(dag.aantal_bonnen, 'bon', 'bonnen')}</span>}>
                    <DagHokjes dag={dag} />
                </Panel>
            )}

            {!mislukt && laatste && (
                <Panel title="In de la">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={RIJ}>
                            <span style={{ flex: 1 }}>Na het afromen</span>
                            <span style={{ ...BEDRAG, fontSize: 17, fontWeight: 600 }}>{euro(laatste.contant_geteld_cents - laatste.afgeroomd_cents)}</span>
                        </div>
                        <div style={RIJ}>
                            <span style={{ flex: 1 }}>Geteld</span>
                            {ruw === 0 ? <span style={{ color: 'var(--status-success-text)' }}>Gelijk aan verwacht</span>
                                : onverklaard === 0 ? <span style={{ color: 'var(--muted)' }}>{euro(ruw)} verschil, verklaard door je kasregel</span>
                                : <span style={{ ...BEDRAG, color: 'var(--status-warning-text)' }}>{euro(onverklaard)} verschil</span>}
                        </div>
                        <div style={RIJ}>
                            <span style={{ flex: 1 }}>Afgeroomd</span>
                            <span style={BEDRAG}>{euro(afgeroomd)}</span>
                        </div>
                    </div>
                </Panel>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {!mislukt && dag.stand !== 'geen_verkoop' && (
                    <Link href={`/verkoop/toonbank?datum=${dag.datum}`} className="btn btn-brand btn-touch" style={{ justifyContent: 'center', textDecoration: 'none' }}>
                        <Receipt size={16} aria-hidden="true" /> Bekijk de bonnen
                    </Link>
                )}
                <Link href="/winkelboek" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, fontSize: 13, fontWeight: 600, color: 'var(--brand-hover)', textDecoration: 'none' }}>
                    Naar Boekhouding winkel →
                </Link>
            </div>
        </div>
    );
}
