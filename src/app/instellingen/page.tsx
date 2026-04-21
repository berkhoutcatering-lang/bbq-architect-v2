/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef } from 'react';
import { useSettings, useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/lib/OrgContext';
import { supabase } from '@/lib/supabase';
import type { DbEvent, Factuur, Offerte, Recept, Materieel } from '@/types';
import PageHeader from '@/components/PageHeader';
import { Building2, CloudUpload, Database, FileText, Layout, Loader2, Palette, Pen, Save } from 'lucide-react';

export default function Instellingen() {
    const { settings, loading, save } = useSettings();
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

    function saveSettings() {
        const { id, created_at, updated_at, ...data } = form;
        const beforePrimary = settings?.brand_primary as string | undefined;
        const beforeAccent = settings?.brand_accent as string | undefined;
        save(data).then(function () {
            showToast('Instellingen opgeslagen', 'success');
            // Detect huisstijl change → ask the user whether to also update existing templates
            const changed: { primary?: string; accent?: string } = {};
            if (data.brand_primary && data.brand_primary !== beforePrimary) changed.primary = data.brand_primary;
            if (data.brand_accent && data.brand_accent !== beforeAccent) changed.accent = data.brand_accent;
            if (changed.primary || changed.accent) setPendingCascade(changed);
        });
    }

    if (loading || !form) return <div className="empty-state"><Loader2 size={14} className="animate-spin" /><p>Laden...</p></div>;

    return (
        <>
            <PageHeader title="Instellingen" description="Beheer bedrijfsgegevens, huisstijl en systeeminstellingen" />

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

                    {/* Colors — 3 huiskleuren */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                        <div className="field">
                            <label>Primair (hoofdkleur)</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="color" value={form.brand_primary || '#c4a35a'} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_primary', e.target.value); }} style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                                <input value={form.brand_primary || '#c4a35a'} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_primary', e.target.value); }} placeholder="#c4a35a" style={{ flex: 1 }} />
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Knoppen, highlights, pictogrammen</div>
                        </div>
                        <div className="field">
                            <label>Accent (tweede)</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="color" value={form.brand_accent || form.brand_primary || '#c4a35a'} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_accent', e.target.value); }} style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                                <input value={form.brand_accent || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_accent', e.target.value); }} placeholder="Auto (donkerder)" style={{ flex: 1 }} />
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Gradient-einde, hover-state</div>
                        </div>
                        <div className="field">
                            <label>Donker (basis)</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="color" value={form.brand_secondary || '#1a1a1a'} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_secondary', e.target.value); }} style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                                <input value={form.brand_secondary || '#1a1a1a'} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_secondary', e.target.value); }} placeholder="#1a1a1a" style={{ flex: 1 }} />
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Achtergrond-tint, sidebar</div>
                        </div>
                    </div>

                    {/* Preset-kleuren */}
                    <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Presets</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {[
                                { naam: 'BBQ Goud', primary: '#c4a35a', accent: '#a8893e', donker: '#1a1a1a' },
                                { naam: 'Vuur & Rook', primary: '#e85d04', accent: '#9d0208', donker: '#1a0f0d' },
                                { naam: 'Bos & Ei', primary: '#52796f', accent: '#354f52', donker: '#2f3e46' },
                                { naam: 'Koper', primary: '#b87333', accent: '#8b4513', donker: '#1e1410' },
                                { naam: 'Royal Blauw', primary: '#3b82f6', accent: '#1e40af', donker: '#0f172a' },
                                { naam: 'Wijn', primary: '#7f1d1d', accent: '#4a0404', donker: '#1c0a0a' },
                            ].map(function (p) {
                                return (
                                    <button key={p.naam} onClick={function () { setForm(function (prev: any) { return Object.assign({}, prev, { brand_primary: p.primary, brand_accent: p.accent, brand_secondary: p.donker }); }); }}
                                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ display: 'inline-flex', gap: 2 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.primary }} />
                                            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.accent }} />
                                            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.donker, border: '1px solid rgba(255,255,255,.1)' }} />
                                        </span>
                                        {p.naam}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Preview */}
                    <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: form.brand_secondary || '#1a1a1a', border: '1px solid rgba(255,255,255,.1)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Live preview</div>
                        <div style={{ height: 3, background: 'linear-gradient(to right, ' + (form.brand_primary || '#c4a35a') + ', ' + (form.brand_accent || form.brand_primary || '#c4a35a') + ')', borderRadius: 2, marginBottom: 12 }} />
                        <div style={{ textAlign: 'center', marginBottom: 12 }}>
                            {form.logo_url ? (
                                <img src={form.logo_url} alt="Preview" style={{ maxHeight: 36, objectFit: 'contain' }} />
                            ) : (
                                <span style={{ fontSize: 18, fontWeight: 800, color: form.brand_primary || '#c4a35a' }}>{form.bedrijfsnaam || 'Hop & Bites'}</span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                            <button style={{ padding: '6px 14px', borderRadius: 6, background: form.brand_primary || '#c4a35a', color: '#000', border: 'none', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>OFFERTE</button>
                            <button style={{ padding: '6px 14px', borderRadius: 6, background: 'transparent', color: form.brand_accent || form.brand_primary || '#c4a35a', border: '1px solid ' + (form.brand_accent || form.brand_primary || '#c4a35a'), fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>FACTUUR</button>
                        </div>
                        <div style={{ height: 3, background: 'linear-gradient(to right, ' + (form.brand_primary || '#c4a35a') + ', ' + (form.brand_accent || form.brand_primary || '#c4a35a') + ')', borderRadius: 2 }} />
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
                            { type: 'menukaart', label: 'Menukaart' },
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
