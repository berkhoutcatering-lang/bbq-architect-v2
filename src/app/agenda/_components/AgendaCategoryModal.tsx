'use client';
import { useEffect, useState, useTransition } from 'react';
import { X, Trash2, Check } from 'lucide-react';
import {
    createAgendaCategory,
    updateAgendaCategory,
    deleteAgendaCategory,
} from '../actions';
import type { AgendaCategoryRow } from '../_lib/useAgendaCategories';

const PRESET_COLORS = [
    '#a78bfa', // paars
    '#60a5fa', // blauw
    '#10b981', // groen
    '#f59e0b', // amber
    '#ef4444', // rood
    '#ec4899', // roze
    '#06b6d4', // cyaan
    '#94a3b8', // grijs
];

const PRESET_ICONS = [
    'Calendar', 'Briefcase', 'Users', 'Truck',
    'Home', 'Heart', 'Coffee', 'ChefHat',
    'Wrench', 'Phone', 'MessageSquare', 'Star',
];

interface Props {
    open: boolean;
    editing: AgendaCategoryRow | null;
    onClose: () => void;
    onSaved?: () => void;
}

export default function AgendaCategoryModal({ open, editing, onClose, onSaved }: Props) {
    const [name, setName] = useState('');
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [icon, setIcon] = useState(PRESET_ICONS[0]);
    const [defaultVisible, setDefaultVisible] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [deleting, setDeleting] = useState(false);

    useEffect(function () {
        if (open) {
            setName(editing?.name ?? '');
            setColor(editing?.color ?? PRESET_COLORS[0]);
            setIcon(editing?.icon ?? PRESET_ICONS[0]);
            setDefaultVisible(editing?.default_visible ?? true);
            setError(null);
            setDeleting(false);
        }
    }, [open, editing]);

    if (!open) return null;

    function submit() {
        setError(null);
        startTransition(async function () {
            const input = { name: name.trim(), color, icon, default_visible: defaultVisible };
            const res = editing
                ? await updateAgendaCategory({ ...input, id: editing.id })
                : await createAgendaCategory(input);
            if ('error' in res) {
                setError(res.error);
                return;
            }
            onSaved?.();
            onClose();
        });
    }

    function confirmDelete() {
        if (!editing) return;
        setError(null);
        startTransition(async function () {
            const res = await deleteAgendaCategory({ id: editing.id });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            onSaved?.();
            onClose();
        });
    }

    return (
        <>
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998,
            }} />
            <div role="dialog" aria-label={editing ? 'Agenda bewerken' : 'Nieuwe agenda'} style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 'min(480px, 92vw)', maxHeight: '90dvh', overflowY: 'auto',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                boxShadow: '0 30px 60px rgba(0,0,0,.5)',
                zIndex: 9999,
            }}>
                <div style={{
                    padding: '18px 22px', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 17, fontWeight: 400, color: 'var(--text)' }}>
                        {editing ? 'Agenda bewerken' : 'Nieuwe agenda'}
                    </strong>
                    <button onClick={onClose} aria-label="Sluiten" style={iconBtnStyle}>
                        <X size={16} />
                    </button>
                </div>

                <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <label style={fieldStyle}>
                        <span style={labelStyle}>Naam</span>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="bv. Inkoop, Personeel, Showroom"
                            maxLength={40}
                            autoFocus
                            style={inputStyle}
                        />
                    </label>

                    <div style={fieldStyle}>
                        <span style={labelStyle}>Kleur</span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {PRESET_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    aria-label={`Kleur ${c}`}
                                    aria-pressed={color === c}
                                    style={{
                                        width: 32, height: 32, borderRadius: 8,
                                        background: c,
                                        border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                                        cursor: 'pointer',
                                        padding: 0,
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    <div style={fieldStyle}>
                        <span style={labelStyle}>Icoon</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                            {PRESET_ICONS.map(name => (
                                <button
                                    key={name}
                                    type="button"
                                    onClick={() => setIcon(name)}
                                    aria-pressed={icon === name}
                                    style={{
                                        padding: '8px 4px', borderRadius: 8,
                                        background: icon === name ? 'rgba(255,191,0,.08)' : 'rgba(0,0,0,.2)',
                                        border: `1px solid ${icon === name ? 'rgba(255,191,0,.4)' : 'var(--border)'}`,
                                        color: icon === name ? '#FFBF00' : 'var(--muted)',
                                        fontSize: 10, cursor: 'pointer',
                                    }}
                                    title={name}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={defaultVisible}
                            onChange={e => setDefaultVisible(e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: '#FFBF00' }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--text)' }}>
                            Standaard zichtbaar in agenda
                        </span>
                    </label>

                    {error && (
                        <div role="alert" style={{
                            padding: '10px 12px', borderRadius: 8,
                            background: 'rgba(239,68,68,.08)',
                            border: '1px solid rgba(239,68,68,.3)',
                            color: '#ef4444', fontSize: 12,
                        }}>
                            {error}
                        </div>
                    )}
                </div>

                <div style={{
                    padding: '14px 22px', borderTop: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    {editing ? (
                        deleting ? (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: '#ef4444' }}>Weet je het zeker?</span>
                                <button onClick={confirmDelete} disabled={pending} style={{
                                    ...primaryBtnStyle, background: '#ef4444', color: '#fff',
                                    opacity: pending ? 0.5 : 1,
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
                        <button onClick={submit} disabled={pending || !name.trim()} style={{
                            ...primaryBtnStyle,
                            opacity: pending || !name.trim() ? 0.5 : 1,
                            cursor: pending || !name.trim() ? 'not-allowed' : 'pointer',
                        }}>
                            <Check size={12} /> {pending ? 'Opslaan…' : 'Opslaan'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

const iconBtnStyle: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--muted)', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const labelStyle: React.CSSProperties = {
    fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700,
};
const inputStyle: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 8,
    background: 'rgba(0,0,0,.25)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
    minHeight: 44,
};
const primaryBtnStyle: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 7,
    background: '#FFBF00', color: '#000',
    border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minHeight: 36,
};
const ghostBtnStyle: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 7,
    background: 'transparent', color: 'var(--muted)',
    border: '1px solid var(--border)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minHeight: 36,
};
