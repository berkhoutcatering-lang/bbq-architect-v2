/**
 * Contract toonbank/v1, versie 1.1.0 — de kant van BBQ Architect (BA-7b).
 *
 * Bron: hopbites-toonbank/docs/datacontract-toonbank-v1.md (1.1.0-ontwerp)
 * en de zod-schema's in hopbites-toonbank/packages/kern/src/contract/ (branch
 * feat/tb-skelet). BBQ Architect heeft eigen schema's (dit bestand): de
 * Toonbank-repo is een aparte, privé repo zonder gedeeld pakket. Dat ze
 * hetzelfde zeggen, bewaakt contract.test.ts: elk voorbeeldbericht uit
 * contract/v1/voorbeelden (gekopieerd naar ./contract/voorbeelden, met
 * MANIFEST.sha256) parse't hier, zonder onbekende velden, en de hashes zijn
 * vastgepind. Verandert een voorbeeld aan één kant, dan faalt de andere kant.
 *
 * Elk antwoord van /api/toonbank/v1 wordt in de tests tegen deze schema's
 * gelegd; de routes zelf valideren de verzoeken van de tablet ermee.
 */
import { z } from 'zod';

/* ═══ Versie en headers (contract §3.1, §6) ═══════════════════════════════ */

/** De versie die BBQ Architect spreekt. */
export const CONTRACT_HUIDIG = '1.1.0';
/**
 * Een tablet met een lagere x-toonbank-contract krijgt 426 contract_verouderd. 1.1.0: de
 * Toonbank-app is vanaf het begin op 1.1.0 gebouwd (kern CONTRACT_VERSIE) en het voorbeeld
 * status.json zegt minimaal 1.1.0; een 1.0.0-app bestaat niet (review M2, klein 12).
 */
export const CONTRACT_MINIMAAL = '1.1.0';

export const HEADERS = {
    sleutel: 'x-toonbank-sleutel',
    contract: 'x-toonbank-contract',
    app: 'x-toonbank-app',
    medewerker: 'x-toonbank-medewerker',
} as const;

/** Contant betalen kan alleen onder € 3.000 (Wwft, sinds 1 januari 2026). */
export const CONTANT_GRENS_CENTS = 300_000;

/* ═══ Bouwstenen (contract §0) ════════════════════════════════════════════ */

export const Uuid = z.uuid();
export const Moment = z.iso.datetime({ offset: true });
export const Datum = z.iso.date();
export const Cents = z.int();
export const PositieveCents = z.int().nonnegative();
export const BtwPct = z.int().min(0).max(100);
export const OrderId = z.int().positive();
export const Ordernummer = z.string().min(1);
export const Bonnummer = z.string().regex(/^T\d+-\d{6,}$/, 'bonnummer zoals T1-000412');
export const ApparaatCode = z.string().regex(/^T\d+$/, 'apparaatcode zoals T1');
export const Versie = z.int().nonnegative();
export const Volgnummer = z.int().positive();
export const Aantal = z.int();
export const Hoeveelheid = z.number().positive();
export const Eenheid = z.enum(['stuk', 'gram']);
export const VoorraadGetal = z.number();

export const Onderdeel = z.object({
    product_id: Uuid,
    hoeveelheid: Hoeveelheid,
    eenheid: z.string().min(1),
});

export const Leeftijd = z.object({
    uitkomst: z.enum(['vastgesteld', 'geweigerd']),
    at: Moment,
});

export const Betaalmethode = z.enum(['pin', 'contant']);

/* ═══ Fouten (contract §3.2) ═════════════════════════════════════════════ */

export const FoutAntwoord = z.object({
    fout: z.object({
        code: z.string().min(1),
        melding: z.string(),
        details: z.record(z.string(), z.unknown()),
    }),
});
export type FoutAntwoord = z.infer<typeof FoutAntwoord>;

