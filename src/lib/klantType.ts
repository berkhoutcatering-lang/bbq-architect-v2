/**
 * Het klanttype (Particulier, Zakelijk, Festival, Horeca) van een event.
 *
 * Twee plekken maakten een event uit een offerte en zetten daar hard
 * `type: 'Zakelijk'` op — ongeacht wie de klant was. Daardoor stond elke
 * verjaardag en bruiloft als zakelijk in de agenda, waren de filters
 * Particulier/Festival/Horeca altijd leeg en zei de omzet-mix op het
 * dashboard niets. Het type stáát al op de klantkaart; hier halen we het
 * daar vandaan.
 *
 * Geen klantkaart gevonden? Dan Particulier, wat de rest van de app ook als
 * standaard neemt (klantformulier, event-wizard, e-mail-intake).
 */

export const KLANT_TYPE_STANDAARD = 'Particulier';

/* Bewust smal getypeerd: de volledige Supabase-generics laten tsc hier
   vastlopen ("excessively deep"), en beide aanroepers (browser-client en
   service-role) passen erin. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KlantenLezer = { from: (table: 'klanten') => any };

export async function klantTypeVoor(
  sb: KlantenLezer,
  organizationId: string,
  klantNaam: string | null | undefined,
): Promise<string> {
  const naam = (klantNaam || '').trim();
  if (!naam) return KLANT_TYPE_STANDAARD;
  try {
    const { data } = await sb
      .from('klanten')
      .select('type')
      .eq('organization_id', organizationId)
      .ilike('naam', naam)
      .limit(1);
    const type = data?.[0]?.type?.trim();
    return type || KLANT_TYPE_STANDAARD;
  } catch {
    return KLANT_TYPE_STANDAARD;
  }
}
