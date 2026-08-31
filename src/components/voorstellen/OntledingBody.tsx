'use client';

/**
 * De inhoud van een receptuur-ontleding in de goedkeur-lade.
 *
 * Wat je hier moet kunnen zien in één blik, want dat is waar je op tekent:
 *   - klopt de volgorde
 *   - staat wachttijd in het wachttijd-veld en niet bij de handtijd
 *   - klopt de plaats (thuis voorbereiden, op locatie afwerken)
 *
 * Daarom staan handtijd en wachttijd naast elkaar en niet opgeteld: twaalf uur
 * op de smoker is geen twaalf uur werk, en dat verschil is precies waarom deze
 * hele tabel bestaat.
 */

import { Clock, Hourglass, Eye, MapPin } from 'lucide-react';

export interface OntledingStap {
    step_order: number;
    tekst: string;
    actie: string | null;
    prep_group: string | null;
    duur_actief_min: number | null;
    duur_passief_min: number | null;
    plaats: 'thuis' | 'bus' | 'locatie';
    toezicht_nodig: boolean;
    station: string | null;
    apparaat: string | null;
    techniek_slug: string | null;
    temp_doel_c: number | null;
    ingredient_ref: string | null;
    hoeveelheid: number | null;
    eenheid: string | null;
}

export interface OntledingPayload {
    gerecht_id: string | null;
    naam: string;
    porties: number | null;
    stappen: OntledingStap[];
    opmerkingen: string | null;
    technieken_niet_herkend?: string[];
}

const PLAATS_LABEL: Record<OntledingStap['plaats'], string> = {
    thuis: 'Thuis',
    bus: 'In de bus',
    locatie: 'Op locatie',
};

/** 95 → "1 u 35", 45 → "45 min". Uren pas vanaf een uur, want "0 u 45" leest
 *  niemand prettig. */
export function duur(min: number | null): string {
    if (!min || min <= 0) return '—';
    if (min < 60) return `${min} min`;
    const u = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${u} u ${m}` : `${u} u`;
}

export default function OntledingBody({ payload }: { payload: OntledingPayload }) {
    const stappen = payload.stappen ?? [];

    const perPlaats = (['thuis', 'bus', 'locatie'] as const).map((p) => {
        const s = stappen.filter((x) => x.plaats === p);
        return {
            plaats: p,
            aantal: s.length,
            actief: s.reduce((t, x) => t + (x.duur_actief_min ?? 0), 0),
            passief: s.reduce((t, x) => t + (x.duur_passief_min ?? 0), 0),
        };
    }).filter((x) => x.aantal > 0);

    const groepen = [...new Set(stappen.map((s) => s.prep_group).filter(Boolean))] as string[];

    return (
        <div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16 }}>
                <strong style={{ color: 'var(--text)' }}>{payload.naam || 'Naamloos gerecht'}</strong> —{' '}
                {stappen.length} stappen
                {payload.porties ? `, hoeveelheden per gast (recept was voor ${payload.porties})` : ''}.
            </div>

            {/* Twee budgetten, apart geteld: voorbereiden en afwerken zijn niet
                hetzelfde soort tijd. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                {perPlaats.map((p) => (
                    <div
                        key={p.plaats}
                        style={{
                            flex: '1 1 150px',
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-card)',
                        }}
                    >
                        <div
                            style={{
                                fontSize: 10.5,
                                letterSpacing: '.11em',
                                textTransform: 'uppercase',
                                color: 'var(--muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                            }}
                        >
                            <MapPin size={11} /> {PLAATS_LABEL[p.plaats]}
                        </div>
                        <div style={{ fontSize: 13, marginTop: 6, display: 'flex', gap: 12 }}>
                            <span title="handtijd — kost een persoon" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={12} /> {duur(p.actief)}
                            </span>
                            <span title="wachttijd — kost geen persoon" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                                <Hourglass size={12} /> {duur(p.passief)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {groepen.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                        Samen te voegen met andere recepten
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {groepen.map((g) => (
                            <span key={g} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 12 }}>
                                {g}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)' }}>
                {stappen.map((s) => (
                    <div key={s.step_order} style={{ display: 'flex', gap: 11, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ width: 20, flexShrink: 0, fontSize: 12, color: 'var(--muted)', paddingTop: 2 }}>
                            {s.step_order}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{s.tekst}</div>

                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 10,
                                    marginTop: 5,
                                    fontSize: 11.5,
                                    color: 'var(--muted)',
                                    alignItems: 'center',
                                }}
                            >
                                <span>{PLAATS_LABEL[s.plaats]}</span>
                                {s.duur_actief_min ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Clock size={11} /> {duur(s.duur_actief_min)} hand
                                    </span>
                                ) : null}
                                {s.duur_passief_min ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Hourglass size={11} /> {duur(s.duur_passief_min)} wachten
                                    </span>
                                ) : null}
                                {s.toezicht_nodig && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-gold, var(--brand))' }}>
                                        <Eye size={11} /> toezicht
                                    </span>
                                )}
                                {s.temp_doel_c ? <span>{s.temp_doel_c} °C</span> : null}
                                {s.station ? <span>{s.station}</span> : null}
                                {s.prep_group ? (
                                    <span style={{ padding: '2px 7px', borderRadius: 999, border: '1px solid var(--border)' }}>
                                        {s.prep_group}
                                    </span>
                                ) : null}
                            </div>

                            {s.ingredient_ref && (
                                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                                    {s.ingredient_ref}
                                    {s.hoeveelheid != null ? ` · ${String(s.hoeveelheid).replace('.', ',')} ${s.eenheid ?? ''} per gast` : ''}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {payload.opmerkingen && (
                <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                    <strong style={{ color: 'var(--text)' }}>Wat de AI niet zeker wist:</strong> {payload.opmerkingen}
                </div>
            )}

            {payload.technieken_niet_herkend && payload.technieken_niet_herkend.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Deze technieken staan niet in je kennisbank en zijn daarom weggelaten:{' '}
                    {payload.technieken_niet_herkend.join(', ')}.
                </div>
            )}
        </div>
    );
}
