'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

export interface ComponentFolderRow {
    id: string;
    organization_id: string;
    parent_id: string | null;
    name: string;
    icon: string;
    color: string | null;
    sort_order: number;
}

/* Eén zin, in mensentaal, met de geruststelling erin: een hik in de verbinding
   is geen verdwenen indeling. */
export const FOLDER_LAADFOUT_TEKST =
    'Mappen konden niet geladen worden. Je indeling is niet weg — probeer het zo nog eens.';

/* ── Laadfout-signaal ──────────────────────────────────────────────────────
   Een mislukte laadbeurt mag nooit als "je hebt nog geen mappen" op het scherm
   eindigen: dan concludeert de gebruiker dat zijn indeling weg is en maakt hij
   alles opnieuw aan. De fout wordt hier gepubliceerd zodat de mappen-kolom hem
   direct kan tonen met een knop "Opnieuw proberen", zonder dat elke pagina de
   fout eerst zelf moet doorgeven. */
type FolderLaadFout = { message: string; retry: () => void } | null;

let laadFout: FolderLaadFout = null;
const luisteraars = new Set<() => void>();

function publiceerLaadFout(volgende: FolderLaadFout) {
    if (laadFout === null && volgende === null) return;
    laadFout = volgende;
    luisteraars.forEach(function (l) { l(); });
}

function abonneerLaadFout(l: () => void) {
    luisteraars.add(l);
    return function () { luisteraars.delete(l); };
}

function leesLaadFout(): FolderLaadFout { return laadFout; }

/** Laatste laadfout van de mappen, of null. Voor de mappen-kolom. */
export function useComponentFoldersError(): FolderLaadFout {
    return useSyncExternalStore(abonneerLaadFout, leesLaadFout, function () { return null; });
}

/* Lichtgewicht hook: laadt component_folders + realtime sub.
   Gracefully degraderen: als tabel niet bestaat (migration nog niet gedraaid)
   → available=false, lege rows. Page rendert dan zonder folder-rij. */
export function useComponentFolders(): {
    rows: ComponentFolderRow[];
    loading: boolean;
    available: boolean;
    /** Mensentaal-melding als het laden misging, anders null. */
    error: string | null;
    refetch: () => Promise<void>;
} {
    const [rows, setRows] = useState<ComponentFolderRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [available, setAvailable] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /* De "opnieuw proberen"-knop moet dezelfde ophaal-functie aanroepen; via een
       ref, zodat refetch niet naar zichzelf hoeft te verwijzen. */
    const refetchRef = useRef<() => Promise<void>>(async function () {});

    const refetch = useCallback(async function () {
        function meldFout(reden: string) {
            console.warn('[componenten] kon folders niet laden:', reden);
            /* rows bewust NIET leegmaken: de mappen die we al hadden kloppen nog
               steeds, en ze van het scherm halen leest als "je indeling is weg". */
            setError(FOLDER_LAADFOUT_TEKST);
            publiceerLaadFout({
                message: FOLDER_LAADFOUT_TEKST,
                retry: function () { void refetchRef.current(); },
            });
            setLoading(false);
        }

        if (!supabase) {
            meldFout('geen verbinding met de database');
            return;
        }

        const { data, error: laadfout } = await supabase
            .from('component_folders')
            .select('id, organization_id, parent_id, name, icon, color, sort_order')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });
        if (laadfout) {
            if (laadfout.code === '42P01') {
                /* Tabel bestaat niet = functie staat uit, geen storing. */
                setAvailable(false);
                setRows([]);
                setError(null);
                publiceerLaadFout(null);
                setLoading(false);
            } else {
                meldFout(laadfout.message);
            }
        } else {
            setRows((data ?? []) as ComponentFolderRow[]);
            setAvailable(true);
            setError(null);
            publiceerLaadFout(null);
            setLoading(false);
        }
    }, []);

    useEffect(function () { refetchRef.current = refetch; }, [refetch]);

    useEffect(function () {
        refetch();
        const ch = supabase
            ? supabase
                .channel('component_folders_changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'component_folders' }, function () {
                    refetch();
                })
                .subscribe()
            : null;
        return function () {
            if (ch && supabase) supabase.removeChannel(ch);
            /* Melding hoort bij dit scherm; laat 'm niet blijven hangen. */
            publiceerLaadFout(null);
        };
    }, [refetch]);

    return { rows, loading, available, error, refetch };
}
