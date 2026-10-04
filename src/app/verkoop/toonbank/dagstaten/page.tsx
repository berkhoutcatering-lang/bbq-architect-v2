import Link from 'next/link';
import MetallicCard from '@/components/MetallicCard';
import { euro, isAantal, verschilLabel } from '@/lib/toonbank/overzicht';
import DagstaatActies from '../_components/DagstaatActies';
import { toonbankLid } from '../_lib/lid';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Toonbank · Dagstaten',
    description: 'De afgesloten dagen van de Toonbank, nagerekend uit de bonnen.',
};

interface Omzet { pct: number; incl_cents: number; grondslag_cents?: number; btw_cents: number }

interface DagstaatRij {
    id: string;
    apparaat_id: string;
    dagstaatnummer: number;
    bedrijfsdag: string;
    geopend_at: string;
    gesloten_at: string;
    aantal_bonnen: number;
    aantal_tegenbonnen: number;
    aantal_geannuleerd: number;
    omzet: Omzet[];
    statiegeld_cents: number;
    order_rest_cents: number;
    pin_toonbank_cents: number;
    pin_mypos_app_cents: number;
    pin_verschil_cents: number;
    pin_verschil_reden: string | null;
    contant_begin_cents: number;
    contant_verwacht_cents: number;
    contant_geteld_cents: number;
    contant_verschil_cents: number;
    contant_verschil_reden: string | null;
    afgeroomd_cents: number;
    verzendbak_leeg: boolean;
    status: 'voorlopig' | 'definitief' | 'aangevuld' | 'goedgekeurd';
    nagerekend_at: string | null;
    nagerekend: { omzet?: Omzet[]; aantal_bonnen?: number; pin_toonbank_cents?: number; contant_ontvangen_cents?: number; contant_begin_bron?: string } | null;
    verschillen: { veld: string; tablet_cents: number; ba_cents: number }[];
    goedkeur_reden: string | null;
    goedgekeurd_at: string | null;
}

const STATUS: Record<DagstaatRij['status'], { tekst: string; kleur: string }> = {
    voorlopig: { tekst: 'Voorlopig (verzendbak was nog niet leeg)', kleur: 'var(--ws-warn, #d97706)' },
    definitief: { tekst: 'Definitief', kleur: 'var(--green, #16a34a)' },
    aangevuld: { tekst: 'Aangevuld (later nog bonnen)', kleur: 'var(--ws-warn, #d97706)' },
    goedgekeurd: { tekst: 'Goedgekeurd', kleur: 'var(--green, #16a34a)' },
};

