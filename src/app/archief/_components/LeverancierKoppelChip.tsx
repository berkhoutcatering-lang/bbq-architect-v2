/**
 * LeverancierKoppelChip — laat per bon zien of hij aan een leverancierskaart
 * hangt. Zo niet, dan is de chip zelf de actie: één klik maakt de kaart aan
 * op de naam van de factuur (of pakt de bestaande) en koppelt de bon.
 *
 * Gebruikt in het Kistje (kaart) én de tabel; zelfde chip als op
 * /geld/boekhouder zodat "gekoppeld" overal hetzelfde betekent.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Link2, Loader2 } from 'lucide-react';
import type { BonRow } from '@/lib/dal/bonnen';
import { setBonLeverancierAction } from '../actions';

export function LeverancierKoppelChip({ bon }: { bon: BonRow }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    if (bon.leverancier_id) {
        return (
            <span className="bh-link bh-link--ok" title="Gekoppeld aan een leverancierskaart">
                <Check size={10} /> gekoppeld
            </span>
        );
    }

    const naam = bon.winkel?.trim() ?? '';
    if (naam.length < 2 || bon.locked_at) {
        return (
            <span className="bh-link bh-link--none" title="Geen leveranciersnaam op de bon gevonden">
                niet gekoppeld
            </span>
        );
    }

    return (
        <button
            type="button"
            className="bh-link bh-link--todo"
            disabled={pending}
            title={error ?? `Maak een leverancierskaart voor "${naam}" aan (of pak de bestaande) en koppel deze bon`}
            onClick={(e) => {
                e.stopPropagation();
                setError(null);
                startTransition(async () => {
                    const res = await setBonLeverancierAction({ bonId: bon.id, nieuweNaam: naam });
                    if (!res.ok) setError(res.error ?? 'Koppelen mislukt');
                    else router.refresh();
                });
            }}
            onKeyDown={(e) => e.stopPropagation()}
        >
            {pending ? <Loader2 size={10} className="bh-spin" /> : <Link2 size={10} />}
            {error ? 'Mislukt — opnieuw' : 'Koppel leverancier'}
        </button>
    );
}
