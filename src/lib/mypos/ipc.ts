/**
 * myPOS Checkout API (IPC, versie 1.4) — het deel dat de kassa nodig heeft.
 *
 * Drie aanroepen:
 *   IPCPurchase       de klant wordt met een formulier-POST naar de betaalpagina
 *                     van myPOS gestuurd (wij bouwen dat formulier)
 *   IPCGetTxnStatus   server-naar-server: is OrderID betaald?
 *   IPCRefund         server-naar-server: bedrag terugbetalen
 * En één inkomend bericht:
 *   IPCPurchaseNotify myPOS post de betaling naar onze webhook; wij antwoorden 'OK'
 *
 * Handtekening (zo doet de officiële PHP-SDK het):
 *   uitgaand: alle velden in volgorde, waarden aaneengeregen met '-', base64,
 *             RSA-SHA256 met ONZE private key, base64
 *   inkomend: alle velden behalve Signature, in de volgorde van het bericht,
 *             zelfde aaneenrijging, verifiëren met het certificaat VAN MYPOS
 *
 * Deze module raakt geen database en geen Next: alleen sleutels, tekst en
 * fetch. Zo is hij te testen met een eigen sleutelpaar.
 */
import { createSign, createVerify } from 'node:crypto';

export interface MyposConfig {
    sid: string;
    walletNumber: string;
    keyIndex: string;
    privateKey: string;
    /** Het certificaat van myPOS (niet het onze) waarmee inkomende berichten geverifieerd worden. */
    myposCert: string;
    ipcUrl: string;
    /** Taal van de betaalpagina. */
    taal?: string;
}

