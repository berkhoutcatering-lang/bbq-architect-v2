import { describe, expect, it } from 'vitest';
import {
    navSections,
    vindWerkruimte,
    zichtbareWerkruimtes,
    isTabZichtbaar,
    uitzetbareSleutels,
    werkruimteStart,
    toonbankTegel,
    TOONBANK,
    VASTE_TABS,
} from './navigation';

const iedereen = { verborgen: [] as string[], isPlatformAdmin: false };

describe('vindWerkruimte', () => {
    it('Vandaag hoort bij geen werkruimte', () => {
        expect(vindWerkruimte('/')).toBeNull();
        expect(vindWerkruimte(null)).toBeNull();
    });

    it('vindt het tabblad bij een exacte route', () => {
        const m = vindWerkruimte('/offertes');
        expect(m?.section.slug).toBe('verkoop');
        expect(m?.tab?.label).toBe('Offertes');
    });

    it('langste voorvoegsel wint: /voorraad/winkel is Winkel, niet Voorraad', () => {
        expect(vindWerkruimte('/voorraad/winkel')?.tab?.label).toBe('Winkel');
        expect(vindWerkruimte('/voorraad/winkel/tellen')?.tab?.label).toBe('Winkel');
        expect(vindWerkruimte('/voorraad')?.tab?.label).toBe('Voorraad');
        expect(vindWerkruimte('/instellingen/integraties')?.tab?.label).toBe('Koppelingen');
        expect(vindWerkruimte('/instellingen/printers')?.tab?.label).toBe('Instellingen');
    });

    it('detailpagina hoort bij het tabblad erboven', () => {
        const m = vindWerkruimte('/events/42/hub');
        expect(m?.section.slug).toBe('plannen');
        expect(m?.tab?.href).toBe('/events');
    });

    it('ook-routes horen bij een werkruimte zonder actief tabblad', () => {
        const m = vindWerkruimte('/klantgesprek');
        expect(m?.section.slug).toBe('plannen');
        expect(m?.tab).toBeNull();
        expect(vindWerkruimte('/marges')?.section.slug).toBe('gerechten');
        expect(vindWerkruimte('/keuken/tablet')?.section.slug).toBe('gerechten');
    });

    it('matcht geen half woord: /verkoopcijfers is geen /verkoop', () => {
        expect(vindWerkruimte('/verkoopcijfers')).toBeNull();
    });
});

describe('zichtbaarheid', () => {
    it('Platform Beheer alleen voor platformbeheerders', () => {
        const admin = navSections.flatMap((s) => s.children).find((c) => c.href === '/admin')!;
        expect(isTabZichtbaar(admin, iedereen)).toBe(false);
        expect(isTabZichtbaar(admin, { ...iedereen, isPlatformAdmin: true })).toBe(true);
    });

    it('een uitgezette werkruimte verdwijnt', () => {
        const w = zichtbareWerkruimtes({ ...iedereen, verborgen: ['geld'] });
        expect(w.find((s) => s.slug === 'geld')).toBeUndefined();
        expect(w.find((s) => s.slug === 'verkoop')).toBeDefined();
    });

    it('een uitgezet tabblad verdwijnt, de rest blijft', () => {
        const w = zichtbareWerkruimtes({ ...iedereen, verborgen: ['/verkoop/kerst'] });
        const verkoop = w.find((s) => s.slug === 'verkoop')!;
        expect(verkoop.children.map((c) => c.href)).not.toContain('/verkoop/kerst');
        expect(verkoop.children.map((c) => c.href)).toContain('/offertes');
    });

    it('Systeem en Instellingen kunnen niet uit', () => {
        const w = zichtbareWerkruimtes({ ...iedereen, verborgen: ['systeem', '/instellingen'] });
        const systeem = w.find((s) => s.slug === 'systeem')!;
        expect(systeem).toBeDefined();
        expect(systeem.children.map((c) => c.href)).toContain('/instellingen');
    });

    it('werkruimte met alle tabbladen uit verdwijnt ook', () => {
        const geld = navSections.find((s) => s.slug === 'geld')!;
        const w = zichtbareWerkruimtes({ ...iedereen, verborgen: geld.children.map((c) => c.href) });
        expect(w.find((s) => s.slug === 'geld')).toBeUndefined();
    });

    it('raakt de bron niet aan (filteren maakt kopieën)', () => {
        const voor = navSections.find((s) => s.slug === 'verkoop')!.children.length;
        zichtbareWerkruimtes({ ...iedereen, verborgen: ['/offertes'] });
        expect(navSections.find((s) => s.slug === 'verkoop')!.children.length).toBe(voor);
    });
});

