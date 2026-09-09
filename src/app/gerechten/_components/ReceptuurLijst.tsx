'use client';

/**
 * De delen van een receptuur, uitklapbaar.
 *
 * Uitklappen gebeurt op deel-niveau en nergens lager: een stap is de kleinste
 * eenheid die gemeten wordt, dus daaronder valt niets te openen. Alle feiten van
 * een stap staan ónder die stap in één rij, nooit achter nog een klik — in de
 * keuken klik je niet.
 *
 * Dit deel is client-side omdat open en dicht bijgehouden moet worden. Alle
 * rekenwerk staat in Receptuur.tsx; hier wordt alleen getoond.
 */

import { useState } from 'react';

export interface StapChip {
    tekst: string;
    /** Getallen in monospace, zodat kolommen uitlijnen. */
    mono?: boolean;
    /** Gestippeld: dit is geen eigenschap van de stap maar een voorwaarde. */
    voorwaarde?: boolean;
}

export interface StapRegel {
    id: string;
    nummer: number;
    tekst: string;
    chips: StapChip[];
    /** Groot getal rechts, als er een tijd bekend is. */
    getal?: { waarde: string; eenheid: string; amber: boolean } | null;
    /** Regel onder het getal, of de hele rechterkolom als er geen getal is. */
    rechts: string;
    /**
     * Extra onder de stap. De goedkeur-lade hangt hier zijn vragen aan, zodat
     * de lijst zelf dom blijft en beide schermen dezelfde stap tonen.
     */
    extra?: React.ReactNode;
}

export interface DeelRegel {
    sleutel: string;
    naam: string;
    magVooruit: boolean;
    /** Bouwsteen zonder hoeveelheid: telt nog niet mee in de kostprijs. */
    zonderHoeveelheid?: boolean;
    /** "4 stappen · koelwerkbank 1" */
    onderschrift: string;
    /** Rechts op de dichte regel: "12 min werk" of "beide stappen worden gemeten". */
    bekendeTijd: string;
    stappen: StapRegel[];
}

export default function ReceptuurLijst({ delen }: { delen: DeelRegel[] }) {
    /* Eén deel bestaat niet echt als "deel" — dan is het gewoon het recept, en
       dichtklappen zou de kok een klik kosten om te zien wat hij zoekt. */
    const [open, zetOpen] = useState<Set<string>>(
        () => new Set(delen.length === 1 ? delen.map((d) => d.sleutel) : []),
    );

    function wissel(sleutel: string) {
        zetOpen((vorig) => {
            const nieuw = new Set(vorig);
            if (nieuw.has(sleutel)) nieuw.delete(sleutel); else nieuw.add(sleutel);
            return nieuw;
        });
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 11,
                letterSpacing: '.14em', color: '#8a8f98', textTransform: 'uppercase',
                padding: '0 20px 2px',
            }}>
                <span>De delen</span>
                <span>Bekende tijd</span>
            </div>

            {delen.map((deel) => {
                const uit = open.has(deel.sleutel);
                return (
                    <div
                        key={deel.sleutel}
                        style={{
                            background: '#1e1e22',
                            border: '1px solid rgba(245,245,245,.10)',
                            borderTop: '1px solid rgba(196,163,90,.22)',
                            borderRadius: 14,
                            overflow: 'hidden',
                            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,.04)',
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => wissel(deel.sleutel)}
                            aria-expanded={uit}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 20,
                                padding: 22, background: 'none', border: 'none', color: 'inherit',
                                font: 'inherit', textAlign: 'left', cursor: 'pointer',
                            }}
                        >
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, color: '#8a8f98' }}>
                                {uit ? '−' : '+'}
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '.02em' }}>{deel.naam}</span>
                                    {/* Een label en geen kleur: met olie op het scherm en bij
                                        kleurenblindheid moet dit blijven staan. */}
                                    {deel.magVooruit && (
                                        <span style={{
                                            fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
                                            background: 'rgba(245,245,245,.09)', borderRadius: 20, padding: '4px 10px',
                                        }}>Mag vooruit</span>
                                    )}
                                    {/* Geen alarm, wel zichtbaar: zolang hier geen
                                        hoeveelheid staat telt deze bouwsteen voor
                                        nul mee in de kostprijs. */}
                                    {deel.zonderHoeveelheid && (
                                        <span style={{
                                            fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
                                            border: '1px dashed rgba(245,245,245,.20)', color: '#8a8f98',
                                            borderRadius: 20, padding: '4px 10px',
                                        }}>Hoeveelheid nog invullen</span>
                                    )}
                                </span>
                                <span style={{ fontSize: 14, color: '#8a8f98' }}>{deel.onderschrift}</span>
                            </span>
                            <span style={{ textAlign: 'right', fontSize: 15, color: '#8a8f98' }}>{deel.bekendeTijd}</span>
                        </button>

                        {uit && (
                            <div style={{ borderTop: '1px solid rgba(245,245,245,.07)' }}>
                                {deel.stappen.map((stap, i) => (
                                    <Stap key={stap.id} stap={stap} laatste={i === deel.stappen.length - 1} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function Stap({ stap, laatste }: { stap: StapRegel; laatste: boolean }) {
    return (
        <div
            className="receptuur-stap"
            style={{ borderBottom: laatste ? 'none' : '1px solid rgba(245,245,245,.07)' }}
        >
            <div style={{
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, color: '#8a8f98',
                width: 36, flexShrink: 0,
            }}>{stap.nummer}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, lineHeight: 1.45, textWrap: 'pretty' }}>{stap.tekst}</div>
                {stap.extra}
                {stap.chips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        {stap.chips.map((chip, i) => (
                            <span
                                key={i}
                                style={{
                                    fontSize: 14,
                                    fontFamily: chip.mono ? "'IBM Plex Mono',monospace" : undefined,
                                    color: chip.voorwaarde ? '#8a8f98' : undefined,
                                    border: chip.voorwaarde
                                        ? '1px dashed rgba(245,245,245,.20)'
                                        : '1px solid rgba(245,245,245,.16)',
                                    borderRadius: 8, padding: '6px 11px',
                                }}
                            >{chip.tekst}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* Eigen kolom, zodat een stap met niets net zo rustig oogt als een
                stap met vier feiten. */}
            <div
                className="receptuur-stap__tijd"
                style={{
                    borderLeft: `1px solid ${stap.getal?.amber ? 'rgba(255,191,0,.25)' : 'rgba(245,245,245,.07)'}`,
                    color: '#8a8f98',
                }}
            >
                {stap.getal && (
                    <div>
                        <span style={{
                            fontFamily: "'IBM Plex Mono',monospace", fontSize: 28,
                            color: stap.getal.amber ? '#FFBF00' : '#f5f5f5',
                        }}>{stap.getal.waarde}</span>
                        {' '}
                        <span style={{ fontSize: 15, color: '#8a8f98' }}>{stap.getal.eenheid}</span>
                    </div>
                )}
                <div>{stap.rechts}</div>
            </div>
        </div>
    );
}
