import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    MYPOS_TEST, betaalFormulierHtml, centenNaarBedrag, leesBetaalbericht, onderteken, purchaseVelden, verifieer, veldenUitBody,
    type Velden,
} from './ipc';

/* Een eigen sleutelpaar speelt "myPOS" voor de inkomende berichten: alleen
   myPOS zelf kan met hun private key ondertekenen, dus voor de test doen
   we alsof wij myPOS zijn. */
const paar = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privKey = paar.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
const pubKey = paar.publicKey.export({ type: 'spki', format: 'pem' }) as string;

function ondertekendBericht(velden: Velden, key = privKey): string {
    const sig = onderteken(velden, key);
    return new URLSearchParams([...velden, ['Signature', sig]]).toString();
}

describe('handtekening', () => {
    it('ondertekent en verifieert in de volgorde van de velden', () => {
        const velden: Velden = [['IPCmethod', 'IPCPurchaseNotify'], ['OrderID', 'HB-2026-0001-1'], ['Amount', '23.50']];
        const sig = onderteken(velden, privKey);
        expect(verifieer([...velden, ['Signature', sig]], pubKey)).toBe(true);
        // Andere volgorde, zelfde waarden: geen geldige handtekening.
        expect(verifieer([velden[1]!, velden[0]!, velden[2]!, ['Signature', sig]], pubKey)).toBe(false);
        // Eén cent anders: geen geldige handtekening.
        expect(verifieer([velden[0]!, velden[1]!, ['Amount', '23.51'], ['Signature', sig]], pubKey)).toBe(false);
        // Zonder handtekening of met rommel: nee, zonder exception.
        expect(verifieer(velden, pubKey)).toBe(false);
        expect(verifieer([...velden, ['Signature', 'rommel']], pubKey)).toBe(false);
        expect(verifieer([...velden, ['Signature', sig]], 'geen certificaat')).toBe(false);
    });

    it('de vaste testsleutel van myPOS is een werkend sleutelpaar', () => {
        const pub = createPublicKey(MYPOS_TEST.privateKey).export({ type: 'spki', format: 'pem' }) as string;
        const velden: Velden = [['a', '1'], ['b', '2']];
        expect(verifieer([...velden, ['Signature', onderteken(velden, MYPOS_TEST.privateKey)]], pub)).toBe(true);
        // En het certificaat van myPOS is leesbaar als sleutel (anders faalt elke webhook stil).
        expect(() => createPublicKey(MYPOS_TEST.myposCert)).not.toThrow();
    });
});

describe('IPCPurchase', () => {
    const aanvraag = {
        orderId: 'HB-2026-0042-1',
        totaalCenten: 17940 + 695,
        regels: [{ naam: 'Borrel Journey (12 personen)', aantal: 12, stukCenten: 1495 }],
        leverkostenCenten: 695,
        urlOk: 'https://hopbites.nl/bestelling/tok',
        urlCancel: 'https://hopbites.nl/bestelling/tok',
        urlNotify: 'https://bbq-architect-v2.vercel.app/api/public-winkel/hop-en-bites/mypos-webhook',
        klant: { email: 'test@voorbeeld.nl', voornaam: 'Test', achternaam: 'Persoon', telefoon: '0612345678' },
    };

    it('bouwt de velden in SDK-volgorde, met de handtekening als laatste', () => {
        const v = purchaseVelden(MYPOS_TEST, aanvraag);
        const namen = v.map(([k]) => k);
        expect(namen.slice(0, 8)).toEqual(['IPCmethod', 'IPCVersion', 'IPCLanguage', 'SID', 'WalletNumber', 'Amount', 'Currency', 'OrderID']);
        expect(namen.at(-1)).toBe('Signature');
        const o = Object.fromEntries(v);
        expect(o.Amount).toBe('186.35');
        expect(o.CartItems).toBe('2');
        expect(o.Article_2).toBe('Verzendkosten');
        expect(o.Amount_1).toBe('179.40');
        expect(o.Price_1).toBe('14.95');
        expect(o.PaymentMethod).toBe('3');
        expect(o.customercountry).toBe('NLD');
        // De handtekening klopt met de eigen publieke sleutel van de testkey.
        const pub = createPublicKey(MYPOS_TEST.privateKey).export({ type: 'spki', format: 'pem' }) as string;
        expect(verifieer(v, pub)).toBe(true);
    });

    it('weigert regels die niet optellen tot het totaal', () => {
        expect(() => purchaseVelden(MYPOS_TEST, { ...aanvraag, totaalCenten: 1 })).toThrow(/tellen niet op/);
        expect(() => purchaseVelden(MYPOS_TEST, { ...aanvraag, orderId: 'x'.repeat(81) })).toThrow(/80/);
    });

    it('centen naar een bedrag met punt en twee decimalen', () => {
        expect(centenNaarBedrag(2350)).toBe('23.50');
        expect(centenNaarBedrag(5)).toBe('0.05');
        expect(centenNaarBedrag(100000)).toBe('1000.00');
    });

    it('het formulier post naar myPOS en ontsnapt de waarden', () => {
        const html = betaalFormulierHtml(MYPOS_TEST, purchaseVelden(MYPOS_TEST, { ...aanvraag, note: '<b>"x"</b>' }));
        expect(html).toContain(`action="${MYPOS_TEST.ipcUrl}"`);
        expect(html).toContain('name="Signature"');
        expect(html).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
        expect(html).not.toContain('<b>"x"</b>');
    });
});

describe('IPCPurchaseNotify', () => {
    const velden: Velden = [
        ['IPCmethod', 'IPCPurchaseNotify'], ['SID', MYPOS_TEST.sid], ['Amount', '23.50'], ['Currency', 'EUR'],
        ['OrderID', 'HB-2026-0001-1'], ['IPC_Trnref', 'TRN123'], ['RequestDateTime', '20260913120000'],
        ['RequestSTAN', '000042'], ['PaymentMethod', '2'],
    ];

    it('leest een geldig bericht', () => {
        const b = leesBetaalbericht(ondertekendBericht(velden), pubKey);
        expect(b).toMatchObject({ methode: 'IPCPurchaseNotify', orderId: 'HB-2026-0001-1', trnref: 'TRN123', amountCenten: 2350, currency: 'EUR', stan: '000042', paymentMethod: '2' });
    });

    it('weigert een bericht met een verkeerde handtekening of van een andere sleutel', () => {
        const ander = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
        expect(leesBetaalbericht(ondertekendBericht(velden, ander), pubKey)).toBeNull();
        const body = ondertekendBericht(velden).replace('Amount=23.50', 'Amount=0.01');
        expect(leesBetaalbericht(body, pubKey)).toBeNull();
        expect(leesBetaalbericht('', pubKey)).toBeNull();
        expect(leesBetaalbericht('a=1', pubKey)).toBeNull();
    });

    it('veldenUitBody bewaart de volgorde', () => {
        expect(veldenUitBody('b=2&a=1&Signature=x').map(([k]) => k)).toEqual(['b', 'a', 'Signature']);
    });
});
