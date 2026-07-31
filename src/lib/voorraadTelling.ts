/**
 * voorraadTelling — het rekenwerk achter de keuken-telling.
 *
 * Twee vragen, één bron van waarheid, zodat het scherm en de server nooit uit
 * elkaar lopen:
 *
 *   1. Hoeveel heb ik?      → telTotaal(): 4 pakken × 1 kg = 4 kg
 *   2. Wat is dat waard?    → prijsPerEenheid(): wat kost één kg bij deze
 *                             leverancier-treffer?
 *
 * Harde regel: prijs wordt afgeleid of hij wordt niet gezet. Een catalogus-
 * treffer waarvan we de inhoud niet kennen levert `null` op — dan blijft het
 * prijsveld leeg en zegt het scherm dat eerlijk. Een stil ingevulde €0 maakt de
 * voorraadwaarde en elke marge die erop leunt onzichtbaar verkeerd.
 */

import { convertQty, unitFamily } from './unitPrice';

/* ─── Zones = de looproute door de keuken ──────────────────────────────
   Bewust drie, in de volgorde waarin je loopt. De waarden komen overeen met
   de check-constraint op inventory.storage_type. */
export type Zone = 'vries' | 'vers' | 'houdbaar';

export const ZONES: Array<{ key: Zone; label: string; uitleg: string }> = [
    { key: 'vries', label: 'Vriezer', uitleg: 'Diepvries — begin hier, dan staat de deur het kortst open' },
    { key: 'vers', label: 'Koeling', uitleg: 'Koelkast en koelcel — vlees, zuivel, verse groente' },
    { key: 'houdbaar', label: 'Droog', uitleg: 'Stelling en voorraadkast — rijst, suiker, kruiden, blik' },
];

export function zoneLabel(z: string | null | undefined): string {
    return ZONES.find((x) => x.key === z)?.label ?? 'Nog geen plek';
}

/* ─── 1. Hoeveel heb ik? ───────────────────────────────────────────────
   "Vier pakken suiker van een kilo" = 4 × 1 kg = 4 kg. De uitkomst staat in
   `eenheid`; dat is meteen de eenheid waarin het item in de voorraad leeft. */
export function telTotaal(aantalPakken: number, inhoudPerPak: number): number {
    const a = Number(aantalPakken);
    const i = Number(inhoudPerPak);
    if (!Number.isFinite(a) || !Number.isFinite(i) || a < 0 || i <= 0) return 0;
    /* Afronden op 3 decimalen: 3 × 0,333 kg mag geen 0,9990000000000001 worden. */
    return Math.round(a * i * 1000) / 1000;
}

/** "4 × 1 kg = 4 kg" — de zin die onder de rekenhulp staat, zodat de telling
 *  navertelbaar is en niemand hoeft te raden wat de app deed. */
export function telSom(aantalPakken: number, inhoudPerPak: number, eenheid: string): string | null {
    const totaal = telTotaal(aantalPakken, inhoudPerPak);
    if (totaal <= 0) return null;
    const n = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',');
    return `${n(aantalPakken)} × ${n(inhoudPerPak)} ${eenheid} = ${n(totaal)} ${eenheid}`;
}

/* ─── 2. Wat kost één eenheid? ─────────────────────────────────────────── */

/** De prijsvelden van een /api/catalog/search-treffer die we mogen vertrouwen. */
export interface CatalogusPrijsBron {
    source?: 'price_list' | 'supplier_product';
    prijs?: number | null;
    eenheid?: string | null;
    prijs_per_kg?: number | null;
    prijs_per_stuk?: number | null;
    base_cost_cents?: number | null;
    base_quantity?: number | null;
    base_unit?: string | null;
    pack_total_quantity?: number | null;
    pack_total_unit?: string | null;
    pack_count?: number | null;
}

export interface PrijsAfleiding {
    /** Prijs voor één `doelEenheid`, in euro. */
    euro: number;
    /** Waar het vandaan komt — het scherm toont dit, zodat het narekenbaar is. */
    bron: string;
}

/**
 * Wat kost één `doelEenheid` (kg / stuks / liter …) volgens deze catalogus-
 * treffer? `null` = niet af te leiden; de aanroeper moet dat tonen en het
 * prijsveld leeg laten.
 *
 * Volgorde is niet willekeurig: we pakken het veld dat het minst hoeft te
 * interpreteren. De genormaliseerde velden (base_cost_cents, prijs_per_kg,
 * prijs_per_stuk) zijn bij de import al uitgerekend; de kale pakprijs is een
 * laatste redmiddel en alleen bruikbaar als we de eenheid ervan herkennen.
 */
