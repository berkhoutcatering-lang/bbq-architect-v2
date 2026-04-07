// PAGE_CHIPS — AI-suggestie chips per pagina
// Gebruikt door AiAssistant.tsx en EmptyState.tsx
export const PAGE_CHIPS: Record<string, string[]> = {
  '/': ['Wat moet ik vandaag regelen?', 'Maak een prep-lijst', 'Lage voorraad check', 'Omzet overzicht'],
  '/events': ['Voeg een nieuw event toe', 'Welke events komen eraan?', 'Maak een prep-lijst', 'Tip voor grote groepen'],
  '/agenda': ['Maak een prep-lijst', 'Open taken afvinken', 'Taak toevoegen voor event', 'Planning komende week'],
  '/recepten': ['Nieuw recept aanmaken', 'Bereken vlees voor 80 gasten', 'Dry rub recept voor brisket', 'Pulled pork bereidingstijd'],
  '/gerechten': ['20 gerechten met buikspek', 'Gerecht verwijderen', 'Vegetarische hapjes bedenken', 'Menubalans analyseren'],
  '/menu-engineering': ['Welke gerechten hebben beste marge?', 'Menu-analyse uitleggen', 'Stars vs Dogs in mijn menu', 'Gerecht verbeteren voor marge'],
  '/offertes': ['Nieuwe offerte aanmaken', 'Welke offertes verlopen binnenkort?', 'Marge analyse', 'Omzet overzicht per status'],
  '/facturen': ['Nieuwe factuur aanmaken', 'Welke facturen vervallen binnenkort?', 'Openstaand overzicht', 'Cashflow advies'],
  '/voorraad': ['Wat staat op laag voorraad?', 'Bijbestellen wat ik nodig heb', 'Nieuw voorraad item toevoegen', 'Par levels uitleggen'],
  '/inkoop': ['Inkooplijst aanmaken voor event', 'Leverancier toevoegen', 'Vleesinkoop calculeren voor 80p', 'Beste leverancier kiezen'],
  '/service': ['Open prep-taken voor dit event', 'Temperatuur registreren', 'Hoe lang warm houden?', 'Snel probleem oplossen'],
  '/haccp': ['Temperatuur registreren', 'Welke events missen HACCP?', 'Kerntemperaturen uitleggen', 'Gevaarlijke zone uitleg'],
  '/uren': ['Uren registreren voor vandaag', 'Weekoverzicht medewerkers', 'Overuren berekenen', 'Wettelijke limieten NL'],
  '/materieel': ['Welk materieel heeft onderhoud nodig?', 'Onderhoud registreren', 'Materieel toevoegen', 'Levensduur BBQ uitleggen'],
  '/logistiek': ['Wat is nog niet afgevinkt?', 'Bus inlaadvolgorde tips', 'Koelboxen checklist', 'Vergeten items check'],
  '/boekhouding': ['KPI overzicht', 'Verlopen facturen actie', 'BTW-aangifte tips', 'Food cost ratio berekenen'],
  '/financien': ['Beste maand analyse', 'Marge per maand vergelijken', 'Stille maanden aanpak', 'YoY groei berekenen'],
  '/price-intelligence': ['Leverancier vergelijken', 'Beste prijs-kwaliteit vlees', 'Inkoopprijs optimaliseren', 'Seizoensprijzen advies'],
  '/ai-chat': ['20 gerechten met buikspek', 'Thema-BBQ concepten', 'Zomermenu brainstorm', 'Onderscheidend vermogen tips'],
  '/klanten': ['Klant toevoegen', 'Welke klanten zijn terugkerend?', 'Top klanten overzicht', 'Klant contacteren'],
  '/klantgesprek': ['Wat moet ik vragen bij een intake?', 'Gemiddelde prijs per persoon', 'Hoeveel vlees per persoon?', 'Checklist klantbezoek'],
};