/** De vaste testomgeving van myPOS (developers.mypos.com → Test data). */
export const MYPOS_TEST: MyposConfig = {
    sid: '000000000000010',
    walletNumber: '61938166610',
    keyIndex: '1',
    ipcUrl: 'https://www.mypos.com/vmp/checkout-test',
    taal: 'NL',
    privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIICXAIBAAKBgQCf0TdcTuphb7X+Zwekt1XKEWZDczSGecfo6vQfqvraf5VPzcnJ
2Mc5J72HBm0u98EJHan+nle2WOZMVGItTa/2k1FRWwbt7iQ5dzDh5PEeZASg2UWe
hoR8L8MpNBqH6h7ZITwVTfRS4LsBvlEfT7Pzhm5YJKfM+CdzDM+L9WVEGwIDAQAB
AoGAYfKxwUtEbq8ulVrD3nnWhF+hk1k6KejdUq0dLYN29w8WjbCMKb9IaokmqWiQ
5iZGErYxh7G4BDP8AW/+M9HXM4oqm5SEkaxhbTlgks+E1s9dTpdFQvL76TvodqSy
l2E2BghVgLLgkdhRn9buaFzYta95JKfgyKGonNxsQA39PwECQQDKbG0Kp6KEkNgB
srCq3Cx2od5OfiPDG8g3RYZKx/O9dMy5CM160DwusVJpuywbpRhcWr3gkz0QgRMd
IRVwyxNbAkEAyh3sipmcgN7SD8xBG/MtBYPqWP1vxhSVYPfJzuPU3gS5MRJzQHBz
sVCLhTBY7hHSoqiqlqWYasi81JzBEwEuQQJBAKw9qGcZjyMH8JU5TDSGllr3jybx
FFMPj8TgJs346AB8ozqLL/ThvWPpxHttJbH8QAdNuyWdg6dIfVAa95h7Y+MCQEZg
jRDl1Bz7eWGO2c0Fq9OTz3IVLWpnmGwfW+HyaxizxFhV+FOj1GUVir9hylV7V0DU
QjIajyv/oeDWhFQ9wQECQCydhJ6NaNQOCZh+6QTrH3TC5MeBA1Yeipoe7+BhsLNr
cFG8s9sTxRnltcZl1dXaBSemvpNvBizn0Kzi8G3ZAgc=
-----END RSA PRIVATE KEY-----`,
    myposCert: `-----BEGIN CERTIFICATE-----
MIIBsTCCARoCCQCCPjNttGNQWDANBgkqhkiG9w0BAQsFADAdMQswCQYDVQQGEwJC
RzEOMAwGA1UECgwFbXlQT1MwHhcNMTgxMDEyMDcwOTEzWhcNMjgxMDA5MDcwOTEz
WjAdMQswCQYDVQQGEwJCRzEOMAwGA1UECgwFbXlQT1MwgZ8wDQYJKoZIhvcNAQEB
BQADgY0AMIGJAoGBAML+VTmiY4yChoOTMZTXAIG/mk+xf/9mjwHxWzxtBJbNncNK
0OLI0VXYKW2GgVklGHHQjvew1hTFkEGjnCJ7f5CDnbgxevtyASDGst92a6xcAedE
adP0nFXhUz+cYYIgIcgfDcX3ZWeNEF5kscqy52kpD2O7nFNCV+85vS4duJBNAgMB
AAEwDQYJKoZIhvcNAQELBQADgYEACj0xb+tNYERJkL+p+zDcBsBK4RvknPlpk+YP
ephunG2dBGOmg/WKgoD1PLWD2bEfGgJxYBIg9r1wLYpDC1txhxV+2OBQS86KULh0
NEcr0qEY05mI4FlE+D/BpT/+WFyKkZug92rK0Flz71Xy/9mBXbQfm+YK6l9roRYd
J4sHeQc=
-----END CERTIFICATE-----`,
};

export const MYPOS_PRODUCTIE_URL = 'https://www.mypos.com/vmp/checkout';

/* ── Handtekening ──────────────────────────────────────────────────────────── */

/** Geordende velden: de volgorde ís de handtekening, dus geen object maar paren. */
export type Velden = [string, string][];

function aaneen(velden: Velden): string {
    return Buffer.from(velden.map(([, v]) => v).join('-'), 'utf8').toString('base64');
}

export function onderteken(velden: Velden, privateKey: string): string {
    const s = createSign('RSA-SHA256');
    s.update(aaneen(velden));
    return s.sign(privateKey, 'base64');
}

/**
 * Verifieert een inkomend bericht. `velden` in de volgorde van het bericht,
 * inclusief het Signature-veld (dat wordt eruit gehaald).
 */
export function verifieer(velden: Velden, cert: string): boolean {
    const sig = velden.find(([k]) => k === 'Signature')?.[1];
    if (!sig) return false;
    const rest = velden.filter(([k]) => k !== 'Signature');
    try {
        const v = createVerify('RSA-SHA256');
        v.update(aaneen(rest));
        return v.verify(cert, sig, 'base64');
    } catch {
        return false;
    }
}

/** Van een x-www-form-urlencoded body naar geordende velden. */
export function veldenUitBody(body: string): Velden {
    return [...new URLSearchParams(body).entries()];
}

/* ── IPCPurchase: het betaalformulier ──────────────────────────────────────── */

export interface Betaalregel {
    naam: string;
    aantal: number;
    /** Per stuk, in centen. */
    stukCenten: number;
}

export interface BetaalAanvraag {
    /** Uniek per poging, max 80 tekens. */
    orderId: string;
    totaalCenten: number;
    regels: Betaalregel[];
    /** Verzendkosten, in centen; 0 = geen regel. */
    leverkostenCenten: number;
    urlOk: string;
    urlCancel: string;
    urlNotify: string;
    /**
     * Klantgegevens vooraf meegeven (PaymentParametersRequired 1). Dan zijn
     * óók adres, postcode en plaats verplicht op de betaalpagina; bij afhalen
     * hebben we die niet. Weggelaten = alleen kaartgegevens (3): de klant ziet
     * op de betaalpagina niets anders dan de betaalmethode.
     */
    klant?: { email: string; voornaam: string; achternaam: string; telefoon?: string; plaats: string; postcode: string; adres: string };
    note?: string;
}

export function centenNaarBedrag(centen: number): string {
    return (centen / 100).toFixed(2);
}

/**
 * De velden van een IPCPurchase, in de volgorde die de SDK gebruikt, met
 * handtekening als laatste. PaymentMethod 3 = alles (kaart én iDEAL).
 * Zonder `klant` gaat PaymentParametersRequired op 3 en blijven de
 * klantvelden weg, precies zoals de officiële SDK dat doet.
 */
export function purchaseVelden(cfg: MyposConfig, a: BetaalAanvraag): Velden {
    if (a.orderId.length > 80) throw new Error('OrderID langer dan 80 tekens');
    const regels: Betaalregel[] = [...a.regels];
    if (a.leverkostenCenten > 0) regels.push({ naam: 'Verzendkosten', aantal: 1, stukCenten: a.leverkostenCenten });
    const som = regels.reduce((s, r) => s + r.aantal * r.stukCenten, 0);
    if (som !== a.totaalCenten) throw new Error(`Regels (${som}) tellen niet op tot het totaal (${a.totaalCenten})`);

    const velden: Velden = [
        ['IPCmethod', 'IPCPurchase'],
        ['IPCVersion', '1.4'],
        ['IPCLanguage', cfg.taal ?? 'NL'],
        ['SID', cfg.sid],
        ['WalletNumber', cfg.walletNumber],
        ['Amount', centenNaarBedrag(a.totaalCenten)],
        ['Currency', 'EUR'],
        ['OrderID', a.orderId],
        ['URL_OK', a.urlOk],
        ['URL_Cancel', a.urlCancel],
        ['URL_Notify', a.urlNotify],
        ['CardTokenRequest', '0'],
        ['KeyIndex', cfg.keyIndex],
        ['PaymentParametersRequired', a.klant ? '1' : '3'],
        ['PaymentMethod', '3'],
    ];
    if (a.klant) {
        velden.push(
            ['customeremail', a.klant.email],
            ['customerfirstnames', a.klant.voornaam],
            ['customerfamilyname', a.klant.achternaam],
            ['customerphone', a.klant.telefoon ?? ''],
            ['customercountry', 'NLD'],
            ['customercity', a.klant.plaats],
            ['customerzipcode', a.klant.postcode],
            ['customeraddress', a.klant.adres],
        );
    }
    velden.push(['Note', a.note ?? ''], ['CartItems', String(regels.length)]);
    regels.forEach((r, i) => {
        const n = i + 1;
        velden.push(
            [`Article_${n}`, r.naam],
            [`Quantity_${n}`, String(r.aantal)],
            [`Price_${n}`, centenNaarBedrag(r.stukCenten)],
            [`Amount_${n}`, centenNaarBedrag(r.aantal * r.stukCenten)],
            [`Currency_${n}`, 'EUR'],
        );
    });
    velden.push(['Signature', onderteken(velden, cfg.privateKey)]);
    return velden;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Een pagina die zichzelf naar myPOS post. De klant ziet hem hooguit een
 * tel; zonder JavaScript is er een knop.
 */
export function betaalFormulierHtml(cfg: MyposConfig, velden: Velden, titel = 'Naar de betaalpagina…'): string {
    const inputs = velden
        .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
        .join('\n');
    return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${escapeHtml(titel)}</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#333}p{margin:0 0 16px}button{font:inherit;padding:10px 20px}</style>
</head><body>
<form method="post" action="${escapeHtml(cfg.ipcUrl)}" id="f">
${inputs}
<div><p>Je gaat naar de beveiligde betaalpagina van myPOS.</p><button type="submit">Doorgaan naar betalen</button></div>
</form>
<script>document.getElementById('f').submit();</script>
</body></html>`;
}

