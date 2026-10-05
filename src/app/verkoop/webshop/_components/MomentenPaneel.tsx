'use client';

/**
 * Momenten — wanneer klanten kunnen ophalen, en hoeveel er per keer past.
 * Ontwerp: artboard 07. Plan §3.3.
 *
 * De bezetting wordt geteld uit de orders die de pagina toch al heeft
 * (betaald + lopende reserveringen — dezelfde regel als de kassa). Geen
 * aparte teller die kan gaan afwijken.
 */
import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Check, ChevronUp, Loader2, Plus } from 'lucide-react';
import Button from '@/components/Button';
import { capaciteitEenheid, datumKort, datumLang, groepLabel, telBezetting, tijdvak, type ArtikelRij, type MomentRij, type OrderRij } from '../_lib/vakjes';
import { voegMomentToe, zetMomentActief, zetMomentBestellenTot, zetMomentCapaciteit, zetMomentSluitOp } from '../actions';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;

interface Props {
    momenten: MomentRij[];
    artikelen: ArtikelRij[];
    orders: OrderRij[];
    vandaag: string;
    herlaad: () => Promise<void>;
    melding: Melding;
}

export default function MomentenPaneel({ momenten, artikelen, orders, vandaag, herlaad, melding }: Props) {
    const [nieuw, setNieuw] = useState(false);
    const [voorbij, setVoorbij] = useState(false);
    const [bezig, setBezig] = useState<string | null>(null);
    const bezetting = useMemo(() => telBezetting(orders, new Date()), [orders]);

    const groepen = useMemo(() => {
        const set = new Set<string>();
        for (const a of artikelen) if (a.moment_groep) set.add(a.moment_groep);
        for (const m of momenten) set.add(m.groep);
        return [...set].sort((a, b) => (a === 'agenda' ? -1 : b === 'agenda' ? 1 : a.localeCompare(b)));
    }, [artikelen, momenten]);

    const vol = momenten.filter((m) => m.actief && m.datum >= vandaag && m.capaciteit != null && (bezetting.get(m.id) ?? 0) >= m.capaciteit).length;

    async function doe(sleutel: string, actie: () => Promise<{ data: unknown } | { error: string }>, gelukt: string) {
        setBezig(sleutel);
        try {
            const r = await actie();
            if ('error' in r) { melding(r.error, 'error'); return false; }
            melding(gelukt, 'success');
            await herlaad();
            return true;
        } finally { setBezig(null); }
    }

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {vol > 0 && <span className="ws-teller ws-teller-warn" style={{ cursor: 'default' }}><b>{vol}</b> {vol === 1 ? 'vak vol' : 'vakken vol'}</span>}
                    <button type="button" className="ws-teller" aria-pressed={voorbij} onClick={() => setVoorbij((x) => !x)}>{voorbij ? 'Voorbije vakken verbergen' : 'Ook voorbije vakken'}</button>
                </div>
                <Button variant="ghost" icon={nieuw ? <ChevronUp size={14} /> : <Plus size={14} />} onClick={() => setNieuw((x) => !x)}>{nieuw ? 'Annuleren' : 'Vak toevoegen'}</Button>
            </div>

            {nieuw && (
                <NieuwVak groepen={groepen} artikelen={artikelen} bezig={bezig === 'nieuw'}
                    onOpslaan={async (w) => { const ok = await doe('nieuw', () => voegMomentToe(w), 'Vak toegevoegd'); if (ok) setNieuw(false); }} />
            )}

            {groepen.length === 0 && <div className="ws-leeg" style={{ padding: 24, textAlign: 'center' }}>Nog geen groepen. Geef een artikel eerst een afhaalvorm (moment of dag) met een groep.</div>}
            {groepen.map((groep) => {
                const eenheid = capaciteitEenheid(groep, artikelen);
                const rijen = momenten.filter((m) => m.groep === groep && (voorbij || m.datum >= vandaag)).sort((a, b) => (a.datum + (a.van ?? '')).localeCompare(b.datum + (b.van ?? '')));
                const namen = [...new Set(artikelen.filter((a) => a.moment_groep === groep).map((a) => a.naam))];
                const dozenArt = artikelen.find((a) => a.moment_groep === groep && a.capaciteit_soort === 'dozen');
                return (
                    <div key={groep} className="panel">
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>{groepLabel(groep, artikelen)}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{namen.join(' · ') || 'geen artikelen wijzen hierheen'}{dozenArt?.doos_klein_max && dozenArt.doos_groot ? ` · kleine doos t/m ${dozenArt.doos_klein_max}, grote doos ${dozenArt.doos_groot}` : ''}</div>
                        </div>
                        <div className="ws-tabel-kop ws-momenten-grid"><span>Vak</span><span>Bezetting</span><span>Capaciteit</span><span>Bestellen tot</span><span>Deadline (tijd)</span><span /></div>
                        {rijen.length === 0 && <div className="ws-leeg" style={{ padding: 20 }}>Nog geen vakken. Zonder vak kan er niet besteld worden.</div>}
                        {rijen.map((m) => (
                            <VakRij key={m.id} m={m} bezet={bezetting.get(m.id) ?? 0} eenheid={eenheid} bezig={bezig} vandaag={vandaag}
                                onCapaciteit={(c) => doe(`cap:${m.id}`, () => zetMomentCapaciteit({ id: m.id, capaciteit: c }), c == null ? 'Geen grens meer op dit vak' : 'Capaciteit bijgewerkt')}
                                onSluitOp={(d) => doe(`sluit:${m.id}`, () => zetMomentSluitOp({ id: m.id, sluit_op: d }), d ? 'Besteldeadline gezet' : 'Geen deadline met tijd meer')}
                                onBestellenTot={(d) => doe(`tot:${m.id}`, () => zetMomentBestellenTot({ id: m.id, bestellen_tot: d }), d ? `Bestellen kan tot ${datumKort(d)}` : 'Geen besteltermijn meer')}
                                onActief={(actief) => doe(`act:${m.id}`, () => zetMomentActief({ id: m.id, actief }), actief ? 'Vak staat weer open' : 'Vak uit de lijst gehaald')} />
                        ))}
                    </div>
                );
            })}
        </>
    );
}

