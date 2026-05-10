/* /inspiratie/gerechten — PR1 port van /gerechten (zelfde content, nieuwe route).
   In PR3 wordt deze pagina geherbouwd op de components-laag (zie plan v5 PR3).
   Voor nu re-exporteren we de bestaande Gerechten-page zodat sidebar werkt zonder
   gebruikers-disruptie. /gerechten URL blijft ook werken (geen redirect — staat al
   live en wordt door bookmarks/links gebruikt). */
export { default } from '../../gerechten/page';
