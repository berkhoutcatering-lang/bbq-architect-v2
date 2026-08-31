'use client';

/**
 * "Wat kan ik niet" — het gemis-rapport uit hoofdstuk 6.9 van het plan.
 *
 * Valt gratis uit twee lijsten naast elkaar: elke techniek noemt zijn apparaat,
 * de materieel-lijst noemt wat er staat, en het verschil is je gemiste
 * repertoire.
 *
 * Eén ding is bewust anders dan je zou verwachten. Het rapport zegt NIET "je
 * kunt dit niet" maar "dit staat niet in je lijst". Dat verschil is groot: bij
 * de eerste meting bleken 36 van de 44 technieken gesloten, terwijl de oven,
 * het fornuis en de vacuümmachine gewoon in de keuken staan — ze waren alleen
 * nog niet ingevoerd. Een rapport dat dat verzwijgt, liegt over je keuken.
 *
 * Daarom is dit tegelijk een invullijst: per ontbrekend apparaat kun je in één
 * tik zeggen dat je het wél hebt. Dat schrijft de apparaat-code in
 * `maakt_mogelijk`, en die expliciete invoer wint daarna altijd van het raden
 * op trefwoorden.
 */

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Check, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { maakGemisRapport, type MaterieelItem, type TechniekRegel } from '@/lib/apparaatMatch';
import { upsertMaterieel } from '../actions';
import { useToast } from '@/components/Toast';

import '@/styles/menu-hub.css';

interface Props {
    open: boolean;
    onClose: () => void;
    onGewijzigd?: () => void;
}

/** Hoe een apparaat heet als je het aan een mens uitlegt. */
const APPARAAT_LABEL: Record<string, string> = {
    'bain-marie': 'Bain-marie of chafing dish',
    'sous-vide': 'Sous-vide-bad',
    blender: 'Blender',
    fornuis: 'Fornuis of inductieplaat',
    friteuse: 'Friteuse',
    grill: 'Grill',
    groentesnijder: 'Groentesnijder',
    koelbox: 'Koelbox',
    koeling: 'Koeling',
    mixer: 'Standmixer',
    oven: 'Oven',
    pan: 'Pan',
    sifon: 'Sifon',
    smoker: 'Smoker',
    snijmachine: 'Snijmachine',
    staafmixer: 'Staafmixer',
    vacuummachine: 'Vacuümmachine',
    vriezer: 'Vriezer',
    werkbank: 'Werkbank',
};

