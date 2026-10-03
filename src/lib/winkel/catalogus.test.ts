/**
 * De catalogus naar de website (plan docs/OPDRACHT-BBQ-ARCHITECT-CATALOGUS.md, C1–C2):
 * de vorm per soort, wat er nooit mee gaat, de poort naar live en de voorbeeldlink.
 */
import { describe, expect, it } from 'vitest';
import { leesVoorbeeldToken, maakVoorbeeldToken, seinWebsite } from './catalogus';
import { maakSlug, naarCatalogus, soortVanType, typeVan, watOntbreekt, type ArtikelRij, type ProductRij } from './productsoorten';

const URL = 'https://abc.supabase.co';

const proefkaart = {
    plaats: 'Rochefort', land: 'België', brouwerij: 'Een trappistenbrouwerij.', oorsprong: 'Feestbier.', smaak: 'Vol en moutig.',
    gebrouwenMet: ['water', 'gerstemout'], ibu: 22, palet: { bitter: 2, zoet: 3, moutig: 4, fruitig: 3, zuur: 1, body: 4 },
};

const rij = (extra: Partial<ProductRij> = {}): ProductRij => ({
    id: 'p1',
    naam: 'Rochefort 8',
    type: 'bier',
    slug: 'rochefort-8',
    kenmerken: { brouwerij: 'Rochefort', stijl: 'trappist', verpakking: { soort: 'fles', cl: 33 }, proefkaart },
    alcohol: true,
    alcohol_pct: '9.20',
    allergenen: ['gluten (gerst)'],
    ingredienten: null,
    bewaren: null,
    lekker_bij: null,
    foto_pad: 'org/rochefort-8.png',
    pagina_status: 'live',
    pagina_volgorde: 1,
    goedgekeurd: {},
    actief: true,
    updated_at: '2026-10-03T10:00:00Z',
    ...extra,
});

const artikel: ArtikelRij = { slug: 'rochefort-8', eenheid: 'per fles', prijs_cents: 345, actief: true, publiek: true };

describe('naarCatalogus', () => {
    it('maakt van een bier wat de website kent', () => {
        const p = naarCatalogus(rij(), artikel, URL)!;
        expect(p.soort).toBe('bier');
        expect(p.prijsCenten).toBe(345);
        expect(p.alcoholPct).toBe(9.2);
        expect(p.foto).toBe(`${URL}/storage/v1/object/public/winkel-fotos/org/rochefort-8.png`);
        expect(p.concept).toBe(false);
    });

    it('laat een proefkaart weg zolang Mathijs hem niet goedkeurde', () => {
        const zonder = naarCatalogus(rij(), artikel, URL);
        expect(zonder?.soort === 'bier' && zonder.proefkaart).toBeNull();
        const met = naarCatalogus(rij({ goedgekeurd: { proefkaart: { door: 'u', op: '2026-10-03' } } }), artikel, URL);
        expect(met?.soort === 'bier' && met.proefkaart?.ibu).toBe(22);
    });

    it('geeft geen prijs als het artikel uit staat of ontbreekt', () => {
        expect(naarCatalogus(rij(), { ...artikel, actief: false }, URL)?.prijsCenten).toBeNull();
        expect(naarCatalogus(rij(), null, URL)?.prijsCenten).toBeNull();
    });

    it('laat een rij met kapotte kenmerken weg in plaats van half te tonen', () => {
        expect(naarCatalogus(rij({ kenmerken: { brouwerij: 'Rochefort' } }), artikel, URL)).toBeNull();
        expect(naarCatalogus(rij({ type: 'doos' }), artikel, URL)).toBeNull();
        expect(naarCatalogus(rij({ slug: null }), artikel, URL)).toBeNull();
    });

    it('toont druiven alleen als ze gecontroleerd zijn', () => {
        const wijn = rij({
            type: 'wijn',
            slug: 'rueda',
            kenmerken: {
                producent: 'Bodega', jaargang: '2025', wijnType: 'wit', land: 'Spanje', regio: 'Castilla y León', appellatie: 'DO Rueda',
                druiven: ['Verdejo'], biologisch: false, huiswijn: true, inhoud: '0,75 L', stijl: 'Fris en droog', smaak: 'Citrus.',
                omschrijving: 'Een frisse witte.', pastBij: 'Vis.', serveertemperatuur: '8–10 °C',
            },
        });
        expect(naarCatalogus(wijn, null, URL)?.soort === 'wijn' && naarCatalogus(wijn, null, URL)).toMatchObject({ druivenGecontroleerd: false });
        const ok = naarCatalogus({ ...wijn, goedgekeurd: { druiven: { op: '2026-10-03' } } }, null, URL);
        expect(ok).toMatchObject({ druivenGecontroleerd: true });
    });

    it('stuurt nooit inkoop, leverancier of marge mee', () => {
        const vervuild = { ...rij(), inkoop_excl_cents: 120, leverancier_id: 7, marge: 0.6, herkomst: 'mr_hop' } as unknown as ProductRij;
        const json = JSON.stringify(naarCatalogus(vervuild, artikel, URL));
        expect(json).not.toMatch(/inkoop|leverancier|marge|herkomst|mr_hop/i);
    });
});

