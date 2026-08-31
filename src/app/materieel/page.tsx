/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useMemo, useRef } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { supabase } from '@/lib/supabase';
import { upsertMaterieel, deleteMaterieel as deleteMaterieelAction } from './actions';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmtNl, today } from '@/lib/utils';
import { useFormValidation } from '@/hooks/useFormValidation';
import FieldError from '@/components/FieldError';
import EmptyState from '@/components/EmptyState';
import MetallicCard from '@/components/MetallicCard';
import PageHeader from '@/components/PageHeader';
import type { Materieel as MatType } from '@/types';
import { ArrowLeft, Calendar, ClipboardList, Loader2, Plus, Save, Trash2, MapPin, Camera, X, Search, Sparkles, Upload, Boxes } from 'lucide-react';
import GnBakkenDrawer from './_components/GnBakkenDrawer';
import GemisRapport from './_components/GemisRapport';
import { RequireTier } from '@/components/PaywallPrompt';

const CATEGORIES = ['Alles', 'BBQ', 'Apparatuur', 'Gereedschap', 'Servies', 'Linnen', 'Koeling', 'Transport', 'Meubilair', 'Overig'] as const;
const BUCKET = 'materieel';

interface NewLogEntry {
    actie: string;
    notitie: string;
}

export default function Materieel() {
    /* `insert/update/remove` worden niet meer gebruikt — mutaties lopen via
       Server Actions (`./actions.ts`) voor Zod-validatie + re-auth (Bundel 7).
       `refetch` halen we wel uit useSupabase voor live-refresh na een action. */
    const { data: materieel, loading, refetch } = useSupabase<MatType>('materieel', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [editing, setEditing] = useState<number | string | null>(null);
    const [form, setForm] = useState<any>(null);
    const [newLog, setNewLog] = useState<NewLogEntry>({ actie: '', notitie: '' });
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [filter, setFilter] = useState<string>('Alles');
    const [search, setSearch] = useState('');
    // Scan-flow state: foto upload → AI Vision parse → preview → user-keur → insert
    const [scanOpen, setScanOpen] = useState(false);
    const [gnOpen, setGnOpen] = useState(false);
    const [gemisOpen, setGemisOpen] = useState(false);
    const [scanLoading, setScanLoading] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [scanPreview, setScanPreview] = useState<any>(null);
    const [scanUrl, setScanUrl] = useState('');
    const [scanImageDataUrl, setScanImageDataUrl] = useState<string | null>(null);
    const scanFileInputRef = useRef<HTMLInputElement>(null);
    const { errors, validateAll, clearError, fieldProps } = useFormValidation({
        naam: [{ required: 'Vul een naam in' }],
    });

    const filtered = useMemo(() => {
        const list = (materieel || []) as any[];
        const q = search.toLowerCase().trim();
        return list
            .filter(m => filter === 'Alles' || m.type === filter)
            .filter(m => !q || m.naam?.toLowerCase().includes(q) || m.locatie?.toLowerCase().includes(q) || m.notitie?.toLowerCase().includes(q));
    }, [materieel, filter, search]);

    const counts = useMemo(() => {
        const list = (materieel || []) as any[];
        const byType: Record<string, number> = {};
        list.forEach(m => { byType[m.type] = (byType[m.type] || 0) + 1; });
        return { total: list.length, byType };
    }, [materieel]);

    function newItem() {
        setEditing('new');
        setForm({ naam: '', type: 'BBQ', status: 'ok', aanschaf_datum: '', notitie: '', locatie: '', fotos: [], logboek: [] });
    }

    function editItem(m: any) { setEditing(m.id); setForm(JSON.parse(JSON.stringify({ ...m, fotos: m.fotos || [] }))); }
    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    async function saveItem() {
        if (!validateAll({ naam: form.naam })) return;
        const isNew = editing === 'new';
        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
        const { id: _existingId, created_at: _ca, ...rest } = form;
        const payload = isNew ? form : { id: editing as number, ...rest };
        const result = await upsertMaterieel(payload);
        if (result.error) {
            const fieldMsg = result.fields
                ? ' (' + Object.entries(result.fields).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('; ') + ')'
                : '';
            showToast((isNew ? 'Toevoegen' : 'Opslaan') + ' mislukt: ' + result.error + fieldMsg, 'error');
            return;
        }
        await refetch();
        showToast(isNew ? 'Materieel toegevoegd' : 'Materieel bijgewerkt', 'success');
        setEditing(null);
        setForm(null);
    }

    function deleteItem() {
        showConfirm('Materieel verwijderen?', async () => {
            /* Verwijder ook de foto's uit storage (best-effort, separate van de Server Action). */
            const paths = (form.fotos || []).map((url: string) => extractStoragePath(url)).filter(Boolean) as string[];
            if (paths.length > 0) supabase.storage.from(BUCKET).remove(paths).catch(() => { /* ignore */ });
            const result = await deleteMaterieelAction(editing as number);
            if (result.error) {
                showToast('Verwijderen mislukt: ' + result.error, 'error');
                return;
            }
            await refetch();
            showToast('Verwijderd', 'success');
            setEditing(null);
            setForm(null);
        });
    }

    function extractStoragePath(url: string): string | null {
        const match = url.match(/\/storage\/v1\/object\/public\/materieel\/(.+)$/);
        return match ? match[1] : null;
    }

    async function uploadFotos(files: FileList) {
        if (!files.length) return;
        setUploading(true);
        const newUrls: string[] = [];
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const ext = file.name.split('.').pop() || 'jpg';
                const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
                const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
                if (upErr) { showToast('Upload fout: ' + upErr.message, 'error'); continue; }
                const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
                if (data?.publicUrl) newUrls.push(data.publicUrl);
            }
            if (newUrls.length) {
                setField('fotos', [...(form.fotos || []), ...newUrls]);
                showToast(newUrls.length + ' foto' + (newUrls.length !== 1 ? '\'s' : '') + ' toegevoegd', 'success');
            }
        } finally { setUploading(false); }
    }

    async function removeFoto(url: string) {
        const path = extractStoragePath(url);
        if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => { /* ignore */ });
        setField('fotos', (form.fotos || []).filter((u: string) => u !== url));
    }

    function addLogEntry() {
        if (!newLog.actie) { showToast('Vul een actie in', 'error'); return; }
        const entry = { datum: today(), actie: newLog.actie, notitie: newLog.notitie };
        setField('logboek', (form.logboek || []).concat([entry]));
        setNewLog({ actie: '', notitie: '' });
        showToast('Logboek bijgewerkt — vergeet niet op te slaan', 'info');
    }

    // ── Scan-flow handlers ────────────────────────────────────────────────────
    function openScan(): void {
        setScanOpen(true);
        setScanError(null);
        setScanPreview(null);
        setScanImageDataUrl(null);
    }

    function closeScan(): void {
        setScanOpen(false);
        setScanError(null);
        setScanPreview(null);
        setScanImageDataUrl(null);
        if (scanFileInputRef.current) scanFileInputRef.current.value = '';
    }

    async function handleScanFile(file: File): Promise<void> {
        setScanLoading(true);
        setScanError(null);
        setScanPreview(null);
        try {
            // Lees naar base64 data-URL — preview én API in één keer
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result));
                r.onerror = () => reject(r.error || new Error('Kon bestand niet lezen'));
                r.readAsDataURL(file);
            });
            setScanImageDataUrl(dataUrl);
            const res = await fetch('/api/materieel/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: dataUrl, model: 'haiku' }),
            });
            const json = await res.json();
            if (!res.ok || json.error) {
                throw new Error(json.error || 'Scan mislukt');
            }
            setScanPreview(json.data);
        } catch (err: any) {
            setScanError(err.message || 'Onbekende fout');
        } finally {
            setScanLoading(false);
        }
    }

    /** Productlink lezen. De server haalt de pagina op, de AI leest de specs.
     *  Lukt dat niet — sommige winkels bouwen hun pagina pas in de browser op —
     *  dan zeggen we dat eerlijk en wijzen we naar de screenshot-route. */
    async function handleScanUrl(): Promise<void> {
        const url = scanUrl.trim();
        if (!url) return;
        setScanLoading(true);
        setScanError(null);
        setScanPreview(null);
        setScanImageDataUrl(null);
        try {
            const res = await fetch('/api/materieel/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productUrl: url, model: 'haiku' }),
            });
            const json = await res.json();
            if (!res.ok || json.error) {
                throw new Error(json.error || 'Link lezen mislukt');
            }
            setScanPreview(json.data);
            if (json.data?.foto_suggestie) setScanImageDataUrl(json.data.foto_suggestie);
        } catch (err: any) {
            setScanError(err.message || 'Onbekende fout');
        } finally {
            setScanLoading(false);
        }
    }

    function updateScanPreview(key: string, value: any): void {
        setScanPreview((prev: any) => prev ? { ...prev, [key]: value } : prev);
    }

    async function saveScanned(): Promise<void> {
        if (!scanPreview) return;
        try {
            // Upload de foto naar Storage zodat hij gekoppeld is aan het record
            let fotoUrls: string[] = [];
            if (scanImageDataUrl) {
                const blob = await (await fetch(scanImageDataUrl)).blob();
                const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
                const path = 'scan_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
                const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
                if (!upErr) {
                    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
                    if (pub?.publicUrl) fotoUrls = [pub.publicUrl];
                }
            }
            const payload = {
                naam: scanPreview.naam,
                type: scanPreview.type,
                status: 'ok' as const,
                kleur: scanPreview.kleur,
                materiaal: scanPreview.materiaal,
                afmetingen: scanPreview.afmetingen,
                geschikt_voor_gangen: scanPreview.geschikt_voor_gangen || [],
                ai_styling_hint: scanPreview.ai_styling_hint,
                notitie: scanPreview.notitie || '',
                fotos: fotoUrls,
                scan_source: scanPreview.scan_source,
                scan_data: scanPreview.scan_data,

                // Apparatuur-velden uit de link-lezer. Alleen meesturen wat
                // gevuld is: een leeg veld blijft leeg, niets wordt geraden.
                ...(scanPreview.soort ? { soort: scanPreview.soort } : {}),
                ...(scanPreview.merk ? { merk: scanPreview.merk } : {}),
                ...(scanPreview.model ? { model: scanPreview.model } : {}),
                ...(scanPreview.artikelnummer ? { artikelnummer: scanPreview.artikelnummer } : {}),
                ...(scanPreview.product_url ? { product_url: scanPreview.product_url } : {}),
                ...(scanPreview.breedte_mm != null ? { breedte_mm: scanPreview.breedte_mm } : {}),
                ...(scanPreview.diepte_mm != null ? { diepte_mm: scanPreview.diepte_mm } : {}),
                ...(scanPreview.hoogte_mm != null ? { hoogte_mm: scanPreview.hoogte_mm } : {}),
                ...(scanPreview.gewicht_g != null ? { gewicht_g: scanPreview.gewicht_g } : {}),
                ...(scanPreview.capaciteit_waarde != null ? { capaciteit_waarde: scanPreview.capaciteit_waarde } : {}),
                ...(scanPreview.capaciteit_eenheid ? { capaciteit_eenheid: scanPreview.capaciteit_eenheid } : {}),
                ...(scanPreview.temp_min_c != null ? { temp_min_c: scanPreview.temp_min_c } : {}),
                ...(scanPreview.temp_max_c != null ? { temp_max_c: scanPreview.temp_max_c } : {}),
                ...(scanPreview.specificaties ? { specificaties: scanPreview.specificaties } : {}),
            };
            const result = await upsertMaterieel(payload);
            if (result.error) {
                showToast('Opslaan mislukt: ' + result.error, 'error');
                return;
            }
            showToast('Toegevoegd via scan', 'success');
            closeScan();
            await refetch();
        } catch (err: any) {
            showToast('Opslaan mislukt: ' + (err.message || 'onbekend'), 'error');
        }
    }

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                <Loader2 size={32} className="animate-spin" style={{ marginBottom: 12, display: 'block' }} />
                Laden...
            </div>
        </div>
    );

    if (editing !== null && form) {
        return (
            <MetallicCard hover={false}>
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuw Materieel' : 'Materieel Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(null); setForm(null); }}><ArrowLeft size={14} /> Terug</button>
                </div>
                <div className="panel-body">
                    {/* FOTO UPLOAD SECTIE */}
                    <div style={{ marginBottom: 20 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.12em', display: 'block', marginBottom: 8 }}>Foto's ({(form.fotos || []).length})</label>
                        <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                            {(form.fotos || []).map((url: string, i: number) => (
                                <div key={i} style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--card-solid)', background: 'var(--card)' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={`Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <button onClick={() => removeFoto(url)} aria-label="Foto verwijderen"
                                        style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 6, background: 'rgba(0,0,0,.7)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <X size={13} />
                                    </button>
                                </div>
                            ))}
                            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                                style={{ aspectRatio: '1/1', borderRadius: 10, border: '1px dashed var(--card-solid)', background: 'var(--card)', color: 'var(--muted)', cursor: uploading ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11 }}>
                                {uploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={22} />}
                                {uploading ? 'Uploaden...' : 'Foto toevoegen'}
                            </button>
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display: 'none' }}
                            onChange={e => { if (e.target.files) uploadFotos(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ''; }} />
                    </div>

                    <div className="form-grid">
                        <div className="field"><label>Naam</label><input name="naam" value={form.naam} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { clearError('naam'); setField('naam', e.target.value); }} {...fieldProps('naam', form.naam)} style={errors.naam ? { borderColor: 'var(--red)' } : undefined} /><FieldError message={errors.naam} fieldName="naam" /></div>
                        <div className="field"><label>Categorie</label>
                            <select value={form.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('type', e.target.value)}>
                                {CATEGORIES.filter(c => c !== 'Alles').map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('status', e.target.value)}>
                                <option value="ok">OK</option>
                                <option value="warn">Aandacht nodig</option>
                                <option value="danger">Defect</option>
                            </select>
                        </div>
                        <div className="field"><label>Locatie</label>
                            <input value={form.locatie || ''} placeholder="bv. Loods, Bus 1, Koelkamer" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('locatie', e.target.value)} />
                        </div>
                        <div className="field"><label>Aanschafdatum</label><input type="date" value={form.aanschaf_datum || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('aanschaf_datum', e.target.value)} /></div>
                        <div className="field full"><label>Notitie</label><textarea rows={2} value={form.notitie || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField('notitie', e.target.value)} /></div>
                    </div>

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Onderhoudslogboek</h4>
                    {(form.logboek || []).map((entry: any, idx: number) => (
                        <div key={idx} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                            <span style={{ color: 'var(--muted)', marginRight: 12 }}>{fmtNl(entry.datum)}</span>
                            <span style={{ fontWeight: 600 }}>{entry.actie}</span>
                            {entry.notitie && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>— {entry.notitie}</span>}
                        </div>
                    ))}
                    <div className="responsive-row" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px var(--font-dm-sans), sans-serif' }}
                            placeholder="Actie (bijv. Reiniging)" value={newLog.actie} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLog(Object.assign({}, newLog, { actie: e.target.value }))} />
                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px var(--font-dm-sans), sans-serif' }}
                            placeholder="Notitie" value={newLog.notitie} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLog(Object.assign({}, newLog, { notitie: e.target.value }))} />
                        <button className="btn btn-brand btn-sm" onClick={addLogEntry} aria-label="Logboek item toevoegen"><Plus size={14} /></button>
                    </div>

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveItem}><Save size={14} /> Opslaan</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteItem}><Trash2 size={14} /> Verwijderen</button>}
                    </div>
                </div>
            </MetallicCard>
        );
    }

    const statusColors: Record<string, string> = { ok: 'var(--green)', warn: 'var(--amber)', danger: 'var(--red)', onderhoud: 'var(--amber)', defect: 'var(--red)' };
    const statusLabels: Record<string, string> = { ok: 'OK', warn: 'Aandacht', danger: 'Defect', onderhoud: 'Aandacht', defect: 'Defect' };
    const statusPills: Record<string, string> = { ok: 'pill-green', warn: 'pill-amber', danger: 'pill-red', onderhoud: 'pill-amber', defect: 'pill-red' };

    return (
        <RequireTier feature="materieel">
        <>
            <PageHeader
                title={'Materieel (' + materieel.length + ')'}
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost" onClick={() => setGemisOpen(true)} title="Welke technieken zijn voor jou gesloten omdat het apparaat ontbreekt">
                            <Sparkles size={14} /> Wat kan ik niet
                        </button>
                        <button className="btn btn-ghost" onClick={() => setGnOpen(true)} title="Tel je gastronorm-bakken — de maten staan al vast">
                            <Boxes size={14} /> GN tellen
                        </button>
                        <button className="btn btn-ghost" onClick={openScan} title="Lees een productlink, screenshot of foto uit via AI">
                            <Sparkles size={14} /> Product toevoegen
                        </button>
                        <button className="btn btn-brand" onClick={newItem}><Plus size={14} /> Nieuw</button>
                    </div>
                }
            />

            {/* ZOEKBALK */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek op naam of locatie..."
                    style={{ width: '100%', padding: '12px 40px 12px 42px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                {search && (
                    <button onClick={() => setSearch('')} aria-label="Wissen"
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 6, background: 'var(--color-bg-deep)', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>×</button>
                )}
            </div>

            {/* FILTER TABS */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {CATEGORIES.map(c => {
                    const active = filter === c;
                    const count = c === 'Alles' ? counts.total : (counts.byType[c] || 0);
                    return (
                        <button key={c} onClick={() => setFilter(c)}
                            style={{
                                padding: '8px 14px', borderRadius: 8,
                                border: active ? '1px solid var(--brand-primary)' : '1px solid var(--card-solid)',
                                background: active ? 'var(--brand-primary)' : 'var(--card)',
                                color: active ? 'var(--brand-background, #000)' : 'var(--text)',
                                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            }}>
                            {c}{count > 0 && <span style={{ opacity: 0.5, fontWeight: 500, marginLeft: 4 }}>· {count}</span>}
                        </button>
                    );
                })}
            </div>

            {materieel.length === 0 && <EmptyState page="/materieel" onAction={newItem} />}
            {materieel.length > 0 && filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
                    Geen items gevonden in deze categorie{search ? ' met "' + search + '"' : ''}.
                </div>
            )}
            <div className="grid-3">
                {filtered.map((m: any) => {
                    const firstFoto = (m.fotos || [])[0];
                    const fotoCount = (m.fotos || []).length;
                    return (
                        <div key={m.id} className="rec-card" onClick={() => editItem(m)} style={{ padding: 0, overflow: 'hidden' }}>
                            {firstFoto ? (
                                <div style={{ position: 'relative', aspectRatio: '16/10', background: 'var(--color-bg-deep)' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={firstFoto} alt={m.naam} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    {fotoCount > 1 && (
                                        <span style={{ position: 'absolute', bottom: 8, right: 8, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,.7)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <Camera size={10} /> {fotoCount}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <div style={{ aspectRatio: '16/10', background: 'var(--color-bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', opacity: 0.4 }}>
                                    <Camera size={26} />
                                </div>
                            )}
                            <div style={{ padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div className="rec-cat" style={{ color: statusColors[m.status] || 'var(--muted)' }}>{m.type}</div>
                                    <span className={'pill ' + (statusPills[m.status] || 'pill-green')}>{statusLabels[m.status] || 'OK'}</span>
                                </div>
                                <div className="rec-name">{m.naam}</div>
                                <div className="rec-meta">
                                    {m.locatie && <span><MapPin size={14} /> {m.locatie}</span>}
                                    {m.aanschaf_datum && <span><Calendar size={14} /> {fmtNl(m.aanschaf_datum)}</span>}
                                    <span><ClipboardList size={14} /> {(m.logboek || []).length}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* SCAN-MODAL: foto upload → AI Vision parse → preview → user-keur → insert */}
            <GemisRapport
                open={gemisOpen}
                onClose={() => setGemisOpen(false)}
                onGewijzigd={() => { refetch(); }}
            />

            <GnBakkenDrawer
                open={gnOpen}
                onClose={() => setGnOpen(false)}
                onSaved={(r) => {
                    refetch();
                    /* formaat → formaten, niet "formaaten": de dubbele a wordt
                       enkel in het meervoud. Losse uitgang erachter plakken
                       werkt in het Nederlands niet. */
                    showToast(
                        `Telling bewaard — ${r.bewaard} ${r.bewaard === 1 ? 'formaat' : 'formaten'}` +
                            (r.verwijderd ? `, ${r.verwijderd} verwijderd` : ''),
                        'success'
                    );
                }}
            />

            {scanOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Product scannen"
                    onClick={(e) => { if (e.target === e.currentTarget) closeScan(); }}
                    style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                >
                    <div style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Sparkles size={18} style={{ color: 'var(--brand)' }} />
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Product scannen</h3>
                            </div>
                            <button onClick={closeScan} aria-label="Sluiten" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                                <X size={18} />
                            </button>
                        </div>

                        {!scanPreview && !scanLoading && (
                            <div>
                                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
                                    Plak de link van de productpagina — dan leest de AI de specificaties er zelf uit: merk, model, afmetingen, capaciteit. Werkt de link niet, dan kun je altijd nog een foto of screenshot uploaden.
                                </p>

                                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                    <input
                                        value={scanUrl}
                                        onChange={(e) => setScanUrl(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleScanUrl(); }}
                                        placeholder="https://…  link van de productpagina"
                                        style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13 }}
                                    />
                                    <button
                                        onClick={handleScanUrl}
                                        disabled={!scanUrl.trim()}
                                        style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: scanUrl.trim() ? 'var(--brand)' : 'var(--card)', color: scanUrl.trim() ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: scanUrl.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                                    >
                                        Lees link
                                    </button>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px', color: 'var(--muted)', fontSize: 11 }}>
                                    <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                                    of
                                    <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                                </div>

                                <button
                                    onClick={() => scanFileInputRef.current?.click()}
                                    style={{ width: '100%', padding: '40px 20px', borderRadius: 10, border: '1px dashed var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
                                >
                                    <Upload size={28} style={{ color: 'var(--brand)' }} />
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>Klik om foto te uploaden</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>JPG / PNG / WebP — max 5MB</div>
                                </button>
                                <input
                                    ref={scanFileInputRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScanFile(f); }}
                                />
                            </div>
                        )}

                        {scanLoading && (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--brand)', marginBottom: 12 }} />
                                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>AI leest het product…</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Dit duurt 3-8 seconden</div>
                            </div>
                        )}

                        {scanError && !scanLoading && (
                            <div style={{ padding: 14, borderRadius: 8, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.06)', color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
                                ❌ {scanError}
                                <button onClick={() => { setScanError(null); setScanImageDataUrl(null); }} style={{ marginLeft: 8, background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                                    Probeer opnieuw
                                </button>
                            </div>
                        )}

                        {scanPreview && !scanLoading && (
                            <div>
                                {scanImageDataUrl && (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={scanImageDataUrl} alt="Geüpload" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, marginBottom: 12, background: 'rgba(0,0,0,0.3)' }} />
                                )}
                                <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                                    ✓ AI heeft het product gelezen — review en pas aan waar nodig
                                </div>

                                <div className="form-grid">
                                    <div className="field">
                                        <label>Naam</label>
                                        <input value={scanPreview.naam || ''} onChange={(e) => updateScanPreview('naam', e.target.value)} />
                                    </div>
                                    <div className="field">
                                        <label>Categorie</label>
                                        <select value={scanPreview.type} onChange={(e) => updateScanPreview('type', e.target.value)}>
                                            {CATEGORIES.filter(c => c !== 'Alles').map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="field">
                                        <label>Kleur</label>
                                        <input value={scanPreview.kleur || ''} placeholder="bv. wit matt" onChange={(e) => updateScanPreview('kleur', e.target.value || null)} />
                                    </div>
                                    <div className="field">
                                        <label>Materiaal</label>
                                        <input value={scanPreview.materiaal || ''} placeholder="bv. porselein, RVS" onChange={(e) => updateScanPreview('materiaal', e.target.value || null)} />
                                    </div>
                                    <div className="field">
                                        <label>Afmetingen</label>
                                        <input value={scanPreview.afmetingen || ''} placeholder="bv. 25cm rond" onChange={(e) => updateScanPreview('afmetingen', e.target.value || null)} />
                                    </div>
                                    <div className="field">
                                        <label>Geschikt voor gangen</label>
                                        <input
                                            value={(scanPreview.geschikt_voor_gangen || []).join(', ')}
                                            placeholder="bv. voorgerecht, hoofdgerecht"
                                            onChange={(e) => updateScanPreview('geschikt_voor_gangen', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                                        />
                                    </div>
                                    <div className="field full">
                                        <label>AI styling-hint</label>
                                        <textarea rows={2} value={scanPreview.ai_styling_hint || ''} placeholder="Past goed bij…" onChange={(e) => updateScanPreview('ai_styling_hint', e.target.value || null)} />
                                    </div>
                                    <div className="field full">
                                        <label>Notitie</label>
                                        <textarea rows={2} value={scanPreview.notitie || ''} onChange={(e) => updateScanPreview('notitie', e.target.value)} />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                    <button className="btn btn-brand" onClick={saveScanned} style={{ flex: 1 }}>
                                        <Save size={14} /> Opslaan in materieel
                                    </button>
                                    <button className="btn btn-ghost" onClick={() => { setScanPreview(null); setScanImageDataUrl(null); setScanError(null); }}>
                                        Andere foto
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
        </RequireTier>
    );
}
