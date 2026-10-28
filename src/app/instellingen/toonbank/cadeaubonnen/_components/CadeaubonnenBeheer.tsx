'use client';

/**
 * Instellingen → Toonbank → Cadeaubonnen (contract toonbank/v1 1.2).
 *
 *  - Aanzetten: pas dan kan er op de Toonbank met een cadeaubon betaald worden
 *    (GET status → instellingen.cadeaubon_aan, binnen 30 seconden).
 *  - Uitgeven: waarde, geldig tot (leeg = geen einddatum), een code (leeg =
 *    BBQ Architect maakt er een) en een notitie. Hoe de verkoop van de bon zelf
 *    geboekt wordt, is nog niet besloten.
 *  - De lijst: saldo, wat er nu gereserveerd is, status; blokkeren of weer
 *    vrijgeven, en het saldo corrigeren met een reden.
 * Alleen een Admin; elke wijziging is een mutatie die niet meer verandert.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ban, Gift, Pencil, RefreshCw, Unlock } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import { CADEAUBON_STATUS_TEKST, leesEuro, type CadeaubonRij } from '@/lib/toonbank/cadeaubonnen';
import { euro } from '@/lib/toonbank/overzicht';
import { cadeaubonBlokkeren, cadeaubonCorrigeren, cadeaubonUitgeven, zetCadeaubonAan, type UitgegevenCadeaubon } from '../actions';

function datum(iso: string | null): string {
    if (!iso) return 'geen einddatum';
    const [j, m, d] = iso.slice(0, 10).split('-');
    return `${d}-${m}-${j}`;
}

export default function CadeaubonnenBeheer({ rijen, aan, isAdmin, gemigreerd }: { rijen: CadeaubonRij[]; aan: boolean; isAdmin: boolean; gemigreerd: boolean }) {
    const router = useRouter();
    const showToast = useToast();
    const [bezig, setBezig] = useState<string | null>(null);
    const [waarde, setWaarde] = useState('');
    const [geldigTot, setGeldigTot] = useState('');
    const [code, setCode] = useState('');
    const [notitie, setNotitie] = useState('');
    const [nieuw, setNieuw] = useState<UitgegevenCadeaubon | null>(null);

    async function zetAan(waar: boolean) {
        setBezig('aan');
        try {
            const r = await zetCadeaubonAan({ aan: waar });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            showToast(waar ? 'Betalen met een cadeaubon staat aan; de tablets krijgen het binnen 30 seconden' : 'Betalen met een cadeaubon staat uit', 'success');
            router.refresh();
        } finally { setBezig(null); }
    }

    async function geefUit() {
        const cents = leesEuro(waarde);
        if (cents === null) { showToast('Vul een waarde in, bijvoorbeeld 25 of 25,00.', 'error'); return; }
        setBezig('uitgeven');
        try {
            const r = await cadeaubonUitgeven({ waardeCents: cents, geldigTot: geldigTot || null, code: code.trim() || null, notitie: notitie.trim() || null });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            setNieuw(r.data);
            setWaarde(''); setGeldigTot(''); setCode(''); setNotitie('');
            router.refresh();
        } finally { setBezig(null); }
    }

    async function blokkeer(c: CadeaubonRij, blokkeren: boolean) {
        let reden: string | null = null;
        if (blokkeren) {
            reden = prompt(`Cadeaubon ${c.code} blokkeren? Er kan dan niet meer mee betaald worden. Waarom? (bijvoorbeeld "verloren")`);
            if (reden === null) return;
            if (!reden.trim()) { showToast('Geef een reden waarom de cadeaubon geblokkeerd wordt.', 'error'); return; }
        } else if (!confirm(`Cadeaubon ${c.code} weer vrijgeven? Er kan dan weer mee betaald worden.`)) {
            return;
        }
        setBezig(`blok:${c.id}`);
        try {
            const r = await cadeaubonBlokkeren({ id: c.id, blokkeren, reden: reden?.trim() || null });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            showToast(blokkeren ? `${c.code} is geblokkeerd` : `${c.code} is weer vrij`, 'success');
            router.refresh();
        } finally { setBezig(null); }
    }

    async function corrigeer(c: CadeaubonRij) {
        const invoer = prompt(`Saldo van ${c.code} corrigeren (nu ${euro(c.saldo_cents)}). Hoeveel erbij? Gebruik een min voor eraf, bijvoorbeeld -5,00.`);
        if (invoer === null) return;
        const min = invoer.trim().startsWith('-') || invoer.trim().startsWith('−');
        const cents = leesEuro(invoer.trim().replace(/^[-−]/, ''));
        if (cents === null) { showToast('Vul een bedrag in, bijvoorbeeld 5,00 of -5,00.', 'error'); return; }
        const reden = prompt('Waarom? (bijvoorbeeld "bon T1-000418 kwam na de reservering binnen")');
        if (reden === null) return;
        if (!reden.trim()) { showToast('Geef een reden voor de correctie.', 'error'); return; }
        setBezig(`corr:${c.id}`);
        try {
            const r = await cadeaubonCorrigeren({ id: c.id, bedragCents: min ? -cents : cents, reden: reden.trim() });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            showToast(`Saldo van ${c.code} is nu ${euro(r.data.saldo_cents)}`, 'success');
            router.refresh();
        } finally { setBezig(null); }
    }

    return (
        <>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Link href="/instellingen/toonbank" className="p-2 rounded-lg hover:bg-[var(--card)] transition-colors" aria-label="Terug naar Toonbank">
                        <ArrowLeft size={18} className="text-[var(--muted)]" />
                    </Link>
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--text)]">Cadeaubonnen</h2>
                        <p className="text-[12px] text-[var(--muted)]">Uitgeven, blokkeren en het saldo; betalen met een cadeaubon op de Toonbank</p>
                    </div>
                </div>
                <button onClick={() => router.refresh()} className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--card)] border border-[var(--border)] rounded-lg transition-colors">
                    <RefreshCw size={13} /> Vernieuwen
                </button>
            </div>

            {!isAdmin && (
                <MetallicCard className="p-4 mb-6" hover={false}>
                    <p className="text-[13px] text-[var(--text)]">Alleen een beheerder (Admin) kan cadeaubonnen bekijken en beheren: een code is als geld.</p>
                </MetallicCard>
            )}
            {isAdmin && !gemigreerd && (
                <MetallicCard className="p-4 mb-6" hover={false}>
                    <p className="text-[13px] text-[var(--text)]">De database kent de cadeaubonnen nog niet (migratie 20261029120000). Tot die gedraaid is, kan er op de Toonbank niet met een cadeaubon betaald worden.</p>
                </MetallicCard>
            )}

            {isAdmin && gemigreerd && (
                <>
                    {/* Aanzetten op de Toonbank. */}
                    <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] mb-3">Op de Toonbank</h3>
                    <MetallicCard className="p-4 mb-8" hover={false}>
                        <label className="flex items-center gap-2 text-[13px] text-[var(--text)]">
                            <input type="checkbox" checked={aan} disabled={bezig === 'aan'} onChange={(e) => void zetAan(e.target.checked)} />
                            Betalen met een cadeaubon op de Toonbank
                        </label>
                        <p className="text-[11px] text-[var(--muted)] mt-2">
                            De Toonbank houdt het bedrag 15 minuten vast en BBQ Architect schrijft het af zodra de bon binnenkomt. Dat kan alleen met verbinding.
                            Een bon die al betaald is, wordt nooit geweigerd: klopt er iets niet (bijvoorbeeld een saldo onder nul), dan staat het in Te controleren.
                        </p>
                    </MetallicCard>

                    {/* Een nieuwe code: groot, om over te nemen. */}
                    {nieuw && (
                        <MetallicCard className="p-5 mb-6" hover={false} accent="var(--brand)">
                            <p className="text-[12px] uppercase tracking-[0.1em] text-[var(--muted)] mb-1">Nieuwe cadeaubon van {euro(nieuw.waarde_cents)}, {datum(nieuw.geldig_tot)}</p>
                            <p className="text-[32px] font-semibold tracking-[0.1em] text-[var(--text)]" aria-live="polite">{nieuw.code}</p>
                            <p className="text-[13px] text-[var(--muted)]">Zet deze code op de cadeaubon (of in de QR-code). Wie de code kent, kan ermee betalen.</p>
                            <div className="mt-3"><Button size="sm" variant="ghost" onClick={() => setNieuw(null)}>Sluiten</Button></div>
                        </MetallicCard>
                    )}

                    {/* Uitgeven. */}
                    <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] mb-3">Cadeaubon uitgeven</h3>
                    <MetallicCard className="p-4 mb-8" hover={false}>
                        <div className="flex flex-wrap items-end gap-4">
                            <div className="field" style={{ width: 140 }}>
                                <label htmlFor="cb-waarde">Waarde (€)</label>
                                <input id="cb-waarde" inputMode="decimal" placeholder="25,00" value={waarde} onChange={(e) => setWaarde(e.target.value)} />
                            </div>
                            <div className="field" style={{ width: 170 }}>
                                <label htmlFor="cb-geldig">Geldig tot (mag leeg)</label>
                                <input id="cb-geldig" type="date" value={geldigTot} onChange={(e) => setGeldigTot(e.target.value)} />
                            </div>
                            <div className="field" style={{ width: 200 }}>
                                <label htmlFor="cb-code">Code (leeg = automatisch)</label>
                                <input id="cb-code" autoComplete="off" maxLength={40} placeholder="HB-…" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                            </div>
                            <div className="field" style={{ flex: '1 1 220px' }}>
                                <label htmlFor="cb-notitie">Notitie</label>
                                <input id="cb-notitie" maxLength={500} placeholder="Voor wie, hoe betaald" value={notitie} onChange={(e) => setNotitie(e.target.value)} />
                            </div>
                            <Button size="sm" loading={bezig === 'uitgeven'} onClick={() => void geefUit()}><Gift size={14} /> Uitgeven</Button>
                        </div>
                        <p className="text-[11px] text-[var(--muted)] mt-2">
                            Hoe de verkoop van een cadeaubon zelf geboekt wordt (webshop, hier of op de Toonbank) is nog niet besloten; zet in de notitie hoe hij betaald is.
                            Een cadeaubon voor zowel 9%- als 21%-producten is bij de verkoop geen omzet: de btw komt pas bij het inwisselen (laten toetsen door de boekhouder).
                        </p>
                    </MetallicCard>

                    {/* De lijst. */}
                    <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] mb-3">Uitgegeven ({rijen.length})</h3>
                    {rijen.length === 0 ? (
                        <MetallicCard className="p-6 mb-6 text-center" hover={false}>
                            <p className="text-[13px] text-[var(--muted)]">Nog geen cadeaubonnen uitgegeven.</p>
                        </MetallicCard>
                    ) : (
                        <MetallicCard className="mb-8" hover={false}>
                            <ul className="divide-y divide-[var(--border)]">
                                {rijen.map((c) => (
                                    <li key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[14px] text-[var(--text)] font-medium tracking-[0.05em]">{c.code}
                                                <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full border ${c.status === 'actief' ? 'border-[var(--brand)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>
                                                    {CADEAUBON_STATUS_TEKST[c.status]}
                                                </span>
                                            </p>
                                            <p className="text-[12px] text-[var(--muted)]">
                                                saldo <span className={c.saldo_cents < 0 ? 'text-[var(--red)] font-semibold' : 'text-[var(--text)]'}>{euro(c.saldo_cents)}</span> van {euro(c.waarde_cents)}
                                                {c.gereserveerd_cents > 0 ? ` · ${euro(c.gereserveerd_cents)} gereserveerd` : ''}
                                                {` · ${datum(c.geldig_tot)}`}
                                                {c.notitie ? ` · ${c.notitie}` : ''}
                                                {c.geblokkeerd_reden ? ` · geblokkeerd: ${c.geblokkeerd_reden}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button size="sm" variant="ghost" loading={bezig === `corr:${c.id}`} onClick={() => void corrigeer(c)}><Pencil size={13} /> Saldo corrigeren</Button>
                                            {c.status === 'geblokkeerd'
                                                ? <Button size="sm" variant="ghost" loading={bezig === `blok:${c.id}`} onClick={() => void blokkeer(c, false)}><Unlock size={13} /> Vrijgeven</Button>
                                                : <Button size="sm" variant="ghost" loading={bezig === `blok:${c.id}`} onClick={() => void blokkeer(c, true)}><Ban size={13} /> Blokkeren</Button>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </MetallicCard>
                    )}
                </>
            )}
        </>
    );
}