/** De HTTP-status bij elke foutcode. 401 is alleen voor de apparaatsleutel. */
export const FOUT_STATUS = {
    ongeldig_verzoek: 400,
    sleutel_onbekend: 401,
    sleutel_ingetrokken: 401,
    koppelcode_ongeldig: 403,
    inlogcode_onjuist: 403,
    medewerker_sessie_verlopen: 403,
    medewerker_geblokkeerd: 403,
    geen_recht: 403,
    eigenaarcode_onjuist: 403,
    niet_gevonden: 404,
    ean_bestaat: 409,
    niet_betaald: 409,
    te_groot: 413,
    regel_geweigerd: 422,
    te_weinig_voorraad: 422,
    al_opgehaald: 422,
    niet_zelfde_dag: 422,
    contract_verouderd: 426,
    te_snel: 429,
    serverfout: 500,
} as const;
export type FoutCode = keyof typeof FOUT_STATUS;

export const WV_CODES = {
    niet_betaald: 'WV006',
    te_weinig_voorraad: 'WV010',
    ongedaan_na_ophalen: 'WV011',
} as const;

export const FoutTeWeinigVoorraad = z.object({
    fout: z.object({
        code: z.literal('te_weinig_voorraad'),
        melding: z.string().min(1),
        details: z.object({
            wv_code: z.literal(WV_CODES.te_weinig_voorraad),
            order_id: OrderId,
            nummer: Ordernummer,
            tekorten: z.array(z.object({
                product_id: Uuid,
                naam: z.string().min(1),
                ligt_er: VoorraadGetal,
                nodig: VoorraadGetal.positive(),
            })).min(1),
        }),
    }),
});

export const FoutNietBetaald = z.object({
    fout: z.object({
        code: z.literal('niet_betaald'),
        melding: z.string().min(1),
        details: z.object({
            wv_code: z.literal(WV_CODES.niet_betaald),
            order_id: OrderId,
            nummer: Ordernummer,
            status: z.string().min(1),
        }),
    }),
});

export const FoutNietZelfdeDag = z.object({
    fout: z.object({
        code: z.literal('niet_zelfde_dag'),
        melding: z.string().min(1),
        details: z.object({
            order_id: OrderId,
            nummer: Ordernummer,
            apart_gezet_at: Moment,
        }),
    }),
});

export const FoutAlOpgehaald = z.object({
    fout: z.object({
        code: z.literal('al_opgehaald'),
        melding: z.string().min(1),
        details: z.object({
            wv_code: z.literal(WV_CODES.ongedaan_na_ophalen),
            order_id: OrderId,
            nummer: Ordernummer,
            opgehaald_at: Moment,
        }),
    }),
});

/* ═══ Koppelen, medewerkers, inloggen (contract §3.3) ════════════════════ */

export const KoppelVerzoek = z.object({
    koppelcode: z.string().regex(/^\d{6}$/, 'zes cijfers'),
    naam: z.string().min(1).optional(),
});

export const KoppelAntwoord = z.object({
    apparaat_id: Uuid,
    code: ApparaatCode,
    naam: z.string().min(1),
    sleutel: z.string().startsWith('tb_'),
});
export type KoppelAntwoord = z.infer<typeof KoppelAntwoord>;

export const MedewerkersAntwoord = z.object({
    medewerkers: z.array(z.object({
        medewerker_id: Uuid,
        naam: z.string().min(1),
        rol: z.enum(['medewerker', 'eigenaar']),
    })),
});
export type MedewerkersAntwoord = z.infer<typeof MedewerkersAntwoord>;

/**
 * POST inloggen. Het contract kent doel 'sessie' en 'vrij_overschrijden';
 * BBQ Architect neemt ook 'dienst' aan (zo heet het in toonbank_sessies).
 */
export const InlogVerzoek = z.object({
    medewerker_id: Uuid,
    inlogcode: z.string().regex(/^\d{4,6}$/, '4 tot 6 cijfers'),
    doel: z.enum(['sessie', 'dienst', 'vrij_overschrijden']),
});

export const InlogAntwoord = z.object({
    sessie: z.string().min(1),
    geldig_tot: Moment,
    medewerker_id: Uuid,
    naam: z.string().min(1),
    rechten: z.array(z.string().min(1)),
});

export const EigenaarcodeAntwoord = z.object({
    eigenaar_token: z.string().min(1),
    geldig_tot: Moment,
    medewerker_id: Uuid,
    goedkeuring_id: Uuid,
});

/* ═══ Status (contract §3.3) ═════════════════════════════════════════════ */

