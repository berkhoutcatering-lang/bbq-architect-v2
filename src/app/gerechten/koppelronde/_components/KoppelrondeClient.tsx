'use client';
/* Koppelronde — al je ingrediënten in één keer aan een product hangen.
 *
 * Golf 4 van docs/leveranciersvoorkeur-plan.md. De lijst komt van
 * /api/recipe/koppelronde (alles wat al in gerechten, bibliotheek en voorraad
 * staat). Per portie van acht gaat hij door de matcher mét AI-synoniemenstap;
 * daarna kijk jij per regel: goed → alias, ander product → drie alternatieven,
 * laat leeg → geen kostprijs. Wat je goedkeurt is de volgende keer direct
 * goed, zonder AI.
 *
 * Er wordt niets aan gerechten veranderd; alleen aliassen worden bewaard. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, RefreshCw, MinusCircle, Loader2, Sparkles } from 'lucide-react';
import type { MatchRegel } from '@/lib/ingredientMatchDb';
import { IngredientAlternatieven } from '@/components/menu/IngredientAlternatieven';
import { fmtEuro } from '@/components/menu/helpers';
import { useToast } from '@/components/Toast';

interface Regel {
    naam: string;
    qty_pp: number;
    eenheid: string;
    bronnen: string[];
    alias: { product_name: string; supplier_name: string | null } | null;
}

interface Voorstel {
    match: MatchRegel | null;
    ai_voorstel: { name: string; reden: string } | null;
}

type Staat = 'bekend' | 'wacht' | 'zoekt' | 'voorstel' | 'goed' | 'leeg';

/* Voorstellen overleven een herlaad in de browser: opnieuw zoeken kost weer
   AI-geld. Beoordeelde regels staan in de aliassen (server), de rest hier. */
const BEWAAR_SLEUTEL = 'koppelronde:voorstellen';
function leesBewaard(): Record<string, Voorstel> {
    try { return JSON.parse(sessionStorage.getItem(BEWAAR_SLEUTEL) || '{}'); } catch { return {}; }
}
function bewaar(v: Record<string, Voorstel>) {
    try { sessionStorage.setItem(BEWAAR_SLEUTEL, JSON.stringify(v)); } catch { /* privémodus */ }
}

const STIP: Record<'hoog' | 'middel' | 'laag', string> = {
    hoog: 'var(--green, #22c55e)', middel: 'var(--brand, #FFBF00)', laag: 'var(--red, #ef4444)',
};

