/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/lib/OrgContext';
import KeukenTabs from '@/components/KeukenTabs';
import PageHeader from '@/components/PageHeader';
import { Sparkles, Loader2, Save, X, RefreshCw, ChefHat } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   GERECHTEN-BEDENKER — AI-speeltuin

   Aparte plek van /gerechten zodat de chef vrij kan brainstormen zonder
   z'n productie-bibliotheek te vervuilen. Concepten landen pas in
   /gerechten als de chef expliciet "Bewaar als concept" klikt — daar
   staan ze met status='concept' + bron='ai' en zijn ze visueel te
   onderscheiden van de echte vaste gerechten.

   Bewust géén volledig event-flow hier: /bedenker is brainstorm, niet
   operationeel. Output wordt pas operationeel zodra de chef 'm
   activeert in /gerechten.
   ═══════════════════════════════════════════════════════════════════ */

interface ConceptDish {
    /* Lokale tijdelijke id zodat we cards kunnen tracken voor jij ze opslaat. */
    _localId: string;
    naam: string;
    categorie?: string;
    gang?: string;
    porties?: number;
    preptime?: number;
    beschrijving?: string;
    ingredienten?: Array<{ naam: string; hoeveelheid: number; eenheid: string }>;
    instructies?: string[] | string;
    allergenen?: string[];
    tags?: string[];
    wijn_suggestie?: string;
    service_tip?: string;
    geschatte_kostprijs_pp?: number;
    /* Citations — namen van bestaande gerechten waar Claude op leunt voor
       de stijl. Pillar #2: AI hallucineert niet, baseert op jouw werk. */
    inspired_by?: string[];
    /* UI-state — waar staat dit concept in de save-flow? */
    saveState?: 'idle' | 'saving' | 'saved' | 'error';
    saveError?: string;
}

const VOORBEELDEN = [
    'Vegan hoofdgerecht in BBQ-stijl voor bruiloften',
    'Bijgerecht met zomerse groenten dat goed opschaalt',
    'Borrelhapje met pulled pork voor 50 gasten',
    'Dessert met seizoensfruit, lichtgekruid',
    'Aziatisch geïnspireerd voorgerecht met BBQ-twist',
    'Glutenvrij hoofdgerecht voor 80 personen',
];

/* Categorie → gang_slug mapping voor save-flow (gerechten heeft gang_slug). */
const CATEGORIE_TO_GANG: Record<string, string> = {
    'Vlees': 'hoofdgerechten',
    'Vis': 'hoofdgerechten',
    'Bijgerecht': 'bijgerechten',
    'Dessert': 'dessert',
    'Saus': 'bijgerechten',
    'Drank': 'bites',
};

