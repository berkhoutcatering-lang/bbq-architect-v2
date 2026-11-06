import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { htmlNaarTekst, isAutomatisch, klopWebhookHandtekening, leesAfzender, slugUitAdressen } from './webhook';

const sleutel = Buffer.from('testgeheim-hop-en-bites').toString('base64');
const geheim = `whsec_${sleutel}`;
const onderteken = (id: string, t: string, body: string) =>
    'v1,' + createHmac('sha256', Buffer.from(sleutel, 'base64')).update(`${id}.${t}.${body}`).digest('base64');

describe('klopWebhookHandtekening', () => {
    const nu = 1_800_000_000;
    const t = String(nu);
    const body = '{"type":"email.received"}';

    it('accepteert een juiste handtekening', () => {
        expect(klopWebhookHandtekening(body, { id: 'm1', tijdstip: t, handtekening: onderteken('m1', t, body) }, geheim, nu)).toBe(true);
    });
    it('accepteert er één uit meerdere', () => {
        const kop = `v1,AAAA ${onderteken('m1', t, body)}`;
        expect(klopWebhookHandtekening(body, { id: 'm1', tijdstip: t, handtekening: kop }, geheim, nu)).toBe(true);
    });
    it('weigert een aangepaste body', () => {
        expect(klopWebhookHandtekening(body + ' ', { id: 'm1', tijdstip: t, handtekening: onderteken('m1', t, body) }, geheim, nu)).toBe(false);
    });
    it('weigert een oud bericht', () => {
        expect(klopWebhookHandtekening(body, { id: 'm1', tijdstip: t, handtekening: onderteken('m1', t, body) }, geheim, nu + 3600)).toBe(false);
    });
    it('weigert alles zonder geheim', () => {
        expect(klopWebhookHandtekening(body, { id: 'm1', tijdstip: t, handtekening: onderteken('m1', t, body) }, undefined, nu)).toBe(false);
    });
});

describe('adressen', () => {
    it('vindt het bedrijf in het ontvangstadres', () => {
        expect(slugUitAdressen(['iets@x.nl', 'mail-hop-en-bites@abc.resend.app'])).toBe('hop-en-bites');
        expect(slugUitAdressen(['Hop <mail-hop-en-bites@abc.resend.app>'])).toBe('hop-en-bites');
        expect(slugUitAdressen(['info@hopbites.nl'])).toBeNull();
    });
    it('leest naam en adres', () => {
        expect(leesAfzender('"Jan Jansen" <Jan@Voorbeeld.nl>')).toEqual({ naam: 'Jan Jansen', email: 'jan@voorbeeld.nl' });
        expect(leesAfzender('jan@voorbeeld.nl')).toEqual({ naam: null, email: 'jan@voorbeeld.nl' });
        expect(leesAfzender('geen adres')).toEqual({ naam: null, email: null });
    });
});

describe('isAutomatisch', () => {
    it('herkent automatische mail', () => {
        expect(isAutomatisch('jan@x.nl', { 'Auto-Submitted': 'auto-replied' })).toBe(true);
        expect(isAutomatisch('jan@x.nl', { 'List-Unsubscribe': '<x>' })).toBe(true);
        expect(isAutomatisch('noreply@x.nl', {})).toBe(true);
    });
    it('laat gewone mail door', () => {
        expect(isAutomatisch('jan@x.nl', { 'Auto-Submitted': 'no' })).toBe(false);
    });
});

describe('htmlNaarTekst', () => {
    it('maakt leesbare tekst', () => {
        expect(htmlNaarTekst('<style>a{}</style><p>Hallo&nbsp;daar</p><p>Tot&nbsp;ziens<br>Jan</p>')).toBe('Hallo daar\n Tot ziens\nJan');
    });
});
