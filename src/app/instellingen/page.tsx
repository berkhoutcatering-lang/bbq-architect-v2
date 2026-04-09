/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef } from 'react';
import { useSettings, useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/lib/OrgContext';
import { supabase } from '@/lib/supabase';
import type { DbEvent, Factuur, Offerte, Recept, Materieel } from '@/types';
import { Building2, CloudUpload, Database, FileText, Loader2, Palette, Save } from 'lucide-react';

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

    function saveSettings() {
        const { id, created_at, updated_at, ...data } = form;
        save(data).then(function () { showToast('Instellingen opgeslagen', 'success'); });
    }

    if (loading || !form) return <div className="empty-state"><Loader2 size={14} className="animate-spin" /><p>Laden...</p></div>;

    return (
        <>
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
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Deze instellingen bepalen hoe je facturen, offertes en klantpagina&apos;s eruitzien.</p>

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

                    {/* Colors */}
                    <div className="form-grid">
                        <div className="field">
                            <label>Primaire kleur</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="color" value={form.brand_primary || '#9e781c'} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_primary', e.target.value); }} style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                                <input value={form.brand_primary || '#9e781c'} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_primary', e.target.value); }} placeholder="#9e781c" style={{ flex: 1 }} />
                            </div>
                        </div>
                        <div className="field">
                            <label>Accent kleur (optioneel)</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="color" value={form.brand_accent || form.brand_primary || '#9e781c'} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_accent', e.target.value); }} style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                                <input value={form.brand_accent || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('brand_accent', e.target.value); }} placeholder="Auto (donkerder)" style={{ flex: 1 }} />
                            </div>
                        </div>
                    </div>

                    {/* Preview */}
                    <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#fafaf7', border: '1px solid #eee' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Preview</div>
                        <div style={{ height: 3, background: form.brand_primary || '#9e781c', borderRadius: 2, marginBottom: 12 }} />
                        <div style={{ textAlign: 'center', marginBottom: 12 }}>
                            {form.logo_url ? (
                                <img src={form.logo_url} alt="Preview" style={{ maxHeight: 36, objectFit: 'contain' }} />
                            ) : (
                                <span style={{ fontSize: 16, fontWeight: 800, color: form.brand_primary || '#9e781c' }}>{form.bedrijfsnaam || 'Bedrijfsnaam'}</span>
                            )}
                        </div>
                        <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 6, background: form.brand_primary || '#9e781c', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>
                            FACTUUR
                        </div>
                        <div style={{ height: 3, background: form.brand_primary || '#9e781c', borderRadius: 2, marginTop: 12 }} />
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
        </>
    );
}
