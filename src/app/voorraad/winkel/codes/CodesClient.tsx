'use client';

/**
 * Streepjescodes koppelen met de USB-scanner (Netum NT-S6: typt de code en
 * daarna Enter). Links de lijst, rechts het scanvak.
 *
 * Werkwijze: tik een product → het scanvak krijgt de focus → scan. De code
 * wordt gecontroleerd en opgeslagen zonder extra knop; daarna springt de
 * keuze naar het volgende product zonder code, zodat je een krat achter
 * elkaar doet. Een fout kiest niets anders: je scant gewoon opnieuw.
 *
 * Tijdens het opslaan van de ene code telt een volgende Enter niet mee: anders
 * zou die code op het vorige product kunnen landen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Search } from 'lucide-react';
import '@/styles/menu-hub.css';
import '@/styles/winkel.css';
import Button from '@/components/Button';
import Panel from '@/components/chassis/Panel';
import { controleerEan, eanVarianten } from '@/lib/winkel/ean';
import { volgendeNa } from '@/lib/winkel/streepjescodes';
import { koppelStreepjescode } from '../actions';

export interface CodeProduct {
    id: string;
    naam: string;
    type: string;
    ean: string | null;
    /** De kassa vindt dit product via zijn code (een los artikel op de Toonbank). */
    opKassa: boolean;
}

type Weergave = 'zonder' | 'met';

interface Melding {
    soort: 'goed' | 'fout' | 'info';
    tekst: string;
    extra?: string;
    /** Na een geslaagde koppeling: meteen terugdraaien. */
    ongedaan?: { productId: string; vorige: string | null };
    /** Bij een dubbele code: naar het product dat hem al heeft. */
    naar?: { id: string; naam: string };
}

const NIET_OP_KASSA = 'Dit product staat nog niet los op de kassa, dus de kassa herkent de code nog niet.';

