'use client';

/**
 * Voorraad toevoegen — kies hoe (W2b). Foto of pdf van de factuur, barcode,
 * een verstuurde inkooporder, of met de hand. Alles komt uit op hetzelfde
 * controlescherm; niets gaat de voorraad in voordat je "Klopt, boeken" zegt.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Camera, ChevronRight, FileText, PenLine, ScanBarcode, Truck } from 'lucide-react';
import '@/styles/menu-hub.css';
import { useToast } from '@/components/Toast';
import MultiFormatDropZone, { type ExtractResult } from '@/app/bonnen/_components/MultiFormatDropZone';
import { nieuweOntvangst, ontvangstVanBon, ontvangstVanInkooporder } from './actions';

export interface ConceptRij { id: string; bron: string; leverancier: string | null; factuurnummer: string | null; datum: string | null; wanneer: string; regels: number }
export interface OrderRij { id: string; leverancier: string; verstuurd: string | null; regels: number }

const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' };
const BRON: Record<string, string> = { handmatig: 'Handmatig', foto: 'Foto', pdf: 'Pdf', ubl: 'E-factuur', mail: 'Mail', barcode: 'Barcode', inkooporder: 'Inkooporder' };

function leesAlsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error('Kon bestand niet lezen'));
        r.readAsDataURL(file);
    });
}

export default function OntvangstStart({ concepten, orders, recent, factuurOpen = false }: { concepten: ConceptRij[]; orders: OrderRij[]; recent: ConceptRij[]; factuurOpen?: boolean }) {
    const router = useRouter();
    const toast = useToast();
    const stil = useReducedMotion();
    const [bezig, setBezig] = useState<string | null>(null);
    const [factuur, setFactuur] = useState(factuurOpen);

    async function start(sleutel: string, fn: () => Promise<{ error: string } | { data: { id: string } }>, na = '') {
        setBezig(sleutel);
        try {
            const r = await fn();
            if ('error' in r) { toast(r.error, 'error'); return; }
            router.push(`/voorraad/ontvangst/${r.data.id}${na}`);
        } finally { setBezig(null); }
    }

    /* Uitgelezen: eerst het bestand in het bonnenarchief (voor de boekhouding),
       dan het concept. Een bon die al eens is ingelezen houdt de bonnen-straat tegen. */
    async function uitgelezen(res: ExtractResult, file: File) {
        setBezig('factuur');
        try {
            let bonId: number | null = null;
            const c = await fetch('/api/bonnen/commit', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bon_preview: res.bon_preview, items: res.items_with_suggestions, image_hash: res.image_hash, mime_type: res.mime_type,
                    source_type: res.source_type, ocr_engine: res.ocr_engine, confidence: res.confidence, ai_cost_eur_cents: res.ai_cost_eur_cents,
                    file_data_url: await leesAlsDataUrl(file), file_name: file.name, reconciliation_status: res.reconciliation?.status, ai_passes: res.ai_passes,
                }),
            });
            const cj = await c.json().catch(() => ({}));
            if (typeof cj?.bon_id === 'number') bonId = cj.bon_id;
            const bron = res.source_type === 'ubl_xml' ? 'ubl' : res.source_type === 'pdf' ? 'pdf' : 'foto';
            const r = await ontvangstVanBon({
                bron, bon_id: bonId, image_hash: res.image_hash,
                leverancier_id: res.bon_preview.leverancier_id, leverancier_naam: res.bon_preview.leverancier_naam,
                factuurnummer: (res.bon_preview as { invoice_id?: string }).invoice_id ?? null,
                datum: res.bon_preview.datum, totaal_eur: res.bon_preview.totaal_bedrag || null,
                items: res.items_with_suggestions.map((i) => ({ naam: i.naam, aantal: i.aantal ?? null, unit: i.unit ?? null, prijs: i.prijs ?? null, btw_pct: i.btw_pct ?? null })),
            });
            if ('error' in r) { toast(r.error, 'error'); return; }
            router.push(`/voorraad/ontvangst/${r.data.id}`);
        } finally { setBezig(null); }
    }

    const tegels = [
        { k: 'factuur', icon: Camera, titel: 'Foto of pdf van de factuur', tekst: 'Ook meerdere foto’s van een lange bon, of een e-factuur (UBL).', doe: () => setFactuur(true) },
        { k: 'barcode', icon: ScanBarcode, titel: 'Barcode scannen', tekst: 'Camera op de fles of doos. Onbekend? Dan maak je het product aan.', doe: () => start('barcode', () => nieuweOntvangst({ bron: 'barcode', plek: 'winkel' }), '?scan=1') },
        { k: 'hand', icon: PenLine, titel: 'Met de hand', tekst: 'Product zoeken, aantal, prijs, THT, plek.', doe: () => start('hand', () => nieuweOntvangst({})) },
    ];

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 48px', maxWidth: 820, margin: '0 auto' }}>
            <h1 className="chassis-titel" style={{ margin: '0 0 6px' }}>Ontvangst</h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
                Voorraad erbij, op de manier die nu uitkomt. Je ziet altijd eerst wat er geboekt gaat worden.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
                {tegels.map((t, i) => (
                    <motion.button key={t.k} type="button" onClick={t.doe} disabled={bezig != null}
                        initial={stil ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        style={{ ...kaart, padding: 16, textAlign: 'left', cursor: 'pointer', minHeight: 110, display: 'flex', flexDirection: 'column', gap: 8, borderColor: factuur && t.k === 'factuur' ? 'var(--brand)' : 'var(--border)' }}>
                        <t.icon size={20} style={{ color: 'var(--brand)' }} />
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{bezig === t.k ? 'Even geduld…' : t.titel}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{t.tekst}</span>
                    </motion.button>
                ))}
            </div>

            {factuur && (
                <div style={{ ...kaart, padding: 14, marginBottom: 22 }}>
                    <MultiFormatDropZone
                        variant="sheet"
                        maxBatch={1}
                        onExtracted={(res, file) => { void uitgelezen(res, file); }}
                        onDuplicate={(dup: { duplicate_winkel: string | null; duplicate_datum: string | null }) => toast(`Deze bon is al eens ingelezen${dup.duplicate_winkel ? ` (${dup.duplicate_winkel}${dup.duplicate_datum ? `, ${dup.duplicate_datum}` : ''})` : ''}. Niet nog een keer boeken.`, 'warning')}
                        onError={(m) => toast(m, 'error')}
                    />
                    {bezig === 'factuur' && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>Bon bewaren en regels klaarzetten…</div>}
                </div>
            )}

            {orders.length > 0 && (
                <section style={{ marginBottom: 22 }}>
                    <div className="kf-eyebrow" style={{ marginBottom: 8 }}><Truck size={12} /> Onderweg — inkooporder ontvangen</div>
                    {orders.map((o) => (
                        <button key={o.id} type="button" disabled={bezig != null} onClick={() => start(`order:${o.id}`, () => ontvangstVanInkooporder({ orderId: o.id }))}
                            style={{ ...kaart, width: '100%', marginBottom: 7, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer', minHeight: 56 }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{o.leverancier}</span>
                                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{o.regels} regels{o.verstuurd ? ` · verstuurd ${new Date(o.verstuurd).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}` : ''}</span>
                            </span>
                            <span style={{ fontSize: 12.5, color: 'var(--brand)' }}>{bezig === `order:${o.id}` ? 'Klaarzetten…' : 'Binnen'}</span>
                            <ChevronRight size={15} style={{ color: 'var(--muted)' }} />
                        </button>
                    ))}
                </section>
            )}

            {concepten.length > 0 && <Lijst titel="Nog te controleren" rijen={concepten} />}
            {recent.length > 0 && <Lijst titel="Laatst geboekt" rijen={recent} gedimd />}
        </div>
    );
}

function Lijst({ titel, rijen, gedimd }: { titel: string; rijen: ConceptRij[]; gedimd?: boolean }) {
    return (
        <section style={{ marginBottom: 22 }}>
            <div className="kf-eyebrow" style={{ marginBottom: 8 }}><FileText size={12} /> {titel}</div>
            {rijen.map((c) => (
                <Link key={c.id} href={`/voorraad/ontvangst/${c.id}`}
                    style={{ ...kaart, marginBottom: 7, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', opacity: gedimd ? 0.75 : 1 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>{c.leverancier ?? BRON[c.bron] ?? c.bron}{c.factuurnummer ? ` · ${c.factuurnummer}` : ''}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{BRON[c.bron] ?? c.bron} · {c.regels} regels · {new Date(c.wanneer).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                    <ChevronRight size={15} style={{ color: 'var(--muted)' }} />
                </Link>
            ))}
        </section>
    );
}
