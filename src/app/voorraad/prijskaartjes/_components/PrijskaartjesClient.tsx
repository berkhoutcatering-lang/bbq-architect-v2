'use client';

/**
 * Prijskaartjes — links de producten uit de winkelvoorraad, rechts het
 * kaartje zoals het in de houder staat en het A4-vel. Overgenomen uit het
 * losse systeempje van Mathijs; de lijst komt nu uit BBQ Architect en de prijs
 * is de winkelprijs van het product (opslaan zet hem daar).
 *
 * Zonder prijs komt een kaartje niet op het vel. Printen op 100 % /
 * werkelijke grootte, anders past het kaartje niet in de gleuf.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bitter, Barlow_Semi_Condensed } from 'next/font/google';
import { FileDown, Save, Search } from 'lucide-react';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import {
    A4_H, A4_W, CARD_W, INHOUD_EENHEDEN, PER_VEL, SOORTEN, aantalVellen, inhoudTekst, kaartjesVoorPrint, kanPrinten,
    tekenKaartje, tekenVel, type InhoudEenheid, type Kaartje, type Letters,
} from '@/lib/winkel/prijskaartje';
import { bewaarPrijskaartjes } from '../actions';

const bitter = Bitter({ subsets: ['latin'], weight: ['500', '700', '800'], style: ['normal', 'italic'], display: 'swap' });
const barlow = Barlow_Semi_Condensed({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });
const LETTERS: Letters = { display: bitter.style.fontFamily, ui: barlow.style.fontFamily };

export interface KaartjeRegel {
    kaartje: Kaartje;
    productNaam: string;
    voorraad: number | null;
    eenheid: 'stuk' | 'gram';
    bewaard: boolean;
}

const EENHEID_TEKST: Record<InhoudEenheid, string> = { cl: 'cl', ml: 'ml', l: 'liter', g: 'gram', kg: 'kg', los: 'los (prijs per 100 g)' };
const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' };

const leesGetal = (s: string): number | null => {
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};
const prijsInvoer = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','));

function lettersKlaar(): Promise<void> {
    if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
    return Promise.all([
        document.fonts.load(`800 40px ${LETTERS.display}`), document.fonts.load(`700 40px ${LETTERS.display}`),
        document.fonts.load(`italic 500 40px ${LETTERS.display}`),
        document.fonts.load(`600 40px ${LETTERS.ui}`), document.fonts.load(`500 40px ${LETTERS.ui}`),
    ]).then(() => undefined, () => undefined);
}

export default function PrijskaartjesClient({ regels }: { regels: KaartjeRegel[] }) {
    const router = useRouter();
    const showToast = useToast();
    const [lijst, setLijst] = useState<Kaartje[]>(() => regels.map((r) => r.kaartje));
    const [prijzen, setPrijzen] = useState<Record<string, string>>(() => Object.fromEntries(regels.map((r) => [r.kaartje.productId, prijsInvoer(r.kaartje.prijsCents)])));
    const [gewijzigd, setGewijzigd] = useState<Set<string>>(new Set());
    const [actief, setActief] = useState<string | null>(regels[0]?.kaartje.productId ?? null);
    const [zoek, setZoek] = useState('');
    const [vel, setVel] = useState(0);
    const [bezig, setBezig] = useState<'opslaan' | 'pdf' | null>(null);
    const [letters, setLetters] = useState(false);
    const kaartCanvas = useRef<HTMLCanvasElement>(null);
    const velCanvas = useRef<HTMLCanvasElement>(null);

    // Na opslaan (router.refresh) komen er nieuwe regels van de server.
    useEffect(() => {
        setLijst(regels.map((r) => r.kaartje));
        setPrijzen(Object.fromEntries(regels.map((r) => [r.kaartje.productId, prijsInvoer(r.kaartje.prijsCents)])));
        setGewijzigd(new Set());
    }, [regels]);
    useEffect(() => { lettersKlaar().then(() => setLetters(true)); }, []);

    const info = useMemo(() => new Map(regels.map((r) => [r.kaartje.productId, r])), [regels]);
    const zichtbaar = useMemo(() => {
        const z = zoek.trim().toLowerCase();
        return z ? lijst.filter((k) => `${k.naam} ${k.maker} ${k.soort} ${info.get(k.productId)?.productNaam ?? ''}`.toLowerCase().includes(z)) : lijst;
    }, [lijst, zoek, info]);
    const opVel = useMemo(() => kaartjesVoorPrint(lijst), [lijst]);
    const vellen = aantalVellen(opVel.length);
    const zonderPrijs = lijst.filter((k) => k.prijsCents == null).length;
    const huidig = lijst.find((k) => k.productId === actief) ?? lijst[0] ?? null;

    useEffect(() => { setVel((v) => Math.min(v, vellen - 1)); }, [vellen]);

    // Tekenen: het kaartje met de gleuf, en het vel dat open staat.
    useEffect(() => {
        const kc = kaartCanvas.current?.getContext('2d');
        if (kc && kaartCanvas.current) {
            kc.clearRect(0, 0, kaartCanvas.current.width, kaartCanvas.current.height);
            if (huidig) tekenKaartje(kc, huidig, 0, 0, kaartCanvas.current.width / CARD_W, LETTERS, { toonGleuf: true });
        }
        const vc = velCanvas.current?.getContext('2d');
        if (vc && velCanvas.current) tekenVel(vc, opVel.slice(vel * PER_VEL, (vel + 1) * PER_VEL), velCanvas.current.width / A4_W, LETTERS);
    }, [huidig, opVel, vel, letters]);

    const wijzig = useCallback((id: string, deel: Partial<Kaartje>) => {
        setLijst((l) => l.map((k) => (k.productId === id ? { ...k, ...deel } : k)));
        setGewijzigd((g) => new Set(g).add(id));
        setActief(id);
    }, []);

    const zetPrijs = (id: string, tekst: string) => {
        setPrijzen((p) => ({ ...p, [id]: tekst }));
        const n = tekst.trim() === '' ? null : leesGetal(tekst);
        if (tekst.trim() !== '' && (n == null || n < 0)) return;
        wijzig(id, { prijsCents: n == null ? null : Math.round(n * 100) });
    };

    async function opslaan() {
        const teBewaren = lijst.filter((k) => gewijzigd.has(k.productId));
        if (!teBewaren.length) return;
        if (teBewaren.some((k) => !k.naam.trim())) { showToast('Elk kaartje heeft een naam nodig', 'warning'); return; }
        setBezig('opslaan');
        const r = await bewaarPrijskaartjes(teBewaren);
        setBezig(null);
        if ('error' in r) { showToast(r.error === 'unauthorized' ? 'Log opnieuw in om op te slaan' : r.error, 'error'); return; }
        showToast(`${r.data.bewaard} kaartje${r.data.bewaard === 1 ? '' : 's'} opgeslagen`, 'success');
        router.refresh();
    }

    async function maakPdf() {
        if (!opVel.length) { showToast('Er staat nog geen kaartje met een prijs op het vel', 'warning'); return; }
        setBezig('pdf');
        try {
            await lettersKlaar();
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
            const s = 12; // ≈ 305 dpi
            const cv = document.createElement('canvas');
            cv.width = Math.round(A4_W * s); cv.height = Math.round(A4_H * s);
            const ctx = cv.getContext('2d');
            if (!ctx) throw new Error('canvas');
            for (let i = 0; i < vellen; i++) {
                tekenVel(ctx, opVel.slice(i * PER_VEL, (i + 1) * PER_VEL), s, LETTERS);
                if (i > 0) doc.addPage('a4', 'portrait');
                doc.addImage(cv.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, A4_W, A4_H, undefined, 'FAST');
            }
            doc.save(`${new Date().toISOString().slice(0, 10)} - prijskaartjes - winkel.pdf`);
            showToast('PDF gedownload. Print op 100 %.', 'success');
        } catch {
            showToast('De PDF maken lukte niet', 'error');
        } finally {
            setBezig(null);
        }
    }

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 48px', maxWidth: 1180, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Prijskaartjes</h1>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
                        Kaartjes van 85 × 55 mm, de maat van een visitekaartje. De onderste 7 mm valt in de gleuf. Tien per A4.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button variant="ghost" icon={<Save size={14} />} onClick={opslaan} loading={bezig === 'opslaan'} disabled={!gewijzigd.size}>
                        {gewijzigd.size ? `Opslaan (${gewijzigd.size})` : 'Opgeslagen'}
                    </Button>
                    <Button icon={<FileDown size={14} />} onClick={maakPdf} loading={bezig === 'pdf'} disabled={!opVel.length}>
                        PDF voor printen ({vellen} {vellen === 1 ? 'vel' : 'vellen'})
                    </Button>
                </div>
            </div>

            {zonderPrijs > 0 && (
                <div role="status" style={{ ...kaart, padding: '10px 14px', marginBottom: 16, fontSize: 13, background: 'rgba(196,163,90,.12)', borderColor: 'rgba(196,163,90,.4)' }}>
                    {zonderPrijs} van de {lijst.length} producten hebben nog geen winkelprijs. Vul hem hier in: opslaan zet hem ook bij het product. Zonder prijs komt een kaartje niet op het vel.
                </div>
            )}

            <div className="prijskaartjes-raster" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
                <section aria-label="Productlijst" style={{ display: 'grid', gap: 10, minWidth: 0 }}>
                    <label className="kf-field" style={{ position: 'relative' }}>
                        <span className="sr-only">Zoeken</span>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--muted)' }} aria-hidden />
                        <input className="kf-input" type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={`Zoek in ${lijst.length} producten`} style={{ paddingLeft: 32 }} />
                    </label>
                    {!lijst.length && <div className="kf-empty">Er staan nog geen actieve producten in de winkelvoorraad.</div>}
                    {zichtbaar.map((k) => {
                        const r = info.get(k.productId);
                        const id = k.productId;
                        const inh = inhoudTekst(k);
                        return (
                            <article key={id} onFocus={() => setActief(id)} onClick={() => setActief(id)}
                                style={{ ...kaart, padding: 12, display: 'grid', gap: 8, borderColor: id === huidig?.productId ? 'var(--brand-gold, #c4a35a)' : 'var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: 15, minWidth: 0, overflowWrap: 'anywhere' }}>{k.naam || 'Zonder naam'}</span>
                                    <span style={{ fontSize: 11.5, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                                        {r?.voorraad == null ? 'nog niet geteld' : `${r.voorraad} ${r.eenheid === 'gram' ? 'g' : 'op voorraad'}`}
                                        {gewijzigd.has(id) ? ' · niet opgeslagen' : r?.bewaard ? '' : ' · voorstel'}
                                    </span>
                                </div>
                                <div className="prijskaartjes-velden">
                                    <Veld id={`soort-${id}`} label="Soort" breed={2}>
                                        <input id={`soort-${id}`} className="kf-input" list="prijskaartjes-soorten" value={k.soort} onChange={(e) => wijzig(id, { soort: e.target.value })} />
                                    </Veld>
                                    <Veld id={`naam-${id}`} label="Naam" breed={4}>
                                        <input id={`naam-${id}`} className="kf-input" value={k.naam} onChange={(e) => wijzig(id, { naam: e.target.value })} />
                                    </Veld>
                                    <Veld id={`maker-${id}`} label="Brouwer / maker" breed={3}>
                                        <input id={`maker-${id}`} className="kf-input" value={k.maker} onChange={(e) => wijzig(id, { maker: e.target.value })} />
                                    </Veld>
                                    <Veld id={`details-${id}`} label="Stijl · alcohol" breed={3}>
                                        <input id={`details-${id}`} className="kf-input" value={k.details} onChange={(e) => wijzig(id, { details: e.target.value })} />
                                    </Veld>
                                    <Veld id={`inhoud-${id}`} label="Inhoud" breed={2}>
                                        <input id={`inhoud-${id}`} className="kf-input" inputMode="decimal" value={k.inhoud == null ? '' : String(k.inhoud).replace('.', ',')}
                                            onChange={(e) => { const n = e.target.value.trim() === '' ? null : leesGetal(e.target.value); if (e.target.value.trim() === '' || (n != null && n >= 0)) wijzig(id, { inhoud: n }); }} />
                                    </Veld>
                                    <Veld id={`eenheid-${id}`} label="Eenheid" breed={2}>
                                        <select id={`eenheid-${id}`} className="kf-input" value={k.inhoudEenheid} onChange={(e) => wijzig(id, { inhoudEenheid: e.target.value as InhoudEenheid })}>
                                            {INHOUD_EENHEDEN.map((e) => <option key={e} value={e}>{EENHEID_TEKST[e]}</option>)}
                                        </select>
                                    </Veld>
                                    <Veld id={`prijs-${id}`} label={k.inhoudEenheid === 'los' ? 'Prijs € per 100 g' : 'Prijs €'} breed={2}>
                                        <input id={`prijs-${id}`} className="kf-input" inputMode="decimal" value={prijzen[id] ?? ''} placeholder="geen prijs"
                                            onChange={(e) => zetPrijs(id, e.target.value)} style={{ fontVariantNumeric: 'tabular-nums' }} />
                                    </Veld>
                                    <Veld id={`bij-${id}`} label="Lekker bij (mag leeg)" breed={4}>
                                        <input id={`bij-${id}`} className="kf-input" value={k.bij} onChange={(e) => wijzig(id, { bij: e.target.value })} />
                                    </Veld>
                                    <Veld id={`aantal-${id}`} label="Aantal" breed={2}>
                                        <input id={`aantal-${id}`} className="kf-input" inputMode="numeric" value={String(k.aantal)}
                                            onChange={(e) => { const n = Math.round(leesGetal(e.target.value) ?? 0); if (n >= 1 && n <= 50) wijzig(id, { aantal: n }); }} />
                                    </Veld>
                                </div>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' }}>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {[inh.onderPrijs, inh.links].filter(Boolean).join(' · ') || 'Geen inhoud ingevuld'}
                                        {k.prijsCents == null ? ' · geen prijs, niet op het vel' : ''}
                                    </span>
                                    <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--text)' }}>
                                        <input type="checkbox" checked={k.printen} onChange={(e) => wijzig(id, { printen: e.target.checked })} /> in PDF
                                    </label>
                                </div>
                            </article>
                        );
                    })}
                </section>

                <aside aria-label="Voorbeeld" className="prijskaartjes-voorbeeld" style={{ display: 'grid', gap: 14 }}>
                    <div style={{ ...kaart, padding: 14, display: 'grid', gap: 10 }}>
                        <div className="kf-eyebrow">Kaartje</div>
                        <canvas ref={kaartCanvas} width={1020} height={660} aria-label="Voorbeeld van het gekozen kaartje"
                            style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 3, boxShadow: '0 6px 18px rgba(0,0,0,.18)' }} />
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            Gearceerd: valt in de houder.{huidig && !kanPrinten(huidig) ? ' Dit kaartje komt niet op het vel (geen prijs, geen naam of niet aangevinkt).' : ''}
                        </div>
                    </div>
                    <div style={{ ...kaart, padding: 14, display: 'grid', gap: 10 }}>
                        <div className="kf-eyebrow">A4-vel</div>
                        <canvas ref={velCanvas} width={630} height={891} aria-label="Voorbeeld van het A4-vel" style={{ display: 'block', width: '100%', height: 'auto', border: '1px solid var(--border)' }} />
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Button variant="ghost" size="sm" onClick={() => setVel((v) => Math.max(0, v - 1))} disabled={vel === 0} aria-label="Vorig vel">‹</Button>
                            <span style={{ fontSize: 12.5, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                                Vel {vel + 1} van {vellen} · {opVel.length} kaartje{opVel.length === 1 ? '' : 's'}
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => setVel((v) => Math.min(vellen - 1, v + 1))} disabled={vel >= vellen - 1} aria-label="Volgend vel">›</Button>
                        </div>
                        <ol style={{ margin: 0, paddingLeft: '1.1em', color: 'var(--muted)', fontSize: 12.5, display: 'grid', gap: 4 }}>
                            <li>Print op 100 % / werkelijke grootte, niet &ldquo;passend maken&rdquo;.</li>
                            <li>Karton van 250–300 g/m² staat het stevigst.</li>
                            <li>Snijd langs de grijze lijnen, kaartje met de tekst naar voren in de gleuf.</li>
                        </ol>
                    </div>
                </aside>
            </div>

            <datalist id="prijskaartjes-soorten">{SOORTEN.map((s) => <option key={s} value={s} />)}</datalist>
            <style>{`
                .prijskaartjes-raster { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
                .prijskaartjes-voorbeeld { position: sticky; top: 12px; }
                .prijskaartjes-velden { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
                @media (max-width: 860px) {
                    .prijskaartjes-raster { grid-template-columns: minmax(0, 1fr); }
                    .prijskaartjes-voorbeeld { position: static; order: -1; }
                }
                @media (max-width: 520px) {
                    .prijskaartjes-velden { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                    .prijskaartjes-velden > [data-breed="3"], .prijskaartjes-velden > [data-breed="4"] { grid-column: span 2 !important; }
                    .prijskaartjes-velden > [data-breed="2"] { grid-column: span 1 !important; }
                }
            `}</style>
        </div>
    );
}

function Veld({ id, label, breed, children }: { id: string; label: string; breed: number; children: React.ReactNode }) {
    return (
        <div className="kf-field" data-breed={breed} style={{ gridColumn: `span ${breed}`, minWidth: 0, gap: 3 }}>
            <label className="kf-label" htmlFor={id}>{label}</label>
            {children}
        </div>
    );
}