export const StatusAntwoord = z.object({
    servertijd: Moment,
    contract: z.object({ huidig: z.string().min(1), minimaal: z.string().min(1) }),
    apparaat: z.object({ apparaat_id: Uuid, code: ApparaatCode, naam: z.string().min(1) }),
    catalogus_versie: Versie,
    voorraad_versie: Versie,
    vrij_verloopt_at: Moment.nullable(),
    afhaallijst_versie: Versie,
    wegzetten_open: z.int().nonnegative(),
    wegzetten_binnen_24u: z.int().nonnegative(),
    hoogste_volgnummer_gemeld: z.int().nonnegative(),
    bevestigd_tot_volgnummer: z.int().nonnegative(),
    hoogste_bon_volgnummer: z.int().nonnegative(),
    instellingen: z.object({
        alcohol_toegestaan: z.boolean(),
        contant_aan: z.boolean(),
        contant_limiet_cents: PositieveCents.max(CONTANT_GRENS_CENTS),
        beschikbaar_grens: z.int().positive(),
    }),
    te_controleren: z.int().nonnegative(),
});
export type StatusAntwoord = z.infer<typeof StatusAntwoord>;

/* ═══ Catalogus (contract §3.3) ══════════════════════════════════════════ */

export const Kanaal = z.enum(['toonbank', 'webshop', 'event']);

export const BtwVerdeling = z.array(z.object({ pct: BtwPct, gewicht: z.number().positive() })).min(1);

export const Artikel = z.object({
    artikel_id: Uuid,
    naam: z.string().min(1),
    prijs_cents: PositieveCents,
    btw_pct: BtwPct,
    btw_verdeling: BtwVerdeling.nullable(),
    alcohol: z.boolean(),
    groep: z.string().min(1).nullable(),
    volgorde: z.int(),
    favoriet: z.boolean(),
    foto_url: z.url().nullable(),
    onderdelen: z.array(Onderdeel),
    actief: z.boolean(),
    kanalen: z.array(Kanaal),
});

export const Product = z.object({
    product_id: Uuid,
    naam: z.string().min(1),
    statiegeld_cents: PositieveCents,
    voorraad_bijgehouden: z.boolean(),
    alcohol: z.boolean(),
});

export const Code = z.object({
    code: z.string().min(1),
    soort: z.enum(['ean', 'plu']),
    artikel_id: Uuid,
});

export const Groep = z.object({
    groep_id: z.string().min(1),
    naam: z.string().min(1),
    volgorde: z.int(),
    open_prijs: z.boolean(),
    btw_pct: BtwPct.nullable(),
    alcohol: z.boolean(),
});

export const CatalogusAntwoord = z.object({
    versie: Versie,
    volledig: z.boolean(),
    artikelen: z.array(Artikel),
    producten: z.array(Product),
    codes: z.array(Code),
    groepen: z.array(Groep),
});
export type CatalogusAntwoord = z.infer<typeof CatalogusAntwoord>;

/* ═══ Vrij (contract §1.9, §3.3) ═════════════════════════════════════════ */

export const Reservering = z.object({
    order_id: OrderId,
    nummer: Ordernummer,
    naam: z.string().min(1),
    afhaalmoment: Moment.nullable(),
    aantal: VoorraadGetal.positive(),
});

export const VrijProduct = z.object({
    product_id: Uuid,
    eenheid: Eenheid,
    ligt_er: VoorraadGetal.nullable(),
    gereserveerd: VoorraadGetal.nonnegative(),
    vrij: VoorraadGetal.nullable(),
    bijgehouden: z.boolean(),
    reserveringen: z.array(Reservering).optional(),
});

export const VrijAntwoord = z.object({
    versie: Versie,
    volledig: z.boolean(),
    vrij_verloopt_at: Moment.nullable(),
    producten: z.array(VrijProduct),
});
export type VrijAntwoord = z.infer<typeof VrijAntwoord>;

export const PIL_SOORTEN = ['op', 'tekort', 'webshop', 'nog', 'ruim'] as const;

export const PilGevallen = z.object({
    uitleg: z.string().min(1),
    gevallen: z.array(z.object({
        ligt_er: VoorraadGetal,
        gereserveerd: VoorraadGetal,
        grens: z.int().positive(),
        soort: z.enum(PIL_SOORTEN),
        tekst: z.string().min(1),
        aria: z.string().min(1),
    })).min(1),
});