describe('werkruimteStart', () => {
    it('gaat naar de startpagina van de werkruimte', () => {
        expect(werkruimteStart(navSections.find((s) => s.slug === 'verkoop')!)).toBe('/offertes');
    });

    it('valt terug op het eerste zichtbare tabblad als de startpagina uit staat', () => {
        const verkoop = zichtbareWerkruimtes({ ...iedereen, verborgen: ['/offertes'] }).find((s) => s.slug === 'verkoop')!;
        expect(werkruimteStart(verkoop)).toBe('/verkoop/leads');
    });

    it('Systeem gaat naar zijn overzichtspagina (een ook-route)', () => {
        expect(werkruimteStart(navSections.find((s) => s.slug === 'systeem')!)).toBe('/systeem');
    });
});

describe('uitzetbareSleutels', () => {
    const sleutels = uitzetbareSleutels();

    it('bevat werkruimtes en tabbladen', () => {
        expect(sleutels.has('voorraad')).toBe(true);
        expect(sleutels.has('/verkoop/webshop')).toBe(true);
    });

    it('bevat niets wat vast staat of platform-only is', () => {
        expect(sleutels.has('systeem')).toBe(false);
        for (const v of VASTE_TABS) expect(sleutels.has(v)).toBe(false);
        expect(sleutels.has('/admin')).toBe(false);
    });

    it('elke tab-href is uniek over alle werkruimtes', () => {
        const hrefs = navSections.flatMap((s) => s.children.map((c) => c.href));
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });
});

describe('tegel Winkel-kassa (de Toonbank)', () => {
    it('zonder adres geen tegel, zodat hij nooit naar een lege pagina gaat', () => {
        expect(toonbankTegel(iedereen, undefined)).toBeNull();
        expect(toonbankTegel(iedereen, '')).toBeNull();
        expect(toonbankTegel(iedereen, '   ')).toBeNull();
    });

    it('met adres een tegel die naar dat adres gaat', () => {
        const tegel = toonbankTegel(iedereen, 'https://toonbank.hopbites.nl');
        expect(tegel).not.toBeNull();
        expect(tegel!.href).toBe('https://toonbank.hopbites.nl/');
        expect(tegel!.title).toBe('Winkel-kassa');
        expect(tegel!.slug).toBe('toonbank');
    });

    it('houdt een pad in het adres heel', () => {
        expect(toonbankTegel(iedereen, ' https://toonbank.hopbites.nl/start ')!.href).toBe('https://toonbank.hopbites.nl/start');
    });

    it('lokaal testen mag over http, verder alleen https', () => {
        expect(toonbankTegel(iedereen, 'http://localhost:5173')!.href).toBe('http://localhost:5173/');
        expect(toonbankTegel(iedereen, 'http://toonbank.hopbites.nl')).toBeNull();
        expect(toonbankTegel(iedereen, 'javascript:alert(1)')).toBeNull();
        expect(toonbankTegel(iedereen, 'toonbank.hopbites.nl')).toBeNull();
    });

    it('verdwijnt als het bedrijf hem uitzet, ook met adres', () => {
        expect(toonbankTegel({ ...iedereen, verborgen: ['toonbank'] }, 'https://toonbank.hopbites.nl')).toBeNull();
    });

    it('leest standaard NEXT_PUBLIC_TOONBANK_URL', () => {
        const vorige = process.env.NEXT_PUBLIC_TOONBANK_URL;
        try {
            delete process.env.NEXT_PUBLIC_TOONBANK_URL;
            expect(toonbankTegel(iedereen)).toBeNull();
            process.env.NEXT_PUBLIC_TOONBANK_URL = 'https://toonbank.hopbites.nl';
            expect(toonbankTegel(iedereen)!.href).toBe('https://toonbank.hopbites.nl/');
        } finally {
            if (vorige === undefined) delete process.env.NEXT_PUBLIC_TOONBANK_URL;
            else process.env.NEXT_PUBLIC_TOONBANK_URL = vorige;
        }
    });

    it('is uit te zetten in Onderdelen en botst met geen werkruimte', () => {
        expect(uitzetbareSleutels().has(TOONBANK.slug)).toBe(true);
        expect(navSections.some((s) => s.slug === TOONBANK.slug)).toBe(false);
    });
});