// EmptyState configuratie per pagina
export const EMPTY_STATE_CONFIG: Record<string, { icon: string; title: string; description: string; actionLabel: string }> = {
  '/events': {
    icon: 'fa-solid fa-calendar-plus',
    title: 'Nog geen events',
    description: 'Plan je eerste BBQ event en begin met het beheren van je catering-opdrachten.',
    actionLabel: 'Nieuw event plannen',
  },
  '/offertes': {
    icon: 'fa-solid fa-file-invoice',
    title: 'Nog geen offertes',
    description: 'Maak je eerste offerte aan voor een klant. Selecteer gerechten, stel prijzen in en verstuur.',
    actionLabel: 'Eerste offerte maken',
  },
  '/facturen': {
    icon: 'fa-solid fa-receipt',
    title: 'Nog geen facturen',
    description: 'Facturen worden automatisch aangemaakt wanneer je een offerte accepteert. Of maak er handmatig een aan.',
    actionLabel: 'Factuur aanmaken',
  },
  '/voorraad': {
    icon: 'fa-solid fa-boxes-stacked',
    title: 'Voorraad is leeg',
    description: 'Voeg je eerste ingrediënten toe of laat de AI ze genereren uit je recepten.',
    actionLabel: 'Ingrediënt toevoegen',
  },
  '/recepten': {
    icon: 'fa-solid fa-book-open',
    title: 'Nog geen recepten',
    description: 'Voeg je eerste BBQ-recept toe met ingrediënten, bereidingswijze en kostprijsberekening.',
    actionLabel: 'Recept toevoegen',
  },
  '/gerechten': {
    icon: 'fa-solid fa-utensils',
    title: 'Nog geen gerechten',
    description: 'Maak gerechten aan die je kunt aanbieden op je menu. Koppel ze aan recepten voor kostprijsberekening.',
    actionLabel: 'Gerecht toevoegen',
  },
  '/haccp': {
    icon: 'fa-solid fa-temperature-half',
    title: 'Geen HACCP-registraties',
    description: 'Log temperaturen voor voedselveiligheid. Verplicht voor elke professionele cateringoperatie.',
    actionLabel: 'Temperatuur registreren',
  },
  '/klanten': {
    icon: 'fa-solid fa-users',
    title: 'Nog geen klanten',
    description: 'Voeg je eerste klant toe. Klantgegevens worden hergebruikt bij offertes en events.',
    actionLabel: 'Klant toevoegen',
  },
  '/inkoop': {
    icon: 'fa-solid fa-truck',
    title: 'Nog geen inkoop-items',
    description: 'Beheer je leveranciers en inkooplijsten. Koppel ingrediënten aan leveranciers voor snelle bestellingen.',
    actionLabel: 'Leverancier toevoegen',
  },
  '/materieel': {
    icon: 'fa-solid fa-toolbox',
    title: 'Nog geen materieel',
    description: 'Registreer je BBQ\'s, koelboxen, tafels en ander materieel. Houd onderhoud en status bij.',
    actionLabel: 'Materieel toevoegen',
  },
  '/uren': {
    icon: 'fa-solid fa-clock',
    title: 'Nog geen urenregistraties',
    description: 'Registreer werktijden voor je team. Punch in/out voor events en krijg automatisch weekoverzichten.',
    actionLabel: 'Start registratie',
  },
  '/agenda': {
    icon: 'fa-solid fa-calendar',
    title: 'Geen items op deze dag',
    description: 'Plan events en taken via de agenda. Klik op een dag om details te zien of maak een nieuw event aan.',
    actionLabel: 'Nieuw event plannen',
  },
  '/logistiek': {
    icon: 'fa-solid fa-truck-ramp-box',
    title: 'Nog geen logistiek items',
    description: 'Stel je bus-indeling, checklists en inpaklisten samen voor komende events.',
    actionLabel: 'Item toevoegen',
  },
  '/service': {
    icon: 'fa-solid fa-bell-concierge',
    title: 'Geen events met menu',
    description: 'Service mode werkt met events die een menu hebben. Maak eerst een event aan met gerechten.',
    actionLabel: 'Naar events',
  },
  '/menu-engineering': {
    icon: 'fa-solid fa-chart-pie',
    title: 'Nog geen gerechten',
    description: 'Voeg gerechten toe om je menu te analyseren op marge, populariteit en winstgevendheid.',
    actionLabel: 'Gerecht toevoegen',
  },
  '/boekhouding': {
    icon: 'fa-solid fa-calculator',
    title: 'Geen data beschikbaar',
    description: 'Boekhouding wordt automatisch gevuld met gegevens uit je facturen en offertes.',
    actionLabel: 'Naar facturen',
  },
};

// Allergenen — EU-14 lijst + veelvoorkomende dieetwensen
export const ALLERGENEN = [
  { code: 'gluten', label: 'Gluten', icon: '🌾' },
  { code: 'lactose', label: 'Lactose', icon: '🥛' },
  { code: 'ei', label: 'Ei', icon: '🥚' },
  { code: 'vis', label: 'Vis', icon: '🐟' },
  { code: 'schaaldieren', label: 'Schaaldieren', icon: '🦐' },
  { code: 'noten', label: 'Noten', icon: '🥜' },
  { code: 'pinda', label: 'Pinda', icon: '🥜' },
  { code: 'soja', label: 'Soja', icon: '🫘' },
  { code: 'selderij', label: 'Selderij', icon: '🌿' },
  { code: 'mosterd', label: 'Mosterd', icon: '🟡' },
  { code: 'sesam', label: 'Sesam', icon: '⚪' },
  { code: 'sulfiet', label: 'Sulfiet', icon: '🍷' },
];

export const DIEETWENSEN = [
  { code: 'vega', label: 'Vegetarisch', icon: '🌿' },
  { code: 'vegan', label: 'Veganistisch', icon: '🌱' },
  { code: 'halal', label: 'Halal', icon: '☪️' },
  { code: 'koosjier', label: 'Koosjier', icon: '✡️' },
];
