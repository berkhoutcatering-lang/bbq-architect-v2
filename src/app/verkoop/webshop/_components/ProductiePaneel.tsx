'use client';

/**
 * Productie & inpakken van één vakje (Sinterklaas S7). Plan §5.
 *
 * Alleen betaalde orders. Rekenwerk in src/lib/winkel/productie.ts; hier
 * alleen tonen en printen. Print-vriendelijk: afvinkvakjes en een
 * controleveld per order zijn bedoeld voor papier (de lijst gaat mee de
 * inpaktafel op), niet als opgeslagen status.
 */
import { useEffect, useMemo, useState } from 'react';
import { Printer, Tag } from 'lucide-react';
import Button from '@/components/Button';
import { printLabels, usePrinters, werkstationPrinter, kiesPrinterVoorDitApparaat } from '@/lib/labelprinter/client';
import { hoeveelheidTekst, inpaklijst, momentTekst, plankProductie, restTekst, type ProductieArtikel, type ProductieRegel } from '@/lib/winkel/productie';
import Drawer from './Drawer';
import { datumLang, tijdvak, type ArtikelRij, type ComponentRij, type Vakje } from '../_lib/vakjes';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;

interface Props {
    v: Vakje;
    artikelen: ArtikelRij[];
    componenten: ComponentRij[];
    onClose: () => void;
    melding: Melding;
}

/** Wat het rekenwerk nodig heeft, uit de regels van het vakje en de componenten. */
export function productieRegels(v: Vakje, componenten: ComponentRij[]): ProductieRegel[] {
    const perRegel = new Map<number, ComponentRij[]>();
    for (const c of componenten) {
        const l = perRegel.get(c.order_regel_id) ?? [];
        l.push(c);
        perRegel.set(c.order_regel_id, l);
    }
    return v.regels.filter((x) => x.order.status === 'betaald').map(({ regel, order }) => ({
        regel: { id: regel.id, artikel_id: regel.artikel_id, slug: regel.slug, naam: regel.naam, aantal: regel.aantal, alcohol: Boolean(regel.alcohol) },
        order: { id: order.id, nummer: order.nummer, contact_naam: order.contact_naam, betaalwijze: order.betaalwijze, nu_te_betalen_cents: order.nu_te_betalen_cents, rest_cents: order.rest_cents, rest_betaald_at: order.rest_betaald_at },
        componenten: (perRegel.get(regel.id) ?? []).map((c) => ({ product_id: c.product_id, slot_type: c.slot_type, naam: c.naam, hoeveelheid: c.hoeveelheid, eenheid: c.eenheid })),
    }));
}

const naarProductieArtikel = (a: ArtikelRij): ProductieArtikel => ({ id: a.id, naam: a.naam, slug: a.slug, schaal_verdeling: a.schaal_verdeling, doos_klein_max: a.doos_klein_max, doos_groot: a.doos_groot, alcohol: a.alcohol });

/* ── Printen ───────────────────────────────────────────────────────────────── */

/** Kiest de printer van dit werkstation; één knop per order. */
export function useEtiketPrinter() {
    const { printers, laden } = usePrinters();
    const [printerId, setPrinterId] = useState<string | null>(null);
    useEffect(() => {
        if (printerId || laden) return;
        const p = werkstationPrinter(printers);
        if (p) setPrinterId(p.id);
    }, [printers, laden, printerId]);
    const actief = useMemo(() => printers.filter((p) => p.actief), [printers]);
    return { printers: actief, printerId, setPrinterId: (id: string | null) => { setPrinterId(id); kiesPrinterVoorDitApparaat(id); }, laden };
}

export function EtiketKnop({ orderId, regelIds, printerId, aantal, melding, size = 'sm' }: { orderId: number; regelIds?: number[]; printerId: string | null; aantal: number; melding: Melding; size?: 'sm' | 'default' }) {
    const [bezig, setBezig] = useState(false);
    async function print() {
        if (!printerId) { melding('Kies eerst een printer (Instellingen → Printers).', 'error'); return; }
        setBezig(true);
        try {
            const r = await printLabels({ soort: 'winkel_etiket', printerId, orderId, regelIds: regelIds ?? null });
            if (r.uitkomst.status === 'success') melding(`${r.job.aantal_labels} ${r.job.aantal_labels === 1 ? 'etiket' : 'etiketten'} geprint`, 'success');
            else melding(r.tekst ?? 'Printen mislukt', 'error');
            for (const w of r.waarschuwingen) melding(w, 'info');
        } catch (e) {
            melding(e instanceof Error ? e.message : 'Printen mislukt', 'error');
        } finally { setBezig(false); }
    }
    return <Button variant="ghost" size={size} icon={<Tag size={13} />} loading={bezig} onClick={print} title={printerId ? 'Etiketten printen op de Zebra' : 'Geen printer gekozen'}>{aantal} {aantal === 1 ? 'etiket' : 'etiketten'}</Button>;
}

