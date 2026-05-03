/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import { Sparkles, X, Loader2, AlertTriangle, Check, ArrowRight, Users, Calendar, Euro, Minus, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const GOLD = '#c4a35a';

type Props = {
    open: boolean;
    onClose: () => void;
    onSaved: (offerteId: number) => void;
};

export default function AiOfferteWizard({ open, onClose, onSaved }: Props) {
    const [step, setStep] = useState<'input' | 'generating' | 'preview'>('input');
    const [clientName, setClientName] = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [gasten, setGasten] = useState(20);
    const [vegaCount, setVegaCount] = useState(0);
    const [gangen, setGangen] = useState('3');
    const [prompt, setPrompt] = useState('');
    const [existingKlanten, setExistingKlanten] = useState<any[]>([]);
    const [existingGerechten, setExistingGerechten] = useState<any[]>([]);
    const [generated, setGenerated] = useState<any | null>(null);
    const [prijsPp, setPrijsPp] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Sync prijsPp met AI-suggestie zodra generated binnenkomt; reset bij weg-gaan
    useEffect(() => {
        if (generated) {
            const suggestion = generated.adviesprijs_pp || Math.ceil((generated.totale_kostprijs_pp || 35) * 2);
            setPrijsPp(Number(suggestion));
        } else {
            setPrijsPp(null);
        }
    }, [generated]);

    // Preload klanten + gerechten
    useEffect(() => {
        if (!open || !supabase) return;
        Promise.all([
            supabase.from('klanten').select('naam,bedrijf,adres,type').limit(50),
            supabase.from('gerechten').select('naam,gang_slug,tags,kostprijs_pp').limit(100),
        ]).then(([kl, ge]) => {
            setExistingKlanten(kl.data || []);
            setExistingGerechten(ge.data || []);
        });
    }, [open]);

    useEffect(() => {
        if (open) {
            setStep('input');
            setGenerated(null);
            setError(null);
            // Default event datum: 4 weken vooruit
            const d = new Date();
            d.setDate(d.getDate() + 28);
            setEventDate(d.toISOString().slice(0, 10));
        }
    }, [open]);

    async function generate() {
        if (!clientName.trim()) { setError('Vul een klantnaam in'); return; }
        setStep('generating');
        setError(null);
        try {
            const existing = existingGerechten.map(g => ({ naam: g.naam, gang: g.gang_slug, tags: g.tags }));
            const fullPrompt = `${prompt.trim() || 'BBQ-menu'} — ${gasten} gasten${vegaCount > 0 ? ` (${vegaCount} vega)` : ''}, event op ${eventDate}`;
            const res = await fetch('/api/recipe-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'menu',
                    prompt: fullPrompt,
                    existing,
                    options: { gasten, gangen },
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error || 'AI fout');
                setStep('input');
                return;
            }
            setGenerated(body.data);
            setStep('preview');
        } catch (e: any) {
            setError(e.message || 'Onbekende fout');
            setStep('input');
        }
    }

    async function saveAsOfferte() {
        if (!generated || !supabase) return;
        setSaving(true);
        try {
            // Build menu_selectie per gang from generated gerechten
            const menuSelectie: Record<string, any[]> = {};
            (generated.gerechten || []).forEach((g: any) => {
                const gangKey = (g.gang || 'hoofdgerecht').toLowerCase();
                if (!menuSelectie[gangKey]) menuSelectie[gangKey] = [];
                menuSelectie[gangKey].push({ naam: g.naam, gerecht_naam: g.naam, beschrijving: g.beschrijving });
            });

            // Nummer: generate simple OFF-YYYY-NNN format
            const y = new Date().getFullYear();
            const { count } = await supabase.from('offertes').select('id', { count: 'exact', head: true });
            const nummer = `OFF-${y}-${String((count || 0) + 1).padStart(3, '0')}`;

            const notitie = `${generated.menu_naam || 'AI-gegenereerd menu'}${generated.thema ? ' — ' + generated.thema : ''}. ${(generated.gerechten || []).length} gangen samengesteld door AI op basis van jouw stijl.`;

            const payload: any = {
                nummer,
                status: 'concept',
                client_naam: clientName,
                client_adres: clientAddress,
                datum: eventDate,
                aantal_gasten: gasten,
                aantal_vega: vegaCount,
                basis_prijs_pp: prijsPp ?? generated.adviesprijs_pp ?? Math.ceil((generated.totale_kostprijs_pp || 35) * 2),
                menu_selectie: menuSelectie,
                notitie,
                items: [],
                vaste_kosten: [],
            };

            const { data, error: insertErr } = await supabase.from('offertes').insert([payload]).select('id').single();
            if (insertErr) {
                setError(insertErr.message);
                setSaving(false);
                return;
            }

            /* Activation-tracking: AI-wizard gebruikt + first_offerte_concept (idempotent
               via trackOnce zodat alleen de allereerste offerte als first_* telt). */
            const { track, trackOnce } = await import('@/lib/track');
            track('ai_wizard_used', { offerteId: data?.id, gangen: (generated.gerechten || []).length });
            if (data?.id) trackOnce('first_offerte_concept', 'first_offerte_concept', { via: 'ai_wizard', offerteId: data.id });

            // Ook gerechten opslaan als ze nieuw zijn (optioneel, zodat ze in de pool komen)
            const newDishes = (generated.gerechten || []).filter((g: any) => !existingGerechten.some(eg => eg.naam.toLowerCase() === g.naam.toLowerCase()));
            if (newDishes.length > 0) {
                const rows = newDishes.map((d: any) => ({
                    naam: d.naam,
                    gang_slug: (d.gang || 'hoofdgerecht').toLowerCase(),
                    beschrijving: d.beschrijving,
                    tags: d.tags || [],
                    allergenen: d.allergenen || [],
                    kostprijs_pp: d.geschatte_kostprijs_pp || 0,
                    ingredienten: d.ingredienten || [],
                    bereidingswijze: Array.isArray(d.instructies) ? d.instructies.join('\n') : d.instructies,
                    actief: true,
                }));
                await supabase.from('gerechten').insert(rows);
            }

            onSaved(data.id);
            setSaving(false);
            onClose();
        } catch (e: any) {
            setError(e.message || 'Onbekende fout');
            setSaving(false);
        }
    }

    if (!open) return null;

    return (
        <div className="ai-wizard-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60, overflow: 'auto' }} onClick={onClose}>
            <div className="ai-wizard-panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(780px, 94vw)', background: 'var(--bg, #0a0a0d)', border: '1px solid var(--card-solid, #1a1a1e)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh', marginBottom: 60 }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--card-solid, #1a1a1e)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Sparkles size={16} style={{ color: GOLD }} />
                            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 400, color: 'var(--text)', margin: 0 }}>AI Offerte Wizard</h2>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--muted, #999)', margin: 0, marginTop: 2 }}>Rook stelt menu + prijs samen op basis van jouw {existingGerechten.length} gerechten</p>
                    </div>
                    <button onClick={onClose} aria-label="Sluit wizard" style={{ background: 'transparent', border: 'none', color: 'var(--muted, #999)', cursor: 'pointer', padding: 10, minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}><X size={18} /></button>
                </div>

                <style jsx>{`
                    @media (max-width: 767px) {
                        :global(.ai-wizard-backdrop) {
                            padding-top: 0 !important;
                            align-items: stretch !important;
                        }
                        :global(.ai-wizard-panel) {
                            width: 100vw !important;
                            max-width: 100vw !important;
                            max-height: 100vh !important;
                            min-height: 100vh !important;
                            border-radius: 0 !important;
                            margin-bottom: 0 !important;
                            padding-bottom: env(safe-area-inset-bottom, 0px) !important;
                        }
                    }
                `}</style>

                <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                    {step === 'input' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <Label>Klantnaam</Label>
                                <input value={clientName} onChange={(e) => setClientName(e.target.value)} list="existing-klanten" placeholder="Bv. Mariel Velema of selecteer..." style={inputStyle} />
                                <datalist id="existing-klanten">
                                    {existingKlanten.map((k, i) => <option key={i} value={k.naam} />)}
                                </datalist>
                            </div>

                            <div>
                                <Label>Klantadres (optioneel)</Label>
                                <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Straat + nr, postcode, plaats" style={inputStyle} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                <div>
                                    <Label>Event datum</Label>
                                    <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={inputStyle} />
                                </div>
                                <div>
                                    <Label>Aantal gasten</Label>
                                    <input type="number" min={1} max={500} value={gasten} onChange={(e) => setGasten(parseInt(e.target.value) || 20)} style={inputStyle} />
                                </div>
                                <div>
                                    <Label>Waarvan vega</Label>
                                    <input type="number" min={0} max={gasten} value={vegaCount} onChange={(e) => setVegaCount(parseInt(e.target.value) || 0)} style={inputStyle} />
                                </div>
                            </div>

                            <div>
                                <Label>Aantal gangen</Label>
                                <select value={gangen} onChange={(e) => setGangen(e.target.value)} style={inputStyle}>
                                    <option value="2">2 (hoofd + dessert)</option>
                                    <option value="3">3 (voorgerecht + hoofd + dessert)</option>
                                    <option value="4">4 (voor + hoofd + bijgerecht + dessert)</option>
                                    <option value="5">5 (amuse + voor + hoofd + kaas + dessert)</option>
                                </select>
                            </div>

                            <div>
                                <Label>Wensen / thema (voor AI)</Label>
                                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
                                    placeholder="Bv. Stoer BBQ, vleesrijk, met pittige sauzen. Feestelijk, maar niet formeel."
                                    style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {[
                                    'Klassiek BBQ met alle toeters en bellen',
                                    'Vega/vegan friendly menu',
                                    'Aziatisch fusion',
                                    'Stoer vlees-zwaar menu',
                                    'Lichte zomerse opzet',
                                ].map(ex => (
                                    <button key={ex} onClick={() => setPrompt(ex)}
                                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-solid, #1a1a1e)', background: 'var(--card, #15151a)', color: 'var(--muted, #999)', fontSize: 11, cursor: 'pointer' }}>
                                        {ex}
                                    </button>
                                ))}
                            </div>

                            {error && (
                                <div style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 12, color: 'var(--red)', display: 'flex', gap: 8 }}>
                                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid, #1a1a1e)', background: 'var(--card, #15151a)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Annuleren</button>
                                <button onClick={generate} disabled={!clientName.trim()}
                                    style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: clientName.trim() ? '#fff' : 'rgba(255,255,255,.3)', color: '#000', fontSize: 12, fontWeight: 700, cursor: clientName.trim() ? 'pointer' : 'not-allowed', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <Sparkles size={14} /> Genereer offerte
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'generating' && (
                        <div style={{ padding: 60, textAlign: 'center' }}>
                            <Loader2 size={32} className="spin" style={{ color: GOLD, margin: '0 auto 16px' }} />
                            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Rook denkt na over jouw menu...</div>
                            <div style={{ fontSize: 12, color: 'var(--muted, #999)' }}>Meestal 30–60 seconden. Rook houdt rekening met je bestaande gerechten, prijs-per-persoon en gangen-indeling.</div>
                            <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                        </div>
                    )}

                    {step === 'preview' && generated && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)', display: 'flex', gap: 10, alignItems: 'center' }}>
                                <Check size={18} style={{ color: '#22c55e' }} />
                                <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>Menu bedacht — check en sla op als concept-offerte</span>
                            </div>

                            <div>
                                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{generated.menu_naam || 'Nieuwe offerte'}</h3>
                                {generated.thema && <p style={{ fontSize: 12, color: 'var(--muted, #999)', marginTop: 4, marginBottom: 0 }}>{generated.thema}</p>}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                <Stat icon={Users} label="Gasten" value={`${gasten}`} />
                                <Stat icon={Calendar} label="Datum" value={eventDate} />
                                <Stat icon={Euro} label="Kost/p" value={generated.totale_kostprijs_pp ? `€${Number(generated.totale_kostprijs_pp).toFixed(2)}` : '—'} />
                                <Stat icon={Euro} label="Advies/p" value={generated.adviesprijs_pp ? `€${Number(generated.adviesprijs_pp).toFixed(2)}` : '—'} highlight />
                            </div>

                            {(() => {
                                const kost = Number(generated.totale_kostprijs_pp) || 0;
                                const aiSuggest = Number(generated.adviesprijs_pp) || Math.ceil(kost * 2) || 0;
                                const huidig = prijsPp ?? aiSuggest;
                                const margePp = huidig - kost;
                                const margePct = huidig > 0 ? (margePp / huidig) * 100 : 0;
                                const margeColor = margePct >= 40 ? '#22c55e' : margePct >= 30 ? '#f59e0b' : 'var(--red)';
                                const aangepast = prijsPp !== null && Math.round(prijsPp) !== Math.round(aiSuggest);
                                const adjust = (delta: number) => setPrijsPp(Math.max(0, Math.round((huidig + delta) * 100) / 100));
                                return (
                                    <div style={{ padding: 14, borderRadius: 10, background: 'linear-gradient(135deg, rgba(196,163,90,.12), rgba(255,255,255,.02))', border: '1px solid rgba(196,163,90,.25)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '.15em' }}>Prijs per persoon</div>
                                            {kost > 0 && (
                                                <div style={{ fontSize: 11, fontWeight: 700, color: margeColor, fontVariantNumeric: 'tabular-nums' }}>
                                                    Marge {margePct.toFixed(0)}% (€{margePp.toFixed(2)}/p)
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                            <button type="button" onClick={() => adjust(-2.5)} aria-label="€2,50 minder"
                                                style={{ minWidth: 44, height: 44, borderRadius: 10, border: '1px solid rgba(196,163,90,.3)', background: 'rgba(196,163,90,.08)', color: GOLD, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Minus size={16} />
                                            </button>
                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, fontWeight: 500, color: GOLD, pointerEvents: 'none' }}>€</span>
                                                <input
                                                    type="number" min={0} step={0.5}
                                                    value={huidig}
                                                    onChange={(e) => setPrijsPp(parseFloat(e.target.value) || 0)}
                                                    style={{ width: '100%', height: 44, paddingLeft: 30, paddingRight: 12, borderRadius: 10, border: '1px solid rgba(196,163,90,.3)', background: 'rgba(0,0,0,.25)', color: GOLD, fontSize: 22, fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontVariantNumeric: 'tabular-nums', textAlign: 'center', outline: 'none' }}
                                                />
                                            </div>
                                            <button type="button" onClick={() => adjust(2.5)} aria-label="€2,50 meer"
                                                style={{ minWidth: 44, height: 44, borderRadius: 10, border: '1px solid rgba(196,163,90,.3)', background: 'rgba(196,163,90,.08)', color: GOLD, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                                            <div>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted, #999)', textTransform: 'uppercase', letterSpacing: '.15em' }}>Totaal offerte</div>
                                                <div style={{ fontSize: 24, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
                                                    €{(huidig * gasten).toFixed(2)}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--muted, #999)', textAlign: 'right' }}>
                                                {gasten} gasten × €{huidig.toFixed(2)}
                                                {aangepast && (
                                                    <button type="button" onClick={() => setPrijsPp(aiSuggest)}
                                                        style={{ display: 'block', marginLeft: 'auto', marginTop: 4, padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: GOLD, fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}>
                                                        ↺ AI-advies (€{aiSuggest.toFixed(2)})
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted, #999)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 8 }}>Menu · {(generated.gerechten || []).length} gerechten</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {(generated.gerechten || []).map((g: any, i: number) => (
                                        <div key={i} style={{ padding: 10, borderRadius: 8, background: 'var(--card, #15151a)', border: '1px solid var(--card-solid, #1a1a1e)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: 'var(--muted, #999)' }}>{g.gang || g.categorie || '—'}</span>
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{g.naam}</div>
                                                {g.beschrijving && <div style={{ fontSize: 11, color: 'var(--muted, #999)', marginTop: 2 }}>{g.beschrijving}</div>}
                                            </div>
                                            {g.geschatte_kostprijs_pp && (
                                                <span style={{ fontSize: 11, color: GOLD, fontVariantNumeric: 'tabular-nums', fontWeight: 700, whiteSpace: 'nowrap' }}>€{Number(g.geschatte_kostprijs_pp).toFixed(2)}/p</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {error && (
                                <div style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 12, color: 'var(--red)' }}>{error}</div>
                            )}

                            <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, paddingTop: 10, background: 'var(--bg, #0a0a0d)' }}>
                                <button onClick={() => setStep('input')} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid, #1a1a1e)', background: 'var(--card, #15151a)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Opnieuw</button>
                                <button onClick={saveAsOfferte} disabled={saving}
                                    style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: GOLD, color: '#000', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    {saving ? <><Loader2 size={14} className="spin" /> Offerte opslaan...</> : <><ArrowRight size={14} /> Opslaan als concept-offerte</>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted, #999)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6, display: 'block' }}>{children}</label>;
}

function Stat({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
    return (
        <div style={{ padding: 10, borderRadius: 8, background: 'var(--card, #15151a)', border: '1px solid var(--card-solid, #1a1a1e)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted, #999)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon size={10} /> {label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: highlight ? GOLD : '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--card-solid, #1a1a1e)',
    background: 'var(--color-bg-deep, #0d0d10)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
};
