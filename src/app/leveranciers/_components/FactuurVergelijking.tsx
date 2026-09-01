'use client';

/**
 * "Wat je facturen zeggen" — de prijslijst naast de werkelijkheid.
 *
 * Een prijslijst is een belofte, een factuur is wat er gebeurd is. Bij Beef
 * Club lopen die twee uiteen omdat een deel van hun lijst de catalogus is van
 * de groothandel waar zíj inkopen. Hoeveel marge daar tussen zit staat nergens
 * opgeschreven, maar het is af te lezen zodra je de twee naast elkaar legt.
 *
 * Dit scherm rekent niets uit dat niet uit die twee bronnen volgt, en het stelt
 * geen correctie voor. Twee facturen zijn te weinig om een percentage op te
 * baseren, en een gemiddelde dat als waarheid gaat gelden is gevaarlijker dan
 * geen gemiddelde. Het laat zien wat er staat en waar het uiteenloopt.
 */

import { useCallback, useEffect, useState } from 'react';
import { Receipt, ArrowUpRight, ArrowDownRight, Minus, HelpCircle, Scale } from 'lucide-react';
import { formatEur } from '@/lib/format';
import type { Vergelijking, VergelijkStand } from '@/lib/bonPrijsvergelijking';

/** Nederlandse notatie voor percentages: 13,3 en niet 13.3. */
const pctNL = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`;

interface Factuur {
    bon_id: number;
    datum: string | null;
    totaal_bedrag: number | null;
    regels: Vergelijking[];
    vergeleken: number;
    afwijkend: number;
    gemiddeldPct: number | null;
}

interface Antwoord {
    lijstregels: number;
    facturen: Factuur[];
    samenvatting: { facturen: number; vergeleken: number; afwijkend: number; gemiddeldPct: number | null };
}

const STAND_KLEUR: Record<VergelijkStand, string> = {
    duurder: '#f0a35e',
    goedkoper: '#5cb85c',
    gelijk: 'var(--muted)',
    'geen-match': 'var(--muted)',
    'eenheden-verschillen': 'var(--muted)',
};

function StandIcoon({ stand }: { stand: VergelijkStand }) {
    if (stand === 'duurder') return <ArrowUpRight size={13} />;
    if (stand === 'goedkoper') return <ArrowDownRight size={13} />;
    if (stand === 'gelijk') return <Minus size={13} />;
    if (stand === 'eenheden-verschillen') return <Scale size={13} />;
    return <HelpCircle size={13} />;
}

export default function FactuurVergelijking({ levId }: { levId: number }) {
    const [data, setData] = useState<Antwoord | null>(null);
    const [laden, setLaden] = useState(true);

    const laad = useCallback(async () => {
        setLaden(true);
        try {
            const r = await fetch(`/api/leveranciers/${levId}/factuurvergelijking`);
            setData(r.ok ? await r.json() : null);
        } catch {
            setData(null);
        } finally {
            setLaden(false);
        }
    }, [levId]);

    useEffect(() => { laad(); }, [laad]);

    if (laden || !data || data.facturen.length === 0) return null;

    const s = data.samenvatting;

    return (
        <section style={{ marginTop: 26 }}>
            <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                    Wat je facturen zeggen
                </h2>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    De prijslijst is een belofte, de factuur is wat er gebeurd is.
                </span>
            </header>

            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px', maxWidth: 760, lineHeight: 1.55 }}>
                {s.facturen} {s.facturen === 1 ? 'factuur' : 'facturen'} gescand ·{' '}
                {s.vergeleken === 0
                    ? 'geen enkele regel was te vergelijken met de prijslijst'
                    : <>
                        {s.vergeleken} {s.vergeleken === 1 ? 'regel' : 'regels'} vergeleken met de{' '}
                        {data.lijstregels} regels in de prijslijst, waarvan{' '}
                        <strong style={{ color: s.afwijkend > 0 ? '#f0a35e' : 'var(--text)' }}>
                            {s.afwijkend} anders
                        </strong>
                        {s.gemiddeldPct != null && s.vergeleken >= 3 && (
                            <> · gemiddeld {pctNL(s.gemiddeldPct)}</>
                        )}
                    </>
                }
                {s.vergeleken > 0 && s.vergeleken < 3 && (
                    <> — te weinig om er een percentage aan te hangen.</>
                )}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.facturen.map((f) => (
                    <div
                        key={f.bon_id}
                        style={{
                            border: '1px solid var(--border)', borderRadius: 12,
                            background: 'var(--card)', overflow: 'hidden',
                        }}
                    >
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                            borderBottom: '1px solid var(--border)', fontSize: 13,
                        }}>
                            <Receipt size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                                {f.datum ? new Date(f.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : 'zonder datum'}
                            </span>
                            {f.totaal_bedrag != null && (
                                <span style={{ color: 'var(--muted)' }}>· {formatEur(f.totaal_bedrag)}</span>
                            )}
                            <span style={{ flex: 1 }} />
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                {f.regels.length} {f.regels.length === 1 ? 'regel' : 'regels'}
                            </span>
                        </div>

                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {f.regels.map((v, i) => (
                                <li
                                    key={i}
                                    style={{
                                        display: 'flex', gap: 10, alignItems: 'flex-start',
                                        padding: '9px 14px',
                                        borderTop: i === 0 ? 'none' : '1px solid var(--border-soft, rgba(255,255,255,0.05))',
                                    }}
                                >
                                    <span style={{ color: STAND_KLEUR[v.stand], flexShrink: 0, paddingTop: 2 }}>
                                        <StandIcoon stand={v.stand} />
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                                            {v.regel.naam}
                                        </div>
                                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
                                            {v.toelichting}
                                            {v.lijstNaam && v.lijstNaam !== v.regel.naam && (
                                                <> Gevonden als &ldquo;{v.lijstNaam}&rdquo;.</>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 12.5 }}>
                                        {v.lijstPrijs != null && (
                                            <div style={{ color: 'var(--muted)' }}>
                                                lijst {formatEur(v.lijstPrijs)}
                                            </div>
                                        )}
                                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                                            bon {formatEur(v.regel.prijs)}
                                            {v.regel.unit ? <span style={{ fontWeight: 400, color: 'var(--muted)' }}> /{v.regel.unit}</span> : null}
                                        </div>
                                        {v.verschilPct != null && v.stand !== 'gelijk' && (
                                            <div style={{ fontWeight: 700, color: STAND_KLEUR[v.stand] }}>
                                                {pctNL(v.verschilPct)}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}
