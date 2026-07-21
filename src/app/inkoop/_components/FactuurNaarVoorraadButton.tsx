'use client';
/**
 * FactuurNaarVoorraadButton — "Factuur scannen → voorraad" ingang in de Inkoop-hub.
 * ────────────────────────────────────────────────────────────────────────────
 * Hergebruikt de bestaande BonAddSheet (foto → boekhouder-bon ÉN voorraad, met
 * per-regel voorraad-suggesties + nieuw-item-aanmaken). Die zat tot nu toe alleen
 * in de boekhouder; deze knop brengt 'm naar de plek waar je 'm verwacht: bij
 * Inkoop & Voorraad. Eén foto → boekhouder + voorraad, multifunctioneel.
 */
import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import BonAddSheet from '@/app/geld/boekhouder/_components/BonAddSheet';

export default function FactuurNaarVoorraadButton() {
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const showToast = useToast();

    return (
        <>
            <button
                type="button"
                className="btn btn-brand btn-sm"
                onClick={() => setOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
                <Camera size={15} /> Factuur scannen → voorraad
            </button>
            {open && (
                <BonAddSheet
                    onClose={() => setOpen(false)}
                    onCommitted={(_bonId, stockMovements) => {
                        setOpen(false);
                        showToast(
                            stockMovements > 0
                                ? `Factuur verwerkt — ${stockMovements} voorraad-mutatie${stockMovements === 1 ? '' : 's'} + boekhouder-bon`
                                : 'Factuur verwerkt en op de boekhouder-bon gezet',
                            'success',
                        );
                        router.refresh();
                    }}
                />
            )}
        </>
    );
}
