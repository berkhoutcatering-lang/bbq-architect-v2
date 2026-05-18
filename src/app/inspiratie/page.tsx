import { redirect } from 'next/navigation';

/* /inspiratie is gedeprecateerd: alles leeft nu onder /gerechten met tabs.
   Slice 1 (2026-05-16): 301-redirect zodat oude bookmarks en interne links blijven werken. */
export default function InspiratieRedirect() {
    redirect('/gerechten');
}