export default function KoppelrondeClient() {
    const showToast = useToast();
    const [regels, setRegels] = useState<Regel[] | null>(null);
    const [fout, setFout] = useState<string | null>(null);
    const [voorstellen, setVoorstellen] = useState<Record<string, Voorstel>>({});
    const [staat, setStaat] = useState<Record<string, Staat>>({});
    const [bezig, setBezig] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const [leverancier, setLeverancier] = useState<string | null>(null);
    const [aiCent, setAiCent] = useState(0);

    useEffect(() => {
        fetch('/api/recipe/koppelronde')
            .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`); return b.data as Regel[]; })
            .then((lijst) => {
                setRegels(lijst);
                const bewaard = leesBewaard();
                const s: Record<string, Staat> = {};
                lijst.forEach((r) => { s[r.naam] = r.alias ? 'bekend' : bewaard[r.naam] ? 'voorstel' : 'wacht'; });
                setStaat(s);
                setVoorstellen(bewaard);
            })
            .catch((e) => setFout(e instanceof Error ? e.message : 'Laden mislukt'));
    }, []);

    const teDoen = useMemo(() => (regels ?? []).filter((r) => staat[r.naam] === 'wacht'), [regels, staat]);
    const beoordeeld = useMemo(() => (regels ?? []).filter((r) => ['bekend', 'goed', 'leeg'].includes(staat[r.naam])).length, [regels, staat]);

    /* Per zes door de matcher; de AI-stap zit daarin (ai: true) en doet er
       maximaal zes per aanroep — meer liep op Vercel tegen de 30 s aan. */
    async function start() {
        if (!regels || bezig) return;
        setBezig(true);
        try {
            const wacht = regels.filter((r) => staat[r.naam] === 'wacht');
            for (let i = 0; i < wacht.length; i += 6) {
                const portie = wacht.slice(i, i + 6);
                setStaat((s) => { const n = { ...s }; portie.forEach((r) => { n[r.naam] = 'zoekt'; }); return n; });
                const res = await fetch('/api/recipe/match-ingredients', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ingredients: portie.map((r) => ({ naam: r.naam, qty_pp: r.qty_pp || 0, eenheid: r.eenheid || '' })), ai: true }),
                });
                const b = await res.json().catch(() => ({}));
                if (!res.ok || !b.success) throw new Error(b.error || b.message || `HTTP ${res.status}`);
                setLeverancier(b.data.kostprijs_leverancier ?? null);
                setAiCent((c) => c + (b.data.ai_cost_cents ?? 0));
                const uit: Array<{ naam: string; match: MatchRegel | null; ai_voorstel?: { name: string; reden: string } | null }> = b.data.ingredients ?? [];
                setVoorstellen((v) => {
                    const n = { ...v };
                    uit.forEach((u, k) => { n[portie[k].naam] = { match: u.match, ai_voorstel: u.ai_voorstel ?? null }; });
                    bewaar(n);
                    return n;
                });
                setStaat((s) => { const n = { ...s }; portie.forEach((r) => { n[r.naam] = 'voorstel'; }); return n; });
            }
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Zoeken mislukt', 'error');
            setStaat((s) => { const n = { ...s }; Object.keys(n).forEach((k) => { if (n[k] === 'zoekt') n[k] = 'wacht'; }); return n; });
        } finally {
            setBezig(false);
        }
    }

    async function bewaarAlias(naam: string, m: MatchRegel) {
        const r = await fetch('/api/recipe/aliases', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aliases: [{ naam, match: { source: m.source, ref_id: m.ref_id, name: m.name, supplier: m.supplier ?? null } }] }),
        });
        if (!r.ok) { showToast('Onthouden mislukt', 'error'); return false; }
        return true;
    }

    /* Exacte naam-treffers (groen, niet door de AI gekozen) in één keer
       goedkeuren — anders klik je tachtig keer hetzelfde vinkje. */
    async function alleGroeneGoed() {
        const groen = (regels ?? []).filter((r) => staat[r.naam] === 'voorstel' && voorstellen[r.naam]?.match?.confidence === 'hoog' && !voorstellen[r.naam]?.match?.via_ai);
        if (groen.length === 0) return;
        const r = await fetch('/api/recipe/aliases', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aliases: groen.map((g) => { const m = voorstellen[g.naam].match!; return { naam: g.naam, match: { source: m.source, ref_id: m.ref_id, name: m.name, supplier: m.supplier ?? null } }; }) }),
        });
        if (!r.ok) { showToast('Onthouden mislukt', 'error'); return; }
        setStaat((s) => { const n = { ...s }; groen.forEach((g) => { n[g.naam] = 'goed'; }); return n; });
        showToast(`${groen.length} koppelingen onthouden`, 'success');
    }
    const groenTeDoen = useMemo(() => (regels ?? []).filter((r) => staat[r.naam] === 'voorstel' && voorstellen[r.naam]?.match?.confidence === 'hoog' && !voorstellen[r.naam]?.match?.via_ai).length, [regels, staat, voorstellen]);

    async function goed(naam: string) {
        const m = voorstellen[naam]?.match;
        if (!m) return;
        if (await bewaarAlias(naam, m)) setStaat((s) => ({ ...s, [naam]: 'goed' }));
    }
    async function kies(naam: string, m: MatchRegel) {
        setVoorstellen((v) => ({ ...v, [naam]: { match: m, ai_voorstel: null } }));
        setOpen(null);
        if (await bewaarAlias(naam, m)) setStaat((s) => ({ ...s, [naam]: 'goed' }));
    }
    function leeg(naam: string) {
        setOpen(null);
        setStaat((s) => ({ ...s, [naam]: 'leeg' }));
    }

    if (fout) return <div style={{ maxWidth: 940, margin: '0 auto', padding: 32, color: 'var(--red, #ef4444)' }}>{fout}</div>;
    if (!regels) return <div style={{ maxWidth: 940, margin: '0 auto', padding: 32, color: 'var(--muted)' }}><Loader2 size={16} style={{ animation: 'mr-spin 1s linear infinite' }} /> Ingrediënten verzamelen…</div>;

    const totaal = regels.length;
    const pct = totaal ? Math.round((beoordeeld / totaal) * 100) : 0;

    return (
        <div style={{ maxWidth: 940, margin: '0 auto', padding: '32px 20px 96px' }}>
            <Link href="/gerechten" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                <ArrowLeft size={14} /> Gerechten
            </Link>
            <h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 6 }}>Koppelronde</h1>
            <p style={{ color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
Alle {totaal} ingrediënten uit je gerechten, één keer aan een product{leverancier ? ` van ${leverancier}` : ''} gehangen.
                Wat je goedkeurt onthoudt de app: de volgende keer is dat ingrediënt direct goed, zonder AI.
                Een andere naam voor hetzelfde product kiest de AI zelf; een ánder product laat hij aan jou.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', marginBottom: 18, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{beoordeeld} van {totaal} beoordeeld · {pct}%{aiCent > 0 ? ` · AI-kosten ${fmtEuro(aiCent / 100)}` : ''}</div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand, #FFBF00)', transition: 'width .3s' }} />
                    </div>
                </div>
                {groenTeDoen > 0 && (
                    <button type="button" className="btn btn-ghost" onClick={alleGroeneGoed} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        title="Alle exacte naam-treffers (groen, niet door de AI gekozen) in één keer onthouden">
                        <Check size={14} /> {groenTeDoen} groene goedkeuren
                    </button>
                )}
                <button type="button" className="btn btn-brand" onClick={start} disabled={bezig || teDoen.length === 0}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {bezig ? <Loader2 size={14} style={{ animation: 'mr-spin 1s linear infinite' }} /> : <Sparkles size={14} />}
                    {bezig ? 'Bezig met zoeken…' : teDoen.length === 0 ? 'Alles gezocht' : `Zoek ${teDoen.length} ingrediënten`}
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {regels.map((r) => {
                    const st = staat[r.naam];
                    const v = voorstellen[r.naam];
                    const m = v?.match ?? null;
                    const heeftPrijs = !!(m && m.line_cost_cents != null);
                    return (
                        <div key={r.naam}>
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1.7fr) auto',
                                gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 10,
                                background: 'var(--card)', border: '1px solid var(--border)',
                                opacity: st === 'leeg' ? 0.55 : 1,
                            }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.naam}</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.qty_pp ? `${r.qty_pp} ${r.eenheid} p.p. · ` : ''}{r.bronnen.slice(0, 3).join(', ')}{r.bronnen.length > 3 ? ` +${r.bronnen.length - 3}` : ''}
                                    </div>
                                </div>
                                <div style={{ minWidth: 0, fontSize: 12 }}>
                                    {st === 'bekend' && r.alias && (
                                        <span style={{ color: 'var(--green, #22c55e)' }}>✓ Al bekend: {r.alias.product_name}{r.alias.supplier_name ? ` · ${r.alias.supplier_name}` : ''}</span>
                                    )}
                                    {st === 'wacht' && <span style={{ color: 'var(--muted)' }}>Nog niet gezocht</span>}
                                    {st === 'zoekt' && <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} style={{ animation: 'mr-spin 1s linear infinite' }} /> Zoeken…</span>}
                                    {(st === 'voorstel' || st === 'goed' || st === 'leeg') && (
                                        m ? (
                                            <>
                                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>
                                                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: STIP[m.confidence], marginRight: 6 }} />
                                                    {st === 'goed' ? '✓ ' : ''}{m.name}
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {m.supplier ?? (m.source === 'component' ? 'eigen bibliotheek' : m.source === 'inventory' ? 'eigen voorraad' : 'catalogus')}
                                                    {heeftPrijs && r.qty_pp
                                                        ? ` · ${fmtEuro(m.line_cost_cents! / 100)} voor ${r.qty_pp} ${r.eenheid}`
                                                        : ` · ${m.base_unit === 'stuk' ? `${fmtEuro(m.cents_per_base_unit / 100)} per stuk` : `${fmtEuro(m.cents_per_base_unit * 10)} per ${m.base_unit === 'g' ? 'kg' : 'liter'}`}`}
                                                    {heeftPrijs === false && r.qty_pp ? ' · eenheid past niet bij het recept' : ''}
                                                    {m.via_ai ? ` · AI: ${m.ai_reden ?? 'zelfde product, andere naam'}` : ''}
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ color: 'var(--muted)' }}>
                                                {v?.ai_voorstel
                                                    ? <>Niet hetzelfde gevonden. AI stelt voor: <strong style={{ color: 'var(--text)' }}>{v.ai_voorstel.name}</strong> — {v.ai_voorstel.reden}. Jij beslist.</>
                                                    : <>Niets gevonden{leverancier ? ` bij ${leverancier}` : ''}.</>}
                                            </div>
                                        )
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {st === 'voorstel' && m && (
                                        <button type="button" className="btn btn-brand btn-sm" title="Goed — onthouden" onClick={() => goed(r.naam)} style={{ padding: '4px 10px' }}>
                                            <Check size={13} />
                                        </button>
                                    )}
                                    {(st === 'voorstel' || st === 'goed' || st === 'leeg') && (
                                        <button type="button" className="btn btn-ghost btn-sm" title="Ander product (AI stelt 3 alternatieven voor)"
                                            onClick={() => setOpen(open === r.naam ? null : r.naam)} style={{ padding: '4px 8px' }}>
                                            <RefreshCw size={12} />
                                        </button>
                                    )}
                                    {st === 'voorstel' && (
                                        <button type="button" className="btn btn-ghost btn-sm" title="Laat leeg — geen kostprijs" onClick={() => leeg(r.naam)} style={{ padding: '4px 8px' }}>
                                            <MinusCircle size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {open === r.naam && (
                                <IngredientAlternatieven
                                    naam={r.naam}
                                    qtyPp={r.qty_pp || 1}
                                    unit={r.eenheid || 'stuks'}
                                    huidige={m}
                                    onKies={(match) => void kies(r.naam, match)}
                                    onLeeg={() => leeg(r.naam)}
                                    onSluit={() => setOpen(null)}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
