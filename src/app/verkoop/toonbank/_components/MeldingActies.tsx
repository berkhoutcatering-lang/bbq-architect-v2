'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import { handelMeldingAf } from '../actions';

/** De knoppen bij een melding in Te controleren (alleen voor een Admin). */
export default function MeldingActies({ journaalId, opnieuwKan }: { journaalId: number; opnieuwKan: boolean }) {
    const router = useRouter();
    const showToast = useToast();
    const [bezig, setBezig] = useState<'opnieuw' | 'opgelost' | null>(null);

    async function doe(actie: 'opnieuw' | 'opgelost') {
        let reden: string | null = null;
        if (actie === 'opgelost') {
            reden = prompt('Waarom is dit afgehandeld? (bijvoorbeeld "geteld en gecorrigeerd", "goedgekeurd door Mathijs")');
            if (reden === null) return;
            if (!reden.trim()) { showToast('Geef een reden.', 'error'); return; }
        }
        setBezig(actie);
        try {
            const r = await handelMeldingAf({ journaalId, actie, reden });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            const s = r.data.status;
            showToast(s === 'opgelost' ? 'Afgehandeld' : s === 'verwerkt' ? 'Verwerkt' : s === 'conflict' ? 'Verwerkt, maar er blijft iets te controleren' : `Nog steeds: ${s}`,
                s === 'fout' ? 'error' : 'success');
            router.refresh();
        } finally { setBezig(null); }
    }

    return (
        <div className="flex gap-2">
            {opnieuwKan && <Button size="sm" variant="ghost" loading={bezig === 'opnieuw'} disabled={bezig !== null} onClick={() => void doe('opnieuw')}>Opnieuw verwerken</Button>}
            <Button size="sm" loading={bezig === 'opgelost'} disabled={bezig !== null} onClick={() => void doe('opgelost')}>Afgehandeld</Button>
        </div>
    );
}
