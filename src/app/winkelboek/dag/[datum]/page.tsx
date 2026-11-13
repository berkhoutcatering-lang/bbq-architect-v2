import { notFound } from 'next/navigation';
import { maakDagboeking } from '@/lib/winkelboek/dagboeking';
import { laadDagBonnen, laadDagstaten, laadKasMutaties, laadUitsluitingen } from '@/lib/winkelboek/laden';
import DagScherm from '../../_components/DagScherm';
import { winkelboekLid } from '../../_lib/lid';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Boekhouding winkel · Dag',
    description: 'Eén kassadag in hokjes, met wat er in de la ligt.',
};

/** Een bestaande kalenderdag in de vorm JJJJ-MM-DD. */
function isDatum(tekst: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tekst)) return false;
    const d = new Date(`${tekst}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === tekst;
}

/**
 * Eén kassadag. Hier komt de melding "Dag geboekt" op uit; op een telefoon is
 * dit het scherm dat je ziet nadat je de kassa hebt afgesloten.
 */
export default async function DagPagina({ params }: { params: Promise<{ datum: string }> }) {
    const { datum } = await params;
    if (!isDatum(datum)) notFound();

    const { supabase, orgId } = await winkelboekLid();
    if (!orgId) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Je bent geen lid van een organisatie.</p>;

    const [proef, bonnen, staten, kas] = await Promise.all([
        laadUitsluitingen(supabase, orgId, datum, datum),
        laadDagBonnen(supabase, orgId, datum, datum),
        laadDagstaten(supabase, orgId, datum, datum),
        laadKasMutaties(supabase, orgId, datum, datum),
    ]);

    const eigenTijdens = kas.mutaties.filter((m) => m.moment === 'tijdens').reduce((s, m) => s + m.bedrag_cents, 0);

    return (
        <DagScherm
            dag={maakDagboeking(datum, bonnen.bonnen, staten.dagstaten, eigenTijdens)}
            dagstaten={staten.dagstaten}
            eigenTijdens={eigenTijdens}
            proefdag={proef.dagen.has(datum)}
            /* Zonder bonnen of dagstaten is de dag niet nagekeken: dan geen vinkje. */
            fout={bonnen.fout ?? staten.fout ?? proef.fout ?? kas.fout}
        />
    );
}
