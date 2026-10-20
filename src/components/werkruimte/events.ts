/* Losse window-events, zodat de knoppen (balk, onderbalk) het tegelscherm en
   het zoekvenster kunnen openen zonder dat die al geladen zijn — ze worden
   pas na de pagina binnengehaald (meting 2026-10-20). Zelfde patroon als het
   bestaande `open-command-palette`. */
export const OPEN_TEGELSCHERM = 'open-tegelscherm';

export function openTegelscherm(): void {
    window.dispatchEvent(new Event(OPEN_TEGELSCHERM));
}

export function openZoekvenster(): void {
    window.dispatchEvent(new Event('open-command-palette'));
}