/* ═══ Wegzetten (contract §1.10, §3.3) ═══════════════════════════════════ */

export const WegzetTaak = z.object({
    order_id: OrderId,
    nummer: Ordernummer,
    naam: z.string().min(1),
    afhaalmoment: Moment.nullable(),
    ophalen_binnen_24u: z.boolean(),
    regels: z.array(z.object({
        artikel: z.string().min(1),
        aantal: z.int().positive(),
        producten: z.array(z.object({
            product_id: Uuid,
            naam: z.string().min(1),
            hoeveelheid: z.number().positive(),
        })),
    })).min(1),
});

export const WegzettenAntwoord = z.object({ taken: z.array(WegzetTaak) });
export type WegzettenAntwoord = z.infer<typeof WegzettenAntwoord>;

export const WegzetVerzoek = z.object({ gebeurtenis_id: Uuid, moment: Moment });

export const Boeking = z.object({
    regel_id: z.int().positive().optional(),
    product_id: Uuid,
    hoeveelheid: VoorraadGetal,
    voorraad: VoorraadGetal.nullable(),
    type: z.string().min(1),
});

export const WegzetAntwoord = z.object({
    uitkomst: z.enum(['apart', 'al_apart', 'geen_taak']),
    voorraad_versie: Versie,
    boekingen: z.array(Boeking),
});
export type WegzetAntwoord = z.infer<typeof WegzetAntwoord>;

export const OngedaanVerzoek = z.object({ gebeurtenis_id: Uuid, moment: Moment, reden: z.string().min(1).optional() });

export const OngedaanAntwoord = z.object({
    uitkomst: z.enum(['ongedaan', 'niet_apart', 'geen_taak']),
    voorraad_versie: Versie,
    boekingen: z.array(Boeking),
});
export type OngedaanAntwoord = z.infer<typeof OngedaanAntwoord>;

/* ═══ Afhalen en scannen (contract §3.3) ═════════════════════════════════ */

export const AfhaallijstAntwoord = z.object({
    versie: Versie,
    datum: Datum,
    orders: z.array(z.object({
        order_id: OrderId,
        nummer: Ordernummer,
        naam: z.string().min(1),
        afhaalmoment: Moment.nullable(),
        alcohol: z.boolean(),
        rest_cents: PositieveCents,
        status: z.string().min(1),
        apart_gezet: z.boolean(),
        dozen: z.array(z.object({
            code: z.string().min(1),
            omschrijving: z.string(),
            volgnr: z.int().positive(),
            opgehaald_at: Moment.nullable(),
        })),
    })),
});
export type AfhaallijstAntwoord = z.infer<typeof AfhaallijstAntwoord>;

export const Rest = z.object({ methode: Betaalmethode, bedrag_cents: z.int().positive() });

export const OphalenVerzoek = z
    .object({
        gebeurtenis_id: Uuid,
        moment: Moment,
        bon_id: Uuid.nullable(),
        rest: Rest.nullable(),
        leeftijd: Leeftijd.nullable(),
    })
    .refine((v) => v.rest === null || v.bon_id !== null, { message: 'een rest staat op een bon: bon_id is nodig', path: ['bon_id'] });
export type OphalenVerzoek = z.infer<typeof OphalenVerzoek>;
export const OrderOphalenVerzoek = OphalenVerzoek;
export const DoosOphalenVerzoek = OphalenVerzoek;

export const ScanAntwoord = z.discriminatedUnion('soort', [
    z.object({ soort: z.literal('artikel'), code: z.string().min(1), artikel_id: Uuid }),
    z.object({
        soort: z.literal('stuk'),
        code: z.string().min(1),
        artikel_id: Uuid,
        product_id: Uuid,
        stuk_status: z.enum(['op_voorraad', 'verkocht', 'afgeschreven']),
        tht: Datum.nullable(),
    }),
    z.object({ soort: z.literal('doos'), code: z.string().min(1), order_id: OrderId, nummer: Ordernummer }),
    z.object({ soort: z.literal('onbekend'), code: z.string().min(1) }),
]);
export type ScanAntwoord = z.infer<typeof ScanAntwoord>;

