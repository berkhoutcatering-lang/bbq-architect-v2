'use client';
import { useEffect, useState, useTransition } from 'react';
import { X, Trash2, Check, Folder, ChefHat, Soup, Beef, Drumstick, Salad, Wheat, Cookie, Sandwich, CupSoda, Fish, Carrot } from 'lucide-react';
import { createComponentFolder, updateComponentFolder, deleteComponentFolder } from '../actions';
import type { ComponentFolderRow } from '../_lib/useComponentFolders';

const ICON_OPTIONS = [
    { id: 'Folder', Icon: Folder },
    { id: 'ChefHat', Icon: ChefHat },
    { id: 'Soup', Icon: Soup },
    { id: 'Beef', Icon: Beef },
    { id: 'Drumstick', Icon: Drumstick },
    { id: 'Salad', Icon: Salad },
    { id: 'Wheat', Icon: Wheat },
    { id: 'Cookie', Icon: Cookie },
    { id: 'Sandwich', Icon: Sandwich },
    { id: 'CupSoda', Icon: CupSoda },
    { id: 'Fish', Icon: Fish },
    { id: 'Carrot', Icon: Carrot },
];

const COLOR_OPTIONS = [
    '#FFBF00', '#a78bfa', '#60a5fa', '#10b981',
    '#f59e0b', '#ef4444', '#ec4899', '#06b6d4',
];

interface Props {
    open: boolean;
    editing: ComponentFolderRow | null;
    parentId?: string | null;
    onClose: () => void;
    onSaved?: () => void;
}

