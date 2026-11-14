import { formatEurInt } from '@/lib/format';

/**
 * Omzet per dag als staafjes. Gewone divs met de merkkleur als variabele: de
 * gedeelde BarChartVertical plakt een hex-alfa achter zijn kleur en werkt dus
 * niet met een variabele.
 */
export default function DagBalken({ dagen }: { dagen: { datum: string; cents: number }[] }) {
    const hoogste = Math.max(...dagen.map((d) => d.cents), 0);
    const HOOGTE = 140;

    return (
        <div role="img" aria-label={`Omzet per dag: ${dagen.map((d) => `${dagLabel(d.datum)} ${formatEurInt(d.cents / 100)}`).join(', ')}`}
            style={{ display: 'grid', gridTemplateColumns: `repeat(${dagen.length}, minmax(0, 1fr))`, gap: dagen.length > 12 ? 4 : 12, alignItems: 'end' }}>
            {dagen.map((d, i) => {
                const laatste = i === dagen.length - 1;
                const hoogte = hoogste > 0 ? Math.max(Math.round((Math.max(d.cents, 0) / hoogste) * HOOGTE), d.cents > 0 ? 3 : 0) : 0;
                return (
                    <div key={d.datum} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
                        {dagen.length <= 12 && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: laatste ? 'var(--text)' : 'var(--muted)', fontWeight: laatste ? 600 : 400, whiteSpace: 'nowrap' }}>
                                {formatEurInt(d.cents / 100)}
                            </span>
                        )}
                        <div style={{
                            width: '100%', maxWidth: 72, height: hoogte, borderRadius: '8px 8px 2px 2px',
                            background: laatste ? 'var(--brand-hover)' : 'color-mix(in srgb, var(--brand) 55%, transparent)',
                        }} />
                        <span style={{ fontSize: dagen.length > 12 ? 10 : 12, color: laatste ? 'var(--text)' : 'var(--muted)', fontWeight: laatste ? 600 : 400, whiteSpace: 'nowrap' }}>
                            {dagen.length > 12 ? String(Number(d.datum.slice(8))) : dagLabel(d.datum)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

/** 'za 28' */
function dagLabel(datum: string): string {
    return new Date(`${datum}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}
