'use client';

/**
 * Afhaalmomenten beheren vanuit de hub.
 * Plan: docs/bestelstroom-bouwplan.md §2.3.
 *
 * De capaciteit zit in de vakken, niet in een totaalplafond: bijsturen gebeurt
 * door een vak te verhogen of er een bij te zetten. Dat moet hier kunnen, zonder
 * migratie en zonder dat iemand de database in hoeft — anders gebeurt het op
 * 23 december niet.
 *
 * De bezetting wordt hier geteld uit de bestellingen die de pagina toch al
 * heeft. Geen aparte teller die kan gaan afwijken.
 */

import { useMemo, useState } from 'react';
import { Plus, X, Check, Loader2 } from 'lucide-react';
import { formatteerDatum, kortTijd } from '@/lib/bestelstroom';
import { voegAfhaalmomentToe, zetAfhaalmomentMax, zetAfhaalmomentActief } from '../actions';

export interface MomentRij {
    id: string;
    datum: string;
    start_tijd: string;
    eind_tijd: string | null;
    max_dozen: number;
    actief: boolean;
}

interface Props {
    momenten: MomentRij[];
    /** afhaalmoment_id → aantal dozen dat er al op staat. */
    bezetting: Map<string, number>;
    doosTypeId: string | null;
    onVeranderd: () => Promise<void> | void;
    melding: (tekst: string, soort?: string) => void;
}

export default function Afhaalmomenten({ momenten, bezetting, doosTypeId, onVeranderd, melding }: Props) {
    const [bezig, setBezig] = useState(false);
    const [nieuw, setNieuw] = useState(false);

    const gesorteerd = useMemo(
        () => [...momenten].sort((a, b) => (a.datum + a.start_tijd).localeCompare(b.datum + b.start_tijd)),
        [momenten],
    );

    async function doe(actie: () => Promise<{ data: unknown } | { error: string }>, gelukt: string) {
        setBezig(true);
        try {
            const r = await actie();
            if ('error' in r) { melding(r.error, 'error'); return false; }
            melding(gelukt, 'success');
            await onVeranderd();
            return true;
        } finally { setBezig(false); }
    }

    return (
        <div className="panel" style={{ padding: 0, marginBottom: 18, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div>
                    <div className="bst-eyebrow" style={{ marginBottom: 4 }}>Afhaalmomenten</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                        Hier zit de capaciteit. Vol? Verhoog een vak of zet er een bij.
                    </div>
                </div>
                <button className="btn btn-ghost btn-sm" disabled={!doosTypeId} onClick={() => setNieuw((v) => !v)}>
                    {nieuw ? <X size={14} /> : <Plus size={14} />} {nieuw ? 'Annuleren' : 'Vak toevoegen'}
                </button>
            </div>

            {nieuw && doosTypeId && (
                <NieuwVak
                    doosTypeId={doosTypeId}
                    bezig={bezig}
                    onOpslaan={async (waarden) => {
                        const ok = await doe(() => voegAfhaalmomentToe(waarden), 'Vak toegevoegd');
                        if (ok) setNieuw(false);
                    }}
                />
            )}

            {gesorteerd.length === 0 && !nieuw && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Nog geen afhaalmomenten. Zonder vak kan er niet besteld worden.
                </div>
            )}

            {gesorteerd.map((m) => (
                <VakRij key={m.id} m={m} bezet={bezetting.get(m.id) ?? 0} bezig={bezig}
                    onMax={(max) => doe(() => zetAfhaalmomentMax({ id: m.id, max_dozen: max }), 'Maximum bijgewerkt')}
                    onActief={(actief) => doe(() => zetAfhaalmomentActief({ id: m.id, actief }), actief ? 'Vak staat weer open' : 'Vak uit de lijst gehaald')}
                />
            ))}
        </div>
    );
}

function VakRij({ m, bezet, bezig, onMax, onActief }: {
    m: MomentRij; bezet: number; bezig: boolean;
    onMax: (max: number) => void; onActief: (actief: boolean) => void;
}) {
    const [max, setMax] = useState(String(m.max_dozen));
    const vol = bezet >= m.max_dozen;
    const gewijzigd = max !== String(m.max_dozen) && max.trim() !== '';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '11px 16px', borderTop: '1px solid var(--border)', opacity: m.actief ? 1 : 0.55 }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{formatteerDatum(m.datum) ?? m.datum}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {kortTijd(m.start_tijd)}{m.eind_tijd ? ` – ${kortTijd(m.eind_tijd)}` : ''}
                    {!m.actief && ' · niet in de lijst'}
                </div>
            </div>

            {/* Bezetting geteld uit de bestellingen, niet uit een losse kolom. */}
            <div className="mono" style={{ fontSize: 13, color: vol ? 'var(--bst-warn)' : 'var(--muted)', minWidth: 92 }}>
                {bezet} / {m.max_dozen} {m.max_dozen === 1 ? 'doos' : 'dozen'}
            </div>

            <div className="bst-veld" style={{ flex: '0 0 auto' }}>
                <input type="number" min={0} max={1000} value={max} onChange={(e) => setMax(e.target.value)}
                    aria-label={`Maximum dozen op ${formatteerDatum(m.datum) ?? m.datum}`} style={{ width: 74 }} />
                <button className="btn btn-ghost btn-sm" disabled={bezig || !gewijzigd} onClick={() => onMax(Number(max))}>
                    {bezig ? <Loader2 size={13} className="lead-spin" /> : <Check size={13} />}
                </button>
            </div>

            <button className="btn btn-ghost btn-sm" disabled={bezig} onClick={() => onActief(!m.actief)}>
                {m.actief ? 'Uit de lijst' : 'Terug in de lijst'}
            </button>
        </div>
    );
}

function NieuwVak({ doosTypeId, bezig, onOpslaan }: {
    doosTypeId: string;
    bezig: boolean;
    onOpslaan: (w: { doos_type_id: string; datum: string; start_tijd: string; eind_tijd: string; max_dozen: number }) => void;
}) {
    const [datum, setDatum] = useState('');
    const [start, setStart] = useState('');
    const [eind, setEind] = useState('');
    const [max, setMax] = useState('25');

    return (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '14px 16px', borderTop: '1px solid var(--border)', background: 'var(--card-solid)' }}>
            <Veld label="Datum"><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></Veld>
            <Veld label="Van"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Veld>
            <Veld label="Tot"><input type="time" value={eind} onChange={(e) => setEind(e.target.value)} /></Veld>
            <Veld label="Max dozen"><input type="number" min={0} max={1000} value={max} onChange={(e) => setMax(e.target.value)} style={{ width: 84 }} /></Veld>
            <button className="btn btn-brand btn-sm" disabled={bezig || !datum || !start}
                onClick={() => onOpslaan({ doos_type_id: doosTypeId, datum, start_tijd: start, eind_tijd: eind, max_dozen: Number(max) })}>
                Toevoegen
            </button>
        </div>
    );
}

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="bst-eyebrow">{label}</span>
            <span className="bst-veld">{children}</span>
        </label>
    );
}