function dag(d: string): string {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function tijd(iso: string): string {
    return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
}

/**
 * Verkoop → Toonbank → Dagstaten (BA-10). Per afgesloten dag per tablet: wat
 * de tablet zei en wat BBQ Architect uit de bonnen narekende (btw = som van
 * de bon-btw per tarief, nooit opnieuw afgerond). Een verschil komt ook in
 * Te controleren; een Admin keurt hem achteraf goed. Afsluiten wordt nooit
 * geblokkeerd.
 */
export default async function DagstatenPagina() {
    const { supabase, orgId, isAdmin } = await toonbankLid();
    if (!orgId) return <p className="text-[13px] text-[var(--muted)]">Je bent geen lid van een organisatie.</p>;

    const [{ data, error }, { data: apparaten }] = await Promise.all([
        supabase.from('toonbank_dagstaten')
            .select('id, apparaat_id, dagstaatnummer, bedrijfsdag, geopend_at, gesloten_at, aantal_bonnen, aantal_tegenbonnen, aantal_geannuleerd, omzet, statiegeld_cents, order_rest_cents, pin_toonbank_cents, pin_mypos_app_cents, pin_verschil_cents, pin_verschil_reden, contant_begin_cents, contant_verwacht_cents, contant_geteld_cents, contant_verschil_cents, contant_verschil_reden, afgeroomd_cents, verzendbak_leeg, status, nagerekend_at, nagerekend, verschillen, goedkeur_reden, goedgekeurd_at')
            .eq('organization_id', orgId)
            .order('bedrijfsdag', { ascending: false })
            .order('gesloten_at', { ascending: false })
            .limit(60),
        supabase.from('toonbank_apparaten').select('id, code, naam').eq('organization_id', orgId),
    ]);
    const code = new Map((apparaten ?? []).map((a) => [a.id as string, a.code as string]));
    const lijst = (data ?? []) as unknown as DagstaatRij[];

    return (
        <>
            <div className="mb-5">
                <h2 className="text-lg font-semibold text-[var(--text)]">Dagstaten</h2>
                <p className="text-[12px] text-[var(--muted)]">Elke afgesloten dag van een tablet, nagerekend uit de bonnen. Een verschil keur je achteraf goed; het afsluiten wordt nooit tegengehouden.</p>
            </div>
            {error && <p className="text-[13px] mb-4" style={{ color: 'var(--ws-vuur, #dc2626)' }}>De dagstaten konden niet geladen worden: {error.message}</p>}

            {lijst.length === 0 ? (
                <MetallicCard className="p-5" hover={false}>
                    <p className="text-[13px] text-[var(--muted)]">Nog geen dagstaten. Die komen binnen als een tablet de dag afsluit.</p>
                </MetallicCard>
            ) : (
                <div className="flex flex-col gap-3">
                    {lijst.map((d) => {
                        const st = STATUS[d.status] ?? { tekst: d.status, kleur: 'var(--muted)' };
                        const ba = d.nagerekend?.omzet ?? [];
                        const tarieven = [...new Set([...d.omzet.map((o) => o.pct), ...ba.map((o) => o.pct)])].sort((a, b) => b - a);
                        const verschil = (d.verschillen ?? []).length > 0 && d.status !== 'goedgekeurd';
                        return (
                            <MetallicCard key={d.id} className="p-4" hover={false} accent={verschil ? 'var(--ws-warn, #d97706)' : undefined}>
                                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                                    <div>
                                        <p className="text-[14px] font-medium text-[var(--text)]">
                                            {dag(d.bedrijfsdag)} · tablet {code.get(d.apparaat_id) ?? '?'} · dagstaat {d.dagstaatnummer}
                                        </p>
                                        <p className="text-[12px] text-[var(--muted)]">
                                            {tijd(d.geopend_at)}–{tijd(d.gesloten_at)} · {d.aantal_bonnen} bonnen, {d.aantal_tegenbonnen} tegenbonnen, {d.aantal_geannuleerd} geannuleerd
                                            {' · '}<span style={{ color: st.kleur }}>{st.tekst}</span>
                                        </p>
                                    </div>
                                    <DagstaatActies dagstaatId={d.id} kanGoedkeuren={isAdmin && d.status !== 'goedgekeurd'} />
                                </div>

                                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)] mb-1">Omzet per tarief</p>
                                        <table className="w-full text-[12px] tabular-nums">
                                            <thead><tr className="text-[var(--muted)]"><th className="text-left font-normal">Tarief</th><th className="text-right font-normal">Tablet</th><th className="text-right font-normal">Uit de bonnen</th></tr></thead>
                                            <tbody>
                                                {tarieven.map((pct) => {
                                                    const t = d.omzet.find((o) => o.pct === pct);
                                                    const b = ba.find((o) => o.pct === pct);
                                                    return (
                                                        <tr key={pct} className="text-[var(--text)]">
                                                            <td>{pct}%</td>
                                                            <td className="text-right">{t ? `${euro(t.incl_cents)} (btw ${euro(t.btw_cents)})` : '—'}</td>
                                                            <td className="text-right">{b ? `${euro(b.incl_cents)} (btw ${euro(b.btw_cents)})` : '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        <p className="text-[12px] text-[var(--muted)] mt-1">Geen omzet: statiegeld {euro(d.statiegeld_cents)}, rest webshoporders {euro(d.order_rest_cents)}</p>
                                    </div>
                                    <div className="text-[12px] text-[var(--text)] tabular-nums">
                                        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)] mb-1">Pin</p>
                                        <p>Toonbank {euro(d.pin_toonbank_cents)} · myPOS {euro(d.pin_mypos_app_cents)}{d.pin_verschil_cents ? ` · verschil ${euro(d.pin_verschil_cents)}` : ''}</p>
                                        {d.pin_verschil_reden && <p className="text-[var(--muted)]">“{d.pin_verschil_reden}”</p>}
                                        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)] mt-2 mb-1">Contant</p>
                                        <p>Begin {euro(d.contant_begin_cents)} · verwacht {euro(d.contant_verwacht_cents)} · geteld {euro(d.contant_geteld_cents)}{d.contant_verschil_cents ? ` · verschil ${euro(d.contant_verschil_cents)}` : ''}</p>
                                        {d.contant_verschil_reden && <p className="text-[var(--muted)]">“{d.contant_verschil_reden}”</p>}
                                        {d.afgeroomd_cents > 0 && <p className="text-[var(--muted)]">Afgeroomd {euro(d.afgeroomd_cents)}</p>}
                                    </div>
                                </div>

                                {(d.verschillen ?? []).length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-[11px] uppercase tracking-[0.08em] mb-1" style={{ color: verschil ? 'var(--ws-warn, #d97706)' : 'var(--muted)' }}>
                                            Tablet en bonnen verschillen{d.status === 'goedgekeurd' ? ' (goedgekeurd)' : ''}
                                        </p>
                                        <ul className="text-[12px] text-[var(--text)] tabular-nums">
                                            {d.verschillen.map((v) => (
                                                <li key={v.veld}>{verschilLabel(v.veld)}: tablet {isAantal(v.veld) ? v.tablet_cents : euro(v.tablet_cents)}, uit de bonnen {isAantal(v.veld) ? v.ba_cents : euro(v.ba_cents)}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {d.status === 'goedgekeurd' && d.goedkeur_reden && <p className="text-[12px] text-[var(--muted)] mt-2">Goedgekeurd: {d.goedkeur_reden}</p>}
                                <p className="text-[11px] text-[var(--muted)] mt-2">
                                    <Link href={`/verkoop/toonbank?datum=${d.bedrijfsdag}`} className="underline">Bonnen van deze dag</Link>
                                    {d.nagerekend_at ? ` · nagerekend ${new Date(d.nagerekend_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}` : ''}
                                    {d.nagerekend?.contant_begin_bron === 'dag_openen' ? ' · wisselgeld uit "dag openen"' : ''}
                                </p>
                            </MetallicCard>
                        );
                    })}
                </div>
            )}
        </>
    );
}
