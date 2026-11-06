'use client';
/* VoorbelastingLijst — alle bonnen van één kwartaal waarvan de BTW nog niet
   meetelt in 5b, op één plek. Per bon: zakelijk-% + vinkje, en "bevestig
   alles". Daaronder de bonnen zonder BTW, waar een buitenlandse dienst met
   verlegde BTW (4a/4b) tussen kan zitten.

   Tot nu toe zat de bevestiging onderaan elke losse bon in het kistje; met
   vijftig bonnen per kwartaal gebeurde dat niet, en telde 5b stil €0. */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Lock, X } from 'lucide-react';
import { fmt } from '@/lib/utils';
import { confirmVoorbelastingBatchAction, setBtwVerlegdAction } from '@/app/archief/actions';

interface BonRij {
    id: number;
    datum: string | null;
    naam: string | null;
    totaal: number;
    btw: number;
    btw_verlegd: 'buiten_eu' | 'binnen_eu' | null;
    zakelijk_pct: number;
    vergrendeld: boolean;
}

const VERLEGD_LABEL: Record<string, string> = {
    buiten_eu: 'Verlegd — buiten EU (4a)',
    binnen_eu: 'Verlegd — binnen EU (4b)',
};

const datumNL = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '—');

export default function VoorbelastingLijst({ year, quarter, onSluit, onGewijzigd }: {
    year: number;
    quarter: number;
    onSluit: () => void;
    onGewijzigd: () => void;
}) {
    const [wachtend, setWachtend] = useState<BonRij[]>([]);
    const [zonderBtw, setZonderBtw] = useState<BonRij[]>([]);
    const [verlegdBeschikbaar, setVerlegdBeschikbaar] = useState(true);
    const [loading, setLoading] = useState(true);
    const [fout, setFout] = useState<string | null>(null);
    const [melding, setMelding] = useState<string | null>(null);
    const [pct, setPct] = useState<Record<number, number>>({});
    const [vink, setVink] = useState<Set<number>>(new Set());
    const [toonZonderBtw, setToonZonderBtw] = useState(false);
    const [pending, startTransition] = useTransition();

    const laad = useCallback(async () => {
        setLoading(true); setFout(null);
        try {
            const r = await fetch(`/api/boekhouder/voorbelasting?year=${year}&quarter=${quarter}`, { credentials: 'include' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) { setFout(j.error || 'Laden mislukt'); return; }
            setWachtend(j.wachtend || []);
            setZonderBtw(j.zonder_btw || []);
            setVerlegdBeschikbaar(j.verlegd_beschikbaar !== false);
            setPct(Object.fromEntries((j.wachtend || []).map((b: BonRij) => [b.id, b.zakelijk_pct ?? 100])));
            setVink(new Set());
        } finally { setLoading(false); }
    }, [year, quarter]);
    useEffect(() => { laad(); }, [laad]);

    const open = useMemo(() => wachtend.filter(b => !b.vergrendeld), [wachtend]);
    const opSlot = wachtend.length - open.length;
    const aftrek = (b: BonRij) => (b.btw * (pct[b.id] ?? 100)) / 100;
    const totaalAlles = open.reduce((s, b) => s + aftrek(b), 0);
    const aangevinkt = open.filter(b => vink.has(b.id));
    const totaalVink = aangevinkt.reduce((s, b) => s + aftrek(b), 0);

    function bevestig(rijen: BonRij[]) {
        if (rijen.length === 0) return;
        setFout(null); setMelding(null);
        startTransition(async () => {
            const res = await confirmVoorbelastingBatchAction({
                items: rijen.map(b => ({ bonId: b.id, zakelijkPct: pct[b.id] ?? 100 })),
            });
            if (res.ok === false) { setFout(res.error); return; }
            setMelding(
                `${res.bevestigd} ${res.bevestigd === 1 ? 'bon' : 'bonnen'} bevestigd`
                + (res.overgeslagen.length ? ` · ${res.overgeslagen.length} overgeslagen (${res.overgeslagen[0].reden})` : ''),
            );
            await laad();
            onGewijzigd();
        });
    }

    function zetVerlegd(bonId: number, waarde: string) {
        setFout(null); setMelding(null);
        startTransition(async () => {
            const res = await setBtwVerlegdAction({ bonId, verlegd: waarde === '' ? null : waarde });
            if (res.ok === false) { setFout(res.error); return; }
            await laad();
            onGewijzigd();
        });
    }

    const kop: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)' };
    const rijStijl: React.CSSProperties = { display: 'grid', gridTemplateColumns: '28px 64px minmax(120px,1fr) 90px 90px 92px 100px', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border, rgba(255,255,255,.08))', fontSize: 13 };
    const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

    const VerlegdKeuze = ({ b }: { b: BonRij }) => (
        <select
            value={b.btw_verlegd ?? ''}
            disabled={pending || b.vergrendeld || !verlegdBeschikbaar}
            onChange={e => zetVerlegd(b.id, e.target.value)}
            aria-label="BTW verlegd"
            style={{ fontSize: 12, background: 'transparent', color: 'inherit', border: '1px solid var(--border, rgba(255,255,255,.15))', borderRadius: 6, padding: '3px 4px', maxWidth: '100%' }}
        >
            <option value="">Gewone bon</option>
            <option value="buiten_eu">Verlegd — buiten EU (4a)</option>
            <option value="binnen_eu">Verlegd — binnen EU (4b)</option>
        </select>
    );

    return (
        <div style={{ marginTop: 20, borderRadius: 14, border: '1px solid var(--border, rgba(255,255,255,.1))', background: 'var(--card-solid, rgba(255,255,255,.02))', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <div>
                    <div style={{ fontWeight: 700 }}>Q{quarter} {year} — BTW op bonnen die nog niet meetelt</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5, maxWidth: 680 }}>
                        De BTW van een bon telt pas mee als terug te vragen BTW (5b) als jij bevestigt dat de uitgave zakelijk is en de bon een echte factuur is.
                        Deels privé? Zet het zakelijk-% lager. Helemaal privé? Zet 0%.
                    </div>
                </div>
                <button onClick={onSluit} className="bh-btn" aria-label="Sluiten" style={{ minHeight: 32, padding: '0 8px' }}><X size={14} /></button>
            </div>

            {fout && <div style={{ fontSize: 12, color: 'var(--red, #ef4444)', margin: '8px 0' }}>{fout}</div>}
            {melding && <div style={{ fontSize: 12, color: 'var(--green, #22c55e)', margin: '8px 0' }}>{melding}</div>}

            {loading ? (
                <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>Laden…</div>
            ) : (
                <>
                    {wachtend.length === 0 ? (
                        <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--green, #22c55e)' }}>Alle bonnen met BTW in dit kwartaal zijn bevestigd.</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <div style={{ minWidth: 640 }}>
                                <div style={{ ...rijStijl, ...kop, fontSize: 10 }}>
                                    <input
                                        type="checkbox"
                                        aria-label="Alles aanvinken"
                                        checked={open.length > 0 && aangevinkt.length === open.length}
                                        onChange={e => setVink(e.target.checked ? new Set(open.map(b => b.id)) : new Set())}
                                    />
                                    <span>Datum</span><span>Bon</span>
                                    <span style={num}>Totaal</span><span style={num}>BTW</span>
                                    <span style={num}>Zakelijk</span><span>Soort</span>
                                </div>
                                {wachtend.map(b => (
                                    <div key={b.id} style={{ ...rijStijl, opacity: b.vergrendeld ? 0.55 : 1 }}>
                                        {b.vergrendeld
                                            ? <span title="Deze maand is afgesloten — heropen de maand om te bevestigen"><Lock size={12} /></span>
                                            : <input
                                                type="checkbox"
                                                aria-label={`Bon ${b.naam ?? b.id} aanvinken`}
                                                checked={vink.has(b.id)}
                                                onChange={e => setVink(v => { const n = new Set(v); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })}
                                            />}
                                        <span style={{ color: 'var(--muted)' }}>{datumNL(b.datum)}</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.naam ?? ''}>{b.naam || `Bon #${b.id}`}</span>
                                        <span style={num}>{fmt(b.totaal)}</span>
                                        <span style={{ ...num, fontWeight: 600 }} title={b.btw_verlegd ? VERLEGD_LABEL[b.btw_verlegd] : undefined}>{fmt(b.btw)}</span>
                                        <span style={num}>
                                            <input
                                                type="number" min={0} max={100}
                                                value={pct[b.id] ?? 100}
                                                disabled={b.vergrendeld}
                                                onChange={e => setPct(p => ({ ...p, [b.id]: Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))) }))}
                                                aria-label="Zakelijk percentage"
                                                style={{ width: 52, textAlign: 'right', background: 'transparent', color: 'inherit', border: '1px solid var(--border, rgba(255,255,255,.15))', borderRadius: 6, padding: '3px 4px', fontSize: 12 }}
                                            /> %
                                        </span>
                                        <VerlegdKeuze b={b} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {opSlot > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                            <Lock size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> {opSlot} {opSlot === 1 ? 'bon zit' : 'bonnen zitten'} in een afgesloten maand.
                            Heropen die maand hierboven om ze te kunnen bevestigen (kan alleen zolang het kwartaal niet is vastgezet).
                        </div>
                    )}

                    {open.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                            <button onClick={() => bevestig(aangevinkt)} disabled={pending || aangevinkt.length === 0} className="bh-btn" style={{ minHeight: 34, opacity: aangevinkt.length === 0 ? 0.5 : 1 }}>
                                Bevestig aangevinkt ({aangevinkt.length}) · {fmt(totaalVink)}
                            </button>
                            <button onClick={() => bevestig(open)} disabled={pending} className="bh-btn-primary" style={{ minHeight: 34 }}>
                                {pending ? 'Bezig…' : `Bevestig alles (${open.length}) · ${fmt(totaalAlles)}`}
                            </button>
                        </div>
                    )}

                    {/* Bonnen zonder BTW — mogelijk een buitenlandse dienst met verlegde BTW. */}
                    {zonderBtw.length > 0 && (
                        <div style={{ marginTop: 18, borderTop: '1px solid var(--border, rgba(255,255,255,.08))', paddingTop: 12 }}>
                            <button onClick={() => setToonZonderBtw(v => !v)} className="bh-btn" style={{ minHeight: 30, fontSize: 12 }}>
                                {toonZonderBtw ? 'Verberg' : 'Toon'} bonnen zonder BTW ({zonderBtw.length})
                            </button>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5, maxWidth: 680 }}>
                                Kwam een bon van een buitenlands bedrijf zonder Nederlandse BTW (bijvoorbeeld een abonnement uit Amerika)? Dan is de BTW naar jou verlegd:
                                je geeft 21% zelf aan in 4a (buiten de EU) of 4b (binnen de EU) en trekt hetzelfde bedrag weer af. Markeer de bon hieronder; hij verschijnt dan in de lijst hierboven om te bevestigen.
                            </div>
                            {!verlegdBeschikbaar && (
                                <div style={{ fontSize: 12, color: 'var(--amber, #d97706)', marginTop: 6 }}>
                                    Nog niet beschikbaar: draai eerst migratie 20261026140000_bonnen_btw_verlegd.sql.
                                </div>
                            )}
                            {toonZonderBtw && (
                                <div style={{ marginTop: 8 }}>
                                    {zonderBtw.map(b => (
                                        <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '64px minmax(120px,1fr) 90px 200px', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border, rgba(255,255,255,.06))', opacity: b.vergrendeld ? 0.55 : 1 }}>
                                            <span style={{ color: 'var(--muted)' }}>{datumNL(b.datum)}</span>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.naam || `Bon #${b.id}`}</span>
                                            <span style={num}>{fmt(b.totaal)}</span>
                                            <VerlegdKeuze b={b} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