/* ═══ Meldingen (contract §1.2–1.4, §3.4) — BA-9 verwerkt ze ═════════════ */

const envelop = {
    gebeurtenis_id: Uuid,
    volgnummer: Volgnummer,
    moment: Moment,
    medewerker_id: Uuid.nullable(),
    vorige_hash: z.string().min(1).optional(),
    hash: z.string().min(1).optional(),
};

const RegelBtw = z.object({ pct: BtwPct, incl_cents: Cents });

const VerkoopRegel = z.object({
    regelnr: z.int().positive(),
    soort: z.literal('verkoop'),
    artikel_id: Uuid.nullable(),
    open_prijs_groep: z.string().min(1).optional(),
    naam: z.string().min(1),
    aantal: Aantal,
    stuk_cents: PositieveCents,
    korting_cents: Cents,
    bedrag_cents: Cents,
    btw: z.array(RegelBtw).min(1),
    alcohol: z.boolean(),
    onderdelen: z.array(Onderdeel),
    scan_code: z.string().min(1).optional(),
    prijs_bron: z.enum(['catalogus', 'open_prijs']),
    verwijst_naar_regelnr: z.int().positive().optional(),
    /**
     * Op een tegenbon: kwam de waar terug (true: retour op de voorraad) of niet (false). De
     * tablet stuurt het daar altijd mee. Ontbreekt het, dan weigert BBQ Architect de tegenbon
     * niet (geen schemafout: het geld moet in de dagstaat), maar boekt hij niets terug en komt
     * de tegenbon in Te controleren (goederen_terug_onbekend; review M2 klein 5, hercontrole).
     * Op een gewone verkoopregel heeft het geen betekenis.
     */
    goederen_terug: z.boolean().optional(),
});

const StatiegeldRegel = z.object({
    regelnr: z.int().positive(),
    soort: z.literal('statiegeld'),
    hoort_bij_regelnr: z.int().positive(),
    product_id: Uuid,
    aantal: Aantal,
    stuk_cents: PositieveCents,
    bedrag_cents: Cents,
});

const OrderRestRegel = z.object({
    regelnr: z.int().positive(),
    soort: z.literal('order_rest'),
    order_id: OrderId,
    nummer: Ordernummer,
    bedrag_cents: Cents,
});

const BetaalRegel = z.object({
    regelnr: z.int().positive(),
    soort: z.literal('betaling'),
    betaalmethode: Betaalmethode,
    betaal_bevestiging: z.literal('handmatig').optional(),
    bedrag_cents: Cents,
    contant_ontvangen_cents: PositieveCents.optional(),
    wisselgeld_cents: PositieveCents.optional(),
});

const BonRegel = z.discriminatedUnion('soort', [VerkoopRegel, StatiegeldRegel, OrderRestRegel, BetaalRegel]);

const bonVelden = {
    ...envelop,
    bon_id: Uuid,
    bonnummer: Bonnummer,
    bon_volgnummer: z.int().positive(),
    status: z.enum(['afgerond', 'geannuleerd']),
    kanaal: z.enum(['winkel', 'event']),
    event_label: z.string().min(1).nullable().optional(),
    catalogus_versie: Versie,
    voorraad_versie: Versie.optional(),
    leeftijd: Leeftijd.nullable(),
    regels: z.array(BonRegel),
    totaal_cents: Cents,
    afronding_cents: z.int().min(-2).max(2).optional(),
};
const zelfdeId = (b: { bon_id: string; gebeurtenis_id: string }) => b.bon_id === b.gebeurtenis_id;
const zelfdeIdFout = { message: 'bon_id is gelijk aan gebeurtenis_id', path: ['bon_id'] };

export const BonMelding = z.object({ soort: z.literal('bon'), ...bonVelden }).refine(zelfdeId, zelfdeIdFout);
export const TegenbonMelding = z
    .object({ soort: z.literal('tegenbon'), ...bonVelden, verwijst_naar_bon_id: Uuid, reden: z.string().min(1) })
    .refine(zelfdeId, zelfdeIdFout);