/* ── Het paneel ────────────────────────────────────────────────────────────── */

export default function ProductiePaneel({ v, artikelen, componenten, onClose, melding }: Props) {
    const rijen = useMemo(() => productieRegels(v, componenten), [v, componenten]);
    const artikelOpId = useMemo(() => new Map(artikelen.map((a) => [a.id, a])), [artikelen]);
    const planken = useMemo(() => artikelen.filter((a) => a.schaal_verdeling && rijen.some((r) => r.regel.artikel_id === a.id)).map((a) => plankProductie(naarProductieArtikel(a), rijen)), [artikelen, rijen]);
    const pakketten = useMemo(() => inpaklijst(artikelen.map(naarProductieArtikel), rijen), [artikelen, rijen]);
    const { printers, printerId, setPrinterId } = useEtiketPrinter();
    const moment = v.moment ? momentTekst(v.moment) : null;
    const zonderComponenten = rijen.filter((r) => r.componenten.length === 0 && !artikelOpId.get(r.regel.artikel_id)?.gerecht_id);
    /* Eén etiket per pakket, één per schaal. */
    const totaalEtiketten = planken.reduce((s, p) => s + p.schalen.totaal, 0) + pakketten.reduce((s, a) => s + a.stuks, 0);

    return (
        <Drawer title={`Productie & inpakken · ${datumLang(v.datum)}`} subtitle={`${v.moment && tijdvak(v.moment) ? `${tijdvak(v.moment)} · ` : ''}${v.orders.filter((o) => o.status === 'betaald').length} betaalde orders · ${rijen.length} regels`} onClose={onClose} width={720}
            footer={<>
                <Button variant="ghost" icon={<Printer size={14} />} onClick={() => window.print()}>Lijst printen</Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                    Zebra:
                    <select value={printerId ?? ''} onChange={(e) => setPrinterId(e.target.value || null)} style={{ height: 32 }}>
                        <option value="">— geen printer —</option>
                        {printers.map((p) => <option key={p.id} value={p.id}>{p.naam} · {p.label_breedte_mm}×{p.label_hoogte_mm} mm</option>)}
                    </select>
                    <span>{totaalEtiketten} etiketten in totaal</span>
                </div>
            </>}>
            <div className="ws-productie" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {rijen.length === 0 && <div className="ws-leeg">Nog geen betaalde orders in dit vakje.</div>}
                {zonderComponenten.length > 0 && (
                    <div className="ws-tip" style={{ color: 'var(--ws-warn)' }}>{zonderComponenten.length} {zonderComponenten.length === 1 ? 'regel heeft' : 'regels hebben'} geen inhoud vastgelegd (artikel zonder slots): {[...new Set(zonderComponenten.map((r) => r.regel.naam))].join(', ')}. Die staan alleen als aantallen op de lijst.</div>
                )}

                {planken.map((p) => (
                    <section key={p.artikel.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div className="ws-sectie-kop">{p.artikel.naam} · productielijst</div>
                            <div className="ws-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{moment ?? datumLang(v.datum)}</div>
                        </div>
                        <div className="ws-tegels">
                            <div className="ws-tegel"><b>{p.personen}</b><span>personen · {p.orders} {p.orders === 1 ? 'order' : 'orders'}</span></div>
                            <div className="ws-tegel"><b>{p.schalen.groot}</b><span>grote schalen (4–5)</span></div>
                            <div className="ws-tegel"><b>{p.schalen.klein}</b><span>kleine schalen (2–3)</span></div>
                            <div className="ws-tegel"><b>{p.bakjes}</b><span>bakjes (6 per schaal)</span></div>
                        </div>
                        <div className="panel" style={{ padding: 0 }}>
                            <div className="ws-tabel-kop" style={{ gridTemplateColumns: 'minmax(0,2fr) 100px 120px' }}><span>Onderdeel</span><span style={{ textAlign: 'right' }}>Per persoon</span><span style={{ textAlign: 'right' }}>Totaal</span></div>
                            {p.onderdelen.map((o) => (
                                <div key={`${o.slot_type}|${o.naam}`} className="ws-tabel-rij" style={{ gridTemplateColumns: 'minmax(0,2fr) 100px 120px', cursor: 'default', minHeight: 40, padding: '8px 20px' }}>
                                    <span style={{ fontSize: 13 }}>{o.naam}<span style={{ color: 'var(--muted)' }}> · {o.slot_type}</span></span>
                                    <span className="ws-mono" style={{ fontSize: 13, textAlign: 'right', color: 'var(--muted)' }}>{hoeveelheidTekst(o.perPersoon, o.eenheid)}</span>
                                    <span className="ws-mono" style={{ fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{hoeveelheidTekst(o.totaal, o.eenheid)}</span>
                                </div>
                            ))}
                        </div>
                        <div className="ws-eyebrow" style={{ marginTop: 4 }}>Snij- en opmaaklijst per order</div>
                        {p.perOrder.map((o) => (
                            <div key={o.regelId} className="ws-order" style={{ gap: 8 }}>
                                <div className="ws-order-kop">
                                    <div className="ws-order-naam"><span className="ws-print-vink" aria-hidden /> {o.order.contact_naam}<span className="ws-order-nummer">{o.order.nummer}</span>{o.alcohol && <span className="ws-merk ws-merk-warn" style={{ marginLeft: 8 }}>18+</span>}</div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span className="ws-mono" style={{ fontSize: 13 }}>{o.personen} pers. · {o.schalen.map((s) => `${s.schaal.maat === 'groot' ? 'groot' : 'klein'} (${s.schaal.personen})`).join(' + ')}</span>
                                        <EtiketKnop orderId={o.order.id} regelIds={[o.regelId]} printerId={printerId} aantal={o.schalen.length} melding={melding} />
                                    </div>
                                </div>
                                {restTekst(o.order) && <div className="ws-order-wat" style={{ color: 'var(--ws-warn)' }}>{restTekst(o.order)}</div>}
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, o.schalen.length)}, minmax(0,1fr))`, gap: 8 }}>
                                    {o.schalen.map((s, i) => (
                                        <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Schaal {i + 1} · {s.schaal.maat} · {s.schaal.personen} pers.</div>
                                            {s.onderdelen.map((x) => <div key={x.naam} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ color: 'var(--muted)' }}>{x.naam}</span><span className="ws-mono">{hoeveelheidTekst(x.hoeveelheid, x.eenheid)}</span></div>)}
                                        </div>
                                    ))}
                                </div>
                                <div className="ws-controle">Gecontroleerd door: ________________</div>
                            </div>
                        ))}
                    </section>
                ))}

                {pakketten.length > 0 && (
                    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div className="ws-sectie-kop">Inpaklijst · {pakketten.reduce((s, a) => s + a.stuks, 0)} pakketten</div>
                            <div className="ws-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{moment ?? datumLang(v.datum)} · per soort, in series</div>
                        </div>
                        {pakketten.map((a) => (
                            <div key={a.artikel.id} className="panel" style={{ padding: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: 15, fontWeight: 600 }}>{a.stuks} × {a.artikel.naam}{a.artikel.alcohol && <span className="ws-merk ws-merk-warn" style={{ marginLeft: 8 }}>18+</span>}</div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.orders.length} {a.orders.length === 1 ? 'order' : 'orders'}</div>
                                </div>
                                {a.inhoudPerStuk && (
                                    <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                                        <span style={{ color: 'var(--muted)' }}>Per pakket:</span>
                                        {a.inhoudPerStuk.map((c, i) => <span key={i}><b className="ws-mono">{hoeveelheidTekst(c.hoeveelheid, c.eenheid)}</b> {c.naam}</span>)}
                                    </div>
                                )}
                                {a.orders.map((o) => (
                                    <div key={o.regelId} className="ws-tabel-rij" style={{ gridTemplateColumns: '24px minmax(0,1.4fr) minmax(0,2fr) auto', cursor: 'default', alignItems: 'start' }}>
                                        <span className="ws-print-vink" aria-hidden />
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 500 }}>{o.order.contact_naam}</div>
                                            <div className="ws-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{o.order.nummer} · {o.aantal} ×{restTekst(o.order) ? ` · ${restTekst(o.order)}` : ''}</div>
                                        </div>
                                        <div style={{ fontSize: 12, color: a.inhoudPerStuk ? 'var(--muted)' : 'var(--text)' }}>
                                            {a.inhoudPerStuk ? 'zelfde inhoud' : o.inhoudPerStuk.map((c) => `${hoeveelheidTekst(c.hoeveelheid, c.eenheid)} ${c.naam}`).join(' · ')}
                                            <div className="ws-controle" style={{ marginTop: 4 }}>Controle: ________</div>
                                        </div>
                                        <EtiketKnop orderId={o.order.id} regelIds={[o.regelId]} printerId={printerId} aantal={o.aantal} melding={melding} />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </Drawer>
    );
}