export default function CodesClient({ producten: begin }: { producten: CodeProduct[] }) {
    const [producten, setProducten] = useState(begin);
    const [weergave, setWeergave] = useState<Weergave>('zonder');
    const [soort, setSoort] = useState<string | null>(null);
    const [zoek, setZoek] = useState('');
    const [gekozenId, setGekozenId] = useState<string | null>(null);
    const [invoer, setInvoer] = useState('');
    const [melding, setMelding] = useState<Melding | null>(null);
    const [bezig, setBezig] = useState(false);
    const veld = useRef<HTMLInputElement>(null);

    const zonder = producten.filter((p) => !p.ean).length;
    const inWeergave = producten.filter((p) => (weergave === 'zonder' ? !p.ean : !!p.ean));
    const soorten = useMemo(() => {
        const m = new Map<string, number>();
        for (const p of inWeergave) m.set(p.type, (m.get(p.type) ?? 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl'));
    }, [inWeergave]);
    const z = zoek.trim().toLowerCase();
    const lijst = inWeergave.filter((p) => (!soort || p.type === soort) && (!z || p.naam.toLowerCase().includes(z) || (p.ean ?? '').includes(z)));
    const gekozen = producten.find((p) => p.id === gekozenId) ?? null;

    /* Een gekozen product = het scanvak heeft de focus. */
    useEffect(() => { if (gekozenId) veld.current?.focus(); }, [gekozenId]);

    /* Scan je terwijl de focus ergens anders staat (op een knop in de lijst),
       dan gaan de cijfers alsnog naar het scanvak. */
    useEffect(() => {
        const opToets = (e: KeyboardEvent) => {
            if (!gekozenId || e.ctrlKey || e.metaKey || e.altKey || !/^\d$/.test(e.key)) return;
            const doel = e.target as HTMLElement | null;
            if (doel && (doel.tagName === 'INPUT' || doel.tagName === 'TEXTAREA' || doel.tagName === 'SELECT' || doel.isContentEditable)) return;
            veld.current?.focus();
        };
        window.addEventListener('keydown', opToets, true);
        return () => window.removeEventListener('keydown', opToets, true);
    }, [gekozenId]);

    function kies(id: string | null) {
        setGekozenId(id);
        setInvoer('');
    }

    function zetCodeLokaal(productId: string, ean: string | null) {
        setProducten((lijstNu) => lijstNu.map((p) => (p.id === productId ? { ...p, ean } : p)));
    }

    async function verwerk(waarde: string) {
        setInvoer('');
        if (bezig) {
            setMelding({ soort: 'fout', tekst: 'De vorige code wordt nog opgeslagen. Scan deze nog een keer.' });
            return;
        }
        const c = controleerEan(waarde);
        if (!gekozen) {
            /* Zonder gekozen product: zeggen bij welk product de code hoort. */
            if (c.ok === false) { setMelding({ soort: 'fout', tekst: c.fout }); return; }
            const van = producten.find((p) => p.ean && eanVarianten(c.code).includes(p.ean));
            setMelding(van
                ? { soort: 'info', tekst: `Deze code hoort bij ${van.naam}.`, naar: { id: van.id, naam: van.naam } }
                : { soort: 'info', tekst: `Code ${c.code} hoort nog bij geen product. Tik eerst het product aan en scan dan.` });
            return;
        }
        if (c.ok === false) { setMelding({ soort: 'fout', tekst: c.fout }); veld.current?.focus(); return; }

        const product = gekozen;
        const lijstVoor = lijst;
        setBezig(true);
        try {
            const r = await koppelStreepjescode({ productId: product.id, ean: c.code });
            if ('error' in r) {
                setMelding({ soort: 'fout', tekst: r.error === 'unauthorized' ? 'Je bent uitgelogd. Log opnieuw in.' : 'Opslaan lukte niet. Probeer het nog een keer.' });
                return;
            }
            const u = r.data;
            if (u.ok === false) {
                setMelding({ soort: 'fout', tekst: u.fout, naar: u.bijProduct });
                return;
            }
            zetCodeLokaal(product.id, u.ean);
            const vervangen = u.vorige && u.vorige !== u.ean;
            setMelding({
                soort: 'goed',
                tekst: vervangen ? `Vervangen: ${u.product.naam} · ${u.ean} (was ${u.vorige})` : `Gekoppeld: ${u.product.naam} · ${u.ean}`,
                extra: product.opKassa ? undefined : NIET_OP_KASSA,
                ongedaan: { productId: product.id, vorige: u.vorige },
            });
            if (weergave === 'zonder') {
                const metCode = new Set(producten.filter((p) => p.ean).map((p) => p.id));
                const volgende = volgendeNa(lijstVoor, product.id, metCode);
                kies(volgende);
                if (!volgende) setMelding((m) => m && { ...m, extra: [m.extra, 'Dit was het laatste product in deze lijst.'].filter(Boolean).join(' ') });
            }
        } finally {
            setBezig(false);
        }
    }

    async function zetTerug(productId: string, ean: string | null, tekst: string) {
        if (bezig) return;
        setBezig(true);
        try {
            const r = await koppelStreepjescode({ productId, ean });
            if ('error' in r) { setMelding({ soort: 'fout', tekst: 'Dat lukte niet. Probeer het nog een keer.' }); return; }
            const d = r.data;
            if (d.ok === false) { setMelding({ soort: 'fout', tekst: d.fout }); return; }
            zetCodeLokaal(productId, d.ean);
            setMelding({ soort: 'info', tekst });
            kies(productId);
        } finally {
            setBezig(false);
        }
    }

    function gaNaar(p: { id: string }) {
        const doel = producten.find((x) => x.id === p.id);
        if (!doel) return;
        setWeergave(doel.ean ? 'met' : 'zonder');
        setSoort(null);
        setZoek('');
        kies(doel.id);
        setMelding(null);
    }

    return (
        <div className="wk-pagina">
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Streepjescodes koppelen</h1>
                    <div className="wk-onder">Tik een product aan en scan de code. Daarna gaat hij vanzelf naar het volgende product.</div>
                </div>
                <div className="wk-codes-teller" aria-live="polite">
                    {zonder === 0 ? 'Alles heeft een code' : <>Nog <strong>{zonder}</strong> zonder code</>}
                </div>
            </div>

            <div className="wk-codes">
                <div className="wk-codes-scan">
                    <Panel title={gekozen ? gekozen.naam : 'Scannen'}>
                        {gekozen ? (
                            <div className="wk-klein" style={{ marginTop: -6, marginBottom: 12, whiteSpace: 'normal' }}>
                                {gekozen.type}{gekozen.ean ? <> · nu <span className="wk-code">{gekozen.ean}</span></> : ' · nog geen code'}
                                {!gekozen.opKassa && <div style={{ marginTop: 4 }}>{NIET_OP_KASSA}</div>}
                            </div>
                        ) : (
                            <p className="wk-klein" style={{ whiteSpace: 'normal', marginTop: -6 }}>Kies een product in de lijst. Scan je zonder product, dan zie je bij welk product de code hoort.</p>
                        )}
                        <label className="kf-label" htmlFor="scanvak">{gekozen?.ean ? 'Scan een nieuwe code om hem te vervangen' : 'Code'}</label>
                        <input
                            id="scanvak"
                            ref={veld}
                            className="kf-input wk-scanvak"
                            inputMode="numeric"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={gekozen ? 'Scan nu de code' : 'Scan of typ een code'}
                            value={invoer}
                            onChange={(e) => setInvoer(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                void verwerk(invoer);
                            }}
                        />
                        <div className="wk-klein" style={{ whiteSpace: 'normal' }}>Typen kan ook: de cijfers en dan Enter.</div>

                        {melding && (
                            <div className={`wk-melding wk-melding-${melding.soort}`} role="status">
                                <div>{melding.tekst}</div>
                                {melding.extra && <div className="wk-klein" style={{ whiteSpace: 'normal' }}>{melding.extra}</div>}
                                {(melding.ongedaan || melding.naar) && (
                                    <div className="wk-knoppen" style={{ marginTop: 8 }}>
                                        {melding.ongedaan && (
                                            <Button variant="ghost" size="sm" disabled={bezig}
                                                onClick={() => { const o = melding.ongedaan!; void zetTerug(o.productId, o.vorige, o.vorige ? 'De oude code staat er weer.' : 'De code is weer weggehaald. Scan opnieuw.'); }}>
                                                Ongedaan maken
                                            </Button>
                                        )}
                                        {melding.naar && <Button variant="ghost" size="sm" onClick={() => gaNaar(melding.naar!)}>Naar {melding.naar.naam}</Button>}
                                    </div>
                                )}
                            </div>
                        )}

                        {gekozen?.ean && (
                            <div style={{ marginTop: 14 }}>
                                <Button variant="ghost" size="sm" disabled={bezig}
                                    onClick={() => void zetTerug(gekozen.id, null, `Code weggehaald bij ${gekozen.naam}.`)}>
                                    Code weghalen
                                </Button>
                            </div>
                        )}
                    </Panel>
                </div>

                <div>
                    <div className="wk-keuzes" style={{ marginTop: 0 }}>
                        <Button variant={weergave === 'zonder' ? 'brand' : 'ghost'} size="sm" onClick={() => { setWeergave('zonder'); setSoort(null); }}>Zonder code · {zonder}</Button>
                        <Button variant={weergave === 'met' ? 'brand' : 'ghost'} size="sm" onClick={() => { setWeergave('met'); setSoort(null); }}>Met code · {producten.length - zonder}</Button>
                    </div>
                    <div className="wk-zoek" style={{ marginBottom: 10 }}>
                        <Search size={15} />
                        <input className="kf-input" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={weergave === 'met' ? 'Zoek op naam of code' : 'Zoek op naam'} />
                    </div>
                    {soorten.length > 1 && (
                        <div className="wk-keuzes" style={{ marginTop: 0 }}>
                            <Button variant={soort == null ? 'brand' : 'ghost'} size="sm" onClick={() => setSoort(null)}>Alles · {inWeergave.length}</Button>
                            {soorten.map(([t, n]) => (
                                <Button key={t} variant={soort === t ? 'brand' : 'ghost'} size="sm" onClick={() => setSoort(soort === t ? null : t)}>{t} · {n}</Button>
                            ))}
                        </div>
                    )}

                    {lijst.length > 0 ? (
                        <div className="wk-lijst">
                            {lijst.map((p) => (
                                <button key={p.id} type="button" className="wk-rij wk-code-rij" aria-pressed={p.id === gekozenId} onClick={() => kies(p.id)}>
                                    <Barcode size={16} className="wk-stil" aria-hidden="true" />
                                    <span style={{ minWidth: 0 }}>
                                        <span className="wk-naam" style={{ display: 'block' }}>{p.naam}</span>
                                        <span className="wk-klein" style={{ display: 'block' }}>{p.type}{p.opKassa ? '' : ' · staat nog niet op de kassa'}</span>
                                    </span>
                                    <span className="wk-code wk-stil">{p.ean ?? ''}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="kf-empty">
                            <p>{producten.length === 0 ? 'Er zijn nog geen losse winkelproducten.'
                                : weergave === 'zonder' && zonder === 0 ? 'Elk product heeft een code. Bij "Met code" kun je een code vervangen of weghalen.'
                                : weergave === 'met' && zonder === producten.length ? 'Nog geen product met een code.'
                                : 'Niets gevonden.'}</p>
                        </div>
                    )}
                    <p className="wk-klein" style={{ whiteSpace: 'normal', marginTop: 12 }}>
                        Producten op gewicht en pakjes met een prijssticker van de slager staan hier niet: die hebben geen vaste streepjescode.
                    </p>
                </div>
            </div>
        </div>
    );
}