export default function FolderModal({ open, editing, parentId, onClose, onSaved }: Props) {
    const [name, setName] = useState('');
    const [iconId, setIconId] = useState('Folder');
    const [color, setColor] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [deleting, setDeleting] = useState(false);

    useEffect(function () {
        if (!open) return;
        setName(editing?.name ?? '');
        setIconId(editing?.icon ?? 'Folder');
        setColor(editing?.color ?? null);
        setError(null);
        setDeleting(false);
    }, [open, editing]);

    /* Escape sluit de drawer — zelfde reflex als bij alle andere drawers. */
    useEffect(function () {
        if (!open) return;
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
        document.addEventListener('keydown', onKey);
        return function () { document.removeEventListener('keydown', onKey); };
    }, [open, onClose]);

    if (!open) return null;

    function submit() {
        setError(null);
        startTransition(async function () {
            const input = { name: name.trim(), icon: iconId, color: color ?? undefined, parent_id: editing?.parent_id ?? parentId ?? null };
            const res = editing
                ? await updateComponentFolder({ ...input, id: editing.id })
                : await createComponentFolder(input);
            if ('error' in res) { setError(res.error); return; }
            onSaved?.();
            onClose();
        });
    }

    function confirmDelete() {
        if (!editing) return;
        setError(null);
        startTransition(async function () {
            const res = await deleteComponentFolder({ id: editing.id });
            if ('error' in res) { setError(res.error); return; }
            onSaved?.();
            onClose();
        });
    }

    /* Rechter drawer, geen gecentreerde modal. Alle andere toevoeg-/bewerk-schermen
       op deze pagina (bewerken, ingekocht, zelf bereid, scannen) schuiven van rechts
       in; deze sprong als enige midden op het scherm en gooide de lijst eronder weg.
       Zelfde patroon = zelfde reflex. */
    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div className="mr-drawer kdrawer" role="dialog" aria-modal="true" aria-label={editing ? 'Map bewerken' : 'Nieuwe map'}>
                <div className="kdrawer-head">
                    <div className="flex-1 min-w-0">
                        <span className="kf-eyebrow"><Folder size={12} /> Map</span>
                        <h2 className="kdrawer-title">{editing ? 'Map bewerken' : 'Nieuwe map'}</h2>
                    </div>
                    <button onClick={onClose} aria-label="Sluiten" className="kf-icon-x"><X size={17} /></button>
                </div>

                <div className="kf-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <label style={fieldStyle}>
                        <span style={labelStyle}>Naam</span>
                        <input
                            type="text" value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="bv. Sauzen, Snijwerk, Marinades"
                            maxLength={60} autoFocus
                            style={inputStyle}
                        />
                    </label>

                    <div style={fieldStyle}>
                        <span style={labelStyle}>Icoon</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                            {ICON_OPTIONS.map(({ id, Icon }) => (
                                <button
                                    key={id} type="button"
                                    onClick={() => setIconId(id)}
                                    aria-pressed={iconId === id}
                                    style={{
                                        padding: 10, borderRadius: 8,
                                        background: iconId === id ? 'color-mix(in srgb, var(--brand) 12%, transparent)' : 'rgba(0,0,0,.2)',
                                        border: `1px solid ${iconId === id ? 'color-mix(in srgb, var(--brand) 45%, transparent)' : 'var(--border)'}`,
                                        color: iconId === id ? 'var(--brand)' : 'var(--muted)',
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                ><Icon size={16} /></button>
                            ))}
                        </div>
                    </div>

                    <div style={fieldStyle}>
                        <span style={labelStyle}>Accent-kleur (optioneel)</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                                type="button" onClick={() => setColor(null)}
                                aria-label="Geen kleur"
                                style={{
                                    width: 28, height: 28, borderRadius: 7,
                                    background: 'transparent',
                                    border: color === null ? '2px solid var(--text)' : '1px dashed var(--border)',
                                    cursor: 'pointer', color: 'var(--muted)', fontSize: 14,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            ><X size={12} /></button>
                            {COLOR_OPTIONS.map(c => (
                                <button
                                    key={c} type="button" onClick={() => setColor(c)}
                                    aria-label={`Kleur ${c}`}
                                    style={{
                                        width: 28, height: 28, borderRadius: 7, background: c,
                                        border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                                        cursor: 'pointer', padding: 0,
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div role="alert" style={{
                            padding: '10px 12px', borderRadius: 8,
                            background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
                            color: '#ef4444', fontSize: 12,
                        }}>{error}</div>
                    )}
                </div>

                <div className="kdrawer-foot" style={{ justifyContent: 'space-between' }}>
                    {editing ? (
                        deleting ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: '#ef4444' }}>Weet je het zeker?</span>
                                <button onClick={confirmDelete} disabled={pending} style={{
                                    ...primaryBtnStyle, background: '#ef4444', color: '#fff', opacity: pending ? 0.5 : 1,
                                }}>Verwijder</button>
                                <button onClick={() => setDeleting(false)} style={ghostBtnStyle}>Nee</button>
                            </div>
                        ) : (
                            <button onClick={() => setDeleting(true)} style={{ ...ghostBtnStyle, color: '#ef4444' }}>
                                <Trash2 size={12} /> Verwijderen
                            </button>
                        )
                    ) : <span />}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} style={ghostBtnStyle}>Annuleer</button>
                        <button
                            onClick={submit}
                            disabled={pending || !name.trim()}
                            style={{
                                ...primaryBtnStyle,
                                opacity: pending || !name.trim() ? 0.5 : 1,
                                cursor: pending || !name.trim() ? 'not-allowed' : 'pointer',
                            }}
                        ><Check size={12} /> {pending ? 'Opslaan…' : 'Opslaan'}</button>
                    </div>
                </div>
            </div>
        </>
    );
}

const iconBtnStyle: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 7,
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--muted)', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelStyle: React.CSSProperties = {
    fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700,
};
const inputStyle: React.CSSProperties = {
    padding: '9px 12px', borderRadius: 8,
    background: 'rgba(0,0,0,.25)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', minHeight: 40,
};
const primaryBtnStyle: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 7,
    /* Merkkleur, niet een vaste amber: bij een olijfgroen merk stond hier
       een felgele knop die nergens anders in de app voorkomt. */
    background: 'var(--brand)', color: '#0a0a0c',
    border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36,
};
const ghostBtnStyle: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 7,
    background: 'transparent', color: 'var(--muted)',
    border: '1px solid var(--border)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36,
};

export { ICON_OPTIONS };
