import { redirect } from 'next/navigation';

/* /recepten is samengevoegd met /gerechten op 2026-05-01.
   Receptuur (bereidingswijze, porties, wijn-suggestie, Kitchen Mode) leeft
   nu in de gerecht-modal op /gerechten. Bestaande deeplinks redirecten zodat
   externe verwijzingen (oude bookmarks, magic-links) niet breken.

   Optionele data-migratie staat in supabase/migrations/014b_recepten_data_migration.sql
   — draai die in Supabase Studio wanneer je de oude recepten-rijen wil
   importeren als gerechten. */
export default function ReceptenRedirectPage(): never {
    redirect('/gerechten');
}
