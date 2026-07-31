'use client';
import { useEffect, useState, useTransition } from 'react';
import { X, Trash2, Check, Folder, ChefHat, Soup, Beef, Drumstick, Salad, Wheat, Cookie, Sandwich, CupSoda, Fish, Carrot, RefreshCw } from 'lucide-react';
import { createComponentFolder, updateComponentFolder, deleteComponentFolder } from '../actions';
import { supabase } from '@/lib/supabase';
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

/* De pagina geeft mee in welke map je nu staat. Dat kan ook het pseudo-item
   "Zonder folder" zijn — dat is geen bestaande map, dus een nieuwe map hoort dan
   gewoon op het hoogste niveau te komen. Zonder deze check kreeg je een kale
   "Validatie-fout" zodra je vanuit Zonder folder een map aanmaakte. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function schoonParentId(waarde?: string | null): string | null {
    return typeof waarde === 'string' && UUID_RE.test(waarde) ? waarde : null;
}

/** Wat er in de map zit, opgehaald vlak vóór het verwijderen. */
interface VerwijderInzicht {
    submappen: ComponentFolderRow[];
    componenten: number;
}

function meervoud(n: number, enkel: string, meer: string): string {
    return `${n} ${n === 1 ? enkel : meer}`;
}

/**
 * De bevestigingstekst bij het verwijderen van een map. Stond hier eerder alleen
 * "Weet je het zeker?" — en dan weet je juist níet waar je ja tegen zegt: de
 * mappenstructuur eronder ging in één klik mee en de bouwstenen kwamen los te
 * staan, zonder ongedaan maken. Deze tekst noemt de map bij naam en vertelt
 * precies wat er met de submappen en de bouwstenen gebeurt.
 */
export function beschrijfVerwijderGevolgen(args: {
    mapNaam: string;
    submapNamen: string[];
    aantalComponenten: number;
}): string {
    const { mapNaam, submapNamen, aantalComponenten } = args;
    const zinnen: string[] = [`"${mapNaam}" verwijderen?`];

    if (submapNamen.length > 0) {
        const namen = submapNamen.length <= 4 ? ` (${submapNamen.join(', ')})` : '';
        zinnen.push(
            `De ${meervoud(submapNamen.length, 'submap', 'submappen')}${namen} `
            + `${submapNamen.length === 1 ? 'blijft' : 'blijven'} bestaan en `
            + `${submapNamen.length === 1 ? 'schuift' : 'schuiven'} één niveau omhoog.`,
        );
    }

    if (aantalComponenten > 0) {
        zinnen.push(
            `De ${meervoud(aantalComponenten, 'bouwsteen', 'bouwstenen')} die hier direct in `
            + `${aantalComponenten === 1 ? 'zit blijft' : 'zitten blijven'} bestaan en `
            + `${aantalComponenten === 1 ? 'komt' : 'komen'} bij "Zonder folder" te staan.`,
        );
    }

    if (submapNamen.length === 0 && aantalComponenten === 0) {
        zinnen.push('De map is leeg.');
    }

    zinnen.push('De map zelf is daarna weg; dat kun je niet ongedaan maken.');
    return zinnen.join(' ');
}

