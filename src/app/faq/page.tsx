import { redirect } from 'next/navigation';

/* /faq is gemerged in /hulp — was een hardcoded accordion met outdated jargon
   ("De Zaak", "Pitmaster Studio"). /hulp is de canonical help-center met
   DB-driven articles, ticket-systeem en search. Hub 7 cleanup: één help-route.

   Backward-compat: redirect zodat oude bookmarks blijven werken. */
export default function FaqRedirect(): never {
    redirect('/hulp');
}
