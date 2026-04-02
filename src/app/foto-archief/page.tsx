/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useRef } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

const CATEGORIES = ['Alle', 'Food', 'Gear', 'Sfeer', 'Admin'];
const CAT_COLORS: Record<string, string> = { Food: '#ef4444', Gear: '#3b82f6', Sfeer: '#a78bfa', Admin: '#f59e0b' };
const BUCKET = 'photos';

interface Foto {
    id: number;
    filename: string;
    url: string;
    categorie: string;
    beschrijving: string;
    tags: string[];
    created_at: string;
}

interface UploadQueueItem {
    file: File;
    preview: string;
    categorie: string;
    beschrijving: string;
}

interface EditForm {
    beschrijving: string;
    categorie: string;
}

export default function FotoArchief() {
    const { data: fotos, insert: insertFoto, update: updateFoto, remove: removeFoto } = useSupabase<Foto>('photo_logbook', []);
    const showToast = useToast();
    const showConfirm = useConfirm();

    const [tab, setTab] = useState('archief');
    const [filterCat, setFilterCat] = useState('Alle');
    const [lightbox, setLightbox] = useState<number | null>(null);
    const [selected, setSelected] = useState<Record<number, boolean>>({});
    const [bulkMode, setBulkMode] = useState(false);
    const [bulkCat, setBulkCat] = useState('Food');

    const [dragOver, setDragOver] = useState(false);
    const [uploadFiles, setUploadFiles] = useState<UploadQueueItem[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const [editFoto, setEditFoto] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<EditForm | null>(null);

    const filtered = (fotos || []).filter(function (f) {
        return filterCat === 'Alle' || f.categorie === filterCat;
    }).sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });

    function addFilesToQueue(files: FileList) {
        const arr = Array.from(files).filter(function (f) { return f.type.startsWith('image/'); });
        if (!arr.length) { showToast('Alleen afbeeldingen worden ondersteund', 'error'); return; }
        arr.forEach(function (file) {
            const reader = new FileReader();
            reader.onload = function (ev: ProgressEvent<FileReader>) {
                setUploadFiles(function (prev) {
                    return prev.concat([{ file: file, preview: ev.target!.result as string, categorie: 'Food', beschrijving: '' }]);
                });
            };
            reader.readAsDataURL(file);
        });
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) { if (e.target.files) { addFilesToQueue(e.target.files); setTab('upload'); } }
    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        addFilesToQueue(e.dataTransfer.files);
        setTab('upload');
    }

    function removeFromQueue(idx: number) {
        setUploadFiles(function (prev) { return prev.filter(function (_, i) { return i !== idx; }); });
    }

    function updateQueueItem(idx: number, key: string, val: string) {
        setUploadFiles(function (prev) {
            return prev.map(function (item, i) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        });
    }

    async function uploadAll() {
        if (!uploadFiles.length) return;
        if (!supabase) { showToast('Supabase niet geconfigureerd', 'error'); return; }
        setUploading(true);
        let succeeded = 0;
        for (let i = 0; i < uploadFiles.length; i++) {
            const item = uploadFiles[i];
            try {
                const ext = item.file.name.split('.').pop()!.toLowerCase();
                const filename = Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
                const { error: upErr } = await supabase.storage.from(BUCKET).upload(filename, item.file, {
                    cacheControl: '3600',
                    upsert: false,
                });
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
                await insertFoto({
                    filename: filename,
                    url: urlData.publicUrl,
                    categorie: item.categorie,
                    beschrijving: item.beschrijving,
                    tags: [],
                } as any);
                succeeded++;
            } catch (err: any) {
                showToast('Fout bij ' + item.file.name + ': ' + (err.message || err), 'error');
            }
        }
        if (succeeded > 0) {
            showToast(succeeded + ' foto' + (succeeded > 1 ? "'s" : '') + ' ge\u00fcpload', 'success');
            setUploadFiles([]);
            setTab('archief');
        }
        setUploading(false);
    }

    async function deleteFoto(foto: Foto) {
        showConfirm('Foto verwijderen?', async function () {
            try {
                if (supabase && foto.filename) {
                    await supabase.storage.from(BUCKET).remove([foto.filename]);
                }
                await removeFoto(foto.id);
                showToast('Foto verwijderd', 'success');
                if (lightbox !== null) setLightbox(null);
            } catch (err) {
                showToast('Verwijderen mislukt', 'error');
            }
        });
    }

    function toggleSelect(id: number) {
        setSelected(function (prev) {
            const next = Object.assign({}, prev);
            if (next[id]) delete next[id]; else next[id] = true;
            return next;
        });
    }

    function selectAll() {
        const next: Record<number, boolean> = {};
        filtered.forEach(function (f) { next[f.id] = true; });
        setSelected(next);
    }

    function clearSelection() { setSelected({}); }

    const selectedCount = Object.keys(selected).length;

    function bulkDelete() {
        showConfirm(selectedCount + ' foto\'s verwijderen?', async function () {
            const ids = Object.keys(selected).map(Number);
            const toDelete = fotos.filter(function (f) { return ids.includes(f.id); });
            for (let i = 0; i < toDelete.length; i++) {
                try {
                    if (supabase && toDelete[i].filename) {
                        await supabase.storage.from(BUCKET).remove([toDelete[i].filename]);
                    }
                    await removeFoto(toDelete[i].id);
                } catch (err) { /* continue */ }
            }
            showToast(ids.length + " foto's verwijderd", 'success');
            setSelected({});
            setBulkMode(false);
        });
    }

    function bulkReCategorize() {
        const ids = Object.keys(selected).map(Number);
        Promise.all(ids.map(function (id) { return updateFoto(id, { categorie: bulkCat }); }))
            .then(function () {
                showToast(ids.length + " foto's verplaatst naar " + bulkCat, 'success');
                setSelected({});
                setBulkMode(false);
            });
    }

    function openEdit(foto: Foto) { setEditFoto(foto.id); setEditForm({ beschrijving: foto.beschrijving || '', categorie: foto.categorie || 'Food' }); }
    function saveEdit() {
        updateFoto(editFoto!, editForm as any).then(function () {
            showToast('Bijgewerkt', 'success');
            setEditFoto(null);
            setEditForm(null);
        });
    }

    function lightboxPrev() { setLightbox(function (i) { return i !== null && i > 0 ? i - 1 : filtered.length - 1; }); }
    function lightboxNext() { setLightbox(function (i) { return i !== null && i < filtered.length - 1 ? i + 1 : 0; }); }

    const activeLightboxFoto = lightbox !== null ? filtered[lightbox] : null;

    const catCounts: Record<string, number> = {};
    CATEGORIES.forEach(function (c) { catCounts[c] = c === 'Alle' ? fotos.length : fotos.filter(function (f) { return f.categorie === c; }).length; });

    return (
        <>
            <div
                onDrop={handleDrop}
                onDragOver={function (e: React.DragEvent) { e.preventDefault(); setDragOver(true); }}
                onDragLeave={function () { setDragOver(false); }}
                style={{
                    display: dragOver ? 'flex' : 'none',
                    position: 'fixed', inset: 0, background: 'rgba(255,191,0,.12)',
                    border: '3px dashed var(--brand)', zIndex: 999,
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12,
                }}
            >
                <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: 56, color: 'var(--brand)' }}></i>
                <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>Sleep foto&apos;s hier naartoe</p>
            </div>

            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'archief' ? ' active' : '')} onClick={function () { setTab('archief'); }}>
                    <i className="fa-solid fa-images"></i> Archief
                    <span style={{ background: 'var(--brand-light)', color: 'var(--brand)', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 5 }}>{fotos.length}</span>
                </button>
                <button className={'tab-btn' + (tab === 'upload' ? ' active' : '')} onClick={function () { setTab('upload'); }}>
                    <i className="fa-solid fa-upload"></i> Upload
                    {uploadFiles.length > 0 && (
                        <span style={{ background: 'var(--amber)', color: '#000', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 5, fontWeight: 700 }}>{uploadFiles.length}</span>
                    )}
                </button>
            </div>

            {tab === 'archief' && (
                <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        {CATEGORIES.map(function (cat) {
                            return (
                                <button
                                    key={cat}
                                    onClick={function () { setFilterCat(cat); }}
                                    style={{
                                        padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                        background: filterCat === cat ? (cat === 'Alle' ? 'var(--brand)' : CAT_COLORS[cat]) : 'var(--card-solid)',
                                        color: filterCat === cat ? (cat === 'Alle' ? '#000' : '#fff') : 'var(--muted)',
                                        transition: 'all .15s',
                                    }}
                                >
                                    {cat} <span style={{ opacity: .7, fontWeight: 400 }}>({catCounts[cat]})</span>
                                </button>
                            );
                        })}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            {!bulkMode ? (
                                <>
                                    <button className="btn btn-ghost btn-sm" onClick={function () { fileRef.current && fileRef.current.click(); }}>
                                        <i className="fa-solid fa-plus"></i> Upload
                                    </button>
                                    {fotos.length > 0 && (
                                        <button className="btn btn-ghost btn-sm" onClick={function () { setBulkMode(true); }}>
                                            <i className="fa-solid fa-check-square"></i> Selecteren
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <button className="btn btn-ghost btn-sm" onClick={selectAll}>Alles</button>
                                    <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Geen</button>
                                    {selectedCount > 0 && (
                                        <>
                                            <select
                                                value={bulkCat}
                                                onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setBulkCat(e.target.value); }}
                                                style={{ background: 'var(--card-solid)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 8, fontSize: 13 }}
                                            >
                                                {CATEGORIES.filter(function (c) { return c !== 'Alle'; }).map(function (c) { return <option key={c}>{c}</option>; })}
                                            </select>
                                            <button className="btn btn-brand btn-sm" onClick={bulkReCategorize}>
                                                <i className="fa-solid fa-folder-open"></i> Verplaats ({selectedCount})
                                            </button>
                                            <button className="btn btn-red btn-sm" onClick={bulkDelete}>
                                                <i className="fa-solid fa-trash"></i> ({selectedCount})
                                            </button>
                                        </>
                                    )}
                                    <button className="btn btn-ghost btn-sm" onClick={function () { setBulkMode(false); clearSelection(); }}>Klaar</button>
                                </>
                            )}
                        </div>
                    </div>

                    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleInputChange} />

                    {filtered.length === 0 ? (
                        <div className="empty-state">
                            <i className="fa-solid fa-camera"></i>
                            <p>{filterCat === 'Alle' ? "Nog geen foto's — upload via het Upload tabblad" : 'Geen foto\'s in categorie ' + filterCat}</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                            {filtered.map(function (foto, idx) {
                                const isSelected = !!selected[foto.id];
                                return (
                                    <div
                                        key={foto.id}
                                        onClick={function () {
                                            if (bulkMode) { toggleSelect(foto.id); }
                                            else if (editFoto === null) { setLightbox(idx); }
                                        }}
                                        style={{
                                            position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                                            aspectRatio: '4/3', background: 'var(--card-solid)',
                                            border: isSelected ? '2px solid var(--brand)' : '2px solid transparent',
                                            transition: 'transform .15s, border-color .15s',
                                        }}
                                    >
                                        {foto.url ? (
                                            <img src={foto.url} alt={foto.beschrijving || foto.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fa-solid fa-image" style={{ fontSize: 32, color: 'var(--muted)' }}></i>
                                            </div>
                                        )}
                                        <div style={{ position: 'absolute', top: 8, left: 8, background: CAT_COLORS[foto.categorie] || 'var(--muted)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, textTransform: 'uppercase' }}>
                                            {foto.categorie}
                                        </div>
                                        {bulkMode && (
                                            <div style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 6, background: isSelected ? 'var(--brand)' : 'rgba(0,0,0,.5)', border: '2px solid ' + (isSelected ? 'var(--brand)' : '#fff'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {isSelected && <i className="fa-solid fa-check" style={{ fontSize: 11, color: '#000' }}></i>}
                                            </div>
                                        )}
                                        {foto.beschrijving && !bulkMode && (
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,.7))', padding: '16px 8px 8px', fontSize: 11, color: '#fff' }}>
                                                {foto.beschrijving}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {tab === 'upload' && (
                <>
                    <div
                        onDrop={handleDrop}
                        onDragOver={function (e: React.DragEvent) { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={function () { setDragOver(false); }}
                        onClick={function () { fileRef.current && fileRef.current.click(); }}
                        style={{ border: '2px dashed ' + (dragOver ? 'var(--brand)' : 'var(--border)'), borderRadius: 14, padding: '36px 24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--brand-light)' : 'transparent', marginBottom: 20, transition: 'all .2s' }}
                    >
                        <i className="fa-solid fa-camera" style={{ fontSize: 36, color: 'var(--brand)', marginBottom: 12, display: 'block' }}></i>
                        <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>Sleep foto&apos;s hierheen of klik om te kiezen</p>
                        <p style={{ color: 'var(--muted)', fontSize: 12 }}>JPG, PNG, WEBP · Meerdere bestanden tegelijk</p>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleInputChange} />

                    {uploadFiles.length === 0 ? (
                        <div className="empty-state"><i className="fa-solid fa-inbox"></i><p>Wachtrij is leeg</p></div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <span style={{ fontWeight: 600 }}>{uploadFiles.length} foto{uploadFiles.length > 1 ? "'s" : ''} gereed</span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-ghost btn-sm" onClick={function () { setUploadFiles([]); }}><i className="fa-solid fa-xmark"></i> Wis wachtrij</button>
                                    <button className="btn btn-brand" onClick={uploadAll} disabled={uploading}>
                                        {uploading ? <><i className="fa-solid fa-spinner fa-spin"></i> Uploaden...</> : <><i className="fa-solid fa-cloud-arrow-up"></i> Upload alles</>}
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {uploadFiles.map(function (item, idx) {
                                    return (
                                        <div key={idx} style={{ display: 'flex', gap: 14, background: 'var(--card-solid)', borderRadius: 12, padding: 12, alignItems: 'flex-start' }}>
                                            <img src={item.preview} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    <select value={item.categorie} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { updateQueueItem(idx, 'categorie', e.target.value); }} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13, flex: '0 0 auto' }}>
                                                        {CATEGORIES.filter(function (c) { return c !== 'Alle'; }).map(function (c) { return <option key={c}>{c}</option>; })}
                                                    </select>
                                                    <input placeholder="Beschrijving (optioneel)" value={item.beschrijving} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateQueueItem(idx, 'beschrijving', e.target.value); }} style={{ flex: 1, minWidth: 120, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13 }} />
                                                </div>
                                            </div>
                                            <button onClick={function () { removeFromQueue(idx); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, fontSize: 16 }}>
                                                <i className="fa-solid fa-xmark"></i>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            )}

            {editFoto !== null && editForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                    onClick={function (e: React.MouseEvent) { if (e.target === e.currentTarget) { setEditFoto(null); } }}>
                    <div style={{ background: 'var(--card-solid)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
                        <h3 style={{ marginBottom: 16, fontWeight: 700 }}>Foto bewerken</h3>
                        <div className="field" style={{ marginBottom: 12 }}>
                            <label>Categorie</label>
                            <select value={editForm.categorie} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setEditForm(Object.assign({}, editForm, { categorie: e.target.value })); }}>
                                {CATEGORIES.filter(function (c) { return c !== 'Alle'; }).map(function (c) { return <option key={c}>{c}</option>; })}
                            </select>
                        </div>
                        <div className="field" style={{ marginBottom: 20 }}>
                            <label>Beschrijving</label>
                            <input value={editForm.beschrijving} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setEditForm(Object.assign({}, editForm, { beschrijving: e.target.value })); }} placeholder="Optionele beschrijving" />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-brand" style={{ flex: 1 }} onClick={saveEdit}><i className="fa-solid fa-save"></i> Opslaan</button>
                            <button className="btn btn-ghost" onClick={function () { setEditFoto(null); }}>Annuleren</button>
                        </div>
                    </div>
                </div>
            )}

            {activeLightboxFoto && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                    onClick={function (e: React.MouseEvent) { if (e.target === e.currentTarget) setLightbox(null); }}>
                    <button onClick={function () { setLightbox(null); }} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                    {filtered.length > 1 && (
                        <button onClick={lightboxPrev} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fa-solid fa-chevron-left"></i>
                        </button>
                    )}
                    <img src={activeLightboxFoto.url} alt={activeLightboxFoto.beschrijving || ''} style={{ maxWidth: 'calc(100vw - 120px)', maxHeight: 'calc(100vh - 160px)', objectFit: 'contain', borderRadius: 12 }} />
                    {filtered.length > 1 && (
                        <button onClick={lightboxNext} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fa-solid fa-chevron-right"></i>
                        </button>
                    )}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.7)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ background: CAT_COLORS[activeLightboxFoto.categorie] || 'var(--muted)', color: '#fff', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{activeLightboxFoto.categorie}</span>
                        <span style={{ color: '#fff', flex: 1, fontSize: 14 }}>{activeLightboxFoto.beschrijving || activeLightboxFoto.filename}</span>
                        <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>{lightbox! + 1} / {filtered.length}</span>
                        <button onClick={function () { openEdit(activeLightboxFoto); setLightbox(null); }} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                            <i className="fa-solid fa-pen"></i> Bewerk
                        </button>
                        <button onClick={function () { deleteFoto(activeLightboxFoto); }} style={{ background: 'rgba(239,68,68,.3)', border: 'none', color: 'var(--red)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