export const PinpogingMelding = z.object({ soort: z.literal('pinpoging'), ...envelop, bon_id: Uuid, bedrag_cents: Cents, uitkomst: z.enum(['gelukt', 'mislukt']) });
export const InloggenMelding = z.object({ soort: z.literal('inloggen'), ...envelop });
export const UitloggenMelding = z.object({ soort: z.literal('uitloggen'), ...envelop, reden: z.enum(['zelf', 'time_out', 'wissel']) });

export const VrijOverschredenMelding = z
    .object({
        soort: z.literal('vrij_overschreden'),
        ...envelop,
        bon_id: Uuid,
        regelnr: z.int().positive(),
        product_id: Uuid,
        vrij_volgens_tablet: VoorraadGetal,
        verkocht: VoorraadGetal.positive(),
        boven_vrij: VoorraadGetal.positive(),
        voorraad_versie: Versie,
        reden: z.string().min(1),
        modus: z.enum(['online', 'offline']),
        eigenaar_medewerker_id: Uuid.nullable(),
        goedkeuring_ids: z.array(Uuid),
    })
    .superRefine((m, ctx) => {
        if (m.boven_vrij > m.verkocht) ctx.addIssue({ code: 'custom', path: ['boven_vrij'], message: 'boven_vrij is nooit meer dan verkocht' });
        if (new Set(m.goedkeuring_ids).size !== m.goedkeuring_ids.length) ctx.addIssue({ code: 'custom', path: ['goedkeuring_ids'], message: 'een goedkeuring geldt een keer' });
        if (m.modus === 'online' && (m.eigenaar_medewerker_id === null || m.goedkeuring_ids.length === 0)) {
            ctx.addIssue({ code: 'custom', path: ['goedkeuring_ids'], message: 'online: eigenaar en minstens een goedkeuring' });
        }
        if (m.modus === 'offline' && (m.eigenaar_medewerker_id !== null || m.goedkeuring_ids.length > 0)) {
            ctx.addIssue({ code: 'custom', path: ['goedkeuring_ids'], message: 'offline: geen eigenaar en geen goedkeuring' });
        }
    });

export const DagOpenenMelding = z.object({ soort: z.literal('dag_openen'), ...envelop, bedrijfsdag: Datum, contant_begin_cents: PositieveCents });

export const Melding = z.discriminatedUnion('soort', [
    BonMelding, TegenbonMelding, PinpogingMelding, InloggenMelding, UitloggenMelding, VrijOverschredenMelding, DagOpenenMelding,
]);

export const MAX_MELDINGEN_PER_VERZOEK = 50;
export const BonnenVerzoek = z.object({ meldingen: z.array(Melding).min(1).max(MAX_MELDINGEN_PER_VERZOEK) });

/** De soorten die via POST bonnen reizen (contract §1.2, plan v5 contractgat 5). */
export const BONNEN_SOORTEN = ['bon', 'tegenbon', 'pinpoging', 'inloggen', 'uitloggen', 'vrij_overschreden', 'dag_openen'] as const;

/**
 * De soepele envelop waarmee BBQ Architect eerst opslaat (review M5, BA-9):
 * alleen wat nodig is om een melding uniek in toonbank_journaal te zetten.
 * Al het andere mag alles zijn; streng controleren (Melding, DagstaatMelding)
 * gebeurt per melding bij het verwerken. Alleen als de envelop zelf niet
 * klopt, antwoordt BBQ Architect 400 ongeldig_verzoek.
 */
export const MeldingEnvelop = z
    .object({
        gebeurtenis_id: Uuid,
        volgnummer: Volgnummer,
        soort: z.string().min(1),
        /** Hier nog los: geen geldige tijd → toch opgeslagen, status fout. */
        moment: z.string().min(1),
    })
    .loose();
export type MeldingEnvelop = z.infer<typeof MeldingEnvelop>;

/** POST bonnen zoals BBQ Architect hem eerst opslaat. Meer dan 50 = 413 te_groot. */
export const BonnenEnvelop = z.object({ meldingen: z.array(MeldingEnvelop).min(1).max(MAX_MELDINGEN_PER_VERZOEK) }).loose();

/** De verwerkstatus in toonbank_journaal (contract §1.2). De tablet bewaart hem alleen. */
export const VERWERK_STATUSSEN = ['wacht', 'verwerkt', 'niet_nodig', 'fout', 'conflict', 'opgelost'] as const;
export type VerwerkStatus = (typeof VERWERK_STATUSSEN)[number];

