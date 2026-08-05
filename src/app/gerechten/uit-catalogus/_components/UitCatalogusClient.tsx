'use client';

/**
 * Receptuur uit de groothandel.
 *
 * "Kip van Beef Club, de marinade maak jij." Je pint één of meer echte
 * producten vast; de AI bouwt het gerecht daaromheen en kiest de rest bij
 * voorkeur uit wat er bij jouw leveranciers te koop is.
 *
 * De kostprijs komt NIET van de AI. Die wordt na afloop uit de echte catalogus
 * afgeleid (/api/recipe/match-ingredients), en het scherm is er eerlijk over
 * hoeveel regels wél en niet een prijs kregen — een som die 5 van de 12 regels
 * als €0 meetelt is geen kostprijs maar een ondergrens, en zo staat hij er ook.
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Search, X, Sparkles, Loader2, Check, Pin, AlertTriangle, Store,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { fmt } from '@/lib/utils';
import { bewaarGerecht } from '../actions';

const GOLD = '#c4a35a';
const DRAAIT: React.CSSProperties = { animation: 'spin 1s linear infinite' };

interface CatalogHit {
    naam: string;
    leverancier: string | null;
    prijs_per_kg?: number | null;
    prijs_per_stuk?: number | null;
    base_cost_cents?: number | null;
    base_quantity?: number | null;
    base_unit?: string | null;
}

interface Ingredient {
    naam: string;
    leverancier: string | null;
    hoeveelheid: number;
    eenheid: string;
    uit_catalogus: boolean;
    /** Uit de kostmotor — null = geen betrouwbare prijs gevonden. */
    regel_cent?: number | null;
    bron?: string | null;
}

interface Recept {
    naam: string;
    beschrijving: string;
    categorie: string;
    porties: number;
    preptime?: number;
    ingredienten: Ingredient[];
    instructies: string[];
    allergenen: string[];
    tags: string[];
    battle_plan: string[];
    service_tip: string;
}

