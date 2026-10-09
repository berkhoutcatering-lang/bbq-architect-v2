import MetallicCard from '@/components/MetallicCard';
import { controleLabel, meldingSamenvatting, minutenTerug, SOORT_LABEL } from '@/lib/toonbank/overzicht';
import MeldingActies from '../_components/MeldingActies';
import { toonbankLid } from '../_lib/lid';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Toonbank · Te controleren',
    description: 'Meldingen van de Toonbank die BBQ Architect niet (helemaal) kon verwerken.',
};

/** Hoe lang een melding op "wacht" mag staan voor hij hier verschijnt. */
const WACHT_MINUTEN = 10;

/** Meldingen die nooit opnieuw verwerkt kunnen worden: die handel je met de hand af. */
const ALLEEN_MET_DE_HAND = new Set(['contract_verouderd', 'volgnummer_dubbel', 'soort_onbekend', 'moment_ongeldig']);

interface JournaalRij {
    id: number;
    apparaat_id: string;
    gebeurtenis_id: string;
    volgnummer: number | null;
    soort: string;
    payload: unknown;
    apparaat_tijd: string | null;
    ontvangen_at: string;
    gat_voor: boolean;
    verwerk_status: string;
    pogingen: number;
    fout_code: string | null;
    fout_melding: string | null;
    resultaat: { controles?: { code: string; melding: string }[]; orders_tekort?: { nummer: string; tekort: number }[] } | null;
    opgelost_reden: string | null;
    opgelost_at: string | null;
}

const KOLOMMEN = 'id, apparaat_id, gebeurtenis_id, volgnummer, soort, payload, apparaat_tijd, ontvangen_at, gat_voor, verwerk_status, pogingen, fout_code, fout_melding, resultaat, opgelost_reden, opgelost_at';

function wanneer(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
}

/**
 * Verkoop → Toonbank → Te controleren (BA-9). Alles wat de Toonbank meldde
 * en niet zonder meer verwerkt is: fout (niet te verwerken), conflict
 * (verwerkt, maar er klopt iets niet), en een melding die al langer dan 10
 * minuten wacht (bijvoorbeeld een tegenbon zonder zijn bon). De tablet heeft
 * nooit een weigering gekregen: de verkoop is al gebeurd. Een Admin verwerkt
 * opnieuw of handelt af met een reden.
 */
export default async function TeControlerenPagina() {
    const { supabase, orgId, isAdmin } = await toonbankLid();
    if (!orgId) return <p className="text-[13px] text-[var(--muted)]">Je bent geen lid van een organisatie.</p>;

    const grens = minutenTerug(new Date(), WACHT_MINUTEN);
    const [{ data: open, error }, { data: klaar }, { data: apparaten }] = await Promise.all([
        supabase.from('toonbank_journaal').select(KOLOMMEN)
            .eq('organization_id', orgId)
            .or(`verwerk_status.in.(fout,conflict),and(verwerk_status.eq.wacht,ontvangen_at.lt.${grens})`)
            .order('ontvangen_at', { ascending: true })
            .limit(200),
        supabase.from('toonbank_journaal').select(KOLOMMEN)
            .eq('organization_id', orgId).eq('verwerk_status', 'opgelost')
            .order('opgelost_at', { ascending: false })
            .limit(20),
        supabase.from('toonbank_apparaten').select('id, code, naam').eq('organization_id', orgId),
    ]);
    const code = new Map((apparaten ?? []).map((a) => [a.id as string, a.code as string]));
    const rijen = (open ?? []) as unknown as JournaalRij[];

    return (
        <>
            <div className="mb-5">
                <h2 className="text-lg font-semibold text-[var(--text)]">Te controleren</h2>
                <p className="text-[12px] text-[var(--muted)]">
                    Wat de Toonbank meldde en BBQ Architect niet zonder meer kon verwerken. De verkoop is al gebeurd: niets is geweigerd.
                    {!isAdmin && ' Alleen een beheerder (Admin) kan meldingen afhandelen.'}
                </p>
            </div>
            {error && <p className="text-[13px] mb-4" style={{ color: 'var(--ws-vuur, #dc2626)' }}>Het journaal kon niet geladen worden: {error.message}</p>}

            {rijen.length === 0 ? (
                <MetallicCard className="p-5 mb-6" hover={false}>
                    <p className="text-[13px] text-[var(--text)]">Niets te controleren. Alles van de Toonbank is verwerkt.</p>
                </MetallicCard>
            ) : (
                <div className="flex flex-col gap-3 mb-8">
                    {rijen.map((j) => {
                        const controles = j.resultaat?.controles ?? [];
                        const kleur = j.verwerk_status === 'fout' ? 'var(--ws-vuur, #dc2626)' : 'var(--ws-warn, #d97706)';
                        return (
                            <MetallicCard key={j.id} className="p-4" hover={false} accent={kleur}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: kleur }}>
                                            {j.verwerk_status === 'fout' ? 'Niet verwerkt' : j.verwerk_status === 'conflict' ? 'Verwerkt, te controleren' : 'Wacht'} · {controleLabel(j.fout_code)}
                                        </p>
                                        <p className="text-[14px] font-medium text-[var(--text)] mt-0.5">
                                            {SOORT_LABEL[j.soort] ?? j.soort}: {meldingSamenvatting(j.soort, j.payload)}
                                        </p>
                                        <p className="text-[12px] text-[var(--muted)]">
                                            Tablet {code.get(j.apparaat_id) ?? '?'} · volgnummer {j.volgnummer ?? '—'}{j.gat_voor ? ' (vorige ontbreekt)' : ''} · op de tablet {wanneer(j.apparaat_tijd)} · ontvangen {wanneer(j.ontvangen_at)} · {j.pogingen} {j.pogingen === 1 ? 'poging' : 'pogingen'}
                                        </p>
                                        {controles.length > 0 ? (
                                            <ul className="mt-2 text-[13px] text-[var(--text)] list-disc pl-5">
                                                {controles.map((c, i) => <li key={i}>{c.melding}</li>)}
                                            </ul>
                                        ) : j.fout_melding && <p className="mt-2 text-[13px] text-[var(--text)]">{j.fout_melding}</p>}
                                        <details className="mt-2">
                                            <summary className="text-[12px] text-[var(--muted)] cursor-pointer">Melding zoals de tablet hem stuurde</summary>
                                            <pre className="mt-1 text-[11px] text-[var(--muted)] whitespace-pre-wrap break-all max-h-72 overflow-auto">{JSON.stringify(j.payload, null, 2)}</pre>
                                        </details>
                                    </div>
                                    {isAdmin && <MeldingActies journaalId={j.id} opnieuwKan={j.verwerk_status !== 'conflict' && !ALLEEN_MET_DE_HAND.has(j.fout_code ?? '')} />}
                                </div>
                            </MetallicCard>
                        );
                    })}
                </div>
            )}

            {(klaar ?? []).length > 0 && (
                <>
                    <h3 className="text-[13px] font-semibold text-[var(--text)] mb-2">Laatst afgehandeld</h3>
                    <div className="flex flex-col gap-1">
                        {((klaar ?? []) as unknown as JournaalRij[]).map((j) => (
                            <p key={j.id} className="text-[12px] text-[var(--muted)]">
                                {wanneer(j.opgelost_at)} · {SOORT_LABEL[j.soort] ?? j.soort}: {meldingSamenvatting(j.soort, j.payload)} · {controleLabel(j.fout_code)} — {j.opgelost_reden}
                            </p>
                        ))}
                    </div>
                </>
            )}
        </>
    );
}
