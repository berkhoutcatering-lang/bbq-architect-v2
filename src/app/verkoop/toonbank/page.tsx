import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import { dagTotalen, euro, geldigeDatum, vandaagAmsterdam, type BonRij } from '@/lib/toonbank/overzicht';
import { toonbankLid } from './_lib/lid';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Toonbank · Bonnen',
    description: 'De bonnen van de Toonbank per dag: omzet, btw, betalingen en wat er met de voorraad gebeurde.',
};

interface RegelRij {
    regelnr: number;
    soort: string;
    naam: string | null;
    aantal: number | null;
    stuk_cents: number | null;
    bedrag_cents: number;
    alcohol: boolean | null;
    voorraad_status: string | null;
    betaalmethode: string | null;
    order_id: number | null;
}

interface BonScherm extends BonRij {
    apparaat_id: string;
    bonnummer: string;
    reden: string | null;
    kanaal: string;
    event_label: string | null;
    medewerker_naam: string | null;
    leeftijd_vastgesteld: boolean | null;
    leeftijd_geweigerd: boolean;
    prijs_afwijking: boolean;
    gebeurd_at: string;
    toonbank_bon_regels: RegelRij[];
}

const VOORRAAD_LABEL: Record<string, string> = {
    geboekt: 'afgeboekt',
    tekort_gecorrigeerd: 'tekort gecorrigeerd',
    niet_bijgehouden: 'niet bijgehouden',
    nvt: '',
};

