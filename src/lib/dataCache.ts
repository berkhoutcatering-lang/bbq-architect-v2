/* ── Geheugen tussen pagina's ───────────────────────────────────────────
   Zonder dit begon elke pagina weer bij nul: terug naar een hub waar je net
   was, betekende alles opnieuw ophalen achter een laadicoon (meting
   2026-10-20). useSupabase bewaart hier per tabel+bedrijf+kolommen de laatste
   rijen, useSettings de instellingen-rij per bedrijf. Een nieuwe pagina toont
   die meteen en ververst op de achtergrond ("stale-while-revalidate").
   Het geheugen wordt alleen getóónd, nooit vertrouwd: bij openen wordt er
   altijd ververst, zodat iets wat net elders is opgeslagen er ook staat.
   VERS_MS geldt alleen voor fetchSettingsShared (eenmalige leesacties zoals
   het logo).

   Leeft alleen in het geheugen van dit tabblad; uitloggen wist het
   (AuthContext). Los bestand zodat AuthContext het kan wissen zonder
   useSupabase → OrgContext → AuthContext in een kring te importeren. */
import type { Settings } from '@/types';

export const VERS_MS = 10_000;

export const tableCache = new Map<string, { rows: unknown[]; at: number }>();

export const settingsCache = new Map<string, { value: Settings | null; at: number }>();

export function cacheKey(table: string, orgId: string, columns: string): string {
    return 'tbl:' + table + ':' + orgId + ':' + columns;
}

/** Wist het geheugen (bij uitloggen). */
export function clearDataCache(): void {
    tableCache.clear();
    settingsCache.clear();
}
