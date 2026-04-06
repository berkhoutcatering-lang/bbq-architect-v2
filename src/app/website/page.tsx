/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { supabase } from '@/lib/supabase';
import type { WebsiteFaq, WebsiteGallery, WebsiteGang, WebsiteGerecht, WebsiteHero } from '@/types';
interface WSettings { id: number; email: string; telefoon: string; adres: string; kvk: string; btw_nummer: string; }

type Tab = 'afbeeldingen' | 'faq' | 'galerij' | 'menu' | 'footer';

const BUCKET = 'website-images';
const STORAGE_URL = 'https://oheilybckvtsczmbczot.supabase.co/storage/v1/object/public/' + BUCKET + '/';

/* ── Shared styles ── */
const S = {
    btn: 'px-4 py-2 rounded-lg text-sm font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors',
    btnSm: 'px-3 py-1.5 rounded-lg text-xs font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors',
    btnOutline: 'px-4 py-2 rounded-lg text-sm font-medium border border-[#333] text-[var(--muted)] hover:text-white hover:border-[#555] transition-colors',
    btnIcon: 'w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-white hover:bg-white/10 transition-colors',
    inp: 'w-full bg-[#111114] border border-[#222] rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-[#3b82f6]/50 transition-colors',
    lbl: 'block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5',
    card: 'bg-[#111114] border border-[#1a1a1e] rounded-xl',
};