/** ISO (UTC) → waarde voor <input type="datetime-local"> in de lokale tijd van de browser. */
function lokaalVanIso(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function isoVanLokaal(v: string): string | null {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function VakRij({ m, bezet, eenheid, bezig, vandaag, onCapaciteit, onSluitOp, onBestellenTot, onActief }: {
    m: MomentRij; bezet: number; eenheid: string; bezig: string | null; vandaag: string;
    onCapaciteit: (c: number | null) => void; onSluitOp: (d: string | null) => void; onBestellenTot: (d: string | null) => void; onActief: (a: boolean) => void;
}) {
    /* Leeg = onbeperkt (Sinterklaas S3). */
    const capTekst = (c: number | null) => (c == null ? '' : String(c));
    const [cap, setCap] = useState(capTekst(m.capaciteit));
    const onbeperkt = m.capaciteit == null;
    const vol = m.actief && !onbeperkt && bezet >= m.capaciteit!;
    const pct = onbeperkt ? 0 : m.capaciteit! > 0 ? Math.min(100, Math.round((bezet / m.capaciteit!) * 100)) : 100;
    const gewijzigd = cap !== capTekst(m.capaciteit);
    const voorbij = m.datum < vandaag;
    return (
        <div className="ws-tabel-rij ws-momenten-grid" style={{ cursor: 'default', opacity: m.actief ? (voorbij ? .6 : 1) : .5, background: vol ? 'rgba(245,158,11,.04)' : undefined }}>
            <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{datumLang(m.datum)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{tijdvak(m) ?? 'hele dag'}{!m.actief && ' · niet in de lijst'}{voorbij && ' · voorbij'}</div>
            </div>
            <div className={`ws-balk${vol ? ' ws-balk-vol' : ''}`} style={{ maxWidth: 'none' }}>
                <div className="ws-balk-spoor"><div className="ws-balk-vul" style={{ width: `${pct}%` }} /></div>
                <span className="ws-balk-tekst">{bezet} / {onbeperkt ? '∞' : m.capaciteit}{vol ? ' · vol' : ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input inputMode="numeric" value={cap} placeholder="∞" onChange={(e) => setCap(e.target.value)}
                    onBlur={() => { if (!gewijzigd) return; if (cap.trim() === '') { onCapaciteit(null); return; } const n = Number(cap); if (Number.isInteger(n) && n >= 0) onCapaciteit(n); else setCap(capTekst(m.capaciteit)); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ width: 56, height: 36, padding: '0 10px', background: 'var(--bg)', border: `1px solid ${gewijzigd ? 'var(--brand-gold)' : 'var(--border)'}`, borderRadius: 8, color: 'var(--text)', font: '500 13px var(--font-mono)', textAlign: 'right' }} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{bezig === `cap:${m.id}` ? <Loader2 size={12} /> : eenheid}</span>
            </div>
            <div>
                <input type="date" value={m.bestellen_tot ?? ''} max={m.datum} onChange={(e) => onBestellenTot(e.target.value || null)}
                    style={{ height: 36, padding: '0 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: m.bestellen_tot ? 'var(--text)' : 'var(--muted)', font: '400 13px var(--font-sans)', colorScheme: 'dark', width: '100%' }} />
            </div>
            <div>
                <input type="datetime-local" value={lokaalVanIso(m.sluit_op)} onChange={(e) => onSluitOp(isoVanLokaal(e.target.value))} title="Besteldeadline met tijd: daarna staat dit vak niet meer op de site"
                    style={{ height: 36, padding: '0 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: m.sluit_op ? 'var(--text)' : 'var(--muted)', font: '400 13px var(--font-sans)', colorScheme: 'dark', width: '100%' }} />
            </div>
            <button type="button" className="mr-icon-btn-sm" style={{ width: 36, height: 36 }} title={m.actief ? 'Uit de lijst halen' : 'Terugzetten'} disabled={bezig === `act:${m.id}`} onClick={() => onActief(!m.actief)}>
                {m.actief ? <Archive size={15} /> : <ArchiveRestore size={15} />}
            </button>
        </div>
    );
}

function NieuwVak({ groepen, artikelen, bezig, onOpslaan }: { groepen: string[]; artikelen: ArtikelRij[]; bezig: boolean; onOpslaan: (w: { groep: string; datum: string; van: string; tot: string; capaciteit: string; bestellen_tot: string; sluit_op: string }) => void }) {
    const [groep, setGroep] = useState(groepen[0] ?? 'agenda');
    const [eigen, setEigen] = useState('');
    const [datum, setDatum] = useState('');
    const [van, setVan] = useState('');
    const [tot, setTot] = useState('');
    const [capaciteit, setCapaciteit] = useState('');
    const [bestellenTot, setBestellenTot] = useState('');
    const [sluitOp, setSluitOp] = useState('');
    const gekozen = groep === '__eigen' ? eigen.trim().toLowerCase() : groep;
    const eenheid = capaciteitEenheid(gekozen, artikelen);
    const isDag = artikelen.some((a) => a.moment_groep === gekozen && a.moment_soort === 'dag');
    return (
        <div className="smoke-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nieuw vak</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <div className="field"><label>Soort</label>
                    <select value={groep} onChange={(e) => setGroep(e.target.value)}>
                        {groepen.map((g) => <option key={g} value={g}>{groepLabel(g, artikelen)}</option>)}
                        <option value="__eigen">Nieuwe groep…</option>
                    </select>
                </div>
                {groep === '__eigen' && <div className="field"><label>Groep</label><input value={eigen} onChange={(e) => setEigen(e.target.value)} placeholder="kerst-box" /></div>}
                <div className="field"><label>Datum</label><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ colorScheme: 'dark' }} /></div>
                {!isDag && <div className="field"><label>Van</label><input type="time" value={van} onChange={(e) => setVan(e.target.value)} style={{ colorScheme: 'dark' }} /></div>}
                {!isDag && <div className="field"><label>Tot</label><input type="time" value={tot} onChange={(e) => setTot(e.target.value)} style={{ colorScheme: 'dark' }} /></div>}
                <div className="field"><label>Capaciteit</label><input inputMode="numeric" value={capaciteit} placeholder="∞" onChange={(e) => setCapaciteit(e.target.value)} /><div className="field-hint">{eenheid} · leeg = onbeperkt</div></div>
                <div className="field"><label>Bestellen tot</label><input type="date" value={bestellenTot} max={datum || undefined} onChange={(e) => setBestellenTot(e.target.value)} style={{ colorScheme: 'dark' }} /><div className="field-hint">Daarna dicht op de site</div></div>
                <div className="field"><label>Deadline met tijd</label><input type="datetime-local" value={sluitOp} onChange={(e) => setSluitOp(e.target.value)} style={{ colorScheme: 'dark' }} /><div className="field-hint">Leeg = alleen de dag hierboven telt</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <Button icon={<Check size={14} />} loading={bezig} onClick={() => onOpslaan({ groep: gekozen, datum, van, tot, capaciteit, bestellen_tot: bestellenTot, sluit_op: isoVanLokaal(sluitOp) ?? '' })}>Toevoegen</Button>
            </div>
        </div>
    );
}
