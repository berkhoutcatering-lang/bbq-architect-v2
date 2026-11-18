'use client';

/**
 * Pakjes van de slager scannen bij binnenkomst (rechter-lade). Eén THT voor de
 * hele levering (van het A4), dan elk pakje scannen: de scanner typt de code en
 * drukt op Enter. BBQ Architect leest uit de code het artikelnummer en de prijs.
 * Kent hij het nummer nog niet, dan kies je een keer het product. Een
 * verkeerde scan haal je met "Weg" weer weg.
 * Plan: docs/plan-veerbeek-pakjes.md.
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Undo2 } from 'lucide-react';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import Drawer from '@/app/verkoop/webshop/_components/Drawer';
import { formatEur } from '@/lib/format';
import { leesPrijscode } from '@/lib/winkel/prijscode';
import { haalPakjeWeg, meldPakjeBinnen } from '../actions';

export interface PakjeProduct { id: string; naam: string; afdeling: string | null }
interface Gescand { stuk_id: string; naam: string; prijs_cents: number; tht: string; weg: boolean }

const datumKort = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' });

export default function PakjesLade({ producten, onClose }: { producten: PakjeProduct[]; onClose: () => void }) {
    const router = useRouter();
    const toast = useToast();
    const [bezig, start] = useTransition();
    const veld = useRef<HTMLInputElement>(null);
    const [tht, setTht] = useState('');
    const [code, setCode] = useState('');
    const [gescand, setGescand] = useState<Gescand[]>([]);
    const [onbekend, setOnbekend] = useState<{ code: string; nr: string; prijs_cents: number } | null>(null);
    const [zoek, setZoek] = useState('');

    const terugNaarScan = () => setTimeout(() => veld.current?.focus(), 0);

    const meld = (c: string, productId: string | null) => start(async () => {
        const r = await meldPakjeBinnen({ code: c, tht, productId });
        if ('error' in r) { toast(r.error, 'error'); terugNaarScan(); return; }
        const u = r.data;
        if (u.uitkomst === 'binnen') {
            setGescand((g) => [{ stuk_id: u.stuk_id, naam: u.naam, prijs_cents: u.prijs_cents, tht: u.tht, weg: false }, ...g]);
            setOnbekend(null);
            setZoek('');
        } else if (u.uitkomst === 'onbekend') {
            setOnbekend({ code: c, nr: u.nr, prijs_cents: u.prijs_cents });
            return;
        } else if (u.uitkomst === 'controlecijfer') {
            toast('Deze code klopt niet. Scan het pakje opnieuw.', 'error');
        } else {
            toast('Dit is geen prijscode van de slager (die begint met 21).', 'error');
        }
        terugNaarScan();
    });

    const scan = () => {
        const c = code.trim();
        setCode('');
        if (!c) return;
        if (!tht) { toast('Vul eerst de THT van de levering in.', 'error'); return; }
        const p = leesPrijscode(c);
        if (p.ok === false) {
            toast(p.reden === 'controlecijfer' ? 'Deze code klopt niet. Scan het pakje opnieuw.' : 'Dit is geen prijscode van de slager (die begint met 21).', 'error');
            terugNaarScan();
            return;
        }
        meld(c, null);
    };

    const weg = (g: Gescand) => start(async () => {
        const r = await haalPakjeWeg({ stukId: g.stuk_id });
        if ('error' in r || !r.data.weg) { toast('error' in r ? r.error : 'Dit pakje ligt niet meer op voorraad.', 'error'); return; }
        setGescand((l) => l.map((x) => (x.stuk_id === g.stuk_id ? { ...x, weg: true } : x)));
        terugNaarScan();
    });

    const keuzes = useMemo(() => {
        const z = zoek.trim().toLowerCase();
        return producten.filter((p) => !z || p.naam.toLowerCase().includes(z)).slice(0, 8);
    }, [producten, zoek]);

    const binnen = gescand.filter((g) => !g.weg);
    const sluit = () => { if (binnen.length) router.refresh(); onClose(); };

    return (
        <Drawer title="Pakjes scannen" subtitle="Scan elk pakje van de slager. De prijs komt uit de streepjescode." width={560} onClose={sluit}
            footer={<Button variant="ghost" onClick={sluit}>Klaar{binnen.length ? ` · ${binnen.length} ${binnen.length === 1 ? 'pakje' : 'pakjes'} binnen` : ''}</Button>}>
            <div style={{ display: 'grid', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                    <span className="kf-eyebrow">THT van deze levering (van het A4)</span>
                    <input className="kf-input" type="date" value={tht} onChange={(e) => { setTht(e.target.value); terugNaarScan(); }} />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                    <span className="kf-eyebrow">Scan een pakje</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <ScanLine size={18} aria-hidden />
                        <input ref={veld} className="kf-input" inputMode="numeric" autoFocus value={code} disabled={!tht || !!onbekend}
                            placeholder={tht ? 'Scan of typ de code en druk op Enter' : 'Vul eerst de THT in'}
                            onChange={(e) => setCode(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scan(); } }}
                            style={{ flex: 1, fontSize: 16 }} />
                    </div>
                </label>

                {onbekend && (
                    <div style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                        <div style={{ fontSize: 13.5 }}>
                            Artikelnummer <b>{onbekend.nr}</b> ({formatEur(onbekend.prijs_cents / 100)}) kent BBQ Architect nog niet. Welk product is dit? Dat onthoudt hij voor de volgende keer.
                        </div>
                        <input className="kf-input" autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek het product" />
                        <div style={{ display: 'grid', gap: 4 }}>
                            {keuzes.map((p) => (
                                <Button key={p.id} variant="ghost" disabled={bezig} onClick={() => meld(onbekend.code, p.id)} style={{ justifyContent: 'space-between' }}>
                                    <span>{p.naam}</span>{p.afdeling && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.afdeling}</span>}
                                </Button>
                            ))}
                            {keuzes.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Niets gevonden. Voeg het product eerst toe bij Assortiment.</div>}
                        </div>
                        <Button variant="ghost" onClick={() => { setOnbekend(null); setZoek(''); terugNaarScan(); }}>Dit pakje overslaan</Button>
                    </div>
                )}

                {gescand.length > 0 && (
                    <div style={{ display: 'grid', gap: 2 }}>
                        <div className="kf-eyebrow">Gescand</div>
                        {gescand.map((g) => (
                            <div key={g.stuk_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5, opacity: g.weg ? 0.45 : 1 }}>
                                <span style={{ flex: 1, textDecoration: g.weg ? 'line-through' : undefined }}>{g.naam}</span>
                                <span>{formatEur(g.prijs_cents / 100)}</span>
                                <span style={{ color: 'var(--muted)', fontSize: 12 }}>THT {datumKort(g.tht)}</span>
                                {!g.weg && <Button variant="ghost" size="sm" icon={<Undo2 size={13} />} disabled={bezig} onClick={() => weg(g)}>Weg</Button>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Drawer>
    );
}