export const BonnenAntwoord = z.object({
    resultaten: z.array(z.object({
        gebeurtenis_id: Uuid,
        journaal: z.enum(['nieuw', 'bestond']),
        /** Een van VERWERK_STATUSSEN; de tablet accepteert ook een andere tekst (review H2). */
        verwerking: z.string().min(1),
    })),
    bevestigd_tot_volgnummer: z.int().nonnegative(),
});
export type BonnenAntwoord = z.infer<typeof BonnenAntwoord>;

const OmzetPerTarief = z.object({ pct: BtwPct, incl_cents: Cents, grondslag_cents: Cents, btw_cents: Cents });

export const DagstaatMelding = z
    .object({
        soort: z.literal('dagstaat'),
        gebeurtenis_id: Uuid,
        volgnummer: Volgnummer,
        moment: Moment,
        medewerker_id: Uuid.nullable(),
        vorige_hash: z.string().min(1).optional(),
        hash: z.string().min(1).optional(),
        dagstaat_id: Uuid,
        dagstaatnummer: z.int().positive(),
        bedrijfsdag: Datum,
        geopend_at: Moment,
        gesloten_at: Moment,
        eerste_bonnummer: Bonnummer.nullable(),
        laatste_bonnummer: Bonnummer.nullable(),
        aantal_bonnen: z.int().nonnegative(),
        aantal_tegenbonnen: z.int().nonnegative(),
        aantal_geannuleerd: z.int().nonnegative(),
        omzet: z.array(OmzetPerTarief),
        statiegeld_cents: Cents,
        order_rest_cents: Cents,
        /**
         * De som van totaal_cents van de afgeronde tegenbonnen van die dag (negatief), dus met statiegeld,
         * rest en afronding: zoals kern (dagCijfers) en de narekening in BA (review M2 K2). Ter informatie:
         * de netto omzet per tarief bevat de tegenbonnen al.
         */
        tegenbonnen_cents: Cents,
        korting_cents: Cents,
        afronding_cents: Cents,
        pin_toonbank_cents: Cents,
        pin_mypos_app_cents: Cents,
        pin_verschil_cents: Cents,
        pin_verschil_reden: z.string().min(1).nullable(),
        contant_begin_cents: PositieveCents,
        contant_verwacht_cents: Cents,
        contant_geteld_cents: Cents,
        contant_telling: z.array(z.object({ waarde_cents: z.int().positive(), aantal: z.int().nonnegative() })).nullable(),
        contant_verschil_cents: Cents,
        contant_verschil_reden: z.string().min(1).nullable(),
        afgeroomd_cents: PositieveCents,
        verzendbak_leeg: z.boolean(),
    })
    .refine((d) => d.dagstaat_id === d.gebeurtenis_id, { message: 'dagstaat_id is gelijk aan gebeurtenis_id', path: ['dagstaat_id'] });

export const DAGSTAAT_STATUSSEN = ['voorlopig', 'definitief', 'aangevuld', 'goedgekeurd'] as const;

/** Antwoord op POST dagstaten (BA-10). */
export const DagstatenAntwoord = z.object({
    dagstaat_id: Uuid,
    journaal: z.enum(['nieuw', 'bestond']),
    status: z.enum(DAGSTAAT_STATUSSEN),
    verschillen: z.array(z.object({ veld: z.string().min(1), tablet_cents: Cents, ba_cents: Cents })),
});
export type DagstatenAntwoord = z.infer<typeof DagstatenAntwoord>;

/** GET dagstaat?datum: wat BBQ Architect van die dag van dit apparaat kent (BA-10). */
export const DagstaatOverzicht = z.object({
    datum: Datum,
    apparaat_code: ApparaatCode,
    aantal_bonnen: z.int().nonnegative(),
    hoogste_bonnummer: Bonnummer.nullable(),
    omzet: z.array(z.object({ pct: BtwPct, incl_cents: Cents, btw_cents: Cents })),
    pin_cents: Cents,
    contant_cents: Cents,
});
export type DagstaatOverzicht = z.infer<typeof DagstaatOverzicht>;

