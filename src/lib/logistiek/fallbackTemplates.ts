/**
 * Statische fallback-templates voor /api/logistics-checklist bij hard-cap.
 *
 * Bij Pro 150%-cap (of ANTHROPIC_API_KEY ontbreekt) krijgt de tenant niet
 * "feature unavailable" maar een handgecodeerde generieke checklist op basis
 * van event-type + guests. Niet zo precies als de AI-versie, wel direct
 * bruikbaar.
 *
 * Selectiestrategie: kijk eerst of er een type-specifieke template is
 * (bruiloft / verjaardag / corporate / buurtfeest), anders 'default'.
 * Schaal materieel-aantallen lineair met guests.
 */

import type { LogisticsCheck } from '@/lib/ai/logisticsChecklist';

export type FallbackTemplateKey = 'default' | 'bruiloft' | 'verjaardag' | 'corporate' | 'buurtfeest';

interface FallbackInput {
    guests: number;
    eventType?: string | null;
    locationProfile?: string | null;
    hasMenu: boolean;
}

/** Map ruwe NL event-type strings naar canonieke template-key. */
function pickTemplate(eventType?: string | null): FallbackTemplateKey {
    if (!eventType) return 'default';
    const t = eventType.toLowerCase();
    if (t.includes('bruiloft') || t.includes('wedding')) return 'bruiloft';
    if (t.includes('verjaard') || t.includes('birthday')) return 'verjaardag';
    if (t.includes('zakelijk') || t.includes('corporate') || t.includes('bedrijf')) return 'corporate';
    if (t.includes('buurt') || t.includes('wijk')) return 'buurtfeest';
    return 'default';
}

/* Helpers — schaal qty met gasten + standaard buffer. */
function perGast(qty: number, guests: number, buffer = 1.2): number {
    return Math.max(1, Math.ceil(qty * guests * buffer));
}
function perBlock(qty: number, guests: number, blockSize: number): number {
    return Math.max(1, Math.ceil(qty * (guests / blockSize)));
}

