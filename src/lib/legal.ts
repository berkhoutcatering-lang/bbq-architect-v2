/**
 * De aanbieder-gegevens en de reviewstatus van de juridische pagina's.
 *
 * /legal/privacy, /legal/voorwaarden en /legal/dpa zijn publiek bereikbaar:
 * er is geen ingelogde gebruiker en dus geen organisatie om gegevens uit te
 * halen. Dit gaat ook niet over een klant van de app maar over de aanbieder
 * ervan, en die is voor iedereen dezelfde. Vandaar omgevingsvariabelen.
 *
 * Ze stonden alleen niet gezet, en de terugval was een streepje: "Berkhout
 * Catering, KvK —, —". In een privacy-statement leest dat als "wij hebben
 * geen KvK-nummer" in plaats van "dit moet nog ingevuld worden".
 */

const KVK = (process.env.NEXT_PUBLIC_KVK_NUMBER || '').trim();
const ADRES = (process.env.NEXT_PUBLIC_COMPANY_ADDRESS || '').trim();
const NAAM = (process.env.NEXT_PUBLIC_COMPANY_NAME || '').trim();

export const aanbieder = {
  naam: NAAM || 'Berkhout Catering',
  /** Leeg als niet gezet — de pagina's laten de zin dan weg in plaats van een streepje te tonen. */
  kvk: KVK,
  adres: ADRES,
  compleet: !!(KVK && ADRES),
};

/**
 * Staat op `false` zolang NEXT_PUBLIC_LEGAL_REVIEWED niet op '1' staat, en
 * dan tonen de drie pagina's hun concept-melding.
 *
 * Die melding stond hardgecodeerd in alle drie de bestanden. Zij hoort weg te
 * gaan op het moment dat een jurist de teksten heeft gezien — niet op het
 * moment dat iemand toevallig in de code zit. Eén variabele omzetten haalt
 * hem overal tegelijk weg.
 */
export const juridischGereviewd = process.env.NEXT_PUBLIC_LEGAL_REVIEWED === '1';