export function prijsPerEenheid(
    hit: CatalogusPrijsBron,
    doelEenheid: string,
): PrijsAfleiding | null {
    if (!doelEenheid || unitFamily(doelEenheid) === null) return null;

    /* Bewust in euro's en niet via costForBasisCents: die rondt af op hele
       centen, en dat is precies de fout die je op een kleine eenheid maakt.
       €29,50 per kilo is €0,0295 per gram — afgerond op centen wordt dat €0,03,
       oftewel 1,7% te duur op élke gram die je telt. Op een voorraadwaarde en
       de marges die daarop leunen is dat geen afrondingsruis meer. */
    const perEenheid = (srcEuro: number, srcQuantity: number, srcUnit: string, bron: string): PrijsAfleiding | null => {
        if (!Number.isFinite(srcEuro) || srcEuro <= 0) return null;
        if (!Number.isFinite(srcQuantity) || srcQuantity <= 0) return null;
        /* Hoeveel van de leverancier-eenheid zit er in één van jouw eenheden? */
        const eenDoelInSrc = convertQty(1, doelEenheid, srcUnit);
        if (eenDoelInSrc === null) return null;
        const euro = (srcEuro / srcQuantity) * eenDoelInSrc;
        if (!Number.isFinite(euro) || euro < 0) return null;
        /* Zes decimalen: genoeg voor een prijs per gram, en het snoeit de
           binaire ruis weg (0.029500000000000002). */
        return { euro: Math.round(euro * 1e6) / 1e6, bron };
    };

    /* a) Gescande bestel-catalogus: de import heeft de pakinhoud al naar een
          basis genormaliseerd (bv. 329 cent per 100 g). */
    if (
        hit.base_cost_cents != null && hit.base_cost_cents > 0 &&
        hit.base_quantity != null && hit.base_quantity > 0 &&
        hit.base_unit
    ) {
        const r = perEenheid(hit.base_cost_cents / 100, hit.base_quantity, hit.base_unit, 'leverancier-catalogus');
        if (r) return r;
    }

    /* b) Prijslijst-import: per kilo of per stuk al uitgerekend. */
    if (hit.prijs_per_kg != null && hit.prijs_per_kg > 0) {
        const r = perEenheid(hit.prijs_per_kg, 1, 'kg', 'prijslijst (per kg)');
        if (r) return r;
    }
    if (hit.prijs_per_stuk != null && hit.prijs_per_stuk > 0) {
        const r = perEenheid(hit.prijs_per_stuk, 1, 'stuk', 'prijslijst (per stuk)');
        if (r) return r;
    }

    /* Bewust GÉÉN derde regel op (prijs + eenheid). Dat veldenpaar ziet eruit
       als een eenheidsprijs, maar is het niet:
         - "Suikerwafel 90gram" komt binnen als prijs 13,50 / eenheid 'g'. Die
           'g' is uit de productnaam gevist; 13,50 is de pakprijs. Eén regel
           erop zou € 13,50 per gram opleveren.
         - "Suikerklontjes, doosje 1,06 kg" heeft prijs 1,06 — dat is de
           pakinhoud die in het prijsveld beland is, geen bedrag.
       Zonder genormaliseerd veld weten we het simpelweg niet. Dan blijft de
       prijs leeg en zegt het scherm dat, in plaats van een getal te tonen dat
       zich later als voorraadwaarde en marge voordoet. */
    return null;
}

/**
 * Wat stellen we voor als pakinhoud? "Bak 1 kg" → 1 + 'kg'. Alleen als de
 * leverancier de inhoud écht meelevert; anders `null` en typt de gebruiker
 * zelf wat er op de verpakking staat.
 */
export function pakVoorstel(hit: CatalogusPrijsBron): { inhoud: number; eenheid: string } | null {
    if (hit.pack_total_quantity != null && hit.pack_total_quantity > 0 && hit.pack_total_unit) {
        const eenheid = String(hit.pack_total_unit).toLowerCase();
        if (unitFamily(eenheid) === null) return null;
        /* Gram/milliliter tonen we liever als kilo/liter zodra het een ronde,
           grotere hoeveelheid is — "1 kg" leest nu eenmaal beter dan "1000 g". */
        if ((eenheid === 'g' || eenheid === 'ml') && hit.pack_total_quantity >= 1000) {
            const groot = eenheid === 'g' ? 'kg' : 'liter';
            const om = convertQty(hit.pack_total_quantity, eenheid, groot);
            if (om !== null) return { inhoud: Math.round(om * 1000) / 1000, eenheid: groot };
        }
        return { inhoud: hit.pack_total_quantity, eenheid };
    }
    return null;
}

/**
 * In welke eenheid houd je dit product bij? Volgt de pakinhoud als die bekend
 * is, anders de eenheid van de prijslijst, anders 'stuks'.
 */
export function eenheidVoorstel(hit: CatalogusPrijsBron): string {
    const pak = pakVoorstel(hit);
    if (pak) return pak.eenheid;
    if (hit.base_unit && unitFamily(hit.base_unit) !== null) {
        return hit.base_unit === 'g' ? 'kg' : hit.base_unit === 'ml' ? 'liter' : hit.base_unit;
    }
    if (hit.eenheid && unitFamily(hit.eenheid) !== null) return hit.eenheid;
    return 'stuks';
}
