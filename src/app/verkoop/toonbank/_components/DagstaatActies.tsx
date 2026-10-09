'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import { keurDagstaatGoed, rekenDagstaatNa } from '../actions';

/**
 * Bij een dagstaat: opnieuw narekenen en goedkeuren (met reden). Alleen voor een Admin (review M2
 * K5): de pagina toont dit blok niet aan andere leden, en de database controleert het ook.
 */
export default function DagstaatActies({ dagstaatId, kanGoedkeuren }: { dagstaatId: string; kanGoedkeuren: boolean }) {
    const router = useRouter();
    const showToast = useToast();
    const [bezig, setBezig] = useState<'na' | 'goed' | null>(null);

    async function narekenen() {
        setBezig('na');
        try {
            const r = await rekenDagstaatNa({ dagstaatId });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            showToast(r.data.verschillen === 0 ? 'Nagerekend: klopt met de bonnen' : `Nagerekend: ${r.data.verschillen} verschil${r.data.verschillen === 1 ? '' : 'len'}`,
                r.data.verschillen === 0 ? 'success' : 'error');
            router.refresh();
        } finally { setBezig(null); }
    }

    async function goedkeuren() {
        const reden = prompt('Waarom is deze dagstaat goed zo? (bijvoorbeeld "kas geteld, verschil is fooi")');
        if (reden === null) return;
        if (!reden.trim()) { showToast('Geef een reden.', 'error'); return; }
        setBezig('goed');
        try {
            const r = await keurDagstaatGoed({ dagstaatId, reden });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            showToast('Dagstaat goedgekeurd', 'success');
            router.refresh();
        } finally { setBezig(null); }
    }

    return (
        <div className="flex gap-2">
            <Button size="sm" variant="ghost" loading={bezig === 'na'} disabled={bezig !== null} onClick={() => void narekenen()}>Opnieuw narekenen</Button>
            {kanGoedkeuren && <Button size="sm" loading={bezig === 'goed'} disabled={bezig !== null} onClick={() => void goedkeuren()}>Goedkeuren</Button>}
        </div>
    );
}
