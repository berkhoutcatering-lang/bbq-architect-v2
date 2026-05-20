'use client';
import { useMemo } from 'react';
import { Folder, FolderPlus, ChevronRight, Pencil } from 'lucide-react';
import { ICON_OPTIONS } from './FolderModal';
import type { ComponentFolderRow } from '../_lib/useComponentFolders';

interface FolderBarProps {
    folders: ComponentFolderRow[];
    counts: Record<string, number>;          // folderId → component count
    rootCount: number;                       // count voor componenten zonder folder
    currentFolderId: string | null;
    onSelectFolder: (id: string | null) => void;
    onCreate: () => void;
    onEdit: (folder: ComponentFolderRow) => void;
}

/* Folder-rij die boven de filter-bar staat. Klik op een folder filtert
   de componenten-lijst. Klik op "Alles" = root view. + knop opent modal.
   Hover op een folder toont een potlood-icoon voor edit/delete. */
export default function FolderBar({ folders, counts, rootCount, currentFolderId, onSelectFolder, onCreate, onEdit }: FolderBarProps) {
    /* Filter alleen root-folders (parent_id = null). Sub-folders verschijnen
       als de gebruiker een folder selecteert (volgende iteratie). */
    const rootFolders = useMemo(() => folders.filter(f => f.parent_id === null), [folders]);

    /* Breadcrumb opbouwen als we in een folder zitten. */
    const current = currentFolderId ? folders.find(f => f.id === currentFolderId) ?? null : null;
    const breadcrumb = useMemo(() => {
        const chain: ComponentFolderRow[] = [];
        let node = current;
        while (node) {
            chain.unshift(node);
            node = node.parent_id ? folders.find(f => f.id === node!.parent_id) ?? null : null;
        }
        return chain;
    }, [current, folders]);

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: 10,
            padding: '14px 16px',
            background: 'rgba(255,255,255,.02)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            marginBottom: 14,
        }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                <button
                    onClick={() => onSelectFolder(null)}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        color: currentFolderId === null ? 'var(--text)' : 'var(--muted)',
                        fontWeight: currentFolderId === null ? 600 : 500,
                        fontSize: 11,
                    }}
                >Componenten</button>
                {breadcrumb.map((f, i) => (
                    <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ChevronRight size={11} aria-hidden style={{ color: 'var(--muted)' }} />
                        <button
                            onClick={() => onSelectFolder(f.id)}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                color: i === breadcrumb.length - 1 ? 'var(--text)' : 'var(--muted)',
                                fontWeight: i === breadcrumb.length - 1 ? 600 : 500,
                                fontSize: 11,
                            }}
                        >{f.name}</button>
                    </span>
                ))}
            </div>

            {/* Folder-grid (alleen root-niveau in dit MVP) */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <FolderChip
                    label="Alles"
                    count={rootCount + Object.values(counts).reduce((s, n) => s + n, 0)}
                    icon={null}
                    color={null}
                    active={currentFolderId === null}
                    onClick={() => onSelectFolder(null)}
                />
                <FolderChip
                    label="Zonder map"
                    count={rootCount}
                    icon="Folder"
                    color="#94a3b8"
                    active={false}
                    /* "Zonder map" filter is impliciet; voor MVP geen aparte view
                       maar wel een visuele indicatie van hoeveel componenten in root staan. */
                    onClick={() => onSelectFolder(null)}
                    muted
                />
                {rootFolders.map(f => (
                    <FolderChip
                        key={f.id}
                        label={f.name}
                        count={counts[f.id] ?? 0}
                        icon={f.icon}
                        color={f.color}
                        active={currentFolderId === f.id}
                        onClick={() => onSelectFolder(f.id)}
                        onEdit={() => onEdit(f)}
                    />
                ))}
                <button
                    type="button"
                    onClick={onCreate}
                    aria-label="Nieuwe map"
                    style={{
                        padding: '7px 12px', borderRadius: 8,
                        background: 'transparent',
                        border: '1px dashed var(--border)',
                        color: 'var(--muted)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        minHeight: 36,
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.color = '#FFBF00';
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,191,0,.4)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    }}
                >
                    <FolderPlus size={12} /> Nieuwe map
                </button>
            </div>
        </div>
    );
}

function FolderChip({
    label, count, icon, color, active, onClick, onEdit, muted,
}: {
    label: string; count: number; icon: string | null; color: string | null;
    active: boolean; onClick: () => void; onEdit?: () => void; muted?: boolean;
}) {
    const Icon = icon ? (ICON_OPTIONS.find(o => o.id === icon)?.Icon ?? Folder) : null;
    const accentColor = color ?? '#FFBF00';
    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={onClick}
                aria-pressed={active}
                style={{
                    padding: '7px 12px', borderRadius: 8,
                    background: active ? `${accentColor}15` : 'rgba(0,0,0,.2)',
                    border: `1px solid ${active ? `${accentColor}55` : 'var(--border)'}`,
                    color: active ? 'var(--text)' : (muted ? 'var(--muted)' : 'var(--text)'),
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    minHeight: 36, opacity: muted && count === 0 ? 0.5 : 1,
                }}
            >
                {Icon && <Icon size={12} style={{ color: accentColor }} />}
                <span>{label}</span>
                <span style={{
                    padding: '0 6px', borderRadius: 999,
                    background: active ? accentColor : 'rgba(255,255,255,.06)',
                    color: active ? '#000' : 'var(--muted)',
                    fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    lineHeight: '16px', minWidth: 18, textAlign: 'center',
                }}>{count}</span>
            </button>
            {onEdit && (
                <button
                    onClick={onEdit}
                    aria-label={`Bewerk map ${label}`}
                    style={{
                        position: 'absolute', top: 3, right: 3,
                        width: 18, height: 18, borderRadius: 4,
                        background: 'rgba(0,0,0,.6)',
                        border: 'none', cursor: 'pointer',
                        color: 'var(--muted)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0, transition: 'opacity .15s',
                    }}
                    className="folder-chip-edit"
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
                ><Pencil size={10} /></button>
            )}
        </div>
    );
}
