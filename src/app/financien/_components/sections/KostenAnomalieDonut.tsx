'use client';
/* Kostenanomalie-donut — design-system build (Tool 09).
   Verklaart visueel waarom de marge "te mooi" kan zijn: theoretisch
   verwachte kosten (foodcost + personeel uit de forecast) versus wat er
   werkelijk aan bonnen is geboekt. Groot gat = marge-cijfer is niet
   realistisch. Geen AI, pure berekening uit bestaande forecast + bonnen. */

import { AlertTriangle, Receipt } from 'lucide-react';
import { formatEur } from '@/lib/format';

interface Props {
    verwacht: number;       /* forecast.totalFoodcost + totalLabor (theoretisch) */
    geboekt: number;        /* som bonnen.totaal in geselecteerd jaar */
    margePct: number;       /* forecast.overalMarge — het cijfer dat misleidt */
    bonnenOngecategoriseerd: number;
    onToonBonnen?: () => void;
}

export default function KostenAnomalieDonut({ verwacht, geboekt, margePct, bonnenOngecategoriseerd, onToonBonnen }: Props) {
    /* alleen tonen als er echt een gat is: minder dan 60% van verwacht geboekt */
    const dekking = verwacht > 0 ? geboekt / verwacht : 1;
    if (verwacht <= 0 || dekking >= 0.6) return null;

    const R = 52, C = 2 * Math.PI * R;
    const filled = Math.max(0.02, Math.min(1, dekking));

    return (
        <div className="panel uren-glass" style={{ padding: 20, marginBottom: 20, border: '1px solid rgba(239,68,68,.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    <AlertTriangle size={14} style={{ color: 'var(--red)' }} /> Kostenanomalie
                </h3>
                {bonnenOngecategoriseerd > 0 && (
                    <button onClick={onToonBonnen}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--red)', fontSize: 11.5, fontWeight: 700, cursor: onToonBonnen ? 'pointer' : 'default' }}>
                        <Receipt size={12} /> {bonnenOngecategoriseerd} bonnen
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
                <svg width={130} height={130} viewBox="0 0 130 130" role="img"
                    aria-label={`Geboekt ${formatEur(geboekt)} van verwacht ${formatEur(verwacht)} aan kosten`}>
                    <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(239,68,68,.18)" strokeWidth="13" />
                    <circle cx="65" cy="65" r={R} fill="none" stroke="var(--amber)" strokeWidth="13" strokeLinecap="round"
                        strokeDasharray={`${C * filled} ${C}`} transform="rotate(-90 65 65)" />
                    <text x="65" y="60" textAnchor="middle" fill="var(--text)" style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display, inherit)' }}>
                        {formatEur(geboekt)}
                    </text>
                    <text x="65" y="78" textAnchor="middle" fill="var(--muted)" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' as const }}>
                        geboekt
                    </text>
                </svg>

                <div style={{ flex: 1, minWidth: 220 }}>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--text)' }}>
                        Verwacht <strong>{formatEur(verwacht)}</strong> aan kosten (theoretische foodcost + personeel),
                        maar pas <strong style={{ color: 'var(--red)' }}>{formatEur(geboekt)}</strong> geboekt.
                        Daardoor toont je marge {margePct.toFixed(1).replace('.', ',')}%.
                    </p>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                        Scan je bonnen of koppel facturen van leveranciers — dan zakt de marge naar het echte cijfer.
                    </p>
                </div>
            </div>
        </div>
    );
}