export default function FolderModal({ open, editing, parentId, onClose, onSaved }: Props) {
    const [name, setName] = useState('');
    const [iconId, setIconId] = useState('Folder');
    const [color, setColor] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [deleting, setDeleting] = useState(false);
    const [inzicht, setInzicht] = useState<VerwijderInzicht | null>(null);
    const [inzichtLaden, setInzichtLaden] = useState(false);
    const [inzichtFout, setInzichtFout] = useState<string | null>(null);

    useEffect(function () {
        if (!open) return;
        setName(editing?.name ?? '');
        setIconId(editing?.icon ?? 'Folder');
        setColor(editing?.color ?? null);
        setError(null);
        setDeleting(false);
        setInzicht(null);
        setInzichtFout(null);
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
            const input = {
                name: name.trim(),
                icon: iconId,
                color: color ?? undefined,
                parent_id: editing?.parent_id ?? schoonParentId(parentId),
            };
            const res = editing
                ? await updateComponentFolder({ ...input, id: editing.id })
                : await createComponentFolder(input);
            if ('error' in res) { setError(res.error); return; }
            onSaved?.();
            onClose();
        });
    }

    /* Vóórdat we iets weggooien: kijken wat erin zit. Zonder deze telling staat er
       alleen "Weet je het zeker?" op het scherm en weet niemand dat er een halve
       indeling aan hangt. Lukt het ophalen niet, dan gaat de verwijder-knop op
       slot — blind verwijderen zonder te weten wat je meeneemt is niet terug te
       draaien. */
    async function laadInzicht(folder: ComponentFolderRow) {
        setInzichtLaden(true);
        setInzichtFout(null);
        setInzicht(null);
        if (!supabase) {
            setInzichtFout('We konden niet ophalen wat er in deze map zit.');
            setInzichtLaden(false);
            return;
        }
        const [subRes, compRes] = await Promise.all([
            supabase
                .from('component_folders')
                .select('id, organization_id, parent_id, name, icon, color, sort_order')
                .eq('parent_id', folder.id)
                .order('name', { ascending: true }),
            supabase
                .from('components')
                .select('id', { count: 'exact', head: true })
                .eq('folder_id', folder.id),
        ]);
        if (subRes.error || compRes.error) {
            console.warn('[componenten] inhoud van map niet op te halen:',
                subRes.error?.message ?? compRes.error?.message);
            setInzichtFout('We konden niet ophalen wat er in deze map zit. Zolang dat niet lukt verwijderen we niets.');
        } else {
            setInzicht({
                submappen: (subRes.data ?? []) as ComponentFolderRow[],
                componenten: compRes.count ?? 0,
            });
        }
        setInzichtLaden(false);
    }

    function startVerwijderen() {
        if (!editing) return;
        setError(null);
        setDeleting(true);
        void laadInzicht(editing);
    }

    function confirmDelete() {
        if (!editing || !inzicht) return;
        setError(null);
        startTransition(async function () {
            /* Submappen eerst één niveau omhoog zetten. De database ruimt anders
               de hele tak onder deze map op (ON DELETE CASCADE) en dat is uren
               sorteerwerk zonder ongedaan maken. Nu overleeft de indeling en
               verdwijnt alleen de map die je aanwees. */
            let verplaatstAantal = 0;
            for (const sub of inzicht.submappen) {
                const verplaatst = await updateComponentFolder({
                    id: sub.id,
                    name: sub.name,
                    icon: sub.icon,
                    color: sub.color ?? undefined,
                    parent_id: editing.parent_id ?? null,
                });
                if ('error' in verplaatst) {
                    onSaved?.();
                    setInzicht(null);
                    setDeleting(false);
                    setError(
                        `De submap "${sub.name}" kon niet omhoog verplaatst worden: ${verplaatst.error}. `
                        + 'Er is niets verwijderd. Geef die map een andere naam of verplaats hem zelf, en probeer het daarna opnieuw.'
                        + (verplaatstAantal > 0
                            ? ` De ${verplaatstAantal === 1 ? 'submap' : verplaatstAantal + ' submappen'} hiervóór ${verplaatstAantal === 1 ? 'staat' : 'staan'} al een niveau hoger.`
                            : ''),
                    );
                    return;
                }
                verplaatstAantal += 1;
            }

            const res = await deleteComponentFolder({ id: editing.id });
            if ('error' in res) {
                onSaved?.();
                setDeleting(false);
                setError(res.error);
                return;
            }
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

                    {/* De bevestiging staat hier en niet in de voetregel: hij moet
                        ruimte hebben om te vertellen wat er precies gebeurt. */}
                    {deleting && editing && (
                        <div role="alert" style={{
                            padding: '10px 12px', borderRadius: 8,
                            background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)',
                            color: 'var(--text)', fontSize: 12, lineHeight: 1.5,
                            display: 'flex', flexDirection: 'column', gap: 8,
                        }}>
                            {inzichtLaden ? (
                                <span style={{ color: 'var(--muted)' }}>Even kijken wat er in deze map zit…</span>
                            ) : inzichtFout ? (
                                <>
                                    <span>{inzichtFout}</span>
                                    <button
                                        type="button"
                                        onClick={() => laadInzicht(editing)}
                                        style={{ ...ghostBtnStyle, alignSelf: 'flex-start' }}
                                    ><RefreshCw size={12} /> Opnieuw proberen</button>
                                </>
                            ) : inzicht ? (
                                beschrijfVerwijderGevolgen({
                                    mapNaam: editing.name,
                                    submapNamen: inzicht.submappen.map(s => s.name),
                                    aantalComponenten: inzicht.componenten,
                                })
                            ) : null}
                        </div>
                    )}
                </div>

                <div className="kdrawer-foot" style={{ justifyContent: 'space-between' }}>
                    {editing ? (
                        deleting ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                {/* Pas verwijderen als we wéten wat eraan hangt — de
                                    tekst hierboven zegt het, deze knop wacht erop. */}
                                <button
                                    onClick={confirmDelete}
                                    disabled={pending || inzichtLaden || !inzicht}
                                    style={{
                                        ...primaryBtnStyle, background: '#ef4444', color: '#fff',
                                        opacity: pending || inzichtLaden || !inzicht ? 0.5 : 1,
                                        cursor: pending || inzichtLaden || !inzicht ? 'not-allowed' : 'pointer',
                                    }}
                                >{pending ? 'Verwijderen…' : 'Ja, verwijder deze map'}</button>
                                <button onClick={() => { setDeleting(false); setInzicht(null); setInzichtFout(null); }} style={ghostBtnStyle}>Nee</button>
                            </div>
                        ) : (
                            <button onClick={startVerwijderen} style={{ ...ghostBtnStyle, color: '#ef4444' }}>
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
