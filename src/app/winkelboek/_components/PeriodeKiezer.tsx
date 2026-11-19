import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { maandSleutel, weekSleutel, type Periode } from '@/lib/winkelboek/periode';

/**
 * Eén periodekiezer voor alle tabbladen: week of maand, met pijlen terug en
 * vooruit. De periode staat in het adres (`?p=`), dus alles zijn gewone links
 * en de pagina blijft een servercomponent.
 */
export default function PeriodeKiezer({ periode, basis, extra }: {
    periode: Periode;
    /** Het pad van het tabblad, bv. '/winkelboek/verkoop'. */
    basis: string;
    /** Andere zoekparameters die mee moeten blijven gaan (zoekwoord, filter). */
    extra?: Record<string, string | undefined>;
}) {
    const naar = (p: string) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
        q.set('p', p);
        return `${basis}?${q.toString()}`;
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 10 }}>
                <Link href={naar(periode.vorige)} className="btn btn-ghost btn-icon" aria-label="Vorige periode" style={{ border: 0 }}>
                    <ChevronLeft size={16} />
                </Link>
                <span style={{ minWidth: 168, textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '0 4px' }}>{periode.label}</span>
                <Link href={naar(periode.volgende)} className="btn btn-ghost btn-icon" aria-label="Volgende periode" style={{ border: 0 }}>
                    <ChevronRight size={16} />
                </Link>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                <Link href={naar(weekSleutel(periode))} className={`kf-chip${periode.soort === 'week' ? ' is-on' : ''}`} aria-current={periode.soort === 'week' ? 'true' : undefined} style={{ textDecoration: 'none', minHeight: 32 }}>
                    Week
                </Link>
                <Link href={naar(maandSleutel(periode))} className={`kf-chip${periode.soort === 'maand' ? ' is-on' : ''}`} aria-current={periode.soort === 'maand' ? 'true' : undefined} style={{ textDecoration: 'none', minHeight: 32 }}>
                    Maand
                </Link>
            </div>
        </div>
    );
}