function dagErbij(datum: string, n: number): string {
    const d = new Date(`${datum}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

function tijd(iso: string): string {
    return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
}

function Kenmerk({ kleur, children }: { kleur: string; children: ReactNode }) {
    return <span className="text-[11px] px-1.5 py-0.5 rounded-md border" style={{ color: kleur, borderColor: kleur }}>{children}</span>;
}

/**
 * Verkoop → Toonbank → Bonnen (BA-9). Per dag (Europe/Amsterdam) alle bonnen
 * en tegenbonnen van de Toonbank, met de dagtotalen volgens de btw-regel
 * (som van de bon-btw, nooit opnieuw afronden). Alleen lezen, via RLS.
 */
export default async function ToonbankBonnenPagina({ searchParams }: { searchParams: Promise<{ datum?: string }> }) {
    const sp = await searchParams;
    const { supabase, orgId } = await toonbankLid();
    const vandaag = vandaagAmsterdam(new Date());
    const datum = geldigeDatum(sp.datum ?? null, vandaag);

    if (!orgId) {
        return <p className="text-[13px] text-[var(--muted)]">Je bent geen lid van een organisatie.</p>;
    }

    const [{ data: bonnen, error }, { data: apparaten }, { count: teControleren }] = await Promise.all([
        supabase.from('toonbank_bonnen')
            .select('id, apparaat_id, bonnummer, soort, status, reden, kanaal, event_label, medewerker_naam, leeftijd_vastgesteld, leeftijd_geweigerd, totaal_cents, afronding_cents, omzet_incl_cents, btw, statiegeld_cents, order_rest_cents, korting_cents, pin_cents, contant_cents, prijs_afwijking, gebeurd_at, toonbank_bon_regels(regelnr, soort, naam, aantal, stuk_cents, bedrag_cents, alcohol, voorraad_status, betaalmethode, order_id)')
            .eq('organization_id', orgId)
            .eq('bedrijfsdag', datum)
            .order('gebeurd_at', { ascending: false })
            .limit(1000),
        supabase.from('toonbank_apparaten').select('id, code, naam').eq('organization_id', orgId),
        supabase.from('toonbank_journaal').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('verwerk_status', ['fout', 'conflict']),
    ]);

    const lijst = ((bonnen ?? []) as unknown as BonScherm[]).map((b) => ({
        ...b,
        toonbank_bon_regels: [...(b.toonbank_bon_regels ?? [])].sort((x, y) => x.regelnr - y.regelnr),
    }));
    const code = new Map((apparaten ?? []).map((a) => [a.id as string, a.code as string]));
    const t = dagTotalen(lijst);

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text)]">Bonnen</h2>
                    <p className="text-[12px] text-[var(--muted)]">Wat de Toonbank verkocht, per dag. Een bon verandert nooit meer; een correctie is een tegenbon.</p>
                </div>
                <form method="get" className="flex items-center gap-2">
                    <Link href={`?datum=${dagErbij(datum, -1)}`} className="p-2 rounded-lg hover:bg-[var(--card)]" aria-label="Vorige dag"><ChevronLeft size={16} /></Link>
                    <input type="date" name="datum" defaultValue={datum} max={vandaag} aria-label="Dag"
                        className="px-2 py-1.5 text-[13px] rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)]" />
                    <button type="submit" className="px-3 py-1.5 text-[12px] rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)]">Toon</button>
                    {datum < vandaag && <Link href={`?datum=${dagErbij(datum, 1)}`} className="p-2 rounded-lg hover:bg-[var(--card)]" aria-label="Volgende dag"><ChevronRight size={16} /></Link>}
                </form>
            </div>

            {(teControleren ?? 0) > 0 && (
                <Link href="/verkoop/toonbank/te-controleren" className="flex items-center gap-2 mb-4 text-[13px] text-[var(--text)] no-underline">
                    <AlertTriangle size={14} style={{ color: 'var(--ws-warn, #d97706)' }} />
                    {teControleren} {teControleren === 1 ? 'melding' : 'meldingen'} van de Toonbank te controleren
                </Link>
            )}
            {error && <p className="text-[13px] mb-4" style={{ color: 'var(--ws-vuur, #dc2626)' }}>De bonnen konden niet geladen worden: {error.message}</p>}

            <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                <MetallicCard className="p-4" hover={false}>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">Omzet (incl. btw)</p>
                    <p className="text-[22px] font-semibold text-[var(--text)] tabular-nums">{euro(t.omzet_incl_cents)}</p>
                    <p className="text-[12px] text-[var(--muted)]">{t.aantal_bonnen} bonnen · {t.aantal_tegenbonnen} tegenbonnen · {t.aantal_geannuleerd} geannuleerd</p>
                </MetallicCard>
                <MetallicCard className="p-4" hover={false}>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">Btw (som van de bonnen)</p>
                    {t.omzet.length === 0 ? <p className="text-[13px] text-[var(--muted)]">—</p> : t.omzet.map((o) => (
                        <p key={o.pct} className="text-[13px] text-[var(--text)] tabular-nums">{o.pct}%: {euro(o.btw_cents)} <span className="text-[var(--muted)]">over {euro(o.grondslag_cents)}</span></p>
                    ))}
                </MetallicCard>
                <MetallicCard className="p-4" hover={false}>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">Betaald</p>
                    <p className="text-[13px] text-[var(--text)] tabular-nums">Pin {euro(t.pin_cents)}</p>
                    <p className="text-[13px] text-[var(--text)] tabular-nums">Contant {euro(t.contant_cents)}</p>
                </MetallicCard>
                <MetallicCard className="p-4" hover={false}>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">Geen omzet</p>
                    <p className="text-[13px] text-[var(--text)] tabular-nums">Statiegeld {euro(t.statiegeld_cents)}</p>
                    <p className="text-[13px] text-[var(--text)] tabular-nums">Rest webshoporders {euro(t.order_rest_cents)}</p>
                </MetallicCard>
            </div>

            {lijst.length === 0 ? (
                <MetallicCard className="p-5" hover={false}>
                    <p className="text-[13px] text-[var(--muted)]">Geen bonnen op deze dag.</p>
                </MetallicCard>
            ) : (
                <div className="flex flex-col gap-2">
                    {lijst.map((b) => {
                        const tekort = b.toonbank_bon_regels.some((r) => r.voorraad_status === 'tekort_gecorrigeerd');
                        const nietBij = b.toonbank_bon_regels.some((r) => r.voorraad_status === 'niet_bijgehouden');
                        const betaling = [b.pin_cents ? 'pin' : null, b.contant_cents ? 'contant' : null].filter(Boolean).join(' + ') || '—';
                        return (
                            <details key={b.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
                                <summary className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 cursor-pointer text-[13px] text-[var(--text)]">
                                    <span className="tabular-nums text-[var(--muted)] w-12">{tijd(b.gebeurd_at)}</span>
                                    <span className="font-medium tabular-nums w-28">{b.bonnummer}</span>
                                    <span className="text-[var(--muted)] w-10">{code.get(b.apparaat_id) ?? '?'}</span>
                                    <span className="flex-1 min-w-[120px]">{b.medewerker_naam ?? '—'}{b.kanaal === 'event' ? ` · ${b.event_label ?? 'event'}` : ''}</span>
                                    <span className="text-[var(--muted)] w-24">{betaling}</span>
                                    <span className="tabular-nums font-medium w-24 text-right">{euro(b.totaal_cents)}</span>
                                    <span className="flex gap-1.5 flex-wrap">
                                        {b.soort === 'tegenbon' && <Kenmerk kleur="var(--muted)">tegenbon</Kenmerk>}
                                        {b.status === 'geannuleerd' && <Kenmerk kleur="var(--muted)">geannuleerd</Kenmerk>}
                                        {tekort && <Kenmerk kleur="var(--ws-warn, #d97706)">tekort gecorrigeerd</Kenmerk>}
                                        {nietBij && <Kenmerk kleur="var(--muted)">niet bijgehouden</Kenmerk>}
                                        {b.leeftijd_vastgesteld && <Kenmerk kleur="var(--green, #16a34a)">18+ gezien</Kenmerk>}
                                        {b.leeftijd_geweigerd && <Kenmerk kleur="var(--ws-vuur, #dc2626)">18+ geweigerd</Kenmerk>}
                                        {b.prijs_afwijking && <Kenmerk kleur="var(--muted)">prijs week af</Kenmerk>}
                                    </span>
                                </summary>
                                <div className="px-4 pb-3">
                                    {b.reden && <p className="text-[12px] text-[var(--muted)] mb-2">Reden: {b.reden}</p>}
                                    <table className="w-full text-[12px]">
                                        <tbody>
                                            {b.toonbank_bon_regels.map((r) => (
                                                <tr key={r.regelnr} className="border-t border-[var(--border)]">
                                                    <td className="py-1 pr-2 text-[var(--muted)] w-8">{r.regelnr}</td>
                                                    <td className="py-1 pr-2 text-[var(--text)]">
                                                        {r.soort === 'verkoop' ? `${r.aantal ?? ''} × ${r.naam ?? ''}` : r.soort === 'statiegeld' ? `Statiegeld (${r.aantal ?? ''}×)` : r.soort === 'order_rest' ? `${r.naam ?? 'Restbetaling'} (order ${r.order_id ?? '?'})` : `Betaling ${r.betaalmethode ?? ''}`}
                                                        {r.alcohol ? ' · 18+' : ''}
                                                    </td>
                                                    <td className="py-1 pr-2 text-[var(--muted)]">{VOORRAAD_LABEL[r.voorraad_status ?? ''] ?? r.voorraad_status}</td>
                                                    <td className="py-1 text-right tabular-nums text-[var(--text)]">{euro(r.bedrag_cents)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </details>
                        );
                    })}
                </div>
            )}
        </>
    );
}
