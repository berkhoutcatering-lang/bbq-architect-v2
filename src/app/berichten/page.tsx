import { redirect } from 'next/navigation';

/**
 * /berichten is uitgefaseerd — was een dunne intern-notes module
 * (afzender + onderwerp + bericht + gelezen-flag), terwijl /mailbox
 * een volwaardig e-mail systeem heeft met templates, klant-koppeling
 * en compose-flow. Audit 2026-04-30 sectie 9: mergen.
 *
 * Redirect blijft voor oude bookmarks. Supabase-tabel `berichten`
 * blijft bestaan — als die ooit gebruikt blijkt te zijn, kan de
 * data alsnog opgehaald worden.
 */
export default function BerichtenRedirect() {
  redirect('/mailbox');
}
