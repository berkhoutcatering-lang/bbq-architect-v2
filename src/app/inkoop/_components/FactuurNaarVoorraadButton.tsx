'use client';
/**
 * FactuurNaarVoorraadButton — "Factuur scannen → voorraad" ingang in de Inkoop-hub.
 * ────────────────────────────────────────────────────────────────────────────
 * Sinds W2b gaat elke factuur eerst langs het controlescherm (besluit Mathijs
 * 26 sep: ook de keuken eerst controleren). Deze knop opent daarom Ontvangst,
 * met de factuur-upload al open; de bon gaat daar ook naar het archief.
 */
import Link from 'next/link';
import { Camera } from 'lucide-react';

export default function FactuurNaarVoorraadButton() {
    return (
        <Link href="/voorraad/ontvangst?factuur=1" className="btn btn-brand btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Camera size={15} /> Factuur scannen → voorraad
        </Link>
    );
}