export default function UitCatalogusClient() {
    const showToast = useToast();
    const router = useRouter();

    const [vraag, setVraag] = useState('');
    const [porties, setPorties] = useState('40');
    const [pins, setPins] = useState<CatalogHit[]>([]);
    const [recept, setRecept] = useState<Recept | null>(null);
    const [kosten, setKosten] = useState<{ centen: number; gematcht: number; totaal: number } | null>(null);
    const [bezig, setBezig] = useState<null | 'bedenken' | 'bewaren'>(null);
    const [fout, setFout] = useState<string | null>(null);

    async function bedenk() {
        if (!vraag.trim() && pins.length === 0) {
            setFout('Beschrijf wat je wilt maken, of pin een product vast.');
            return;
        }
        setFout(null);
        setBezig('bedenken');
        setRecept(null);
        setKosten(null);
        try {
            const res = await fetch('/api/recipe/from-catalog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vraag: vraag.trim(),
                    porties: Number(porties) || 10,
                    vastgepind: pins,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setFout(json.error || 'Het bedenken lukte niet.');
                return;
            }
            const d = json.data;
            const basis: Recept = {
                naam: d.naam ?? 'Naamloos gerecht',
                beschrijving: d.beschrijving ?? '',
                categorie: d.categorie ?? 'Vlees',
                porties: d.porties ?? (Number(porties) || 10),
                preptime: d.preptime,
                ingredienten: Array.isArray(d.ingredienten) ? d.ingredienten : [],
                instructies: Array.isArray(d.instructies) ? d.instructies : [],
                allergenen: Array.isArray(d.allergenen) ? d.allergenen : [],
                tags: Array.isArray(d.tags) ? d.tags : [],
                battle_plan: Array.isArray(d.battle_plan) ? d.battle_plan : [],
                service_tip: d.service_tip ?? '',
            };
            setRecept(basis);

            /* Kostprijs apart, want dat is code-werk over de echte catalogus. */
            const kostRes = await fetch('/api/recipe/match-ingredients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingredients: basis.ingredienten.map((i) => ({ naam: i.naam, qty_pp: i.hoeveelheid, eenheid: i.eenheid })),
                }),
            });
            const kostJson = await kostRes.json();
            if (kostJson.success) {
                const perNaam = new Map<string, { cent: number | null; bron: string | null }>();
                for (const r of kostJson.data.ingredients) {
                    perNaam.set(String(r.naam).toLowerCase(), {
                        cent: r.match?.line_cost_cents ?? null,
                        bron: r.match?.source ?? null,
                    });
                }
                setRecept((v) => v && ({
                    ...v,
                    ingredienten: v.ingredienten.map((i) => {
                        const k = perNaam.get(i.naam.toLowerCase());
                        return { ...i, regel_cent: k?.cent ?? null, bron: k?.bron ?? null };
                    }),
                }));
                setKosten({
                    centen: kostJson.data.kostprijs_pp_cents ?? 0,
                    gematcht: kostJson.data.matched_count ?? 0,
                    totaal: kostJson.data.total_count ?? basis.ingredienten.length,
                });
            }
        } catch {
            setFout('Er ging iets mis bij het bedenken. Probeer het opnieuw.');
        } finally {
            setBezig(null);
        }
    }

    async function bewaar() {
        if (!recept) return;
        setBezig('bewaren');
        setFout(null);
        const compleet = kosten != null && kosten.gematcht === kosten.totaal;
        const res = await bewaarGerecht({
            naam: recept.naam,
            beschrijving: recept.beschrijving,
            categorie: recept.categorie,
            porties: recept.porties,
            ingredienten: recept.ingredienten.map((i) => ({
                naam: i.naam, hoeveelheid: i.hoeveelheid, eenheid: i.eenheid,
                leverancier: i.leverancier ?? null, uit_catalogus: i.uit_catalogus,
                regel_cent: i.regel_cent ?? null,
            })),
            bereidingswijze: recept.instructies,
            allergenen: recept.allergenen,
            tags: recept.tags,
            battle_plan_steps: recept.battle_plan,
            service_tip: recept.service_tip,
            /* Alleen een kostprijs vastleggen als élke regel er één had. */
            kostprijs_pp: compleet && kosten ? kosten.centen / 100 : null,
        });
        setBezig(null);
        if (res.error) {
            setFout(res.error === 'validation' ? 'Er klopt iets niet in het recept.' : res.error);
            return;
        }
        showToast(`"${recept.naam}" opgeslagen bij je gerechten`, 'success');
        router.push('/gerechten');
    }

    const uitCatalogus = recept?.ingredienten.filter((i) => i.uit_catalogus).length ?? 0;

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge) 48px', maxWidth: 780, margin: '0 auto' }}>
            <Link href="/gerechten" style={terugKnop}><ArrowLeft size={15} /> Gerechten</Link>

            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 30, margin: '18px 0 6px' }}>
                Receptuur uit de groothandel
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
                Pin de producten vast die je zelf kiest — de kip van Beef Club, jouw vaste rib.
                De AI bouwt het gerecht eromheen en pakt de rest bij voorkeur uit je eigen
                prijslijsten, zodat de kostprijs klopt in plaats van een schatting is.
            </p>

            <Pinner pins={pins} onPin={(h) => setPins((v) => [...v, h])} onWeg={(i) => setPins((v) => v.filter((_, n) => n !== i))} />

            <div style={{ ...kaart, padding: 16, marginBottom: 14 }}>
                <Label>Wat wil je maken?</Label>
                <textarea
                    value={vraag}
                    onChange={(e) => setVraag(e.target.value)}
                    rows={3}
                    placeholder="Gemarineerde kip van de BBQ, pittig maar niet te heet — voor een bedrijfsfeest"
                    style={{
                        width: '100%', borderRadius: 10, padding: 12, fontSize: 15, lineHeight: 1.6,
                        background: 'var(--color-bg-deep)', border: '1px solid var(--border)',
                        color: 'var(--text)', outline: 'none', resize: 'vertical',
                    }}
                />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
                    <Label style={{ margin: 0 }}>Porties</Label>
                    <input
                        type="text" inputMode="numeric" value={porties}
                        onChange={(e) => setPorties(e.target.value.replace(/[^\d]/g, ''))}
                        style={{ ...veld, width: 90, textAlign: 'center' }}
                    />
                </div>
            </div>

            <button
                onClick={bedenk}
                disabled={bezig !== null}
                style={{ ...primair, background: GOLD, color: '#14140f', opacity: bezig ? .7 : 1 }}
            >
                {bezig === 'bedenken' ? <Loader2 size={17} style={DRAAIT} /> : <Sparkles size={17} />}
                {bezig === 'bedenken' ? 'Bezig — dit duurt een halve minuut…' : 'Bedenk de receptuur'}
            </button>

            {fout && <Melding>{fout}</Melding>}

            {recept && (
                <div style={{ marginTop: 26 }}>
                    <div style={{ ...kaart, padding: 18, marginBottom: 14 }}>
                        <input
                            value={recept.naam}
                            onChange={(e) => setRecept({ ...recept, naam: e.target.value })}
                            style={{
                                width: '100%', border: 'none', background: 'transparent', color: 'var(--text)',
                                fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 24, padding: 0, outline: 'none',
                            }}
                        />
                        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '8px 0 0' }}>
                            {recept.beschrijving}
                        </p>
                        <div style={{ fontSize: 11, color: 'var(--muted-light)', marginTop: 10 }}>
                            {recept.porties} porties{recept.preptime ? ` · ${recept.preptime} min` : ''} · {recept.categorie}
                        </div>
                    </div>

                    {/* Kostprijs — met de eerlijkheid erbij */}
                    {kosten && (
                        <div style={{
                            ...kaart, padding: 16, marginBottom: 14,
                            borderColor: kosten.gematcht === kosten.totaal ? `${GOLD}66` : 'rgba(245,158,11,.4)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 27, fontWeight: 300, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(kosten.centen / 100)}
                                </span>
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>kostprijs per portie</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6, marginTop: 8 }}>
                                {kosten.gematcht === kosten.totaal
                                    ? <>Alle {kosten.totaal} ingrediënten hebben een echte prijs uit je catalogus.</>
                                    : <><strong style={{ color: 'var(--amber)' }}>Ondergrens.</strong> {kosten.gematcht} van de {kosten.totaal} regels
                                        hebben een echte prijs; de rest telt als € 0 mee. De werkelijke kostprijs ligt hoger.
                                        Koppel die regels aan een product, dan klopt het bedrag.</>}
                            </div>
                        </div>
                    )}

                    {/* Ingrediënten */}
                    <Kop>Ingrediënten <span style={{ color: 'var(--muted-light)', fontWeight: 400 }}>· {uitCatalogus} van de {recept.ingredienten.length} uit je catalogus</span></Kop>
                    <div style={{ ...kaart, padding: 4, marginBottom: 14 }}>
                        {recept.ingredienten.map((i, n) => (
                            <div key={n} style={{
                                display: 'flex', gap: 10, alignItems: 'center', padding: '11px 12px',
                                borderBottom: n < recept.ingredienten.length - 1 ? '1px solid var(--border)' : undefined,
                            }}>
                                <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 74, fontVariantNumeric: 'tabular-nums' }}>
                                    {String(i.hoeveelheid).replace('.', ',')} {i.eenheid}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 13.5 }}>{i.naam}</span>
                                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted-light)', marginTop: 2 }}>
                                        {i.uit_catalogus
                                            ? <><Store size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />{i.leverancier || 'uit je catalogus'}</>
                                            : 'eigen kast — geen catalogusregel'}
                                    </span>
                                </span>
                                <span style={{
                                    fontSize: 11.5, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                                    color: i.regel_cent != null ? GOLD : 'var(--muted-light)',
                                }}>
                                    {i.regel_cent != null ? fmt(i.regel_cent / 100) : 'geen prijs'}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Bereiding */}
                    {recept.instructies.length > 0 && (
                        <>
                            <Kop>Bereiding</Kop>
                            <ol style={{ ...kaart, padding: '14px 14px 14px 32px', marginBottom: 14, fontSize: 13, lineHeight: 1.7 }}>
                                {recept.instructies.map((s, n) => <li key={n} style={{ marginBottom: 6 }}>{s}</li>)}
                            </ol>
                        </>
                    )}

                    {recept.battle_plan.length > 0 && (
                        <>
                            <Kop>Draaiboek</Kop>
                            <div style={{ ...kaart, padding: 14, marginBottom: 14, fontSize: 12.5, lineHeight: 1.8, color: 'var(--muted)' }}>
                                {recept.battle_plan.map((s, n) => <div key={n}>{s}</div>)}
                            </div>
                        </>
                    )}

                    {recept.allergenen.length > 0 && (
                        <div style={{
                            display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 13px',
                            borderRadius: 10, background: 'rgba(245,158,11,.1)', marginBottom: 18,
                            fontSize: 12, color: 'var(--amber)', lineHeight: 1.6,
                        }}>
                            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>
                                Allergenen volgens de AI: {recept.allergenen.join(', ')}.
                                Controleer dit zelf tegen de etiketten voordat het naar een klant gaat.
                            </span>
                        </div>
                    )}

                    <button
                        onClick={bewaar}
                        disabled={bezig !== null}
                        style={{ ...primair, background: GOLD, color: '#14140f', opacity: bezig ? .7 : 1 }}
                    >
                        {bezig === 'bewaren' ? <Loader2 size={17} style={DRAAIT} /> : <Check size={17} />}
                        Bewaar als gerecht
                    </button>
                </div>
            )}
        </div>
    );
}