/* ── Upload helper ── */
async function uploadToStorage(file: File, filename?: string): Promise<string | null> {
    if (!supabase) return null;
    const name = filename || (Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const { error } = await supabase.storage.from(BUCKET).upload(name, file, { contentType: file.type, upsert: true });
    if (error) { console.error('Upload error:', error); return null; }
    return STORAGE_URL + name;
}

async function deleteFromStorage(src: string): Promise<void> {
    if (!supabase || !src.startsWith(STORAGE_URL)) return;
    const filename = src.replace(STORAGE_URL, '');
    await supabase.storage.from(BUCKET).remove([filename]);
}

export default function WebsiteBeheer() {
    const [tab, setTab] = useState<Tab>('afbeeldingen');
    const showToast = useToast();
    const showConfirm = useConfirm();

    const faq = useSupabase<WebsiteFaq>('website_faq', []);
    const gallery = useSupabase<WebsiteGallery>('website_gallery', []);
    const hero = useSupabase<WebsiteHero>('website_hero', []);
    const wGangen = useSupabase<WebsiteGang>('website_gangen', []);
    const wGerechten = useSupabase<WebsiteGerecht>('website_gerechten', []);
    const footerHook = useSupabase<any>('settings', []);

    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState<Record<string, any>>({});
    const [footerForm, setFooterForm] = useState<Record<string, any>>({});
    const [footerDirty, setFooterDirty] = useState(false);

    useEffect(() => {
        if (footerHook.data[0] && !footerDirty) setFooterForm({ ...footerHook.data[0] });
    }, [footerHook.data, footerDirty]);

    function startEdit(item: any) { setEditId(item.id); setForm({ ...item }); }
    function cancelEdit() { setEditId(null); setForm({}); }
    function f(key: string, val: any) { setForm(prev => ({ ...prev, [key]: val })); }
    function ff(key: string, val: any) { setFooterForm(prev => ({ ...prev, [key]: val })); setFooterDirty(true); }

    async function saveItem(hook: any, label: string) {
        try {
            const { id, _type, ...rest } = form;
            if (editId === -1) { await hook.insert(rest); showToast(label + ' toegevoegd', 'success'); }
            else { await hook.update(editId!, rest); showToast(label + ' opgeslagen', 'success'); }
            cancelEdit();
        } catch { showToast('Fout bij opslaan', 'error'); }
    }

    async function toggleActief(hook: any, item: any) {
        await hook.update(item.id, { actief: !item.actief });
        showToast(item.actief ? 'Verborgen' : 'Zichtbaar gemaakt', 'success');
    }

    async function deleteItem(hook: any, id: number, label: string) {
        showConfirm('Weet je zeker dat je dit item wilt verwijderen?', async () => {
            await hook.remove(id);
            showToast(label + ' verwijderd', 'success');
        });
    }

    const tabs: { key: Tab; label: string; icon: string }[] = [
        { key: 'afbeeldingen', label: 'Afbeeldingen', icon: 'fa-image' },
        { key: 'faq', label: 'FAQ', icon: 'fa-circle-question' },
        { key: 'galerij', label: 'Galerij', icon: 'fa-images' },
        { key: 'menu', label: 'Signature Menu', icon: 'fa-utensils' },
        { key: 'footer', label: 'Footer / Contact', icon: 'fa-address-card' },
    ];

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3b82f6]/20 to-[#3b82f6]/5 flex items-center justify-center">
                        <i className="fa-solid fa-globe text-[#3b82f6]"></i>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Website Beheer</h1>
                        <p className="text-[var(--muted)] text-sm">Content beheren voor hopbites.nl</p>
                    </div>
                </div>
                <div className="mt-3 p-3 rounded-lg bg-yellow-900/20 border border-yellow-700/30">
                    <p className="text-yellow-400 text-xs">
                        <i className="fa-solid fa-triangle-exclamation mr-2"></i>
                        De Next.js website draait voorlopig op <strong>localhost</strong>. Wijzigingen worden direct in Supabase opgeslagen en binnen 60 sec opgepikt.
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-[#111114] p-1 rounded-xl w-fit">
                {tabs.map(t => (
                    <button key={t.key}
                        className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-[#3b82f6]/15 text-white shadow-sm' : 'text-[var(--muted)] hover:text-white hover:bg-white/5'}`}
                        onClick={() => { setTab(t.key); cancelEdit(); }}>
                        <i className={`fa-solid ${t.icon} mr-2`}></i>{t.label}
                    </button>
                ))}
            </div>

            {tab === 'afbeeldingen' && <AfbeeldingenTab hero={hero} gallery={gallery} showToast={showToast} showConfirm={showConfirm} S={S} />}
            {tab === 'faq' && <FaqTab faq={faq} editId={editId} form={form} f={f} startEdit={startEdit} cancelEdit={cancelEdit} saveItem={saveItem} toggleActief={toggleActief} deleteItem={deleteItem} S={S} />}
            {tab === 'galerij' && <GalerijTab gallery={gallery} editId={editId} form={form} f={f} startEdit={startEdit} cancelEdit={cancelEdit} saveItem={saveItem} toggleActief={toggleActief} deleteItem={deleteItem} setEditId={setEditId} setForm={setForm} S={S} />}
            {tab === 'menu' && <MenuTab gangen={wGangen} gerechten={wGerechten} editId={editId} form={form} f={f} startEdit={startEdit} cancelEdit={cancelEdit} toggleActief={toggleActief} deleteItem={deleteItem} setEditId={setEditId} setForm={setForm} showToast={showToast} showConfirm={showConfirm} S={S} />}
            {tab === 'footer' && <FooterTab settings={footerHook.data[0]} footerForm={footerForm} ff={ff} footerDirty={footerDirty} setFooterDirty={setFooterDirty} footerHook={footerHook} showToast={showToast} S={S} />}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*                      AFBEELDINGEN TAB                         */
/* ══════════════════════════════════════════════════════════════ */
function AfbeeldingenTab({ hero, gallery, showToast, showConfirm, S }: any) {
    const [uploading, setUploading] = useState(false);
    const [editingHero, setEditingHero] = useState<number | null>(null);
    const [heroForm, setHeroForm] = useState<Record<string, any>>({});
    const [editingGallery, setEditingGallery] = useState<number | null>(null);
    const [galleryForm, setGalleryForm] = useState<Record<string, any>>({});
    const heroInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const [dragOverHero, setDragOverHero] = useState(false);
    const [dragOverGallery, setDragOverGallery] = useState(false);

    const sortedHero = [...hero.data].sort((a: any, b: any) => a.volgorde - b.volgorde);
    const sortedGallery = [...gallery.data].sort((a: any, b: any) => a.volgorde - b.volgorde);
    const galCategories = ['Gerechten', 'De Smoker', 'Ingrediënten'];

    /* ── Upload hero image ── */
    const handleHeroUpload = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.type.startsWith('image/')) { showToast('Alleen afbeeldingen toegestaan', 'error'); continue; }
                if (file.size > 10 * 1024 * 1024) { showToast('Max 10MB per bestand', 'error'); continue; }
                const filename = 'hero-' + Date.now() + '-' + i + '.' + file.name.split('.').pop();
                const url = await uploadToStorage(file, filename);
                if (url) {
                    await hero.insert({ src: url, alt: file.name.replace(/\.[^.]+$/, ''), volgorde: (sortedHero.length + i + 1) * 10, actief: true });
                    showToast('Hero afbeelding geüpload', 'success');
                } else { showToast('Upload mislukt', 'error'); }
            }
        } catch { showToast('Upload fout', 'error'); }
        setUploading(false);
    }, [hero, sortedHero.length, showToast]);

    /* ── Upload gallery image ── */
    const handleGalleryUpload = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.type.startsWith('image/')) { showToast('Alleen afbeeldingen toegestaan', 'error'); continue; }
                if (file.size > 10 * 1024 * 1024) { showToast('Max 10MB per bestand', 'error'); continue; }
                const filename = 'gallery-' + Date.now() + '-' + i + '.' + file.name.split('.').pop();
                const url = await uploadToStorage(file, filename);
                if (url) {
                    await gallery.insert({ src: url, label: file.name.replace(/\.[^.]+$/, ''), categorie: 'Gerechten', volgorde: (sortedGallery.length + i + 1) * 10, actief: true });
                    showToast('Galerij foto geüpload', 'success');
                } else { showToast('Upload mislukt', 'error'); }
            }
        } catch { showToast('Upload fout', 'error'); }
        setUploading(false);
    }, [gallery, sortedGallery.length, showToast]);

    /* ── Replace image ── */
    async function replaceImage(hook: any, item: any, file: File, prefix: string) {
        setUploading(true);
        try {
            // Delete old from storage
            await deleteFromStorage(item.src);
            const filename = prefix + '-' + Date.now() + '.' + file.name.split('.').pop();
            const url = await uploadToStorage(file, filename);
            if (url) {
                await hook.update(item.id, { src: url });
                showToast('Afbeelding vervangen', 'success');
            } else { showToast('Upload mislukt', 'error'); }
        } catch { showToast('Vervangen mislukt', 'error'); }
        setUploading(false);
    }

    /* ── Delete with storage cleanup ── */
    async function deleteWithStorage(hook: any, item: any, label: string) {
        showConfirm('Afbeelding verwijderen uit storage en database?', async () => {
            await deleteFromStorage(item.src);
            await hook.remove(item.id);
            showToast(label + ' verwijderd', 'success');
        });
    }

    /* ── Drag & drop handlers ── */
    function onDrop(e: React.DragEvent, handler: (f: FileList) => void, setDrag: (v: boolean) => void) {
        e.preventDefault(); setDrag(false);
        handler(e.dataTransfer.files);
    }
    function onDragOver(e: React.DragEvent, setDrag: (v: boolean) => void) { e.preventDefault(); setDrag(true); }
    function onDragLeave(setDrag: (v: boolean) => void) { setDrag(false); }

    return (
        <div>
            {uploading && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                    <div className={`${S.card} p-6 flex items-center gap-3`}>
                        <div className="w-5 h-5 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-white text-sm">Uploading...</span>
                    </div>
                </div>
            )}

            {/* ── HERO SLIDESHOW ── */}
            <div className="mb-10">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-white font-semibold text-lg">Hero Slideshow</h3>
                        <p className="text-[var(--muted)] text-sm">Homepage achtergrond afbeeldingen (4 slides)</p>
                    </div>
                    <button className={S.btn} onClick={() => heroInputRef.current?.click()}>
                        <i className="fa-solid fa-cloud-arrow-up mr-2"></i>Upload
                    </button>
                    <input ref={heroInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => handleHeroUpload(e.target.files)} />
                </div>

                {/* Drop zone */}
                <div
                    className={`border-2 border-dashed rounded-xl p-6 mb-4 transition-colors text-center cursor-pointer ${dragOverHero ? 'border-[#3b82f6] bg-[#3b82f6]/5' : 'border-[#333] hover:border-[#555]'}`}
                    onClick={() => heroInputRef.current?.click()}
                    onDrop={e => onDrop(e, handleHeroUpload, setDragOverHero)}
                    onDragOver={e => onDragOver(e, setDragOverHero)}
                    onDragLeave={() => onDragLeave(setDragOverHero)}
                >
                    <i className="fa-solid fa-cloud-arrow-up text-[var(--muted)] text-2xl mb-2"></i>
                    <p className="text-[var(--muted)] text-sm">Sleep afbeeldingen hierheen of klik om te uploaden</p>
                    <p className="text-[var(--muted)] text-xs mt-1">JPG, PNG of WebP — max 10MB</p>
                </div>

                {/* Hero grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {sortedHero.map((item: any) => (
                        <div key={item.id} className={`${S.card} overflow-hidden transition-opacity ${!item.actief ? 'opacity-40' : ''}`}>
                            <div className="aspect-video bg-[#0a0a0c] relative group">
                                <img src={item.src} alt={item.alt} className="w-full h-full object-cover" onError={(e: any) => { e.target.src = ''; e.target.alt = 'Laden mislukt'; }} />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <label className={`${S.btnSm} cursor-pointer`}>
                                        <i className="fa-solid fa-arrows-rotate mr-1"></i>Vervang
                                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { if (e.target.files?.[0]) replaceImage(hero, item, e.target.files[0], 'hero'); }} />
                                    </label>
                                </div>
                                <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">{item.volgorde}</div>
                            </div>
                            <div className="p-3">
                                {editingHero === item.id ? (
                                    <div className="space-y-2">
                                        <input className={S.inp} value={heroForm.alt || ''} onChange={e => setHeroForm(p => ({ ...p, alt: e.target.value }))} placeholder="Alt tekst" />
                                        <div className="flex gap-2">
                                            <input className={`${S.inp} w-20`} type="number" value={heroForm.volgorde ?? 0} onChange={e => setHeroForm(p => ({ ...p, volgorde: parseInt(e.target.value) || 0 }))} />
                                            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-white">
                                                <input type="checkbox" checked={heroForm.actief ?? true} onChange={e => setHeroForm(p => ({ ...p, actief: e.target.checked }))} className="accent-[#3b82f6]" />Actief
                                            </label>
                                        </div>
                                        <div className="flex gap-1">
                                            <button className={S.btnSm} onClick={async () => {
                                                const { id, ...rest } = heroForm;
                                                await hero.update(item.id, rest);
                                                showToast('Opgeslagen', 'success');
                                                setEditingHero(null);
                                            }}>Opslaan</button>
                                            <button className="px-3 py-1.5 rounded-lg text-xs text-[var(--muted)] hover:text-white" onClick={() => setEditingHero(null)}>Annuleer</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <p className="text-white text-xs truncate flex-1">{item.alt || '(geen alt tekst)'}</p>
                                        <div className="flex gap-1 shrink-0 ml-2">
                                            <button className={S.btnIcon} onClick={() => { hero.update(item.id, { actief: !item.actief }); showToast(item.actief ? 'Verborgen' : 'Zichtbaar', 'success'); }}>
                                                <i className={`fa-solid ${item.actief ? 'fa-eye' : 'fa-eye-slash'} text-xs`}></i>
                                            </button>
                                            <button className={S.btnIcon} onClick={() => { setEditingHero(item.id); setHeroForm({ ...item }); }}>
                                                <i className="fa-solid fa-pen text-xs"></i>
                                            </button>
                                            <button className={`${S.btnIcon} text-red-400`} onClick={() => deleteWithStorage(hero, item, 'Hero afbeelding')}>
                                                <i className="fa-solid fa-trash text-xs"></i>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {sortedHero.length === 0 && (
                        <div className="col-span-4 text-center py-8">
                            <i className="fa-solid fa-image text-[var(--muted)] text-3xl mb-2"></i>
                            <p className="text-[var(--muted)] text-sm">Nog geen hero afbeeldingen. Upload er een paar!</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── GALERIJ AFBEELDINGEN ── */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-white font-semibold text-lg">Galerij Afbeeldingen</h3>
                        <p className="text-[var(--muted)] text-sm">Foto&apos;s op de /galerij pagina — categorie, label en volgorde instelbaar</p>
                    </div>
                    <button className={S.btn} onClick={() => galleryInputRef.current?.click()}>
                        <i className="fa-solid fa-cloud-arrow-up mr-2"></i>Upload
                    </button>
                    <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => handleGalleryUpload(e.target.files)} />
                </div>

                {/* Drop zone */}
                <div
                    className={`border-2 border-dashed rounded-xl p-6 mb-4 transition-colors text-center cursor-pointer ${dragOverGallery ? 'border-[#3b82f6] bg-[#3b82f6]/5' : 'border-[#333] hover:border-[#555]'}`}
                    onClick={() => galleryInputRef.current?.click()}
                    onDrop={e => onDrop(e, handleGalleryUpload, setDragOverGallery)}
                    onDragOver={e => onDragOver(e, setDragOverGallery)}
                    onDragLeave={() => onDragLeave(setDragOverGallery)}
                >
                    <i className="fa-solid fa-images text-[var(--muted)] text-2xl mb-2"></i>
                    <p className="text-[var(--muted)] text-sm">Sleep galerij foto&apos;s hierheen of klik om te uploaden</p>
                    <p className="text-[var(--muted)] text-xs mt-1">Categorie wordt standaard op &quot;Gerechten&quot; gezet — pas aan na upload</p>
                </div>

                {/* Gallery by category */}
                {galCategories.map(cat => {
                    const items = sortedGallery.filter((g: any) => g.categorie === cat);
                    if (items.length === 0) return null;
                    return (
                        <div key={cat} className="mb-6">
                            <h4 className="text-white font-semibold text-sm mb-3 uppercase tracking-wider">{cat}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {items.map((item: any) => (
                                    <div key={item.id} className={`${S.card} overflow-hidden transition-opacity ${!item.actief ? 'opacity-40' : ''}`}>
                                        <div className="aspect-video bg-[#0a0a0c] relative group">
                                            <img src={item.src} alt={item.label} className="w-full h-full object-cover" onError={(e: any) => { e.target.style.display = 'none'; }} />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                <label className={`${S.btnSm} cursor-pointer`}>
                                                    <i className="fa-solid fa-arrows-rotate mr-1"></i>Vervang
                                                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { if (e.target.files?.[0]) replaceImage(gallery, item, e.target.files[0], 'gallery'); }} />
                                                </label>
                                            </div>
                                            <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">{item.volgorde}</div>
                                        </div>
                                        <div className="p-3">
                                            {editingGallery === item.id ? (
                                                <div className="space-y-2">
                                                    <input className={S.inp} value={galleryForm.label || ''} onChange={e => setGalleryForm(p => ({ ...p, label: e.target.value }))} placeholder="Label / bijschrift" />
                                                    <select className={S.inp} value={galleryForm.categorie || 'Gerechten'} onChange={e => setGalleryForm(p => ({ ...p, categorie: e.target.value }))}>
                                                        {galCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                    <div className="flex gap-2">
                                                        <input className={`${S.inp} w-20`} type="number" value={galleryForm.volgorde ?? 0} onChange={e => setGalleryForm(p => ({ ...p, volgorde: parseInt(e.target.value) || 0 }))} placeholder="Volgorde" />
                                                        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-white">
                                                            <input type="checkbox" checked={galleryForm.actief ?? true} onChange={e => setGalleryForm(p => ({ ...p, actief: e.target.checked }))} className="accent-[#3b82f6]" />Actief
                                                        </label>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button className={S.btnSm} onClick={async () => {
                                                            const { id, ...rest } = galleryForm;
                                                            await gallery.update(item.id, rest);
                                                            showToast('Opgeslagen', 'success');
                                                            setEditingGallery(null);
                                                        }}>Opslaan</button>
                                                        <button className="px-3 py-1.5 rounded-lg text-xs text-[var(--muted)] hover:text-white" onClick={() => setEditingGallery(null)}>Annuleer</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <p className="text-white text-xs font-medium truncate">{item.label || '(geen label)'}</p>
                                                    <div className="flex items-center justify-between mt-1.5">
                                                        <span className="text-[var(--muted)] text-[10px]">{item.categorie}</span>
                                                        <div className="flex gap-1">
                                                            <button className={S.btnIcon} onClick={() => { gallery.update(item.id, { actief: !item.actief }); showToast(item.actief ? 'Verborgen' : 'Zichtbaar', 'success'); }}>
                                                                <i className={`fa-solid ${item.actief ? 'fa-eye' : 'fa-eye-slash'} text-xs`}></i>
                                                            </button>
                                                            <button className={S.btnIcon} onClick={() => { setEditingGallery(item.id); setGalleryForm({ ...item }); }}>
                                                                <i className="fa-solid fa-pen text-xs"></i>
                                                            </button>
                                                            <button className={`${S.btnIcon} text-red-400`} onClick={() => deleteWithStorage(gallery, item, 'Galerij foto')}>
                                                                <i className="fa-solid fa-trash text-xs"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
                {sortedGallery.length === 0 && (
                    <div className="text-center py-8">
                        <i className="fa-solid fa-images text-[var(--muted)] text-3xl mb-2"></i>
                        <p className="text-[var(--muted)] text-sm">Nog geen galerij foto&apos;s. Upload er een paar!</p>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*                           FAQ TAB                             */
/* ══════════════════════════════════════════════════════════════ */
function FaqTab({ faq, editId, form, f, startEdit, cancelEdit, saveItem, toggleActief, deleteItem, S }: any) {
    const sorted = [...faq.data].sort((a: any, b: any) => a.volgorde - b.volgorde);
    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <p className="text-[var(--muted)] text-sm">Beheer de FAQ vragen op de homepage</p>
                <button className={S.btn} onClick={() => { startEdit({ id: -1, vraag: '', antwoord: '', volgorde: (sorted.length + 1) * 10, actief: true }); }}>
                    <i className="fa-solid fa-plus mr-2"></i>Nieuwe vraag
                </button>
            </div>

            {editId !== null && (
                <div className={`${S.card} p-5 mb-6 border-[#3b82f6]/30`}>
                    <h4 className="text-white font-semibold mb-4">{editId === -1 ? 'Nieuwe FAQ' : 'FAQ Bewerken'}</h4>
                    <div className="space-y-3">
                        <div><label className={S.lbl}>Vraag</label><input className={S.inp} value={form.vraag || ''} onChange={(e: any) => f('vraag', e.target.value)} /></div>
                        <div><label className={S.lbl}>Antwoord</label><textarea className={S.inp} rows={4} value={form.antwoord || ''} onChange={(e: any) => f('antwoord', e.target.value)} /></div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className={S.lbl}>Volgorde</label><input className={S.inp} type="number" value={form.volgorde ?? 0} onChange={(e: any) => f('volgorde', parseInt(e.target.value) || 0)} /></div>
                            <div className="flex items-end pb-1">
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.actief ?? true} onChange={(e: any) => f('actief', e.target.checked)} className="accent-[#3b82f6]" /><span className="text-sm text-white">Zichtbaar</span></label>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button className={S.btn} onClick={() => saveItem(faq, 'FAQ')}>Opslaan</button>
                            <button className={S.btnOutline} onClick={cancelEdit}>Annuleren</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {sorted.map((item: any) => (
                    <div key={item.id} className={`${S.card} p-4 flex items-start gap-4 transition-opacity ${!item.actief ? 'opacity-40' : ''}`}>
                        <div className="text-xs text-[var(--muted)] font-mono w-8 text-center pt-1">{item.volgorde}</div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm">{item.vraag}</p>
                            <p className="text-[var(--muted)] text-xs mt-1 line-clamp-2">{item.antwoord}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                            <button className={S.btnIcon} title={item.actief ? 'Verbergen' : 'Tonen'} onClick={() => toggleActief(faq, item)}>
                                <i className={`fa-solid ${item.actief ? 'fa-eye' : 'fa-eye-slash'} text-xs`}></i>
                            </button>
                            <button className={S.btnIcon} onClick={() => startEdit(item)}><i className="fa-solid fa-pen text-xs"></i></button>
                            <button className={`${S.btnIcon} text-red-400`} onClick={() => deleteItem(faq, item.id, 'FAQ')}><i className="fa-solid fa-trash text-xs"></i></button>
                        </div>
                    </div>
                ))}
                {sorted.length === 0 && <p className="text-[var(--muted)] text-sm text-center py-8">Geen FAQ items gevonden</p>}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*                         GALERIJ TAB                           */
/* ══════════════════════════════════════════════════════════════ */
function GalerijTab({ gallery, editId, form, f, startEdit, cancelEdit, saveItem, toggleActief, deleteItem, setEditId, setForm, S }: any) {
    const sorted = [...gallery.data].sort((a: any, b: any) => a.volgorde - b.volgorde);
    const categories = ['Gerechten', 'De Smoker', 'Ingrediënten'];

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <p className="text-[var(--muted)] text-sm">Metadata van galerij foto&apos;s bewerken (upload via Afbeeldingen tab)</p>
                <button className={S.btn} onClick={() => { setEditId(-1); setForm({ src: '', label: '', categorie: 'Gerechten', volgorde: (sorted.length + 1) * 10, actief: true }); }}>
                    <i className="fa-solid fa-plus mr-2"></i>Handmatig toevoegen
                </button>
            </div>

            {editId !== null && (
                <div className={`${S.card} p-5 mb-6 border-[#3b82f6]/30`}>
                    <h4 className="text-white font-semibold mb-4">{editId === -1 ? 'Nieuwe foto' : 'Foto Bewerken'}</h4>
                    <div className="space-y-3">
                        <div><label className={S.lbl}>Afbeelding URL</label><input className={S.inp} value={form.src || ''} onChange={(e: any) => f('src', e.target.value)} placeholder="https://..." /></div>
                        <div><label className={S.lbl}>Bijschrift</label><input className={S.inp} value={form.label || ''} onChange={(e: any) => f('label', e.target.value)} /></div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className={S.lbl}>Categorie</label>
                                <select className={S.inp} value={form.categorie || 'Gerechten'} onChange={(e: any) => f('categorie', e.target.value)}>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="w-24"><label className={S.lbl}>Volgorde</label><input className={S.inp} type="number" value={form.volgorde ?? 0} onChange={(e: any) => f('volgorde', parseInt(e.target.value) || 0)} /></div>
                            <div className="flex items-end pb-1"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.actief ?? true} onChange={(e: any) => f('actief', e.target.checked)} className="accent-[#3b82f6]" /><span className="text-sm text-white">Zichtbaar</span></label></div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button className={S.btn} onClick={() => saveItem(gallery, 'Foto')}>Opslaan</button>
                            <button className={S.btnOutline} onClick={cancelEdit}>Annuleren</button>
                        </div>
                    </div>
                </div>
            )}

            {categories.map(cat => {
                const items = sorted.filter((g: any) => g.categorie === cat);
                if (items.length === 0) return null;
                return (
                    <div key={cat} className="mb-6">
                        <h4 className="text-white font-semibold text-sm mb-3 uppercase tracking-wider">{cat}</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {items.map((item: any) => (
                                <div key={item.id} className={`${S.card} p-3 transition-opacity ${!item.actief ? 'opacity-40' : ''}`}>
                                    <div className="aspect-video bg-[#1a1a20] rounded-lg mb-2 overflow-hidden flex items-center justify-center">
                                        {item.src ? (
                                            <img src={item.src} alt={item.label} className="w-full h-full object-cover" onError={(e: any) => { e.target.style.display = 'none'; }} />
                                        ) : (
                                            <i className="fa-solid fa-image text-[var(--muted)] text-2xl"></i>
                                        )}
                                    </div>
                                    <p className="text-white text-xs font-medium truncate">{item.label || '(geen bijschrift)'}</p>
                                    <p className="text-[var(--muted)] text-[10px] mt-0.5 truncate">{item.src}</p>
                                    <div className="flex gap-1 mt-2">
                                        <button className={S.btnIcon} onClick={() => toggleActief(gallery, item)}><i className={`fa-solid ${item.actief ? 'fa-eye' : 'fa-eye-slash'} text-xs`}></i></button>
                                        <button className={S.btnIcon} onClick={() => startEdit(item)}><i className="fa-solid fa-pen text-xs"></i></button>
                                        <button className={`${S.btnIcon} text-red-400`} onClick={() => deleteItem(gallery, item.id, 'Foto')}><i className="fa-solid fa-trash text-xs"></i></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
            {sorted.length === 0 && <p className="text-[var(--muted)] text-sm text-center py-8">Geen galerij items gevonden</p>}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*                      SIGNATURE MENU TAB                       */
/* ══════════════════════════════════════════════════════════════ */
const ALLERGENEN = [
    { code: 'gluten', label: 'Gluten', icon: '\u{1F33E}' },
    { code: 'lactose', label: 'Lactose', icon: '\u{1F95B}' },
    { code: 'ei', label: 'Ei', icon: '\u{1F95A}' },
    { code: 'vis', label: 'Vis', icon: '\u{1F41F}' },
    { code: 'schaaldieren', label: 'Schaaldieren', icon: '\u{1F990}' },
    { code: 'weekdieren', label: 'Weekdieren', icon: '\u{1F41A}' },
    { code: 'pinda', label: 'Pinda', icon: '\u{1F95C}' },
    { code: 'noten', label: 'Noten', icon: '\u{1F95C}' },
    { code: 'soja', label: 'Soja', icon: '\u{1FAD8}' },
    { code: 'selderij', label: 'Selderij', icon: '\u{1F33F}' },
    { code: 'mosterd', label: 'Mosterd', icon: '\u{1F7E1}' },
    { code: 'sesam', label: 'Sesam', icon: '\u26AA' },
    { code: 'sulfiet', label: 'Sulfiet', icon: '\u{1F377}' },
    { code: 'lupine', label: 'Lupine', icon: '\u{1F338}' },
];

function allergenLabel(code: string) {
    const a = ALLERGENEN.find(x => x.code === code);
    return a ? a.icon + ' ' + a.label : code;
}

function AllergenBadges({ allergenen }: { allergenen: string[] }) {
    if (!allergenen || allergenen.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {allergenen.map((code: string) => (
                <span key={code} className="px-1.5 py-0.5 rounded bg-orange-900/30 text-orange-300 text-[9px] font-medium">{allergenLabel(code)}</span>
            ))}
        </div>
    );
}

function AllergenCheckboxes({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
    const current = selected || [];
    return (
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
            {ALLERGENEN.map(a => (
                <label key={a.code} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${current.includes(a.code) ? 'bg-orange-900/30 text-orange-300 border border-orange-600/40' : 'bg-[#1a1a1e] text-[var(--muted)] border border-transparent hover:border-[#333]'}`}>
                    <input type="checkbox" className="hidden" checked={current.includes(a.code)} onChange={() => {
                        onChange(current.includes(a.code) ? current.filter(x => x !== a.code) : [...current, a.code]);
                    }} />
                    <span>{a.icon}</span>{a.label}
                </label>
            ))}
        </div>
    );
}

function MenuTab({ gangen, gerechten, editId, form, f, cancelEdit, toggleActief, deleteItem, setEditId, setForm, showToast, showConfirm, S }: any) {
    const sortedGangen = [...gangen.data].sort((a: any, b: any) => a.volgorde - b.volgorde);
    const sortedGerechten = [...gerechten.data].sort((a: any, b: any) => a.volgorde - b.volgorde);
    const gangSlugs = sortedGangen.map((g: any) => g.slug);
    const [uploading, setUploading] = useState(false);

    async function uploadFoto(file: File, dish: any) {
        setUploading(true);
        try {
            const slug = dish.naam.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
            const ext = file.name.split('.').pop() || 'jpg';
            const filename = 'gerechten/' + slug + '.' + ext;
            const url = await uploadToStorage(file, filename);
            if (url) {
                await gerechten.update(dish.id, { foto: url });
                showToast('Foto geüpload', 'success');
                if (form && form.id === dish.id) f('foto', url);
            } else { showToast('Upload mislukt', 'error'); }
        } catch { showToast('Upload fout', 'error'); }
        setUploading(false);
    }

    async function removeFoto(dish: any) {
        if (dish.foto) await deleteFromStorage(dish.foto);
        await gerechten.update(dish.id, { foto: null });
        showToast('Foto verwijderd', 'success');
        if (form && form.id === dish.id) f('foto', null);
    }

    return (
        <div>
            {uploading && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                    <div className={`${S.card} p-6 flex items-center gap-3`}><div className="w-5 h-5 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div><span className="text-white text-sm">Foto uploaden...</span></div>
                </div>
            )}

            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="text-[var(--muted)] text-sm">Website Signature Menu — aparte gerechten tabel (<code className="text-[10px] bg-[#1a1a1e] px-1 py-0.5 rounded">website_gerechten</code>)</p>
                </div>
                <button className={S.btn} onClick={() => { setEditId(-1); setForm({ naam: '', beschrijving: '', gang_slug: gangSlugs[0] || 'bites', volgorde: 1, actief: true, allergenen: [], foto: null, extra_info: '', _type: 'gerecht' }); }}>
                    <i className="fa-solid fa-plus mr-2"></i>Nieuw gerecht
                </button>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mb-6 text-[10px] text-[var(--muted)]">
                <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>Normaal menu (volgorde &lt; 10)</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1"></span>Dieet optie (volgorde ≥ 10)</span>
                <span className="inline-flex items-center"><span className="px-1 py-0.5 rounded bg-orange-900/30 text-orange-300 text-[9px] mr-1">{ALLERGENEN[0].icon} Gluten</span>= allergeen badge</span>
            </div>

            {/* Gang edit form */}
            {editId !== null && form._type === 'gang' && (
                <div className={`${S.card} p-5 mb-6 border-[#3b82f6]/30`}>
                    <h4 className="text-white font-semibold mb-4">Gang bewerken</h4>
                    <div className="space-y-3">
                        <div className="flex gap-4">
                            <div className="flex-1"><label className={S.lbl}>Naam</label><input className={S.inp} value={form.naam || ''} onChange={(e: any) => f('naam', e.target.value)} /></div>
                            <div className="w-32"><label className={S.lbl}>Slug</label><input className={S.inp} value={form.slug || ''} onChange={(e: any) => f('slug', e.target.value)} disabled={editId !== -1} /></div>
                            <div className="w-24"><label className={S.lbl}>Volgorde</label><input className={S.inp} type="number" value={form.volgorde ?? 0} onChange={(e: any) => f('volgorde', parseInt(e.target.value) || 0)} /></div>
                            <div className="w-24"><label className={S.lbl}>Minimum</label><input className={S.inp} type="number" value={form.minimum ?? 1} onChange={(e: any) => f('minimum', parseInt(e.target.value) || 0)} /></div>
                            <div className="w-32"><label className={S.lbl}>Extra € p.p.</label><input className={S.inp} type="number" step="0.25" value={form.extra_prijs_pp ?? 0} onChange={(e: any) => f('extra_prijs_pp', parseFloat(e.target.value) || 0)} /></div>
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.actief ?? true} onChange={(e: any) => f('actief', e.target.checked)} className="accent-[#3b82f6]" /><span className="text-sm text-white">Actief op website</span></label>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button className={S.btn} onClick={async () => {
                                try { const { _type, id, ...rest } = form; await gangen.update(editId!, rest); showToast('Gang opgeslagen', 'success'); cancelEdit(); } catch { showToast('Fout bij opslaan', 'error'); }
                            }}>Opslaan</button>
                            <button className={S.btnOutline} onClick={cancelEdit}>Annuleren</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Gerecht edit form — met foto, extra_info, allergenen */}
            {editId !== null && form._type === 'gerecht' && (
                <div className={`${S.card} p-5 mb-6 border-[#3b82f6]/30`}>
                    <h4 className="text-white font-semibold mb-4">{editId === -1 ? 'Nieuw gerecht' : 'Gerecht bewerken'}</h4>
                    <div className="space-y-4">
                        <div className="flex gap-4">
                            <div className="flex-1"><label className={S.lbl}>Naam</label><input className={S.inp} value={form.naam || ''} onChange={(e: any) => f('naam', e.target.value)} /></div>
                            <div className="w-44"><label className={S.lbl}>Gang</label>
                                <select className={S.inp} value={form.gang_slug || ''} onChange={(e: any) => f('gang_slug', e.target.value)}>
                                    {gangSlugs.map((s: string) => <option key={s} value={s}>{sortedGangen.find((g: any) => g.slug === s)?.naam || s}</option>)}
                                </select>
                            </div>
                        </div>

                        <div><label className={S.lbl}>Beschrijving <span className="normal-case text-[var(--muted)]">(wordt getoond op de menukaart)</span></label><input className={S.inp} value={form.beschrijving || ''} onChange={(e: any) => f('beschrijving', e.target.value)} /></div>

                        <div><label className={S.lbl}>Extra info <span className="normal-case text-[var(--muted)]">(optioneel — wordt getoond in de info-popup)</span></label><textarea className={S.inp} rows={2} value={form.extra_info || ''} onChange={(e: any) => f('extra_info', e.target.value)} placeholder="Bijv. herkomst, bereidingswijze, etc." /></div>

                        {/* Foto upload */}
                        <div>
                            <label className={S.lbl}>Foto <span className="normal-case text-[var(--muted)]">(info-popup)</span></label>
                            <div className="flex items-center gap-3">
                                {form.foto ? (
                                    <div className="w-20 h-14 rounded-lg overflow-hidden bg-[#1a1a1e] shrink-0">
                                        <img src={form.foto} alt="" className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <div className="w-20 h-14 rounded-lg bg-[#1a1a1e] flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-image text-[var(--muted)] text-sm"></i>
                                    </div>
                                )}
                                <label className={`${S.btnSm} cursor-pointer`}>
                                    <i className="fa-solid fa-cloud-arrow-up mr-1"></i>{form.foto ? 'Vervang' : 'Upload foto'}
                                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => {
                                        if (e.target.files?.[0] && editId !== -1) uploadFoto(e.target.files[0], { ...form, id: editId });
                                    }} />
                                </label>
                                {form.foto && <button className="text-red-400 text-xs hover:text-red-300" onClick={() => { if (editId !== -1) removeFoto({ ...form, id: editId }); }}>Verwijder foto</button>}
                            </div>
                        </div>

                        {/* Allergenen */}
                        <div>
                            <label className={S.lbl}>Allergenen</label>
                            <AllergenCheckboxes selected={form.allergenen || []} onChange={(v) => f('allergenen', v)} />
                        </div>

                        <div className="flex gap-4">
                            <div className="w-24"><label className={S.lbl}>Volgorde</label><input className={S.inp} type="number" value={form.volgorde ?? 1} onChange={(e: any) => f('volgorde', parseInt(e.target.value) || 0)} /></div>
                            <div className="flex items-end pb-1"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.actief ?? true} onChange={(e: any) => f('actief', e.target.checked)} className="accent-[#3b82f6]" /><span className="text-sm text-white">Zichtbaar op website</span></label></div>
                        </div>
                        <p className="text-[var(--muted)] text-xs"><i className="fa-solid fa-info-circle mr-1"></i>Volgorde &lt; 10 = normaal menu | ≥ 10 = dieet/verborgen optie</p>
                        <div className="flex gap-2 pt-2">
                            <button className={S.btn} onClick={async () => {
                                try {
                                    const { _type, id, ...rest } = form;
                                    if (editId === -1) { await gerechten.insert(rest); showToast('Gerecht toegevoegd', 'success'); }
                                    else { await gerechten.update(editId!, rest); showToast('Gerecht opgeslagen', 'success'); }
                                    cancelEdit();
                                } catch { showToast('Fout bij opslaan', 'error'); }
                            }}>Opslaan</button>
                            <button className={S.btnOutline} onClick={cancelEdit}>Annuleren</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Gang sections with dishes */}
            {sortedGangen.map((gang: any) => {
                const dishes = sortedGerechten.filter((g: any) => g.gang_slug === gang.slug);
                const normalCount = dishes.filter((d: any) => d.volgorde < 10).length;
                const dieetCount = dishes.filter((d: any) => d.volgorde >= 10).length;
                return (
                    <div key={gang.id} className={`mb-8 ${!gang.actief ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-3 mb-3">
                            <h4 className="text-white font-semibold text-sm uppercase tracking-wider">{gang.naam}</h4>
                            {!gang.actief && <span className="text-red-400 text-[9px] font-medium px-1.5 py-0.5 rounded bg-red-900/20">INACTIEF</span>}
                            <span className="text-[var(--muted)] text-xs">min {gang.minimum} | +€{Number(gang.extra_prijs_pp || 0).toFixed(2)} p.p.</span>
                            <span className="text-[var(--muted)] text-xs ml-auto mr-2">{normalCount} normaal, {dieetCount} dieet</span>
                            <button className={S.btnIcon} title="Gang bewerken" onClick={() => { setEditId(gang.id); setForm({ ...gang, _type: 'gang' }); }}>
                                <i className="fa-solid fa-pen text-xs"></i>
                            </button>
                        </div>
                        <div className="space-y-1.5">
                            {dishes.map((dish: any) => {
                                const allergs = dish.allergenen || [];
                                return (
                                    <div key={dish.id} className={`${S.card} p-3 flex items-start gap-3 transition-opacity ${!dish.actief ? 'opacity-40' : ''} ${dish.volgorde >= 10 ? 'border-l-2 border-yellow-600/40' : 'border-l-2 border-green-600/40'}`}>
                                        {/* Foto thumbnail */}
                                        {dish.foto ? (
                                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#1a1a1e] shrink-0">
                                                <img src={dish.foto} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-[#1a1a1e] flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-utensils text-[var(--muted)] text-[10px]"></i>
                                            </div>
                                        )}
                                        <div className="text-xs text-[var(--muted)] font-mono w-5 text-center pt-1 shrink-0">{dish.volgorde}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-white text-sm font-medium">{dish.naam}</p>
                                                {dish.volgorde >= 10 && <span className="text-yellow-500 text-[9px] font-medium px-1.5 py-0.5 rounded bg-yellow-900/20">DIEET</span>}
                                            </div>
                                            {dish.beschrijving && <p className="text-[var(--muted)] text-xs mt-0.5">{dish.beschrijving}</p>}
                                            {dish.extra_info && <p className="text-blue-400/70 text-[10px] mt-0.5 truncate"><i className="fa-solid fa-circle-info mr-1"></i>{dish.extra_info}</p>}
                                            <AllergenBadges allergenen={allergs} />
                                        </div>
                                        <div className="flex gap-1 shrink-0 pt-0.5">
                                            <button className={S.btnIcon} onClick={() => toggleActief(gerechten, dish)}><i className={`fa-solid ${dish.actief ? 'fa-eye' : 'fa-eye-slash'} text-xs`}></i></button>
                                            <button className={S.btnIcon} onClick={() => { setEditId(dish.id); setForm({ ...dish, _type: 'gerecht' }); }}><i className="fa-solid fa-pen text-xs"></i></button>
                                            <button className={`${S.btnIcon} text-red-400`} onClick={() => deleteItem(gerechten, dish.id, 'Gerecht')}><i className="fa-solid fa-trash text-xs"></i></button>
                                        </div>
                                    </div>
                                );
                            })}
                            {dishes.length === 0 && <p className="text-[var(--muted)] text-xs py-2 pl-9">Geen gerechten in deze gang</p>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*                        FOOTER TAB                             */
/* ══════════════════════════════════════════════════════════════ */
function FooterTab({ settings, footerForm, ff, footerDirty, setFooterDirty, footerHook, showToast, S }: any) {
    return (
        <div>
            <p className="text-[var(--muted)] text-sm mb-6">Beheer de contactgegevens in de website footer</p>

            {!settings && <p className="text-[var(--muted)] text-sm text-center py-8">Geen settings gevonden in de database</p>}

            {settings && (
                <div className={`${S.card} p-6 max-w-2xl`}>
                    <div className="space-y-4">
                        <div><label className={S.lbl}>E-mailadres</label><input className={S.inp} value={footerForm.email || ''} onChange={(e: any) => ff('email', e.target.value)} /></div>
                        <div><label className={S.lbl}>Telefoon</label><input className={S.inp} value={footerForm.telefoon || ''} onChange={(e: any) => ff('telefoon', e.target.value)} /></div>
                        <div><label className={S.lbl}>Adres <span className="text-[var(--muted)] normal-case">(komma = nieuwe regel op website)</span></label><input className={S.inp} value={footerForm.adres || ''} onChange={(e: any) => ff('adres', e.target.value)} /></div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className={S.lbl}>KvK-nummer</label><input className={S.inp} value={footerForm.kvk || ''} onChange={(e: any) => ff('kvk', e.target.value)} /></div>
                            <div className="flex-1"><label className={S.lbl}>BTW-nummer</label><input className={S.inp} value={footerForm.btw_nummer || ''} onChange={(e: any) => ff('btw_nummer', e.target.value)} /></div>
                        </div>
                        <div className="pt-3">
                            <button className={`${S.btn} ${!footerDirty ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={!footerDirty} onClick={async () => {
                                try {
                                    const { id, ...rest } = footerForm;
                                    await footerHook.update(settings.id, rest);
                                    showToast('Footer opgeslagen', 'success');
                                    setFooterDirty(false);
                                } catch { showToast('Fout bij opslaan', 'error'); }
                            }}>
                                <i className="fa-solid fa-floppy-disk mr-2"></i>Opslaan
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 pt-5 border-t border-[#222]">
                        <h4 className="text-[var(--muted)] text-xs font-semibold uppercase tracking-wider mb-3">Niet via dit paneel aanpasbaar</h4>
                        <ul className="text-[var(--muted)] text-xs space-y-1.5">
                            <li><i className="fa-solid fa-lock mr-2 text-yellow-600"></i>Basisprijs Signature Menu (hardcoded in code)</li>
                            <li><i className="fa-solid fa-lock mr-2 text-yellow-600"></i>Pagina&apos;s: Grote Groepen, Over Ons, Contact (statische teksten)</li>
                            <li><i className="fa-solid fa-lock mr-2 text-yellow-600"></i>Dieet menu items in de popup</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
