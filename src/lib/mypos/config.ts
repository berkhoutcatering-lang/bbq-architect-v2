/**
 * Welke myPOS-instellingen gelden: de testomgeving of de productiesleutels.
 *
 * MYPOS_TEST_MODE=1 → de vaste testinstellingen van myPOS (geen echt geld,
 * testkaarten). Anders de vijf MYPOS_-variabelen uit het configuratiepakket
 * (scripts/mypos-config-naar-env.mjs). Ontbreekt er één, dan is er geen
 * configuratie en kan de kassa geen betaling starten — dat melden de routes
 * als 'niet-beschikbaar', nooit als een halve betaling.
 */
import { MYPOS_PRODUCTIE_URL, MYPOS_TEST, type MyposConfig } from './ipc';

export function isTestModus(): boolean {
    return process.env.MYPOS_TEST_MODE === '1';
}

/** PEM-waarden in .env staan met \n; Next leest die als letterlijke backslash-n. */
function pem(v: string | undefined): string {
    return (v ?? '').replace(/\\n/g, '\n').trim();
}

export function myposConfig(): MyposConfig | null {
    if (isTestModus()) return MYPOS_TEST;
    const sid = process.env.MYPOS_SID;
    const walletNumber = process.env.MYPOS_CLIENT_NUMBER;
    const keyIndex = process.env.MYPOS_KEY_INDEX;
    const privateKey = pem(process.env.MYPOS_PRIVATE_KEY);
    const myposCert = pem(process.env.MYPOS_PUBLIC_CERT);
    if (!sid || !walletNumber || !keyIndex || !privateKey || !myposCert) return null;
    return { sid, walletNumber, keyIndex, privateKey, myposCert, ipcUrl: MYPOS_PRODUCTIE_URL, taal: 'NL' };
}