export default function GemisRapport({ open, onClose, onGewijzigd }: Props) {
    const showToast = useToast();
    const [technieken, setTechnieken] = useState<TechniekRegel[]>([]);
    const [spullen, setSpullen] = useState<MaterieelItem[]>([]);
    const [laden, setLaden] = useState(false);
    const [fout, setFout] = useState<string | null>(null);
    const [invullen, setInvullen] = useState<string | null>(null);
    const [naam, setNaam] = useState('');
    const [bezig, setBezig] = useState(false);

    async function laad() {
        setLaden(true);
        setFout(null);
        try {
            const sb = supabase;
            if (!sb) throw new Error('Geen verbinding met de database');
            const [t, m] = await Promise.all([
                sb.from('technieken').select('slug, naam, apparaat, eindtextuur'),
                sb.from('materieel').select('id, naam, type, soort, maakt_mogelijk'),
            ]);
            if (t.error) throw new Error(t.error.message);
            if (m.error) throw new Error(m.error.message);
            setTechnieken((t.data ?? []) as TechniekRegel[]);
            setSpullen((m.data ?? []) as MaterieelItem[]);
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Kon het rapport niet maken');
        } finally {
            setLaden(false);
        }
    }

    useEffect(() => {
        if (open) laad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const rapport = useMemo(() => maakGemisRapport(technieken, spullen), [technieken, spullen]);

    const totaal = technieken.length;
    const kan = rapport.open.length + rapport.zonderApparaat.length;

    async function ikHebDitWel(apparaat: string) {
        if (!naam.trim()) return;
        setBezig(true);
        try {
            /* De apparaat-code hoort in `maakt_mogelijk`, niet in `soort`.
               `soort` is de categorie (apparatuur, servies, opslag); zou de
               code daarin staan, dan botst hij met wat de GN-lade en de scan
               erin schrijven en gaat het matchen straks raden waar het net
               zeker was. */
            const res = await upsertMaterieel({
                naam: naam.trim(),
                type: 'Apparatuur',
                soort: 'apparatuur',
                maakt_mogelijk: [apparaat],
                status: 'ok',
            });
            if ('error' in res) throw new Error(res.error);
            showToast(`${naam.trim()} toegevoegd — ${APPARAAT_LABEL[apparaat] ?? apparaat} staat nu in je lijst`, 'success');
            setInvullen(null);
            setNaam('');
            await laad();
            onGewijzigd?.();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Toevoegen mislukt', 'error');
        } finally {
            setBezig(false);
        }
    }

    if (!open) return null;

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} />
            <div className="mr-drawer" style={{ maxWidth: 640 }}>
                <div className="mr-drawer-header">
                    <div className="mr-drawer-header-info">
                        <div style={{ fontSize: 17, fontWeight: 600 }}>Wat kan ik niet</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                            Dit rekent met wat er in je lijst staat. Mist er een apparaat dat je wél hebt, dan lijkt je
                            repertoire kleiner dan het is — zeg het hieronder en het klopt weer.
                        </div>
                    </div>
                    <button className="mr-drawer-close" onClick={onClose} aria-label="Sluiten">
                        <X size={16} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 20px' }}>
                    {laden && (
                        <div style={{ textAlign: 'center', padding: 40 }}>
                            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand)' }} />
                        </div>
                    )}
                    {fout && <div style={{ color: 'var(--red, #ff6b6b)', fontSize: 13 }}>{fout}</div>}

                    {!laden && !fout && (
                        <>
                            <div
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: 10,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-card)',
                                    marginBottom: 18,
                                }}
                            >
                                <div style={{ fontSize: 19, fontFamily: 'var(--font-mono, monospace)' }}>
                                    {kan} van {totaal}
                                </div>
                                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
                                    technieken kun je met wat er in je lijst staat.
                                </div>
                            </div>

                            {rapport.gesloten.length > 0 && (
                                <div style={{ fontSize: 10.5, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                                    Ontbreekt in je lijst — meeste winst bovenaan
                                </div>
                            )}

                            {rapport.gesloten.map((g) => (
                                <div key={g.apparaat} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                                                {APPARAAT_LABEL[g.apparaat] ?? g.apparaat}
                                            </span>
                                            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
                                                opent {g.technieken.length}{' '}
                                                {g.technieken.length === 1 ? 'techniek' : 'technieken'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setInvullen(invullen === g.apparaat ? null : g.apparaat);
                                                setNaam('');
                                            }}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                padding: '5px 10px',
                                                borderRadius: 999,
                                                border: '1px solid var(--border)',
                                                background: 'transparent',
                                                color: 'var(--muted)',
                                                fontSize: 11.5,
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            <Plus size={11} /> heb ik wel
                                        </button>
                                    </div>

                                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                                        {g.technieken.map((t) => t.naam).join(' · ')}
                                    </div>

                                    {invullen === g.apparaat && (
                                        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                                            <input
                                                value={naam}
                                                autoFocus
                                                onChange={(e) => setNaam(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && ikHebDitWel(g.apparaat)}
                                                placeholder={`Hoe heet hij? bv. ${voorbeeldNaam(g.apparaat)}`}
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    padding: '8px 10px',
                                                    borderRadius: 8,
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-card)',
                                                    color: 'var(--text)',
                                                    fontSize: 12.5,
                                                }}
                                            />
                                            <button
                                                onClick={() => ikHebDitWel(g.apparaat)}
                                                disabled={bezig || !naam.trim()}
                                                style={{
                                                    padding: '8px 14px',
                                                    borderRadius: 8,
                                                    border: '1px solid var(--border)',
                                                    background: naam.trim() ? 'var(--brand)' : 'var(--card)',
                                                    color: naam.trim() ? '#000' : 'var(--muted)',
                                                    fontSize: 12.5,
                                                    fontWeight: 600,
                                                    cursor: bezig ? 'default' : 'pointer',
                                                }}
                                            >
                                                {bezig ? '…' : 'Toevoegen'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {rapport.open.length > 0 && (
                                <>
                                    <div style={{ fontSize: 10.5, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--muted)', margin: '20px 0 8px' }}>
                                        Dit kun je al
                                    </div>
                                    {rapport.open.map((o) => (
                                        <div
                                            key={o.techniek.slug}
                                            style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--border)' }}
                                        >
                                            <Check size={12} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                                            <span style={{ fontSize: 13 }}>{o.techniek.naam}</span>
                                            <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 'auto', textAlign: 'right' }}>
                                                {o.treffer.item?.naam}
                                                {o.treffer.zekerheid === 'geraden' && (
                                                    <span style={{ opacity: 0.7 }}> · geraden</span>
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                                        &ldquo;Geraden&rdquo; betekent dat we het op naam hebben gematcht. Klopt dat niet, vul dan het
                                        soort-veld van dat item in — jouw invoer wint altijd.
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

/** Een voorbeeld dat helpt herkennen wat er bedoeld wordt. */
function voorbeeldNaam(apparaat: string): string {
    const v: Record<string, string> = {
        oven: 'Rational combisteamer',
        fornuis: 'Inductieplaat Metro',
        koeling: 'Koelwerkbank links',
        vriezer: 'Vrieskist garage',
        vacuummachine: 'Alvac vacuümmachine',
        snijmachine: 'Bizerba snijmachine',
        groentesnijder: 'Robot Coupe CL50',
        mixer: 'KitchenAid',
        blender: 'Blender',
        staafmixer: 'Staafmixer',
        sifon: 'Sifon 1 liter',
        'sous-vide': 'Sous-vide-circulator',
        koelbox: 'Cambro koelbox',
        'bain-marie': 'Chafing dish',
        friteuse: 'Friteuse',
        grill: 'Grill',
        pan: 'Braadpan groot',
        werkbank: 'RVS werkbank',
    };
    return v[apparaat] ?? 'naam van het apparaat';
}
