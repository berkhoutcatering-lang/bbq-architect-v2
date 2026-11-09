'use client';

/**
 * Bestelling invoeren — de lade waarin een bestelling per mail of telefoon in
 * de app komt. Alleen vakjes invullen; de app maakt er een gewone order van:
 * vakjes, agenda, Kerst-overzicht, en op de afhaaldag in de kassa.
 * Ontwerp: docs/superpowers/specs/2026-11-09-bestelling-invoeren-design.md
 *
 * Er gaat nooit een mail naar de klant, en de app verzint geen prijs: zonder
 * prijs is een regel op maat "prijs volgt".
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Plus, Search, Trash2, Wallet } from 'lucide-react';
import Button from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { ALLERGEEN_KEUZES, BRON_LABEL, BRONNEN, OP_MAAT_SLUG, splitsRegels, type Bron, type InvoerRegel } from '@/lib/winkel/handmatig';
import Drawer from './Drawer';
import { leesEuro, toonEuro } from '../_lib/vakjes';
import { voerBestellingIn, zoekAanvragen } from '../invoeren';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;

interface Artikel {
    id: string;
    slug: string;
    naam: string;
    eenheid: string;
    prijs_cents: number | null;
    moment_soort: string;
    moment_groep: string | null;
}

interface Aanvraag {
    id: number;
    naam: string;
    email: string | null;
    telefoon: string | null;
    created_at: string;
}

type RegelForm =
    | { sleutel: number; soort: 'artikel'; slug: string; aantal: string; prijs: string; toelichting: string }
    | { sleutel: number; soort: 'op-maat'; naam: string; aantal: string; prijs: string; btwPct: 0 | 9 | 21; toelichting: string };

interface Props {
    onClose: () => void;
    /** Na opslaan: het scherm eronder opnieuw laden. */
    onKlaar: () => void | Promise<void>;
    melding: Melding;
    /** Een product dat al klaarstaat, bijvoorbeeld de Kerst-Box vanuit het Kerst-scherm. */
    startSlug?: string;
}

let teller = 0;
const nieuweSleutel = () => ++teller;

function vandaagISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BestellingInvoeren({ onClose, onKlaar, melding, startSlug }: Props) {
    const [sleutel] = useState(() => crypto.randomUUID());
    const [artikelen, setArtikelen] = useState<Artikel[]>([]);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState<string | null>(null);

    const [zoek, setZoek] = useState('');
    const [aanvragen, setAanvragen] = useState<Aanvraag[]>([]);
    const [lead, setLead] = useState<Aanvraag | null>(null);
    const [naam, setNaam] = useState('');
    const [email, setEmail] = useState('');
    const [telefoon, setTelefoon] = useState('');
    const [bron, setBron] = useState<Bron>('mail');
    const [datum, setDatum] = useState('');
    const [tijd, setTijd] = useState('');
    const [regels, setRegels] = useState<RegelForm[]>(() => [
        startSlug
            ? { sleutel: nieuweSleutel(), soort: 'artikel', slug: startSlug, aantal: '', prijs: '', toelichting: '' }
            : { sleutel: nieuweSleutel(), soort: 'artikel', slug: '', aantal: '', prijs: '', toelichting: '' },
    ]);
    const [vega, setVega] = useState('');
    const [allergenen, setAllergenen] = useState<string[]>([]);
    const [andereAllergenen, setAndereAllergenen] = useState('');
    const [harde, setHarde] = useState('');
    const [opmerking, setOpmerking] = useState('');
    const [inDeKassa, setInDeKassa] = useState(true);

    useEffect(() => {
        void supabase.from('winkel_artikelen').select('id, slug, naam, eenheid, prijs_cents, moment_soort, moment_groep').eq('actief', true).neq('slug', OP_MAAT_SLUG).order('naam')
            .then(({ data }) => setArtikelen((data ?? []) as Artikel[]));
    }, []);

    /* Aanvragen zoeken terwijl je typt; even wachten zodat niet elke letter een vraag is. */
    useEffect(() => {
        const t = window.setTimeout(async () => {
            const r = await zoekAanvragen({ zoek });
            if ('data' in r) setAanvragen(r.data);
        }, 250);
        return () => window.clearTimeout(t);
    }, [zoek]);

    const opSlug = useMemo(() => new Map(artikelen.map((a) => [a.slug, a])), [artikelen]);

    function kiesAanvraag(a: Aanvraag) {
        setLead(a);
        /* Een aanmelding heeft geen echte naam ("Aanmelding afhaalmoment"); die nemen we niet over. */
        if (!naam.trim() && !/^aanmelding/i.test(a.naam)) setNaam(a.naam);
        if (a.email && !email.trim()) setEmail(a.email);
        if (a.telefoon && !telefoon.trim()) setTelefoon(a.telefoon);
        setZoek('');
    }

    function zetRegel(i: number, deel: Partial<RegelForm>) {
        setRegels((rs) => rs.map((r, j) => (j === i ? ({ ...r, ...deel } as RegelForm) : r)));
    }

    /* Wat het totaal nu is, zoals de server het ook rekent; regels zonder prijs apart. */
    const som = useMemo(() => {
        let centen = 0;
        let volgt = 0;
        for (const r of regels) {
            const aantal = Number(r.aantal) || 0;
            const eigen = leesEuro(r.prijs);
            const stuk = r.soort === 'artikel' ? (eigen ?? opSlug.get(r.slug)?.prijs_cents ?? null) : (eigen ?? null);
            if (stuk == null || eigen === undefined) { if (r.soort === 'op-maat') volgt += 1; continue; }
            centen += stuk * aantal;
        }
        return { centen, volgt };
    }, [regels, opSlug]);

    async function opslaan() {
        setFout(null);
        const invoerRegels: InvoerRegel[] = [];
        for (const r of regels) {
            const aantal = Number(r.aantal);
            const prijs = leesEuro(r.prijs);
            if (prijs === undefined) { setFout('Een prijs klopt niet. Schrijf hem als 12,50.'); return; }
            if (!Number.isInteger(aantal) || aantal < 1) { setFout('Vul bij elke regel een aantal in.'); return; }
            if (r.soort === 'artikel') {
                if (!r.slug) { setFout('Kies bij elke productregel een product.'); return; }
                invoerRegels.push({ soort: 'artikel', slug: r.slug, aantal, stukCenten: prijs, toelichting: r.toelichting });
            } else {
                if (!r.naam.trim()) { setFout('Geef elke regel op maat een naam.'); return; }
                invoerRegels.push({ soort: 'op-maat', naam: r.naam, toelichting: r.toelichting, aantal, stukCenten: prijs, btwPct: r.btwPct });
            }
        }
        if (!datum) { setFout('Kies de afhaaldag.'); return; }
        const vegetarisch = vega.trim() ? Number(vega) : 0;
        if (!Number.isInteger(vegetarisch) || vegetarisch < 0) { setFout('Het aantal vegetariërs klopt niet.'); return; }

        setBezig(true);
        try {
            const r = await voerBestellingIn({
                sleutel,
                klant: { naam, email: email.trim(), telefoon: telefoon.trim() },
                bron,
                datum,
                tijd: tijd || null,
                regels: invoerRegels,
                wensen: {
                    vegetarisch,
                    veganistisch: 0,
                    glutenvrij: 0,
                    allergenen: [...allergenen, ...andereAllergenen.split(',').map((s) => s.trim()).filter(Boolean)],
                    overig: splitsRegels(harde),
                },
                opmerking,
                inDeKassa,
                leadId: lead?.id ?? null,
            });
            if ('error' in r) { setFout(r.error); return; }
            const d = r.data;
            melding(`${d.nummer} staat erin${d.prijsVolgt ? ` · ${d.prijsVolgt} ${d.prijsVolgt === 1 ? 'regel' : 'regels'} prijs volgt` : ''}`, 'success');
            for (const m of d.let_op) melding(m, 'info');
            await onKlaar();
            onClose();
        } finally { setBezig(false); }
    }

    const letOpAantal = allergenen.length + (andereAllergenen.trim() ? 1 : 0) + splitsRegels(harde).length;

    return (
        <Drawer
            eyebrow="Bestelling invoeren"
            title="Per mail of telefoon"
            subtitle="Wordt een gewone bestelling: in de vakjes, de agenda en op de afhaaldag in de kassa. Er gaat geen mail naar de klant."
            onClose={onClose}
            width={640}
            footer={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', flexWrap: 'wrap' }}>
                    <Button icon={<Check size={14} />} loading={bezig} onClick={opslaan}>Bestelling opslaan</Button>
                    <Button variant="ghost" onClick={onClose}>Annuleren</Button>
                    <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 13 }}>
                        <span className="ws-mono" style={{ fontWeight: 600 }}>€ {toonEuro(som.centen)}</span>
                        {som.volgt > 0 && <span style={{ color: 'var(--ws-warn)' }}> + {som.volgt} prijs volgt</span>}
                    </div>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {fout && (
                    <div className="ws-wensen ws-wensen-warn" role="alert" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <AlertTriangle size={16} style={{ color: 'var(--ws-warn)', flexShrink: 0, marginTop: 2 }} /><span>{fout}</span>
                    </div>
                )}

                {/* ── Klant ── */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="ws-eyebrow">Klant</div>
                    {lead ? (
                        <div className="ws-merk" style={{ alignSelf: 'flex-start', height: 'auto', padding: '6px 10px', whiteSpace: 'normal' }}>
                            <Check size={13} /> Gekoppeld aan aanvraag van {new Date(lead.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} ({lead.email ?? lead.naam})
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLead(null)} style={{ marginLeft: 6 }}>Los</button>
                        </div>
                    ) : (
                        <div className="field">
                            <label>Staat de klant er al in?</label>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
                                <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, e-mail of telefoon" style={{ paddingLeft: 30 }} />
                            </div>
                            {zoek.trim() && (
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                                    {aanvragen.length === 0 && <div className="ws-leeg" style={{ padding: 10 }}>Geen aanvraag gevonden. Vul de klant hieronder in.</div>}
                                    {aanvragen.map((a) => (
                                        <button key={a.id} type="button" onClick={() => kiesAanvraag(a)} style={{ textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', font: '13px var(--font-sans)' }}>
                                            <b>{a.naam}</b> <span style={{ color: 'var(--muted)' }}>· {a.email ?? a.telefoon ?? 'geen contact'} · {new Date(a.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="field-hint">Een aanvraag of aanmelding koppelen, zodat de klant er niet dubbel in komt.</div>
                        </div>
                    )}
                    <div className="field"><label>Naam</label><input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voor- en achternaam" /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="field"><label>E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                        <div className="field"><label>Telefoon</label><input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} /></div>
                    </div>
                    <div className="field"><label>Binnengekomen via</label>
                        <div className="ws-keuze">{BRONNEN.map((b) => <button key={b} type="button" aria-pressed={bron === b} onClick={() => setBron(b)}>{BRON_LABEL[b]}</button>)}</div>
                    </div>
                </section>

                {/* ── Afhalen ── */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="ws-eyebrow">Afhalen</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="field"><label>Dag</label><input type="date" min={vandaagISO()} value={datum} onChange={(e) => setDatum(e.target.value)} /></div>
                        <div className="field"><label>Tijd</label><input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} /><div className="field-hint">Leeg als het nog niet vaststaat</div></div>
                    </div>
                </section>

                {/* ── Regels ── */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="ws-eyebrow">Wat ze willen</div>
                    {regels.map((r, i) => {
                        const art = r.soort === 'artikel' ? opSlug.get(r.slug) : null;
                        return (
                            <div key={r.sleutel} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <span className="ws-merk">{r.soort === 'artikel' ? 'Uit het assortiment' : 'Op maat'}</span>
                                    {regels.length > 1 && <button type="button" className="btn btn-ghost btn-sm" aria-label="Regel weghalen" onClick={() => setRegels((rs) => rs.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
                                </div>
                                {r.soort === 'artikel' ? (
                                    <div className="field"><label>Product</label>
                                        <select value={r.slug} onChange={(e) => zetRegel(i, { slug: e.target.value })}>
                                            <option value="">Kies een product…</option>
                                            {artikelen.map((a) => <option key={a.id} value={a.slug}>{a.naam}{a.prijs_cents != null ? ` · € ${toonEuro(a.prijs_cents)} ${a.eenheid}` : ' · nog geen prijs'}</option>)}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="field"><label>Naam</label><input value={r.naam} onChange={(e) => zetRegel(i, { naam: e.target.value })} placeholder="Kerstavonddiner, 3 gangen" /></div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: r.soort === 'op-maat' ? '1fr 1fr 1.3fr' : '1fr 1fr', gap: 12 }}>
                                    <div className="field"><label>Aantal</label><input inputMode="numeric" value={r.aantal} onChange={(e) => zetRegel(i, { aantal: e.target.value })} placeholder={art?.eenheid === 'per persoon' ? 'personen' : 'stuks'} /></div>
                                    <div className="field"><label>Prijs per stuk</label>
                                        <input inputMode="decimal" value={r.prijs} onChange={(e) => zetRegel(i, { prijs: e.target.value })}
                                            placeholder={r.soort === 'artikel' ? (art?.prijs_cents != null ? toonEuro(art.prijs_cents) : 'verplicht') : 'prijs volgt'} />
                                        <div className="field-hint">{r.soort === 'artikel' ? 'Leeg = catalogusprijs' : 'Leeg = prijs volgt'}</div>
                                    </div>
                                    {r.soort === 'op-maat' && (
                                        <div className="field"><label>Btw</label><div className="ws-keuze">{([9, 21, 0] as const).map((p) => <button key={p} type="button" aria-pressed={r.btwPct === p} onClick={() => zetRegel(i, { btwPct: p })}>{p}%</button>)}</div></div>
                                    )}
                                </div>
                                <div className="field"><label>Toelichting</label><input value={r.toelichting} onChange={(e) => zetRegel(i, { toelichting: e.target.value })} placeholder={r.soort === 'artikel' ? 'vlees in ovenschaaltjes' : 'drie gangen, verrassing'} /></div>
                            </div>
                        );
                    })}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setRegels((rs) => [...rs, { sleutel: nieuweSleutel(), soort: 'artikel', slug: '', aantal: '', prijs: '', toelichting: '' }])}>Product</Button>
                        <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setRegels((rs) => [...rs, { sleutel: nieuweSleutel(), soort: 'op-maat', naam: '', aantal: '1', prijs: '', btwPct: 9, toelichting: '' }])}>Op maat</Button>
                    </div>
                </section>

                {/* ── Let op ── */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="ws-eyebrow">Let op{letOpAantal > 0 ? ` · ${letOpAantal} met !` : ''}</div>
                    <div className="field"><label>Allergenen</label>
                        <div className="ws-chips">
                            {ALLERGEEN_KEUZES.map((a) => {
                                const aan = allergenen.includes(a);
                                return <button key={a} type="button" className="ws-chip" aria-pressed={aan} onClick={() => setAllergenen((x) => (aan ? x.filter((y) => y !== a) : [...x, a]))}>{aan && <AlertTriangle size={13} />}{a}</button>;
                            })}
                        </div>
                        <input value={andereAllergenen} onChange={(e) => setAndereAllergenen(e.target.value)} placeholder="Andere allergenen, gescheiden door komma’s" style={{ marginTop: 8 }} />
                    </div>
                    <div className="field"><label>Harde regels</label>
                        <textarea rows={3} value={harde} onChange={(e) => setHarde(e.target.value)} placeholder={'geen geitenkaas\ngeen olijven\ngeen alcohol'} />
                        <div className="field-hint">Eén per regel. Komt met een ! in de agenda, de vakjes en op Vandaag.</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                        <div className="field"><label>Vegetarisch</label><input inputMode="numeric" value={vega} onChange={(e) => setVega(e.target.value)} placeholder="0" /></div>
                        <div className="field"><label>Opmerking</label><input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} placeholder="belt nog over de tijd" /></div>
                    </div>
                </section>

                {/* ── Afrekenen ── */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="ws-eyebrow">Afrekenen</div>
                    <div className="ws-chips">
                        <button type="button" className="ws-chip" aria-pressed={inDeKassa} onClick={() => setInDeKassa((x) => !x)}><Wallet size={14} />Afrekenen in de kassa bij het afhalen</button>
                    </div>
                    <div className="field-hint">
                        {inDeKassa
                            ? 'Op de afhaaldag staat de bon in de kassa en vraagt de kassa het hele bedrag.'
                            : 'Factuur of al betaald: de bon staat op de afhaaldag in de kassa om af te vinken, maar de kassa vraagt geen geld.'}
                    </div>
                </section>
            </div>
        </Drawer>
    );
}
