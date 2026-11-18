'use client';

/**
 * De velden van het etiket van een product op gewicht: wat er op de sticker
 * van de Toonbank komt. Gebruikt bij Nieuw product (Op gewicht) en bij het
 * tabblad Sticker van een product.
 *
 * Besluit eigenaar (18 november 2026): de sticker zegt naam, gewicht, prijs,
 * kiloprijs en THT. Verplicht is daarom alleen hoe lang het houdbaar is na
 * het snijden (de THT zit in de streepjescode): harde kaas 14 dagen, zachte
 * kaas 7, of een eigen aantal. Ingrediënten, allergenen, rauwe melk en
 * bewaren mogen leeg en staan onder "Meer op de sticker".
 */
import { useState } from 'react';
import Button from '@/components/Button';
import { HOUDBAAR_KEUZES, controleerEtiket, leesAllergenen, leesIngredienten } from '@/lib/winkel/opGewicht';

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
export function etiketProbleem(e: EtiketInvoer, binnenPerSticker: boolean): string | null {
    if (!binnenPerSticker && e.houdbaar_dagen.trim() === '') return 'Kies harde of zachte kaas, of vul in hoeveel dagen het houdbaar is na het snijden.';
    return controleerEtiket({ ingredienten: leesIngredienten(e.ingredienten), allergenen: leesAllergenen(e.allergenen) });
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

const isKeuze = (dagen: string) => HOUDBAAR_KEUZES.some((k) => String(k.dagen) === dagen);

export default function EtiketVelden({ waarde, binnenPerSticker, onChange }: {
    waarde: EtiketInvoer;
    binnenPerSticker: boolean;
    onChange: (e: EtiketInvoer) => void;
}) {
    const zet = (deel: Partial<EtiketInvoer>) => onChange({ ...waarde, ...deel });
    const [anders, setAnders] = useState(waarde.houdbaar_dagen !== '' && !isKeuze(waarde.houdbaar_dagen));
    const heeftMeer = !!(waarde.ingredienten.trim() || waarde.allergenen.trim() || waarde.rauwe_melk || waarde.bewaren.trim() || waarde.beschermende_atmosfeer);
    const probleem = etiketProbleem(waarde, binnenPerSticker);
    return (
        <>
            {!binnenPerSticker && (
                <div style={{ display: 'grid', gap: 6 }}>
                    <span className="kf-eyebrow">Houdbaar na snijden</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {HOUDBAAR_KEUZES.map((k) => (
                            <Button key={k.dagen} type="button" size="sm" variant={!anders && waarde.houdbaar_dagen === String(k.dagen) ? 'brand' : 'ghost'}
                                onClick={() => { setAnders(false); zet({ houdbaar_dagen: String(k.dagen) }); }}>
                                {k.label} · {k.dagen} dagen
                            </Button>
                        ))}
                        <Button type="button" size="sm" variant={anders ? 'brand' : 'ghost'} onClick={() => { setAnders(true); zet({ houdbaar_dagen: '' }); }}>Anders</Button>
                    </div>
                    {anders && (
                        <input className="kf-input" inputMode="numeric" autoFocus value={waarde.houdbaar_dagen} placeholder="Aantal dagen"
                            onChange={(e) => zet({ houdbaar_dagen: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                    )}
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>De THT op de sticker wordt de snijdag plus dit aantal dagen, en nooit later dan de THT van de hele kaas.</span>
                </div>
            )}

            <details open={heeftMeer} style={{ display: 'grid', gap: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13.5 }}>Meer op de sticker (mag leeg)</summary>
                <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">Ingrediënten</span>
                        <textarea className="kf-input" rows={3} value={waarde.ingredienten} onChange={(e) => zet({ ingredienten: e.target.value })} placeholder="*melk*, zout, stremsel, zuursel" style={{ resize: 'vertical', minHeight: 64 }} />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Met komma&apos;s; zet een allergeen tussen sterretjes: *melk*.</span>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">Allergenen</span>
                        <input className="kf-input" value={waarde.allergenen} onChange={(e) => zet({ allergenen: e.target.value })} placeholder="melk" />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Zonder ingrediënten staat er &quot;Bevat:&quot; met deze allergenen.</span>
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}>
                        <input type="checkbox" checked={waarde.rauwe_melk} onChange={(e) => zet({ rauwe_melk: e.target.checked })} style={{ marginTop: 3 }} />
                        <span>&quot;Met rauwe melk bereid&quot;</span>
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}>
                        <input type="checkbox" checked={waarde.beschermende_atmosfeer} onChange={(e) => zet({ beschermende_atmosfeer: e.target.checked })} style={{ marginTop: 3 }} />
                        <span>&quot;Verpakt onder beschermende atmosfeer&quot; (gasverpakking, niet bij vacuüm)</span>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">Bewaren</span>
                        <input className="kf-input" value={waarde.bewaren} maxLength={80} onChange={(e) => zet({ bewaren: e.target.value })} placeholder="Gekoeld bewaren" />
                    </label>
                </div>
            </details>

            {probleem && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{probleem}</div>}
        </>
    );
}