/** Generieke baseline — gemeenschappelijk voor alle event-types. */
function baselineChecks(input: FallbackInput): LogisticsCheck[] {
    const { guests, hasMenu } = input;
    const out: LogisticsCheck[] = [
        // Materieel
        { category: 'materieel', label: 'Yoder smoker', qty: 1, unit: 'st', source_ref: 'standaard', deadline_offset_hours: -24, cite: { sum: 'Standaard BBQ-set', src: 'Hardware-katalogus', ref: 'standaard_event' } },
        { category: 'materieel', label: 'Kamado Joe', qty: 1, unit: 'st', source_ref: 'standaard', deadline_offset_hours: -24, cite: { sum: 'Standaard BBQ-set', src: 'Hardware-katalogus', ref: 'standaard_event' } },
        { category: 'materieel', label: 'Wegwerpbord (palm leaf)', qty: perGast(1, guests), unit: 'st', source_ref: 'gasten_calc', deadline_offset_hours: -24, cite: { sum: `${guests} gasten × 1.2 buffer`, src: 'Gasten × buffer', ref: 'gasten_calc' } },
        { category: 'materieel', label: 'Bestek-set bamboe', qty: perGast(1, guests), unit: 'st', source_ref: 'gasten_calc', deadline_offset_hours: -24, cite: { sum: `${guests} gasten × 1.2 buffer`, src: 'Gasten × buffer', ref: 'gasten_calc' } },
        { category: 'materieel', label: 'Servetten (zwart)', qty: perGast(2, guests), unit: 'st', source_ref: 'gasten_calc', deadline_offset_hours: -24, cite: { sum: `${guests} × 2.4 servetten`, src: 'Gasten × buffer', ref: 'gasten_calc' } },
        { category: 'materieel', label: 'Koelbox groot', qty: perBlock(1, guests, 20), unit: 'st', source_ref: 'standaard', deadline_offset_hours: -24, cite: { sum: '1 koelbox per ~20 gasten', src: 'Standaard', ref: 'standaard' } },
        { category: 'materieel', label: 'Houtskool (binchotan)', qty: 2, unit: 'zak', source_ref: 'standaard', deadline_offset_hours: -24, cite: { sum: 'Standaard sessie-voorraad', src: 'Standaard', ref: 'standaard' } },
        { category: 'materieel', label: 'BBQ-tangen + thermometer set', qty: 1, unit: 'set', source_ref: 'standaard', deadline_offset_hours: -24, cite: { sum: 'Standaard BBQ-pakket', src: 'Hardware-katalogus', ref: 'standaard_event' } },
        { category: 'materieel', label: 'EHBO-kit + brandblusser', qty: 1, unit: 'set', source_ref: 'standaard', deadline_offset_hours: -24, cite: { sum: 'Wettelijk verplicht bij open vuur', src: 'Veiligheid', ref: 'standaard_event' } },

        // Personeel
        { category: 'personeel', label: 'Pitmaster', qty: 1, unit: 'pers', source_ref: 'standaard', deadline_offset_hours: -72, cite: { sum: 'Standaard crew per event', src: 'Standaard', ref: 'standaard' } },
        { category: 'personeel', label: 'Runner/bediening', qty: Math.max(1, Math.ceil(guests / 25)), unit: 'pers', source_ref: 'gasten_calc', deadline_offset_hours: -72, cite: { sum: `${guests} gasten / 25 ratio`, src: 'Gasten × buffer', ref: 'gasten_calc' } },

        // Route
        { category: 'route', label: 'Route plannen + rij-tijd checken', source_ref: 'standaard', deadline_offset_hours: -48, cite: { sum: 'Vertrek-tijd vaststellen', src: 'Standaard', ref: 'standaard' } },
        { category: 'route', label: 'Laad-moment inplannen (T-1u vóór vertrek)', source_ref: 'standaard', deadline_offset_hours: -24, cite: { sum: '1u laden voor vertrek', src: 'Standaard', ref: 'standaard' } },
        { category: 'route', label: 'Parkeerplaats bevestigen op locatie', source_ref: 'standaard', deadline_offset_hours: -24, cite: { sum: 'Parking checken bij klant', src: 'Standaard', ref: 'standaard' } },

        // Locatie
        { category: 'locatie', label: 'Stroom-aansluiting check', source_ref: 'standaard', deadline_offset_hours: -48, cite: { sum: 'Standaard locatie-check', src: 'Locatie-profiel', ref: 'standaard' } },
        { category: 'locatie', label: 'Watervoorziening check', source_ref: 'standaard', deadline_offset_hours: -48, cite: { sum: 'Standaard locatie-check', src: 'Locatie-profiel', ref: 'standaard' } },
        { category: 'locatie', label: 'Weer-update + tent nodig?', source_ref: 'weer_api', deadline_offset_hours: -24, cite: { sum: 'Outdoor-events: weer-check', src: 'Weer-API', ref: 'weer_api' } },
        { category: 'locatie', label: 'Afvalcontainer regelen', source_ref: 'standaard', deadline_offset_hours: -48, cite: { sum: 'Standaard event-afhandeling', src: 'Standaard', ref: 'standaard' } },

        // Klant-contact
        { category: 'klant', label: 'T-1 belmoment plannen (bevestigingsbelletje)', source_ref: 'standaard', deadline_offset_hours: -24, cite: { sum: 'Standaard pre-event call', src: 'Standaard', ref: 'standaard' } },
        { category: 'klant', label: 'Tijdschema doorgestuurd', source_ref: 'klant_data', deadline_offset_hours: -48, cite: { sum: 'Klant moet weten wanneer wij komen', src: 'Klant-data', ref: 'klant_data' } },
        { category: 'klant', label: 'Allergieën bevestigd met klant', source_ref: 'klant_data', deadline_offset_hours: -72, cite: { sum: 'Allergie-info checken (niet AI-derived)', src: 'Klant-data', ref: 'klant_data' } },
    ];

    if (hasMenu) {
        out.push(
            { category: 'menu_prep', label: 'Vlees besteld bij leverancier', source_ref: 'gerecht', deadline_offset_hours: -120, cite: { sum: 'Op basis van menu-samenstelling', src: 'Berekend uit menu', ref: 'gerecht' } },
            { category: 'menu_prep', label: 'Bijgerechten ingrediënten in voorraad?', source_ref: 'gerecht', deadline_offset_hours: -72, cite: { sum: 'Voorraad-check op bijgerechten', src: 'Berekend uit menu', ref: 'gerecht' } },
            { category: 'menu_prep', label: 'Dry-rub & sauzen mise klaar', source_ref: 'gerecht', deadline_offset_hours: -24, cite: { sum: 'Standaard prep-stap voor BBQ-menu', src: 'Berekend uit menu', ref: 'gerecht' } },
            { category: 'menu_prep', label: 'Brioche buns / brood (op gasten × 1.2)', qty: perGast(1, guests), unit: 'st', source_ref: 'gasten_calc', deadline_offset_hours: -24, cite: { sum: `${guests} × 1.2 buffer`, src: 'Gasten × buffer', ref: 'gasten_calc' } },
        );
    }

    return out;
}