export default function BedenkerPage() {
    const showToast = useToast();
    const { orgId } = useOrg();
    const [prompt, setPrompt] = useState('');
    const [bestaande, setBestaande] = useState<any[]>([]);
    const [concepten, setConcepten] = useState<ConceptDish[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* Laad bestaande gerechten als stijl-referentie voor de AI. */
    useEffect(() => {
        supabase.from('gerechten').select('naam,gang_slug,tags').limit(50).then(res => {
            setBestaande(res.data || []);
        });
    }, []);

    async function bedenk() {
        if (!prompt.trim() || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/recipe-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    mode: 'recipe',
                    existing: bestaande.map(g => ({ naam: g.naam, gang: g.gang_slug, tags: g.tags })),
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error || 'AI fout');
                return;
            }
            const concept: ConceptDish = {
                ...body.data,
                _localId: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                saveState: 'idle',
            };
            setConcepten(prev => [concept, ...prev]);
        } catch (e: any) {
            setError(e.message || 'Onbekende fout');
        } finally {
            setBusy(false);
        }
    }

    async function bewaarConcept(c: ConceptDish) {
        setConcepten(prev => prev.map(p => p._localId === c._localId ? { ...p, saveState: 'saving' } : p));

        const gangSlug = c.gang
            ? c.gang.toLowerCase().replace(/gerecht$/, 'gerechten')
            : (c.categorie ? CATEGORIE_TO_GANG[c.categorie] : null) || 'hoofdgerechten';

        const ingredienten = Array.isArray(c.ingredienten)
            ? c.ingredienten.map(i => i.hoeveelheid + ' ' + i.eenheid + ' ' + i.naam)
            : [];

        const bereidingswijze = Array.isArray(c.instructies)
            ? c.instructies.join('\n')
            : (c.instructies || '');

        const payload = {
            naam: c.naam,
            beschrijving: c.beschrijving || '',
            gang_slug: gangSlug,
            ingredienten,
            bereidingswijze,
            allergenen: c.allergenen || [],
            tags: c.tags || [],
            kostprijs_pp: c.geschatte_kostprijs_pp || 0,
            porties: c.porties || 10,
            target_prep_time: c.preptime ? c.preptime * 60 : 0,
            wijn_suggestie: c.wijn_suggestie || '',
            service_tip: c.service_tip || '',
            organization_id: orgId,
            status: 'concept',
            bron: 'ai',
            actief: false,  /* sync voor pre-migratie omgevingen */
        };

        const { error } = await supabase.from('gerechten').insert([payload]);
        if (error) {
            setConcepten(prev => prev.map(p => p._localId === c._localId ? { ...p, saveState: 'error', saveError: error.message } : p));
            showToast('Fout bij opslaan: ' + error.message, 'error');
            return;
        }
        setConcepten(prev => prev.map(p => p._localId === c._localId ? { ...p, saveState: 'saved' } : p));
        showToast('Concept opgeslagen — vind het terug in /gerechten onder de filter "Concepten"', 'success');
    }

    function verwerp(c: ConceptDish) {
        setConcepten(prev => prev.filter(p => p._localId !== c._localId));
    }

    return (
        <div className="main-content">
            <KeukenTabs />
            <PageHeader
                title="Gerechten-bedenker"
                description="AI-speeltuin: brainstorm gerechten zonder ze direct op je menu te zetten. Goede ideeën sla je op als concept; daarna activeer je ze in /gerechten."
            />

            {/* Hero — prompt-input + voorbeelden */}
            <div style={{ padding: 20, borderRadius: 16, background: 'var(--card)', border: '1px solid var(--border)', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Sparkles size={16} style={{ color: '#a78bfa' }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Wat moet Claude bedenken?</div>
                </div>
                <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="bv. zomers vegetarisch hoofdgerecht met aubergine, voor 60 gasten"
                    rows={3}
                    style={{
                        width: '100%',
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid var(--card-solid)',
                        background: 'var(--color-bg-deep)',
                        color: 'var(--text)',
                        fontSize: 14,
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        outline: 'none',
                        marginBottom: 10,
                    }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {VOORBEELDEN.map(v => (
                        <button
                            key={v}
                            onClick={() => setPrompt(v)}
                            style={{
                                padding: '5px 10px',
                                borderRadius: 999,
                                border: '1px solid var(--border)',
                                background: 'transparent',
                                color: 'var(--muted)',
                                fontSize: 11,
                                cursor: 'pointer',
                            }}
                        >
                            {v}
                        </button>
                    ))}
                </div>
                {error && (
                    <div style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 12, color: '#fca5a5', marginBottom: 10 }}>
                        {error}
                    </div>
                )}
                <button
                    onClick={bedenk}
                    disabled={!prompt.trim() || busy}
                    className="btn btn-brand btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: (!prompt.trim() || busy) ? 0.5 : 1 }}
                >
                    {busy
                        ? <><Loader2 size={14} className="spin" /> Claude bedenkt...</>
                        : <><Sparkles size={14} /> ✦ Bedenk gerecht</>}
                </button>
                <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>

            {/* Concept-stack — nieuwste bovenaan */}
            {concepten.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 14, background: 'rgba(167,139,250,.04)' }}>
                    <ChefHat size={32} style={{ color: 'var(--muted)', opacity: 0.5, marginBottom: 10 }} />
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Nog niets bedacht in deze sessie</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                        Tik een idee in en laat Claude erop los. Je kan zoveel concepten genereren als je wilt — ze landen alleen in je echte menu als jij dat wilt.
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {concepten.map(c => (
                        <ConceptCard key={c._localId} c={c} onSave={() => bewaarConcept(c)} onReject={() => verwerp(c)} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ConceptCard({ c, onSave, onReject }: { c: ConceptDish; onSave: () => void; onReject: () => void }) {
    const ingredientsText = Array.isArray(c.ingredienten)
        ? c.ingredienten.slice(0, 6).map(i => i.naam).join(' · ')
        : '';

    return (
        <div style={{
            padding: 18,
            borderRadius: 14,
            background: 'var(--card)',
            border: '1px solid rgba(167,139,250,.35)',
            backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 8px, rgba(167,139,250,.04) 8px 16px)',
            position: 'relative',
        }}>
            <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(167,139,250,.2)', color: '#a78bfa', fontWeight: 700, letterSpacing: '.05em' }}>
                ✦ AI · CONCEPT
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{c.naam}</div>
                    {c.beschrijving && (
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{c.beschrijving}</div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {c.categorie && <Pill tone="neutral">{c.categorie}</Pill>}
                        {c.porties != null && <Pill tone="neutral">{c.porties} porties</Pill>}
                        {c.preptime != null && <Pill tone="neutral">{c.preptime} min</Pill>}
                        {c.geschatte_kostprijs_pp != null && c.geschatte_kostprijs_pp > 0 && (
                            <Pill tone="green">€{Number(c.geschatte_kostprijs_pp).toFixed(2)} p.p.</Pill>
                        )}
                    </div>
                    {ingredientsText && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Hoofdingrediënten:</strong> {ingredientsText}
                            {c.ingredienten && c.ingredienten.length > 6 && ' + ' + (c.ingredienten.length - 6) + ' meer'}
                        </div>
                    )}
                    {(c.tags || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(c.tags || []).map(t => <Pill key={t} tone="purple">{t}</Pill>)}
                        </div>
                    )}
                    {/* Citations: laat zien op welke bestaande gerechten dit concept leunt.
                        Maakt direct duidelijk dat AI niet hallucineert maar baseert op
                        jouw repertoire. Pillar #2 uit Phase 2 audit. */}
                    {(c.inspired_by || []).length > 0 && (
                        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(167,139,250,.06)', border: '1px solid rgba(167,139,250,.2)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                                ✦ Geïnspireerd door
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(c.inspired_by || []).map(name => (
                                    <span key={name} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(167,139,250,.12)', color: '#a78bfa', fontWeight: 600, border: '1px solid rgba(167,139,250,.3)' }}>
                                        {name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {(c.allergenen || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Allergenen:</span>
                            {(c.allergenen || []).map(a => <Pill key={a} tone="amber">{a}</Pill>)}
                        </div>
                    )}
                    {c.wijn_suggestie && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>🍷 Wijn:</strong> {c.wijn_suggestie}
                        </div>
                    )}
                    {c.service_tip && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>🎯 Service:</strong> {c.service_tip}
                        </div>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                {c.saveState === 'saved' ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', fontSize: 13, fontWeight: 600 }}>
                        ✓ Opgeslagen — review en activeer in <a href="/gerechten" style={{ color: '#22c55e', textDecoration: 'underline' }}>/gerechten</a>
                    </div>
                ) : (
                    <>
                        <button
                            onClick={onSave}
                            disabled={c.saveState === 'saving'}
                            className="btn btn-brand btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: c.saveState === 'saving' ? 0.5 : 1 }}
                        >
                            {c.saveState === 'saving'
                                ? <><Loader2 size={13} className="spin" /> Opslaan...</>
                                : <><Save size={13} /> Bewaar als concept</>}
                        </button>
                        <button onClick={onReject} className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <X size={13} /> Verwerp
                        </button>
                    </>
                )}
            </div>

            {c.saveError && (
                <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 12, color: '#fca5a5' }}>
                    {c.saveError}
                </div>
            )}
        </div>
    );
}

function Pill({ tone, children }: { tone: 'neutral' | 'green' | 'amber' | 'purple'; children: React.ReactNode }) {
    const tones: Record<string, { bg: string; color: string; border: string }> = {
        neutral: { bg: 'rgba(255,255,255,.05)', color: 'var(--muted)', border: 'var(--border)' },
        green: { bg: 'rgba(34,197,94,.1)', color: '#22c55e', border: 'rgba(34,197,94,.3)' },
        amber: { bg: 'rgba(245,158,11,.1)', color: '#f59e0b', border: 'rgba(245,158,11,.3)' },
        purple: { bg: 'rgba(167,139,250,.1)', color: '#a78bfa', border: 'rgba(167,139,250,.3)' },
    };
    const t = tones[tone];
    return (
        <span style={{
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 4,
            background: t.bg,
            color: t.color,
            border: '1px solid ' + t.border,
            fontWeight: 600,
        }}>
            {children}
        </span>
    );
}
