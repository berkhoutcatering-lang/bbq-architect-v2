/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef } from 'react';
import { useSettings, useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/lib/OrgContext';
import { supabase } from '@/lib/supabase';
import type { DbEvent, Factuur, Offerte, Recept, Materieel } from '@/types';
import PageHeader from '@/components/PageHeader';
import { Building2, CloudUpload, Database, FileText, Layout, Loader2, Palette, Pen, Save, Settings } from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import { updateSettings } from './actions';
import { ThemePresetPicker } from '@/components/theme/ThemePresetPicker';

export default function Instellingen() {
    /* `save` van useSettings doet directe Supabase update zonder Zod/re-auth.
       We negeren die en gebruiken de Server Action `updateSettings` voor de
       writes — `useSettings` levert nog wel `settings` + `loading` voor het
       initiële form-state. */
    const { settings, loading } = useSettings();
    const ev = useSupabase<DbEvent>('events', []);
    const fac = useSupabase<Factuur>('facturen', []);
    const off = useSupabase<Offerte>('offertes', []);
    const rec = useSupabase<Recept>('recepten', []);
    const mat = useSupabase<Materieel>('materieel', []);
    const showToast = useToast();
    const { orgId } = useOrg();
    const [form, setForm] = useState<any>(null);
    const [uploading, setUploading] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const logoDarkInputRef = useRef<HTMLInputElement>(null);

    useEffect(function () {
        if (settings && !form) setForm(JSON.parse(JSON.stringify(settings)));
    }, [settings]);

    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    async function uploadLogo(file: File, variant: 'logo' | 'logo-dark') {
        if (!supabase || !orgId) return;
        setUploading(true);
        const ext = file.name.split('.').pop() || 'png';
        const path = orgId + '/' + variant + '.' + ext;

        const { error: uploadErr } = await supabase.storage.from('brand-assets').upload(path, file, { upsert: true });
        if (uploadErr) { showToast('Upload mislukt: ' + uploadErr.message, 'error'); setUploading(false); return; }

        const { data: urlData } = supabase.storage.from('brand-assets').getPublicUrl(path);
        const url = urlData?.publicUrl + '?t=' + Date.now();

        if (variant === 'logo') setField('logo_url', url);
        else setField('logo_dark_url', url);
        setUploading(false);
        showToast('Logo geupload', 'success');
    }

    // Track the brand colours we last loaded so we can detect changes and offer a cascade
    const [pendingCascade, setPendingCascade] = useState<null | { primary?: string; accent?: string }>(null);

    async function saveSettings() {
        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
        const { id, created_at, updated_at, ...data } = form;
        const beforePrimary = settings?.brand_primary as string | undefined;
        const beforeAccent = settings?.brand_accent as string | undefined;

        // Detecteer of een thema-veld is gewijzigd — dan moeten we na opslaan harde reload doen
        // zodat gecachede CSS/SW-assets opnieuw worden opgehaald en de app in het nieuwe thema opstart.
        const themeFields: Array<keyof typeof data> = [
            'brand_background', 'brand_text', 'brand_card',
            'brand_primary', 'brand_accent', 'brand_secondary',
        ];
        const themeChanged = themeFields.some(function (k) {
            return (data[k] as unknown) !== (settings?.[k] as unknown) && (data[k] as unknown) != null;
        });

        const result = await updateSettings(data);
        if (result.error) {
            const fieldMsg = result.fields
                ? ' (' + Object.entries(result.fields).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('; ') + ')'
                : '';
            showToast('Opslaan mislukt: ' + result.error + fieldMsg, 'error');
            return;
        }

        showToast('Instellingen opgeslagen', 'success');
        // Detect huisstijl change → ask the user whether to also update existing templates
        const changed: { primary?: string; accent?: string } = {};
        if (data.brand_primary && data.brand_primary !== beforePrimary) changed.primary = data.brand_primary;
        if (data.brand_accent && data.brand_accent !== beforeAccent) changed.accent = data.brand_accent;
        if (changed.primary || changed.accent) setPendingCascade(changed);

        if (themeChanged) {
            // SW + browser caches flushen zodat CSS-assets vers worden opgehaald.
            try {
                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(function (k) { return caches.delete(k); }));
                }
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(function (r) { return r.update(); }));
                }
            } catch { /* cache flush is best-effort */ }
            // Kleine delay zodat de toast nog even leesbaar is, dan hard reload (cache-buster in URL).
            setTimeout(function () {
                const sep = window.location.href.includes('?') ? '&' : '?';
                window.location.href = window.location.href.split('#')[0] + sep + '_t=' + Date.now();
            }, 600);
        }
    }

    if (loading || !form) return <div className="empty-state"><Loader2 size={14} className="animate-spin" /><p>Laden...</p></div>;

    return (
        <>
            <PageHeader title="Instellingen" description="Beheer bedrijfsgegevens, huisstijl en systeeminstellingen" />

            <PageGuideNote
                id="instellingen"
                accent="#64748b"
                icon={Settings}
                intro="De basis-instellingen die overal in de app terugkomen — vul één keer goed in en je bent klaar."
                actions={[
                    { lead: 'Bedrijfsgegevens', text: 'verschijnen op offertes, facturen en het klantenportaal — KvK en BTW horen hier ook.' },
                    { lead: 'Huisstijl en logo', text: 'bepalen hoe je offerte er voor de klant uitziet — upload één PNG en je bent door.' },
                    { lead: 'Vergeet niet op Opslaan te drukken', text: '— wijzigingen worden niet automatisch bewaard.' },
                ]}
            />

            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3><Building2 size={14} className="mr-1.5" style={{ color: 'var(--brand)' }} />Bedrijfsgegevens</h3></div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Bedrijfsnaam</label><input value={form.bedrijfsnaam || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('bedrijfsnaam', e.target.value); }} /></div>
                        <div className="field"><label>Ondertitel</label><input value={form.ondertitel || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('ondertitel', e.target.value); }} /></div>
                        <div className="field"><label>Email</label><input value={form.email || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('email', e.target.value); }} /></div>
                        <div className="field"><label>Telefoon</label><input value={form.telefoon || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('telefoon', e.target.value); }} /></div>
                        <div className="field full"><label>Adres</label><input value={form.adres || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('adres', e.target.value); }} /></div>
                        <div className="field"><label>Website</label><input value={form.website || ''} placeholder="www.hopenbites.nl" onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('website', e.target.value); }} /></div>
                        <div className="field"><label>KVK-nummer</label><input value={form.kvk || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('kvk', e.target.value); }} /></div>
                        <div className="field"><label>BTW-nummer</label><input value={form.btw || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('btw', e.target.value); }} /></div>
                        <div className="field"><label>IBAN</label><input value={form.iban || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('iban', e.target.value); }} /></div>
                    </div>
                </div>
            </div>

            {/* Huisstijl / Branding */}
            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3><Palette size={14} className="mr-1.5" style={{ color: 'var(--brand)' }} />Huisstijl</h3></div>
                <div className="panel-body">
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Deze kleuren bepalen de huisstijl van <strong>de hele app</strong> — knoppen, accenten, sidebar — én van je facturen, offertes en klantpagina&apos;s.</p>

                    {/* Logo upload */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Logo (lichte achtergrond)</label>
                            <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 16, textAlign: 'center', background: 'rgba(255,255,255,.03)', minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                                {form.logo_url ? (
                                    <>
                                        <img src={form.logo_url} alt="Logo" style={{ maxWidth: 140, maxHeight: 60, objectFit: 'contain' }} />
                                        <button type="button" onClick={function () { setField('logo_url', null); }} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Verwijder</button>
                                    </>
                                ) : (
                                    <button type="button" onClick={function () { logoInputRef.current?.click(); }} disabled={uploading} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                        <CloudUpload size={14} className="mr-1.5" />{uploading ? 'Uploaden...' : 'Logo uploaden'}
                                    </button>
                                )}
                            </div>
                            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={function (e) { if (e.target.files?.[0]) uploadLogo(e.target.files[0], 'logo'); }} />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Logo donker (menukaart, optioneel)</label>
                            <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 16, textAlign: 'center', background: 'rgba(0,0,0,.2)', minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                                {form.logo_dark_url ? (
                                    <>
                                        <img src={form.logo_dark_url} alt="Logo donker" style={{ maxWidth: 140, maxHeight: 60, objectFit: 'contain' }} />
                                        <button type="button" onClick={function () { setField('logo_dark_url', null); }} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Verwijder</button>
                                    </>
                                ) : (
                                    <button type="button" onClick={function () { logoDarkInputRef.current?.click(); }} disabled={uploading} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                        <CloudUpload size={14} className="mr-1.5" />{uploading ? 'Uploaden...' : 'Donker logo uploaden'}
                                    </button>
                                )}
                            </div>
                            <input ref={logoDarkInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={function (e) { if (e.target.files?.[0]) uploadLogo(e.target.files[0], 'logo-dark'); }} />
                        </div>
                    </div>

                    {/* Curated thema-presets — 8 OKLCH-presets, contrast vitest-guarded. */}
                    <ThemePresetPicker
                        currentPresetId={form?.theme_preset ?? null}
                        onChange={(id) => setField('theme_preset', id)}
                    />
                    <div style={{
                        marginTop: 14, padding: 10, borderRadius: 8,
                        background: 'color-mix(in oklch, var(--brand), transparent 92%)',
                        border: '1px solid color-mix(in oklch, var(--brand), transparent 80%)',
                        fontSize: 11, color: 'var(--muted)',
                    }}>
                        <strong style={{ color: 'var(--text)' }}>Goed om te weten:</strong>{' '}
                        rood/groen-waarschuwingen (lage voorraad, allergenen, bevestigd) blijven altijd
                        hun semantische betekenis houden — die wisselen niet mee met het gekozen thema.
                    </div>
                </div>
            </div>

            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3><FileText size={14} className="mr-1.5" style={{ color: 'var(--brand)' }} />Facturatie</h3></div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Factuurprefix</label><input value={form.factuur_prefix || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('factuur_prefix', e.target.value); }} /></div>
                        <div className="field"><label>Offerteprefix</label><input value={form.offerte_prefix || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('offerte_prefix', e.target.value); }} /></div>
                        <div className="field"><label>Standaard BTW (%)</label><input type="number" value={form.default_btw || 21} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('default_btw', parseInt(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Betaaltermijn (dagen)</label><input type="number" value={form.betaaltermijn || 14} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('betaaltermijn', parseInt(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Offerte geldigheid (dagen)</label><input type="number" value={form.offerte_geldig || 30} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('offerte_geldig', parseInt(e.target.value) || 0); }} /></div>
                    </div>
                </div>
            </div>

            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3><FileText size={14} className="mr-1.5" style={{ color: 'var(--brand)' }} />PDF Instellingen</h3></div>
                <div className="panel-body">
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Deze gegevens verschijnen automatisch op je facturen en offertes PDF&apos;s.</p>
                    <div className="form-grid">
                        <div className="field full">
                            <label>Betaalvoorwaarden</label>
                            <textarea rows={3} value={form.betaalvoorwaarden || ''} placeholder="Bijv: Betaling binnen 14 dagen na factuurdatum. Graag onder vermelding van het factuurnummer." onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('betaalvoorwaarden', e.target.value); }} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3><Layout size={14} className="mr-1.5" style={{ color: 'var(--brand)' }} />PDF Templates</h3></div>
                <div className="panel-body">
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Pas de opmaak van je documenten aan met de visuele template editor.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[
                            { type: 'factuur', label: 'Factuur' },
                            { type: 'offerte', label: 'Offerte' },
                            { type: 'haccp', label: 'HACCP Rapport' },
                            { type: 'bon', label: 'Bon / Kassaticket' },
                        ].map(function (doc) {
                            return (
                                <a key={doc.type} href={'/template-editor?type=' + doc.type}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', fontSize: 13, transition: 'border-color 0.15s' }}>
                                    <span style={{ fontWeight: 500 }}>{doc.label}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--brand)' }}>
                                        <Pen size={12} /> Template bewerken
                                    </span>
                                </a>
                            );
                        })}
                        {/* Menukaart is verhuisd naar per-offerte editor (S4) */}
                        <a href="/offertes"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid color-mix(in srgb, var(--brand) 25%, transparent)', textDecoration: 'none', color: 'var(--text)', fontSize: 13, transition: 'border-color 0.15s' }}>
                            <span style={{ fontWeight: 500 }}>
                                Menukaart
                                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>per offerte</span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--brand)' }}>
                                <Pen size={12} /> Via offerte aanpassen
                            </span>
                        </a>
                    </div>
                </div>
            </div>

            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3><Database size={14} className="mr-1.5" style={{ color: 'var(--brand)' }} />Gegevensoverzicht</h3></div>
                <div className="panel-body">
                    <div className="stat-grid">
                        <div className="stat-card">
                            <div className="stat-val">{ev.data.length}</div>
                            <div className="stat-label">Events</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-val">{fac.data.length}</div>
                            <div className="stat-label">Facturen</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-val">{off.data.length}</div>
                            <div className="stat-label">Offertes</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-val">{rec.data.length}</div>
                            <div className="stat-label">Recepten</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-val">{mat.data.length}</div>
                            <div className="stat-label">Materieel</div>
                        </div>
                    </div>
                </div>
            </div>

            <button className="btn btn-brand" onClick={saveSettings} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
                <Save size={14} /> Instellingen Opslaan
            </button>

            {pendingCascade && orgId && (
                <BrandCascadeDialog
                    organizationId={orgId}
                    brandColors={pendingCascade}
                    onClose={function () { setPendingCascade(null); }}
                    onDone={function (count) {
                        setPendingCascade(null);
                        if (count > 0) showToast('Huisstijl bijgewerkt in ' + count + ' sjablonen', 'success');
                    }}
                />
            )}
        </>
    );
}

