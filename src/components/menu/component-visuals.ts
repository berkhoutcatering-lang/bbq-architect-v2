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
    vlees:   { soort: 'vlees',   label: 'Vlees',    gradient: 'linear-gradient(135deg, #7A2222 0%, #4A1010 100%)', accent: '#C0564A', icon: 'Beef' },
    vis:     { soort: 'vis',     label: 'Vis',      gradient: 'linear-gradient(135deg, #2C5A6B 0%, #17323D 100%)', accent: '#5FA3BC', icon: 'Fish' },
    groente: { soort: 'groente', label: 'Groente',  gradient: 'linear-gradient(135deg, #4F6B2A 0%, #2E3F17 100%)', accent: '#8FB05A', icon: 'Leaf' },
    zuivel:  { soort: 'zuivel',  label: 'Zuivel',   gradient: 'linear-gradient(135deg, #B8A06A 0%, #8A7440 100%)', accent: '#D8C48C', icon: 'Milk' },
    saus:    { soort: 'saus',    label: 'Saus',     gradient: 'linear-gradient(135deg, #A8631F 0%, #6E3F0E 100%)', accent: '#D89B4E', icon: 'Droplet' },
    brood:   { soort: 'brood',   label: 'Brood',    gradient: 'linear-gradient(135deg, #9A7433 0%, #6B4E1C 100%)', accent: '#CFA96B', icon: 'Wheat' },
    zoet:    { soort: 'zoet',    label: 'Zoet',     gradient: 'linear-gradient(135deg, #8C4A63 0%, #572A3B 100%)', accent: '#C98BA4', icon: 'Candy' },
    nonfood: { soort: 'nonfood', label: 'Non-food', gradient: 'linear-gradient(135deg, #4A5560 0%, #2B333A 100%)', accent: '#8C99A6', icon: 'Package' },
    overig:  { soort: 'overig',  label: 'Overig',   gradient: 'linear-gradient(135deg, #3A3540 0%, #23212A 100%)', accent: '#8B8496', icon: 'Boxes' },
};

/* Trefwoorden per soort. Volgorde telt: specifieker eerst (spek → vlees vóór
   'spekkoek' → zoet zou matchen). Alleen Nederlands + de merknamen die Sam
   in zijn catalogus gebruikt. */
const SOORT_RULES: Array<{ soort: ComponentSoort; rx: RegExp }> = [
    /* Materieel eerst — een "vacuümzak vlees" is geen vlees. */
    { soort: 'nonfood', rx: /folie|vacu.?mzak|zak\b|snijplank|braadpan|servet|beker|handschoen|krat|disposable|tape|bakje|prikker|schaal|bestek|doos\b/i },
    /* Kruiden/rub/saus vóór vlees: "dry rub kip" en "BBQ dryrub mix kip" zijn
       kruidenmengsels, geen vlees — anders wint het woord 'kip'. */
    { soort: 'saus',    rx: /\brubs?\b|dry.?rub|marinade|kruidenmix|saus|dressing|\bolie\b|azijn|ketchup|mosterd|siroop|glaze|\bjus\b|bouillon|fond\b|pesto|aioli|sriracha|soja|honing|specerij|peper\b|zout\b/i },
    { soort: 'vis',     rx: /zalm|salmon|tonijn|tuna|garna|shrimp|\bvis\b|kabeljauw|forel|makreel|haring|oester|mossel|krab|scampi|inktvis/i },
    { soort: 'vlees',   rx: /bavette|brisket|spare?ribs?|\brib\b|rund|beef|varken|pork|\bkip\b|kippen|chicken|eend|duck|\blam\b|worst|spek|\bham\b|pulled|picanha|entrec|coppa|chorizo|bacon|gehakt|schnitzel|filet|angus|wagyu|short.?rib|procureur|buikspek/i },
    { soort: 'zuivel',  rx: /kaas|cheese|\broom\b|slagroom|boter|butter|melk|milk|yoghurt|mayo|mascarpone|cr.?me|parmez|mozzarella|feta|burrata|\bei\b|eieren/i },
    { soort: 'brood',   rx: /brood|bread|\bbun\b|pinsa|cracker|taco|tortilla|wrap|toast|bagel|focaccia|bruschetta|deeg|meel|panko|paneer|rijstwafel|rice cracker/i },
    { soort: 'zoet',    rx: /chocola|chocolate|suiker|sugar|caramel|karamel|dessert|\bijs\b|sorbet|brownie|koek|vanille|aardbei|framboos|bonbon|pectine/i },
    { soort: 'groente', rx: /\bui\b|uien|onion|paprika|komkommer|cucumber|\bsla\b|tomaat|tomato|aardappel|potato|wortel|prei|knoflook|garlic|champignon|mushroom|courgette|bloemkool|broccoli|spinazie|rucola|avocado|limoen|lime|citroen|lemon|kruid|peterselie|bieslook|koriander|\bmais\b|\bma.?s\b|biet|radijs|augurk|\bkool\b/i },
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