/* ─── Producten vastpinnen ────────────────────────────────────────────── */

function Pinner({ pins, onPin, onWeg }: {
    pins: CatalogHit[];
    onPin: (h: CatalogHit) => void;
    onWeg: (i: number) => void;
}) {
    const [q, setQ] = useState('');
    const [treffers, setTreffers] = useState<CatalogHit[]>([]);
    const [zoekt, setZoekt] = useState(false);
    const veldRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) { setTreffers([]); return; }
        setZoekt(true);
        const t = setTimeout(async () => {
            try {
                const r = await fetch(`/api/catalog/search?q=${encodeURIComponent(term)}&supplierProducts=1`);
                const j = await r.json();
                setTreffers(Array.isArray(j.results) ? j.results.slice(0, 12) : []);
            } catch { setTreffers([]); } finally { setZoekt(false); }
        }, 280);
        return () => clearTimeout(t);
    }, [q]);

    function prijsLabel(h: CatalogHit): string {
        if (h.prijs_per_kg) return `${fmt(h.prijs_per_kg)} / kg`;
        if (h.prijs_per_stuk) return `${fmt(h.prijs_per_stuk)} / stuk`;
        if (h.base_cost_cents && h.base_quantity && h.base_unit) {
            return `${fmt(h.base_cost_cents / 100)} / ${h.base_quantity} ${h.base_unit}`;
        }
        return 'prijs onbekend';
    }

    return (
        <div style={{ ...kaart, padding: 16, marginBottom: 14 }}>
            <Label>Producten die erin moeten</Label>

            {pins.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                    {pins.map((p, i) => (
                        <span key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7,
                            background: `${GOLD}1a`, border: `1px solid ${GOLD}55`, borderRadius: 999,
                            padding: '7px 8px 7px 12px', fontSize: 12,
                        }}>
                            <Pin size={11} style={{ color: GOLD }} />
                            <span>{p.naam}</span>
                            <span style={{ color: 'var(--muted)' }}>{p.leverancier}</span>
                            <button onClick={() => onWeg(i)} aria-label={`${p.naam} losmaken`} style={{
                                width: 26, height: 26, borderRadius: 999, border: 'none', background: 'transparent',
                                color: 'var(--muted)', cursor: 'pointer', display: 'grid', placeItems: 'center',
                            }}><X size={13} /></button>
                        </span>
                    ))}
                </div>
            )}

            <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                <input
                    ref={veldRef} value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Zoek in je prijslijsten — bv. kipfilet"
                    style={{ ...veld, width: '100%', height: 48, padding: '0 38px 0 38px' }}
                />
                {zoekt && <Loader2 size={14} style={{ ...DRAAIT, position: 'absolute', right: 13, top: '50%', marginTop: -7, color: 'var(--muted)' }} />}
            </div>

            {treffers.length > 0 && (
                <div style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
                    {treffers.map((h, i) => (
                        <button
                            key={i}
                            onClick={() => { onPin(h); setQ(''); setTreffers([]); veldRef.current?.focus(); }}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                                background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                                padding: '10px 4px', cursor: 'pointer', minHeight: 52, color: 'var(--text)',
                            }}
                        >
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.naam}</span>
                                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)' }}>{h.leverancier || '—'}</span>
                            </span>
                            <span style={{ fontSize: 11, color: GOLD, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{prijsLabel(h)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Kleine dingen ───────────────────────────────────────────────────── */

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 9, fontWeight: 600, ...style }}>{children}</div>;
}

function Kop({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 12, fontWeight: 600, margin: '0 2px 8px' }}>{children}</div>;
}

function Melding({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            padding: '12px 14px', borderRadius: 10, marginTop: 14, fontSize: 13,
            background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.35)', color: 'var(--red)',
        }}>{children}</div>
    );
}

const kaart: React.CSSProperties = {
    background: 'var(--color-bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 12, color: 'var(--text)',
};

const veld: React.CSSProperties = {
    height: 44, borderRadius: 10, padding: '0 12px',
    background: 'var(--color-bg-deep)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 15, outline: 'none',
};

const terugKnop: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 9,
    padding: '9px 13px', minHeight: 42, color: 'var(--muted)',
    fontSize: 13, cursor: 'pointer', textDecoration: 'none',
};

const primair: React.CSSProperties = {
    width: '100%', minHeight: 54, borderRadius: 12, border: 'none',
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    touchAction: 'manipulation',
};