// ── Curated thema's — verhuisd naar src/components/theme/ThemePresetPicker.tsx
//    8 OKLCH presets (was 6 hex), live preview-tabs (App / Klantportaal / PDF / Mobile),
//    contrast vitest-guard in src/lib/__tests__/theme-contrast.test.ts.

// ── Herbruikbare kleur-picker met label, hex-input en omschrijving ──
function ColorField({ label, sub, value, onChange, placeholder }: { label: string; sub?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
    const colorValue = value || placeholder?.match(/#[0-9a-f]{6}/i)?.[0] || '#000000';
    return (
        <div className="field">
            <label>{label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={colorValue} onChange={(e) => onChange(e.target.value)}
                    style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || colorValue} style={{ flex: 1 }} />
            </div>
            {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}

// ── Brand-color cascade dialog: lets the user push the just-saved huisstijl into existing templates ──
type TemplateRow = { id: string; name: string; document_type: string; page_settings?: { brandColors?: { primary?: string; accent?: string } } };
function BrandCascadeDialog({ organizationId, brandColors, onClose, onDone }: {
    organizationId: string;
    brandColors: { primary?: string; accent?: string };
    onClose: () => void;
    onDone: (updatedCount: number) => void;
}) {
    const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [mode, setMode] = useState<'all' | 'some'>('all');
    const [busy, setBusy] = useState(false);

    useEffect(function () {
        const params = new URLSearchParams({ orgId: organizationId });
        fetch('/api/templates?' + params.toString())
            .then(function (r) { return r.json(); })
            .then(function (d) {
                const list = (d.templates || []).filter(function (t: TemplateRow) { return t.id; });
                setTemplates(list);
                setSelected(new Set(list.map(function (t: TemplateRow) { return t.id; })));
            })
            .catch(function () { setTemplates([]); });
    }, [organizationId]);

    function toggle(id: string) {
        setSelected(function (prev) {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    async function apply(scope: 'all' | 'selected' | 'none') {
        if (scope === 'none') { onClose(); return; }
        setBusy(true);
        const ids = scope === 'all'
            ? (templates || []).map(function (t) { return t.id; })
            : Array.from(selected);
        try {
            const res = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_brand_colors',
                    organizationId,
                    templateIds: ids,
                    brandColors,
                }),
            });
            const data = await res.json();
            onDone(data.count || 0);
        } catch {
            onDone(0);
        } finally {
            setBusy(false);
        }
    }

    const colorChips = (
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
            {brandColors.primary && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: brandColors.primary, border: '1px solid var(--border-strong)' }} aria-hidden="true" />
                    Primair: <code style={{ fontFamily: 'monospace' }}>{brandColors.primary}</code>
                </span>
            )}
            {brandColors.accent && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: brandColors.accent, border: '1px solid var(--border-strong)' }} aria-hidden="true" />
                    Accent: <code style={{ fontFamily: 'monospace' }}>{brandColors.accent}</code>
                </span>
            )}
        </div>
    );

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cascade-title"
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
        >
            <div
                onClick={function (e) { e.stopPropagation(); }}
                style={{
                    width: 'min(560px, 92vw)', maxHeight: '80vh', overflow: 'hidden',
                    background: 'var(--surface, var(--card-solid))', border: '1px solid var(--border-strong)',
                    borderRadius: 10, boxShadow: '0 18px 48px rgba(0,0,0,.5)',
                    display: 'flex', flexDirection: 'column',
                }}
            >
                <div style={{ padding: '18px 22px 12px' }}>
                    <h2 id="cascade-title" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                        Huisstijl ook in sjablonen toepassen?
                    </h2>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 12px' }}>
                        Je hebt de huisstijlkleuren gewijzigd. Sjablonen die deze kleuren overschrijven blijven ongewijzigd, tenzij je ze hier kiest.
                    </p>
                    {colorChips}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 22px 4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', padding: '4px 0' }}>
                        <input type="radio" name="cascade-mode" checked={mode === 'all'} onChange={function () { setMode('all'); }} />
                        <strong>Alle sjablonen bijwerken</strong>
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>({templates ? templates.length : '…'})</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', padding: '4px 0' }}>
                        <input type="radio" name="cascade-mode" checked={mode === 'some'} onChange={function () { setMode('some'); }} />
                        <strong>Alleen geselecteerde sjablonen</strong>
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>({selected.size} gekozen)</span>
                    </label>
                </div>

                {mode === 'some' && (
                    <div style={{ padding: '6px 22px 12px', overflowY: 'auto', flex: 1 }}>
                        {!templates && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Sjablonen laden…</p>}
                        {templates && templates.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Geen sjablonen gevonden.</p>}
                        {templates && templates.map(function (t) {
                            const overridesPrimary = !!t.page_settings?.brandColors?.primary;
                            const overridesAccent = !!t.page_settings?.brandColors?.accent;
                            return (
                                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', padding: '5px 0', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={selected.has(t.id)} onChange={function () { toggle(t.id); }} />
                                    <span style={{ flex: 1 }}>{t.name}</span>
                                    <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.document_type}</span>
                                    {(overridesPrimary || overridesAccent) && (
                                        <span title="Sjabloon heeft eigen huisstijlkleur(en) — wordt overschreven" style={{ fontSize: 10, color: 'var(--amber)' }}>eigen</span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 22px 16px', borderTop: '1px solid var(--border)' }}>
                    <button
                        type="button"
                        onClick={function () { apply('none'); }}
                        disabled={busy}
                        style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}
                    >
                        Niet bijwerken
                    </button>
                    <button
                        type="button"
                        onClick={function () { apply(mode === 'all' ? 'all' : 'selected'); }}
                        disabled={busy || (mode === 'some' && selected.size === 0)}
                        className="btn btn-brand"
                        style={{ padding: '8px 14px', fontSize: 12 }}
                    >
                        {busy ? 'Bezig…' : (mode === 'all' ? 'Alle bijwerken' : 'Geselecteerde bijwerken')}
                    </button>
                </div>
            </div>
        </div>
    );
}
