/* Visuele identiteit voor COMPONENTEN.
 *
 * Gerechten krijgen hun kleur uit GANG_VISUALS (helpers.ts) — componenten hadden
 * niets, waardoor 30 kaarten er identiek grijs uitzagen en de pagina als een
 * spreadsheet las. Hier leiden we soort + kleur + icoon af uit de naam (en het
 * food/non-food-veld), zodat je in één oogopslag vlees van saus onderscheidt.
 *
 * Puur cosmetisch: raakt geen kostprijs, geen data. Alleen herkenning.
 */

export type ComponentSoort =
    | 'vlees' | 'vis' | 'groente' | 'zuivel' | 'saus' | 'brood' | 'zoet' | 'nonfood' | 'overig';

export interface ComponentVisual {
    soort: ComponentSoort;
    label: string;
    /** Achtergrond van de icoon-tegel. */
    gradient: string;
    /** Accentkleur voor randjes/tekst. */
    accent: string;
    /** lucide-react icoonnaam — resolve via COMPONENT_ICONS in de UI. */
    icon: string;
}

export const COMPONENT_VISUALS: Record<ComponentSoort, ComponentVisual> = {
    /* Palet afgestemd op GANG_VISUALS (helpers.ts): dezelfde warmte en
       verzadiging als de gerechten-kaarten. Een eerdere, donkerdere versie liet
       de pagina dof en grijs ogen ("Windows XP") — vooral non-food trok alles
       naar beneden. Referentie: gerechten-bite is #B55720, niet #7A2222. */
    vlees:   { soort: 'vlees',   label: 'Vlees',    gradient: 'linear-gradient(135deg, #A83A2A 0%, #6B1C14 100%)', accent: '#D9705F', icon: 'Beef' },
    vis:     { soort: 'vis',     label: 'Vis',      gradient: 'linear-gradient(135deg, #4A8296 0%, #26505F 100%)', accent: '#7FB8CC', icon: 'Fish' },
    groente: { soort: 'groente', label: 'Groente',  gradient: 'linear-gradient(135deg, #6E8F36 0%, #435A1E 100%)', accent: '#A3C167', icon: 'Leaf' },
    zuivel:  { soort: 'zuivel',  label: 'Zuivel',   gradient: 'linear-gradient(135deg, #D8C288 0%, #A98F52 100%)', accent: '#EBDCAE', icon: 'Milk' },
    saus:    { soort: 'saus',    label: 'Saus',     gradient: 'linear-gradient(135deg, #C97A24 0%, #8A4E10 100%)', accent: '#E6A860', icon: 'Droplet' },
    brood:   { soort: 'brood',   label: 'Brood',    gradient: 'linear-gradient(135deg, #C0954A 0%, #86622A 100%)', accent: '#DCBB7E', icon: 'Wheat' },
    zoet:    { soort: 'zoet',    label: 'Zoet',     gradient: 'linear-gradient(135deg, #D2899C 0%, #96566B 100%)', accent: '#E8B3C1', icon: 'Candy' },
    nonfood: { soort: 'nonfood', label: 'Non-food', gradient: 'linear-gradient(135deg, #6E7A88 0%, #414954 100%)', accent: '#A6B2BF', icon: 'Package' },
    overig:  { soort: 'overig',  label: 'Overig',   gradient: 'linear-gradient(135deg, #6A5F70 0%, #403948 100%)', accent: '#A79BB0', icon: 'Boxes' },
};

/* Trefwoorden per soort. Volgorde telt: specifieker eerst (spek → vlees vóór
   'spekkoek' → zoet zou matchen). Alleen Nederlands + de merknamen die Sam
   in zijn catalogus gebruikt. */
const SOORT_RULES: Array<{ soort: ComponentSoort; rx: RegExp }> = [
    /* Materieel eerst — maar ALLEEN ondubbelzinnig materieel. Verpakkings-
       woorden (doos, zak, krat, bak, schaal) horen hier NIET: die staan in
       talloze eten-namen ("Brioche bun, doos 6x20", "Lángos Doos van 30 stuks")
       en maakten daar grijze non-food-kaarten van. Echt materieel is al
       gemarkeerd via category === 'non_food'. */
    { soort: 'nonfood', rx: /folie|vacu.?mzak|snijplank|braadpan|servet|handschoen|disposable|\btape\b|prikker|bestek|afvalzak|vuilniszak/i },
    /* Kruiden/rub/saus vóór vlees: "dry rub kip" en "BBQ dryrub mix kip" zijn
       kruidenmengsels, geen vlees — anders wint het woord 'kip'. */
    { soort: 'saus',    rx: /\brubs?\b|dry.?rub|marinade|kruidenmix|saus|dressing|\bolie\b|azijn|ketchup|mosterd|siroop|glaze|\bjus\b|bouillon|fond\b|pesto|aioli|mayo|sriracha|soja|honing|specerij|peper\b|zout\b/i },
    { soort: 'vis',     rx: /zalm|salmon|tonijn|tuna|garna|shrimp|\bvis\b|kabeljauw|forel|makreel|haring|oester|mossel|krab|scampi|inktvis/i },
    { soort: 'vlees',   rx: /ba[vb]ette|brisket|spare?ribs?|\brib\b|rund|beef|varken|pork|\bkip\b|kippen|chicken|eend|duck|\blam\b|worst|spek|\bham\b|pulled|picanha|entrec|coppa|chorizo|bacon|gehakt|schnitzel|filet|angus|wagyu|short.?rib|procureur|buikspek|\bdij\b|\bhaas\b|sucade|riblap|shoarma|gyros|kalkoen|\bkalfs/i },
    { soort: 'zuivel',  rx: /kaas|cheese|\broom\b|slagroom|boter|butter|melk|milk|yoghurt|mascarpone|cr.?me|parmez|mozzarella|feta|burrata|\bei\b|eieren/i },
    { soort: 'brood',   rx: /brood|bread|\bbun\b|pinsa|cracker|taco|tortilla|wrap|toast|bagel|focaccia|deeg|meel|panko|paneer|rijstwafel|rice cracker|l.ngos|gyoza|wonton|pita\b|naan\b|ciabatta|croissant/i },
    { soort: 'zoet',    rx: /chocola|chocolate|suiker|sugar|caramel|karamel|dessert|\bijs\b|sorbet|brownie|koek|vanille|aardbei|framboos|bonbon|pectine/i },
    { soort: 'groente', rx: /\bui\b|uien|onion|paprika|komkommer|cucumber|\bsla\b|tomaat|tomato|aardappel|potato|wortel|prei|knoflook|garlic|champignon|mushroom|courgette|bloemkool|broccoli|spinazie|rucola|avocado|limoen|lime|citroen|lemon|kruid|peterselie|bieslook|koriander|\bmais\b|\bma.?s\b|biet|radijs|augurk|\bkool\b|selderij|venkel|pompoen|aubergine|witlof|spruit|asperge|pastinaak|\bboon|bonen\b|\berwt/i },
];

/** Leidt de soort af uit de naam. `category === 'non_food'` wint altijd. */
export function componentSoort(name: string, category?: string | null): ComponentSoort {
    if (category === 'non_food') return 'nonfood';
    const n = String(name || '');
    for (const { soort, rx } of SOORT_RULES) if (rx.test(n)) return soort;
    return 'overig';
}

export function getComponentVisual(name: string, category?: string | null): ComponentVisual {
    return COMPONENT_VISUALS[componentSoort(name, category)];
}