/* ── Server-naar-server ────────────────────────────────────────────────────── */

/**
 * Een JSON-antwoord van myPOS is ondertekend over álle waarden, in volgorde,
 * geneste objecten platgeslagen (inclusief hún Signature), en alleen de
 * buitenste Signature weggelaten. Gemeten op een echt antwoord uit de
 * testomgeving, niet uit de documentatie.
 */
function platteWaarden(o: Record<string, unknown>, buitenste: boolean): string[] {
    const uit: string[] = [];
    for (const [k, v] of Object.entries(o)) {
        if (buitenste && k === 'Signature') continue;
        if (v && typeof v === 'object') uit.push(...platteWaarden(v as Record<string, unknown>, false));
        else uit.push(String(v));
    }
    return uit;
}

export function verifieerJson(json: Record<string, unknown>, cert: string): boolean {
    const sig = json.Signature;
    if (typeof sig !== 'string') return false;
    try {
        const v = createVerify('RSA-SHA256');
        v.update(Buffer.from(platteWaarden(json, true).join('-'), 'utf8').toString('base64'));
        return v.verify(cert, sig, 'base64');
    } catch {
        return false;
    }
}

interface MyposAntwoord {
    /** Status 0 én een geldige handtekening. */
    ok: boolean;
    status: number | null;
    statusMsg: string | null;
    json: Record<string, unknown>;
}

async function postNaarMypos(cfg: MyposConfig, velden: Velden, timeoutMs = 8000): Promise<MyposAntwoord> {
    const stop = new AbortController();
    const klok = setTimeout(() => stop.abort(), timeoutMs);
    try {
        const res = await fetch(cfg.ipcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(velden).toString(),
            signal: stop.signal,
        });
        const tekst = await res.text();
        let json: Record<string, unknown>;
        try {
            json = JSON.parse(tekst) as Record<string, unknown>;
        } catch {
            return { ok: false, status: null, statusMsg: `geen JSON (HTTP ${res.status})`, json: { _ruw: tekst } };
        }
        if (!verifieerJson(json, cfg.myposCert)) {
            return { ok: false, status: null, statusMsg: 'handtekening klopt niet', json };
        }
        const status = json.Status != null ? Number(json.Status) : null;
        return { ok: status === 0, status, statusMsg: json.StatusMsg != null ? String(json.StatusMsg) : null, json };
    } finally {
        clearTimeout(klok);
    }
}