describe('watOntbreekt', () => {
    it('is leeg als alles er is', () => {
        expect(watOntbreekt(rij(), artikel)).toEqual([]);
    });
    it('noemt in gewone taal wat er mist', () => {
        const uit = watOntbreekt(rij({ foto_pad: null, allergenen: [] }), { prijs_cents: null });
        expect(uit).toEqual(expect.arrayContaining(['nog geen foto', 'nog geen prijs', 'nog geen allergenen (van het etiket)']));
    });
    it('weigert drank van 15 % of meer', () => {
        expect(watOntbreekt(rij({ alcohol_pct: 19.5 }), artikel).join()).toMatch(/onder de 15 %/);
    });
    it('vraagt bij alcoholvrij de ingrediënten', () => {
        expect(watOntbreekt(rij({ alcohol_pct: 0.5 }), artikel)).toContain('alcoholvrij: de ingrediënten van het etiket');
    });
    it('vraagt bij vlees ingrediënten en bewaren', () => {
        const worst = rij({ type: 'worst', alcohol: false, alcohol_pct: null, kenmerken: { soort: 'droge-worst', fotoAlt: 'Een worst.', alleenKaartformaat: false } });
        expect(watOntbreekt(worst, artikel)).toEqual(['nog geen ingrediënten', 'nog niet hoe je het bewaart']);
    });
});

describe('soorten en slugs', () => {
    it('vertaalt soort en type heen en terug', () => {
        expect(typeVan('vlees', { soort: 'vers' })).toBe('vleeswaar');
        expect(typeVan('vlees', { soort: 'droge-worst' })).toBe('worst');
        expect(soortVanType('vleeswaar')).toBe('vlees');
        expect(soortVanType('amandelen')).toBeNull();
    });
    it('maakt een nette slug', () => {
        expect(maakSlug('Ayinger', 'Bräuweisse')).toBe('ayinger-brauweisse');
        expect(maakSlug("Maisel's Weisse Alkoholfrei")).toBe('maisels-weisse-alkoholfrei');
        expect(maakSlug('Roeg × Brinx', 'Naober')).toBe('roeg-brinx-naober');
    });
});

describe('voorbeeldlink', () => {
    const sleutel = 'test-geheim';
    it('geldt 24 uur, voor één organisatie', () => {
        const t = maakVoorbeeldToken('org-a', 'p1', 1_000, sleutel)!;
        expect(leesVoorbeeldToken(t, 'org-a', 2_000, sleutel)).toBe('p1');
        expect(leesVoorbeeldToken(t, 'org-b', 2_000, sleutel)).toBeNull();
        expect(leesVoorbeeldToken(t, 'org-a', 1_000 + 25 * 3600_000, sleutel)).toBeNull();
    });
    it('weigert een aangepast token', () => {
        const t = maakVoorbeeldToken('org-a', 'p1', 1_000, sleutel)!;
        const [inhoud] = t.split('.');
        const vals = Buffer.from(JSON.stringify({ o: 'org-a', p: 'p2', t: 9e15 })).toString('base64url');
        expect(leesVoorbeeldToken(`${vals}.${t.split('.')[1]}`, 'org-a', 2_000, sleutel)).toBeNull();
        expect(leesVoorbeeldToken(`${inhoud}.x`, 'org-a', 2_000, sleutel)).toBeNull();
        expect(leesVoorbeeldToken(t, 'org-a', 2_000, 'ander')).toBeNull();
    });
    it('bestaat niet zonder geheim', () => {
        expect(maakVoorbeeldToken('org-a', 'p1', 1_000, null)).toBeNull();
    });
});

describe('seinWebsite', () => {
    const client = (site: string | null) =>
        ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { site_url: site } }) }) }) }) }) as never;

    it('seint de website met het geheim', async () => {
        process.env.HB_VERVERS_GEHEIM = 'g';
        const gezien: { url: string; kop: string | null }[] = [];
        const f = (async (url: string, init: RequestInit) => {
            gezien.push({ url, kop: new Headers(init.headers).get('x-hb-ververs') });
            return new Response(null, { status: 200 });
        }) as unknown as typeof fetch;
        expect(await seinWebsite('org', client('https://hopbites.nl/'), f)).toBe('verstuurd');
        expect(gezien).toEqual([{ url: 'https://hopbites.nl/api/catalogus/ververs', kop: 'g' }]);
    });
    it('probeert twee keer en zegt eerlijk dat het mislukte', async () => {
        process.env.HB_VERVERS_GEHEIM = 'g';
        let n = 0;
        const f = (async () => { n++; return new Response(null, { status: 500 }); }) as unknown as typeof fetch;
        expect(await seinWebsite('org', client('https://hopbites.nl'), f)).toBe('mislukt');
        expect(n).toBe(2);
    });
    it('doet niets zonder site of geheim', async () => {
        process.env.HB_VERVERS_GEHEIM = 'g';
        expect(await seinWebsite('org', client(null))).toBe('geen-site');
        delete process.env.HB_VERVERS_GEHEIM;
        expect(await seinWebsite('org', client('https://hopbites.nl'))).toBe('geen-geheim');
    });
});
