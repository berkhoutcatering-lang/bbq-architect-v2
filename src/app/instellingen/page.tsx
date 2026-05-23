/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef } from 'react';
import { useSettings, useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/lib/OrgContext';
import { supabase } from '@/lib/supabase';
import type { DbEvent, Factuur, Offerte, Recept, Materieel } from '@/types';
import PageHeader from '@/components/PageHeader';
import { Building2, Check, CloudUpload, Database, Eye, FileText, Layout, Loader2, Palette, Pen, Save, Settings } from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import { updateSettings } from './actions';
import { THEMES, type ThemePreset, type ThemeMode, findPresetBySignature } from '@/lib/themes';
import { perceivedLightness } from '@/lib/colorMath';

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

                    {/* Curated thema-presets — geen eigen kleuren kiezen, alleen kant-en-klare combinaties */}
                    <ThemePresetPicker form={form} setForm={setForm} />
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

// ── Curated thema-presets — source of truth lives in src/lib/themes.ts.
// The same 8 presets are consumed by: (1) ThemeProvider runtime hydration,
// (2) the FOUC-fixing :root injector in app/layout.tsx, (3) the WCAG
// contrast-audit CI job. Adding or editing a preset reruns the audit.

function MiniDashboard({ preset }: { preset: ThemePreset }) {
    const { bg, card, text, primary, accent, mode } = preset;
    const wMuted = mode === 'light' ? '65%' : '55%';
    const muted = `color-mix(in oklch, ${text} ${wMuted}, ${bg})`;
    const border = `color-mix(in oklch, ${card}, ${text} 12%)`;
    return (
        <div style={{ background: bg, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 130 }} aria-hidden>
            <div style={{ display: 'flex', gap: 5 }}>
                {[['Omzet', '€ 12,8k'], ['Marge', '68%'], ['Events', '7']].map(([label, val]) => (
                    <div key={label} style={{ flex: 1, background: card, borderRadius: 4, padding: '5px 6px', border: `1px solid ${border}` }}>
                        <div style={{ fontSize: 7, color: muted, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <div style={{ background: primary, color: mode === 'dark' ? bg : '#fff', fontSize: 7, fontWeight: 700, padding: '3px 8px', borderRadius: 3 }}>Nieuw event</div>
                <div style={{ border: `1px solid ${border}`, color: muted, fontSize: 7, fontWeight: 600, padding: '3px 6px', borderRadius: 3 }}>Filters</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[['Buurtfeest', 'Bevestigd'], ['Bruiloft V.D.', 'Optie']].map(([name, status], i) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 5, background: card, borderRadius: 3, padding: '3px 6px', border: `1px solid ${border}` }}>
                        <div style={{
                            width: 14, height: 14, borderRadius: 3,
                            background: `color-mix(in oklch, ${primary} 14%, transparent)`,
                            border: `1px solid color-mix(in oklch, ${primary} 28%, transparent)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 7, fontWeight: 700, color: primary, fontVariantNumeric: 'tabular-nums',
                        }}>{['18', '20'][i]}</div>
                        <span style={{ fontSize: 8, fontWeight: 600, color: text, flex: 1 }}>{name}</span>
                        <span style={{
                            fontSize: 7, padding: '1px 4px', borderRadius: 99, fontWeight: 700,
                            background: i === 0 ? 'rgba(34,197,94,.14)' : `color-mix(in oklch, ${accent} 14%, transparent)`,
                            color: i === 0 ? '#22c55e' : accent,
                        }}>{status}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PresetCard({ preset, isActive, onClick }: { preset: ThemePreset; isActive: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={isActive}
            aria-label={`Thema ${preset.name} — ${preset.description}`}
            style={{
                position: 'relative', padding: 0,
                borderRadius: 'var(--radius-lg, 12px)', overflow: 'hidden', cursor: 'pointer',
                border: isActive ? `2px solid ${preset.primary}` : '1px solid var(--border)',
                background: 'var(--card-solid)', textAlign: 'left', color: 'var(--text)',
                transition: 'transform .15s, box-shadow .15s',
                display: 'flex', flexDirection: 'column',
                minHeight: 220,
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 18px -8px ${preset.primary}55`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
            <MiniDashboard preset={preset} />
            {isActive && (
                <div style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 22, height: 22, borderRadius: '50%',
                    background: preset.primary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 2px 8px color-mix(in oklch, ${preset.primary} 40%, transparent)`,
                }} aria-hidden>
                    <Check size={12} color={preset.mode === 'dark' ? preset.bg : '#ffffff'} strokeWidth={3} />
                </div>
            )}
            <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{preset.name}</span>
                    <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
                        color: 'var(--muted)', background: 'var(--sidebar-bg-hover)',
                        padding: '2px 6px', borderRadius: 4,
                    }}>
                        {preset.mode === 'dark' ? 'Donker' : 'Licht'}
                    </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{preset.description}</div>
            </div>
        </button>
    );
}

function ThemePreviewPane({ preset }: { preset: ThemePreset }) {
    const { bg, card, text, primary, accent, mode } = preset;
    const wMuted = mode === 'light' ? '65%' : '55%';
    const muted = `color-mix(in oklch, ${text} ${wMuted}, ${bg})`;
    const border = `color-mix(in oklch, ${card}, ${text} 12%)`;
    const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <div style={{ background: card, borderRadius: 8, border: `1px solid ${border}`, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${border}`, fontSize: 10, fontWeight: 700, letterSpacing: '.15em', textTransform: 'uppercase', color: muted }}>{title}</div>
            <div style={{ padding: 12 }}>{children}</div>
        </div>
    );
    return (
        <div
            role="img"
            aria-label={`Live voorbeeld van thema ${preset.name}`}
            style={{
                background: bg, color: text,
                borderRadius: 12, padding: 12,
                display: 'flex', flexDirection: 'column', gap: 10,
                border: `1px solid ${border}`,
                transition: 'background .25s, color .25s',
            }}
        >
            <Section title="Dashboard">
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {[['Omzet', '€ 12.840', false], ['Marge', '68,4%', true], ['Events', '7', false]].map(([label, val, isOk]) => (
                        <div key={label as string} style={{ flex: 1, background: bg, borderRadius: 6, padding: '8px 8px 6px', border: `1px solid ${border}` }}>
                            <div style={{ fontSize: 8, color: muted, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>{label}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: isOk ? '#22c55e' : text, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                        </div>
                    ))}
                </div>
                <div style={{ height: 48, borderRadius: 6, background: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'flex-end', padding: '0 6px 4px', gap: 3 }}>
                    {[35, 55, 42, 68, 52, 74, 60, 48, 72, 65, 80, 58].map((h, i) => (
                        <div key={i} style={{
                            flex: 1,
                            height: `${h * 0.5}px`,
                            background: i === 11 ? primary : `color-mix(in oklch, ${primary} ${mode === 'dark' ? '22%' : '34%'}, transparent)`,
                            borderRadius: '2px 2px 0 0',
                        }} />
                    ))}
                </div>
            </Section>
            <Section title="Menukaart">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                        { name: 'Pulled pork, 14u smoked', price: '€ 8,50', allergens: ['Gluten', 'Mosterd'] },
                        { name: 'Brisket, oak-smoked 12u', price: '€ 12,00', allergens: ['Selderij'] },
                    ].map(d => (
                        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', background: bg, borderRadius: 6, border: `1px solid ${border}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: text, marginBottom: 2 }}>{d.name}</div>
                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                    {d.allergens.map(a => (
                                        <span key={a} style={{
                                            fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                                            background: `color-mix(in oklch, ${accent} 14%, transparent)`,
                                            color: accent,
                                        }}>{a}</span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{d.price}</div>
                        </div>
                    ))}
                </div>
            </Section>
            <Section title="Offerte">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: text }}>Bruiloft Van Dijk</div>
                        <div style={{ fontSize: 10, color: muted }}>OFF-2026-0142 · 120 gasten</div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,.14)', color: '#22c55e', border: '1px solid rgba(34,197,94,.28)' }}>Bevestigd</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1, background: primary, color: mode === 'dark' ? bg : '#ffffff', fontSize: 10, fontWeight: 700, padding: '6px 0', borderRadius: 5, textAlign: 'center', letterSpacing: '.02em' }}>PDF downloaden</div>
                    <div style={{ flex: 1, border: `1px solid ${border}`, color: text, fontSize: 10, fontWeight: 600, padding: '6px 0', borderRadius: 5, textAlign: 'center' }}>Follow-up</div>
                </div>
            </Section>
        </div>
    );
}

function ThemePresetPicker({ form, setForm }: { form: any; setForm: (fn: any) => void }) {
    function applyPreset(t: ThemePreset) {
        setForm((prev: any) => ({
            ...prev,
            brand_background: t.bg,
            brand_text: t.text,
            brand_card: t.card,
            brand_primary: t.primary,
            brand_accent: t.accent,
            brand_secondary: t.secondary,
        }));
    }

    const currentId = findPresetBySignature(form.brand_background, form.brand_primary)?.id ?? null;

    // Live preset reflects the in-memory form state so the preview pane updates
    // the instant a card is clicked — no save round-trip, no full app reload.
    // For custom-hex tenants (no signature match) we still build a valid preset
    // from the raw values; mode is recomputed from bg lightness.
    const liveBg = (form.brand_background as string | undefined) ?? '#121214';
    const liveMode: ThemeMode = perceivedLightness(liveBg) > 0.5 ? 'light' : 'dark';
    const livePreset: ThemePreset = {
        id: currentId ?? 'custom',
        name: currentId ?? 'Eigen kleuren',
        description: '',
        mode: liveMode,
        bg: liveBg,
        card: (form.brand_card as string | undefined) ?? '#1e1e22',
        text: (form.brand_text as string | undefined) ?? '#f8f8f8',
        primary: (form.brand_primary as string | undefined) ?? '#c4a35a',
        accent: (form.brand_accent as string | undefined) ?? (form.brand_primary as string | undefined) ?? '#c4a35a',
        secondary: (form.brand_secondary as string | undefined) ?? liveBg,
    };

    return (
        <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
                Kies een thema. Elke combinatie is afgestemd op leesbaarheid en kleurbalans — voorbeeld rechts toont je keuze live. Klik &quot;Instellingen opslaan&quot; onderaan om door te voeren.
            </div>
            <div className="theme-picker-layout">
                <div className="theme-picker-grid">
                    {THEMES.map(t => (
                        <PresetCard
                            key={t.id}
                            preset={t}
                            isActive={currentId === t.id}
                            onClick={() => applyPreset(t)}
                        />
                    ))}
                </div>
                <aside className="theme-picker-preview">
                    <div style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '.15em',
                        textTransform: 'uppercase', color: 'var(--muted)',
                        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <Eye size={12} /> Live voorbeeld
                    </div>
                    <ThemePreviewPane preset={livePreset} />
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                        {currentId
                            ? `Actief in voorbeeld: ${livePreset.name}`
                            : 'Eigen kleuren (geen preset-match)'}
                    </div>
                </aside>
            </div>
            <div style={{
                marginTop: 14, padding: 10, borderRadius: 8,
                background: 'color-mix(in oklch, var(--brand) 8%, transparent)',
                border: '1px solid color-mix(in oklch, var(--brand) 22%, transparent)',
                fontSize: 12, color: 'var(--muted)',
            }}>
                <strong style={{ color: 'var(--text)' }}>Belangrijk:</strong> rood/groen waarschuwingen (lage voorraad, bevestigd, urgent) blijven altijd hun betekenis houden — die kleuren veranderen niet mee met het thema.
            </div>
            {/* Responsive layout — scoped to the picker, no globals.css touch.
                Plain <style> with dangerouslySetInnerHTML (NOT styled-jsx) to
                stay clear of Turbopack 16's styled-jsx hang on interpolation. */}
            <style dangerouslySetInnerHTML={{ __html: `
                .theme-picker-layout {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 320px;
                    gap: 20px;
                    align-items: flex-start;
                }
                .theme-picker-grid {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 10px;
                }
                .theme-picker-preview {
                    position: sticky;
                    top: 16px;
                }
                @media (max-width: 1100px) {
                    .theme-picker-layout { grid-template-columns: 1fr; }
                    .theme-picker-preview { position: static; max-width: 480px; margin: 0 auto; }
                }
                @media (max-width: 768px) {
                    .theme-picker-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                }
            ` }} />
        </div>
    );
}

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