/** Per template-key extra checks bovenop baseline. */
function templateExtras(key: FallbackTemplateKey, input: FallbackInput): LogisticsCheck[] {
    const { guests } = input;
    switch (key) {
        case 'bruiloft':
            return [
                { category: 'materieel', label: 'Tafelkleed (zwart)', qty: Math.max(2, Math.ceil(guests / 12)), unit: 'st', source_ref: 'gasten_calc', deadline_offset_hours: -48, cite: { sum: '1 kleed per ~12 gasten', src: 'Bruiloft-template', ref: 'standaard' } },
                { category: 'materieel', label: 'Banner / branding', qty: 1, unit: 'st', source_ref: 'standaard', deadline_offset_hours: -48, cite: { sum: 'Branding-pakket bruiloft', src: 'Hardware-katalogus', ref: 'branding' } },
                { category: 'personeel', label: 'Extra runner — bruiloft-serviceniveau', qty: 1, unit: 'pers', source_ref: 'standaard', deadline_offset_hours: -72, cite: { sum: 'Hogere bedieningsdichtheid bij bruiloft', src: 'Standaard', ref: 'standaard' } },
                { category: 'klant', label: 'Bruidspaar-wensen doorgenomen', source_ref: 'klant_data', deadline_offset_hours: -120, cite: { sum: 'Speciale wensen voor bruiloft', src: 'Klant-data', ref: 'klant_data' } },
            ];
        case 'corporate':
            return [
                { category: 'materieel', label: 'Allergeen-info-bord (corporate verplicht)', qty: 1, unit: 'st', source_ref: 'standaard', deadline_offset_hours: -48, cite: { sum: 'Corporate audit-trail', src: 'Standaard', ref: 'standaard' } },
                { category: 'klant', label: 'Factuur-adres + PO-nummer bevestigd', source_ref: 'klant_data', deadline_offset_hours: -120, cite: { sum: 'B2B-factuurvereisten', src: 'Klant-data', ref: 'klant_data' } },
                { category: 'route', label: 'Toegang corporate-locatie geregeld', source_ref: 'klant_data', deadline_offset_hours: -48, cite: { sum: 'Vaak badge of poort', src: 'Klant-data', ref: 'klant_data' } },
            ];
        case 'verjaardag':
            return [
                { category: 'materieel', label: 'Decoratie-pakket verjaardag', qty: 1, unit: 'set', source_ref: 'standaard', deadline_offset_hours: -48, cite: { sum: 'Standaard verjaardag-decor', src: 'Standaard', ref: 'standaard' } },
                { category: 'klant', label: 'Gasten-lijst + dieet-wensen ontvangen', source_ref: 'klant_data', deadline_offset_hours: -72, cite: { sum: 'Per-persoon allergie-info', src: 'Klant-data', ref: 'klant_data' } },
            ];
        case 'buurtfeest':
            return [
                { category: 'materieel', label: 'Extra koelboxen (outdoor lange dag)', qty: Math.max(1, Math.ceil(guests / 15)), unit: 'st', source_ref: 'gasten_calc', deadline_offset_hours: -24, cite: { sum: 'Outdoor + lange duur', src: 'Locatie-profiel', ref: 'standaard' } },
                { category: 'locatie', label: 'Vergunning gemeente checken', source_ref: 'standaard', deadline_offset_hours: -168, cite: { sum: 'Buurtfeest-evenementenvergunning', src: 'Standaard', ref: 'standaard' } },
            ];
        case 'default':
        default:
            return [];
    }
}

export function buildFallbackChecklist(input: FallbackInput): {
    template: FallbackTemplateKey;
    checks: LogisticsCheck[];
} {
    const template = pickTemplate(input.eventType);
    const base = baselineChecks(input);
    const extras = templateExtras(template, input);
    return {
        template,
        checks: [...base, ...extras],
    };
}