function naarCenten(bedrag: unknown): number | null {
    if (bedrag == null || bedrag === '') return null;
    const n = Number(bedrag);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export interface TxnStatus {
    /** De statusvraag zelf is gelukt (de order is bekend bij myPOS). */
    ok: boolean;
    /** De laatste gebeurtenis was een betaling (OrderStatus.IPCmethod = IPCPurchaseNotify). */
    betaald: boolean;
    /** IPCPurchaseNotify, IPCPurchaseRollback, … of null als er nog niets gebeurd is. */
    laatste: string | null;
    trnref: string | null;
    amountCenten: number | null;
    statusMsg: string | null;
    ruw: Record<string, unknown>;
}

/**
 * Is deze OrderID bij myPOS betaald? (IPCGetTxnStatus) Status 0 betekent
 * alleen "de vraag is beantwoord"; wat er met de betaling gebeurd is staat in
 * het geneste OrderStatus.
 */
export async function getTxnStatus(cfg: MyposConfig, orderId: string): Promise<TxnStatus> {
    const velden: Velden = [
        ['IPCmethod', 'IPCGetTxnStatus'],
        ['IPCVersion', '1.4'],
        ['IPCLanguage', cfg.taal ?? 'NL'],
        ['SID', cfg.sid],
        ['WalletNumber', cfg.walletNumber],
        ['KeyIndex', cfg.keyIndex],
        ['OrderID', orderId],
        ['OutputFormat', 'json'],
    ];
    velden.push(['Signature', onderteken(velden, cfg.privateKey)]);
    const a = await postNaarMypos(cfg, velden);
    const os = (a.json.OrderStatus && typeof a.json.OrderStatus === 'object' ? a.json.OrderStatus : null) as Record<string, unknown> | null;
    const laatste = os && typeof os.IPCmethod === 'string' ? os.IPCmethod : null;
    return {
        ok: a.ok,
        betaald: a.ok && laatste === 'IPCPurchaseNotify',
        laatste,
        trnref: os && typeof os.IPC_Trnref === 'string' ? os.IPC_Trnref : null,
        amountCenten: os ? naarCenten(os.Amount) : null,
        statusMsg: a.statusMsg,
        ruw: a.json,
    };
}

/** Bedrag terugbetalen op een transactie. (IPCRefund) */
export async function refund(cfg: MyposConfig, args: { orderId: string; trnref: string; centen: number }): Promise<{ ok: boolean; status: number | null; statusMsg: string | null; ruw: Record<string, unknown> }> {
    const velden: Velden = [
        ['IPCmethod', 'IPCRefund'],
        ['IPCVersion', '1.4'],
        ['IPCLanguage', cfg.taal ?? 'NL'],
        ['SID', cfg.sid],
        ['WalletNumber', cfg.walletNumber],
        ['KeyIndex', cfg.keyIndex],
        ['Currency', 'EUR'],
        ['Amount', centenNaarBedrag(args.centen)],
        ['OrderID', args.orderId],
        ['IPC_Trnref', args.trnref],
        ['OutputFormat', 'json'],
    ];
    velden.push(['Signature', onderteken(velden, cfg.privateKey)]);
    const a = await postNaarMypos(cfg, velden);
    return { ok: a.ok, status: a.status, statusMsg: a.statusMsg, ruw: a.json };
}

/* ── IPCPurchaseNotify: het inkomende bericht ──────────────────────────────── */

export interface Betaalbericht {
    methode: string;
    orderId: string;
    trnref: string;
    amountCenten: number | null;
    currency: string;
    stan: string | null;
    paymentMethod: string | null;
    velden: Record<string, string>;
}

/**
 * Leest en verifieert een betaalbericht. null = handtekening klopt niet of
 * het is geen betaalbericht — dan doen we niets en zeggen dat ook.
 */
export function leesBetaalbericht(body: string, cert: string): Betaalbericht | null {
    const velden = veldenUitBody(body);
    if (!velden.length || !verifieer(velden, cert)) return null;
    const o = Object.fromEntries(velden);
    if (!o.OrderID || !o.IPCmethod) return null;
    return {
        methode: o.IPCmethod,
        orderId: o.OrderID,
        trnref: o.IPC_Trnref ?? '',
        amountCenten: naarCenten(o.Amount),
        currency: o.Currency ?? '',
        stan: o.RequestSTAN ?? null,
        paymentMethod: o.PaymentMethod ?? null,
        velden: o,
    };
}
