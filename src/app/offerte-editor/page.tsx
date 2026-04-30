import { redirect } from 'next/navigation';

/**
 * /offerte-editor is uitgefaseerd. Alle offertes lopen nu via de
 * wizard op /offertes (zie commit "UX ronde 3" en Sam's keuze
 * 2026-04-30: "Nee, gebruik altijd de wizard op /offertes").
 *
 * Deze redirect blijft bestaan voor oude bookmarks. Als geen enkele
 * call-site meer naar /offerte-editor verwijst, kan de hele route
 * weg.
 */
export default function OfferteEditorRedirect() {
  redirect('/offertes');
}
