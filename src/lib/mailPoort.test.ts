import { describe, it, expect } from 'vitest';
import { magMailVerstuurd, type MailPoortInvoer } from './mailPoort';

const KLAAR: MailPoortInvoer = {
    status: 'nieuw',
    koppel_status: 'gekoppeld',
    experience_token: 'PLAATSHOUDER-TOKEN-0000',
    mail_status: 'niet_verstuurd',
    email: 'kasper@example.invalid',
};

describe('geen mail zonder token', () => {
    it('mag pas als er een token is', () => {
        expect(magMailVerstuurd(KLAAR).mag).toBe(true);
    });

    it('houdt de mail vast zodra de koppeling mislukt is', () => {
        const oordeel = magMailVerstuurd({ ...KLAAR, koppel_status: 'mislukt', experience_token: null });
        expect(oordeel.mag).toBe(false);
        expect(oordeel.reden).toBe('geen_token');
    });

    it('houdt de mail vast zolang de koppeling nog wacht', () => {
        const oordeel = magMailVerstuurd({ ...KLAAR, koppel_status: 'wacht', experience_token: null });
        expect(oordeel.mag).toBe(false);
        expect(oordeel.reden).toBe('geen_token');
    });

    /* Als koppel_status en het token ooit uit elkaar lopen, is het token de
       waarheid — dat is wat er in de link komt te staan. */
    it('gelooft het token, niet de status', () => {
        expect(magMailVerstuurd({ ...KLAAR, koppel_status: 'gekoppeld', experience_token: null }).mag).toBe(false);
        expect(magMailVerstuurd({ ...KLAAR, koppel_status: 'wacht', experience_token: 'abc' }).mag).toBe(false);
    });

    it('gaat alsnog uit zodra het koppelen lukt', () => {
        const vast = magMailVerstuurd({ ...KLAAR, koppel_status: 'mislukt', experience_token: null });
        expect(vast.mag).toBe(false);
        const na = magMailVerstuurd({ ...KLAAR, koppel_status: 'gekoppeld', experience_token: 'abc' });
        expect(na.mag).toBe(true);
    });
});

describe('de andere redenen om niet te versturen', () => {
    it('verstuurt niet twee keer', () => {
        expect(magMailVerstuurd({ ...KLAAR, mail_status: 'verstuurd' }).reden).toBe('al_verstuurd');
    });

    it('probeert het na een mislukte mail wél opnieuw', () => {
        expect(magMailVerstuurd({ ...KLAAR, mail_status: 'mislukt' }).mag).toBe(true);
    });

    it('verstuurt niets voor een geannuleerde bestelling', () => {
        expect(magMailVerstuurd({ ...KLAAR, status: 'geannuleerd' }).reden).toBe('geannuleerd');
    });

    it('verstuurt niets zonder adres', () => {
        expect(magMailVerstuurd({ ...KLAAR, email: null }).reden).toBe('geen_adres');
        expect(magMailVerstuurd({ ...KLAAR, email: '' }).reden).toBe('geen_adres');
    });

    /* Volgorde telt: een geannuleerde bestelling zonder token hoort
       "geannuleerd" te melden, niet "wacht op de koppeling". */
    it('noemt de belangrijkste reden eerst', () => {
        expect(magMailVerstuurd({
            ...KLAAR, status: 'geannuleerd', koppel_status: 'wacht', experience_token: null,
        }).reden).toBe('geannuleerd');
    });
});
