/* ═══════════════════════════════════════════════════════════════
   FolderTree — Drive-style sidebar voor componenten
   Bucket C P0-8. Vervangt flat-chips FolderBar door tree met
   expand/collapse (max 2 levels) en drop-target slots. Parent
   regelt @dnd-kit DndContext + Draggable component-cards;
   deze tree levert alleen de droppable folder-rijen via
   useDroppable. Componenten kunnen naar `__root__` om te
   uncategorize.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
    ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Plus,
} from 'lucide-react';
import { MRButton, MREyebrow } from './atoms';
import type { ComponentFolderRow } from '@/app/gerechten/componenten/_lib/useComponentFolders';

interface Props {
    folders: ComponentFolderRow[];
    counts: Record<string, number>;
    rootCount: number;
    /* null = alle componenten (root + sub). '__root__' = componenten zonder folder. */
    currentFolderId: string | null;
    onSelectFolder: (id: string | null) => void;
    onCreate: () => void;
    onEdit: (folder: ComponentFolderRow) => void;
}

const ROOT_DROP_ID = '__root__';

function buildTree(folders: ComponentFolderRow[]): Array<ComponentFolderRow & { children: ComponentFolderRow[] }> {
    const byParent: Record<string, ComponentFolderRow[]> = {};
    folders.forEach((f) => {
        const k = f.parent_id ?? 'root';
        (byParent[k] ??= []).push(f);
    });
    const sortFn = (a: ComponentFolderRow, b: ComponentFolderRow) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name);
    Object.values(byParent).forEach((arr) => arr.sort(sortFn));
    return (byParent.root ?? []).map((root) => ({
        ...root,
        children: (byParent[root.id] ?? []).slice(0, 50), // max 2 levels enforced
    }));
}