/* ═══ Ophalen (contract §3.3, BA-10) ═════════════════════════════════════ */

/** De uitkomsten van winkel_order_ophalen (BA-2). Alleen bij "opgehaald" is de order meegegeven. */
export const OPHAAL_UITKOMSTEN = ['onbekend', 'niet_betaald', 'al_opgehaald', 'rest_nodig', 'leeftijd_nodig', 'geweigerd', 'te_weinig_voorraad', 'opgehaald'] as const;
export const OphaalUitkomst = z.enum(OPHAAL_UITKOMSTEN);
export type OphaalUitkomst = z.infer<typeof OphaalUitkomst>;

export const OrderOphalenAntwoord = z.object({
    uitkomst: OphaalUitkomst,
    order_id: OrderId.nullable(),
    nummer: Ordernummer.nullable(),
    /** Bij rest_nodig: wat er nog betaald moet worden. */
    rest_cents: PositieveCents,
    opgehaald_at: Moment.nullable(),
});
export type OrderOphalenAntwoord = z.infer<typeof OrderOphalenAntwoord>;

export const DoosOphalenAntwoord = OrderOphalenAntwoord.extend({
    code: z.string().min(1),
    /** Hoeveel dozen van deze order nog niet zijn opgehaald. */
    nog_open: z.int().nonnegative(),
});
export type DoosOphalenAntwoord = z.infer<typeof DoosOphalenAntwoord>;

/* ═══ De voorbeeldberichten (contract/v1/voorbeelden) ════════════════════ */

export const SCHEMAS = {
    StatusAntwoord, CatalogusAntwoord, VrijAntwoord, WegzettenAntwoord, WegzetAntwoord, OngedaanAntwoord,
    AfhaallijstAntwoord, ScanAntwoord, KoppelAntwoord, MedewerkersAntwoord, InlogAntwoord, EigenaarcodeAntwoord,
    BonMelding, TegenbonMelding, BonnenVerzoek, OrderOphalenVerzoek, DoosOphalenVerzoek, DagstaatMelding,
    FoutAntwoord, FoutTeWeinigVoorraad, FoutNietBetaald, FoutNietZelfdeDag, FoutAlOpgehaald, PilGevallen,
} as const;

/** Elk voorbeeldbestand en zijn schema (zoals VOORBEELDEN in packages/kern). */
export const VOORBEELDEN = {
    'status.json': 'StatusAntwoord',
    'catalogus.json': 'CatalogusAntwoord',
    'vrij-vier-naober.json': 'VrijAntwoord',
    'wegzetten.json': 'WegzettenAntwoord',
    'wegzetten-antwoord.json': 'WegzetAntwoord',
    'bon-los.json': 'BonMelding',
    'bon-pakket-statiegeld-alcohol.json': 'BonMelding',
    'tegenbon.json': 'TegenbonMelding',
    'bon-vrij-overschreden.json': 'BonnenVerzoek',
    'ophalen-rest.json': 'OrderOphalenVerzoek',
    'doos-ophalen.json': 'DoosOphalenVerzoek',
    'dagstaat.json': 'DagstaatMelding',
    'fout-te-weinig-voorraad.json': 'FoutTeWeinigVoorraad',
    'fout-niet-zelfde-dag.json': 'FoutNietZelfdeDag',
    'pil-gevallen.json': 'PilGevallen',
} as const satisfies Record<string, keyof typeof SCHEMAS>;

/* ═══ Versies vergelijken ════════════════════════════════════════════════ */

/** "1.1.0" → [1, 1, 0]; iets anders → null. Een achtervoegsel (-ontwerp) telt niet. */
export function leesVersie(v: string | null | undefined): [number, number, number] | null {
    const m = /^\s*(\d{1,4})\.(\d{1,4})\.(\d{1,4})/.exec(v ?? '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Is versie a minstens b? Een onleesbare of ontbrekende versie is nooit genoeg. */
export function versieMinstens(a: string | null | undefined, b: string): boolean {
    const x = leesVersie(a);
    const y = leesVersie(b);
    if (!x || !y) return false;
    for (let i = 0; i < 3; i++) {
        if (x[i]! !== y[i]!) return x[i]! > y[i]!;
    }
    return true;
}
