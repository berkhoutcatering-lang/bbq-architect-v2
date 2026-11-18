'use client';

/**
 * De velden van het etiket van een product op gewicht: wat er op de sticker
 * van de Toonbank komt. Gebruikt bij Nieuw product (Op gewicht) en bij het
 * tabblad Sticker van een product. Niets is vooraf ingevuld: de eigenaar
 * vult het zelf in, van de verpakking of de leverancier.
 */
import { controleerEtiket, leesAllergenen, leesIngredienten } from '@/lib/winkel/opGewicht';

export interface EtiketInvoer {
    ingredienten: string;
    allergenen: string;
    rauwe_melk: boolean;
    bewaren: string;
    houdbaar_dagen: string;
    beschermende_atmosfeer: boolean;
}

export const LEEG_ETIKET: EtiketInvoer = { ingredienten: '', allergenen: '', rauwe_melk: false, bewaren: '', houdbaar_dagen: '', beschermende_atmosfeer: false };

/** Wat er nog mist of niet klopt; null = klaar om op te slaan. */
export function etiketProbleem(e: EtiketInvoer, type: string, binnenPerSticker: boolean): string | null {
    if (!binnenPerSticker && e.houdbaar_dagen.trim() === '') return 'Vul in hoeveel dagen het houdbaar is na het snijden.';
    return controleerEtiket({ type, ingredienten: leesIngredienten(e.ingredienten), allergenen: leesAllergenen(e.allergenen) });
}

/** Naar de velden van de server-actions. */
export function etiketNaarActie(e: EtiketInvoer, binnenPerSticker: boolean) {
    return {
        ingredienten: leesIngredienten(e.ingredienten),
        allergenen: leesAllergenen(e.allergenen),
        rauwe_melk: e.rauwe_melk,
        bewaren: e.bewaren.trim() || null,
        houdbaar_dagen: !binnenPerSticker && e.houdbaar_dagen.trim() !== '' ? Number(e.houdbaar_dagen) : null,
        beschermende_atmosfeer: e.beschermende_atmosfeer,
    };
}

export default function EtiketVelden({ waarde, type, binnenPerSticker, onChange }: {
    waarde: EtiketInvoer;
    type: string;
    binnenPerSticker: boolean;
    onChange: (e: EtiketInvoer) => void;
}) {
    const zet = (deel: Partial<EtiketInvoer>) => onChange({ ...waarde, ...deel });
    const probleem = etiketProbleem(waarde, type, binnenPerSticker);
    return (
        <>
            <label style={{ display: 'grid', gap: 6 }}>
                <span className="kf-eyebrow">Ingrediënten (op de sticker)</span>
                <textarea className="kf-input" rows={3} value={waarde.ingredienten} onChange={(e) => zet({ ingredienten: e.target.value })} placeholder="*melk*, zout, stremsel, zuursel" style={{ resize: 'vertical', minHeight: 64 }} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Zoals op de verpakking van de leverancier, met komma&apos;s. Zet elk allergeen tussen sterretjes: *melk*. Mag leeg; dan staat er alleen &quot;Bevat:&quot; met de allergenen.</span>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
                <span className="kf-eyebrow">Allergenen</span>
                <input className="kf-input" value={waarde.allergenen} onChange={(e) => zet({ allergenen: e.target.value })} placeholder="melk" />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Met komma&apos;s.{type === 'kaas' ? ' Bij kaas verplicht.' : ''}</span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}>
                <input type="checkbox" checked={waarde.rauwe_melk} onChange={(e) => zet({ rauwe_melk: e.target.checked })} style={{ marginTop: 3 }} />
                <span>&quot;Met rauwe melk bereid&quot; op de sticker</span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}>
                <input type="checkbox" checked={waarde.beschermende_atmosfeer} onChange={(e) => zet({ beschermende_atmosfeer: e.target.checked })} style={{ marginTop: 3 }} />
                <span>&quot;Verpakt onder beschermende atmosfeer&quot; op de sticker</span>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
                <span className="kf-eyebrow">Bewaren (op de sticker)</span>
                <input className="kf-input" value={waarde.bewaren} maxLength={80} onChange={(e) => zet({ bewaren: e.target.value })} placeholder="Gekoeld bewaren" />
            </label>
            {!binnenPerSticker && (
                <label style={{ display: 'grid', gap: 6 }}>
                    <span className="kf-eyebrow">Houdbaar na snijden (dagen)</span>
                    <input className="kf-input" inputMode="numeric" value={waarde.houdbaar_dagen} onChange={(e) => zet({ houdbaar_dagen: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Van de leverancier of de hygiënecode. De THT op de sticker wordt de snijdag plus dit aantal dagen, en nooit later dan de THT van de hele kaas.</span>
                </label>
            )}
            {probleem && <div style={{ fontSize: 12.5, color: 'var(--red, #dc2626)' }}>{probleem}</div>}
        </>
    );
}