/* Droppable folder-row (visuele highlight bij hover-over) */
function FolderItem({
    folder, count, active, hasChildren, expanded, onClick, onToggle, onEdit, level,
}: {
    folder: ComponentFolderRow;
    count: number;
    active: boolean;
    hasChildren: boolean;
    expanded: boolean;
    onClick: () => void;
    onToggle?: () => void;
    onEdit: () => void;
    level: 0 | 1;
}) {
    const { isOver, setNodeRef } = useDroppable({ id: `folder:${folder.id}` });
    const Icon = active ? FolderOpen : Folder;
    return (
        <div
            ref={setNodeRef}
            className={`mr-folder-item ${active ? 'active' : ''} ${isOver ? 'mr-folder-droptarget' : ''}`}
            style={{ paddingLeft: 12 + level * 14 }}
            data-folder-id={folder.id}
        >
            {hasChildren && onToggle ? (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    aria-label={expanded ? 'Inklappen' : 'Uitklappen'}
                    style={{
                        width: 18, height: 18, padding: 0,
                        background: 'transparent', border: 'none',
                        color: 'var(--muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginLeft: -4,
                    }}
                >
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
            ) : (
                <span style={{ width: 14, display: 'inline-block' }} />
            )}
            <Icon size={15} color={active ? 'var(--brand)' : (folder.color ?? 'var(--muted)')} />
            <button
                type="button"
                onClick={onClick}
                style={{
                    flex: 1, textAlign: 'left', background: 'transparent',
                    border: 'none', color: 'inherit', font: 'inherit',
                    cursor: 'pointer', padding: 0,
                }}
            >
                {folder.name}
            </button>
            <span className="mr-folder-count">{count}</span>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                aria-label="Bewerk folder"
                style={{
                    width: 22, height: 22,
                    background: 'transparent', border: 'none',
                    color: 'var(--muted)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 5, opacity: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
                className="mr-folder-edit-btn"
            >
                <Pencil size={11} />
            </button>
        </div>
    );
}

/* Droppable "Alle componenten" + "Zonder folder" rijen */
function SpecialItem({
    id, label, count, icon, active, onClick,
}: {
    id: string;
    label: string;
    count: number;
    icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
}) {
    const { isOver, setNodeRef } = useDroppable({ id: `folder:${id}` });
    return (
        <button
            ref={setNodeRef}
            type="button"
            className={`mr-folder-item ${active ? 'active' : ''} ${isOver ? 'mr-folder-droptarget' : ''}`}
            onClick={onClick}
        >
            <span style={{ width: 14 }} />
            {icon}
            <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
            <span className="mr-folder-count">{count}</span>
        </button>
    );
}

export function FolderTree({
    folders, counts, rootCount, currentFolderId, onSelectFolder, onCreate, onEdit,
}: Props) {
    const tree = useMemo(() => buildTree(folders), [folders]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
        /* Default: alle root-folders expanded (max 5-10 vouw-niveaus). */
        const init: Record<string, boolean> = {};
        tree.forEach((t) => { init[t.id] = true; });
        return init;
    });

    const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
    const totalCount = rootCount + Object.values(counts).reduce((s, c) => s + c, 0);

    return (
        <aside className="mr-folder-tree" aria-label="Folder navigatie">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', marginBottom: 10 }}>
                <MREyebrow>Mappen</MREyebrow>
                <button
                    type="button"
                    onClick={onCreate}
                    title="Nieuwe folder"
                    aria-label="Nieuwe folder"
                    style={{
                        width: 22, height: 22, background: 'transparent', border: 'none',
                        color: 'var(--muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 5,
                    }}
                >
                    <FolderPlus size={13} />
                </button>
            </div>

            <SpecialItem
                id="all"
                label="Alle componenten"
                count={totalCount}
                icon={<Folder size={15} color={currentFolderId === null ? 'var(--brand)' : 'var(--muted)'} />}
                active={currentFolderId === null}
                onClick={() => onSelectFolder(null)}
            />

            <SpecialItem
                id={ROOT_DROP_ID}
                label="Zonder folder"
                count={rootCount}
                icon={<Folder size={15} color="var(--muted)" />}
                active={currentFolderId === ROOT_DROP_ID}
                onClick={() => onSelectFolder(ROOT_DROP_ID)}
            />

            <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />

            {tree.map((root) => {
                const isOpen = !!expanded[root.id];
                return (
                    <div key={root.id}>
                        <FolderItem
                            folder={root}
                            count={counts[root.id] ?? 0}
                            active={currentFolderId === root.id}
                            hasChildren={root.children.length > 0}
                            expanded={isOpen}
                            onClick={() => onSelectFolder(root.id)}
                            onToggle={() => toggle(root.id)}
                            onEdit={() => onEdit(root)}
                            level={0}
                        />
                        {isOpen && root.children.map((child) => (
                            <FolderItem
                                key={child.id}
                                folder={child}
                                count={counts[child.id] ?? 0}
                                active={currentFolderId === child.id}
                                hasChildren={false}
                                expanded={false}
                                onClick={() => onSelectFolder(child.id)}
                                onEdit={() => onEdit(child)}
                                level={1}
                            />
                        ))}
                    </div>
                );
            })}

            {folders.length === 0 && (
                <div style={{ padding: '12px 8px', fontSize: 12, color: 'var(--muted)' }}>
                    Nog geen folders.{' '}
                    <button
                        type="button"
                        onClick={onCreate}
                        style={{ background: 'transparent', border: 'none', color: 'var(--brand)', cursor: 'pointer', textDecoration: 'underline', padding: 0, font: 'inherit' }}
                    >
                        Maak je eerste.
                    </button>
                </div>
            )}

            <div style={{ marginTop: 10 }}>
                <MRButton variant="ghost" icon={<Plus size={13} />} sm onClick={onCreate}>Nieuwe map</MRButton>
            </div>
        </aside>
    );
}

/* Helper voor parent om dnd-kit drop-event → folder-id om te zetten. */
export function parseDropId(id: string | number | null): string | null | undefined {
    if (id == null) return undefined;
    const s = String(id);
    if (!s.startsWith('folder:')) return undefined;
    const fid = s.slice(7);
    if (fid === 'all') return undefined; // 'all' is read-only, niet droppable
    if (fid === ROOT_DROP_ID) return null; // null = geen folder
    return fid;
}
