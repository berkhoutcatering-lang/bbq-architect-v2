#!/usr/bin/env node
/**
 * Zet het myPOS-configuratiepakket om naar regels in .env.local.
 *
 * Het pakket (.mypos/config.b64) is de base64 van een JSON met vijf velden:
 *   sid  → MYPOS_SID               (Store ID)
 *   cn   → MYPOS_CLIENT_NUMBER     (klantnummer / WalletNumber)
 *   idx  → MYPOS_KEY_INDEX         (welk sleutelpaar)
 *   pk   → MYPOS_PRIVATE_KEY       (onze private key, PEM)
 *   pc   → MYPOS_PUBLIC_CERT       (het certificaat van myPOS, PEM)
 *
 * Bestaande regels met dezelfde naam worden vervangen; de rest van .env.local
 * blijft staan. De PEM-waarden gaan in dubbele aanhalingstekens met \n, zoals
 * Next.js ze leest.
 *
 *   node scripts/mypos-config-naar-env.mjs            # schrijft .env.local
 *   node scripts/mypos-config-naar-env.mjs --toon     # toont alleen de namen
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pakket = resolve(root, '.mypos/config.b64');
const env = resolve(root, '.env.local');

if (!existsSync(pakket)) {
    console.error('Geen .mypos/config.b64 gevonden. Kopieer het configuratiepakket uit myPOS naar dat bestand.');
    process.exit(1);
}

const json = JSON.parse(Buffer.from(readFileSync(pakket, 'utf8').trim(), 'base64').toString('utf8'));
const vereist = ['sid', 'cn', 'idx', 'pk', 'pc'];
for (const k of vereist) {
    if (!json[k]) {
        console.error(`Veld "${k}" ontbreekt in het pakket.`);
        process.exit(1);
    }
}

const regels = {
    MYPOS_SID: json.sid,
    MYPOS_CLIENT_NUMBER: json.cn,
    MYPOS_KEY_INDEX: String(json.idx),
    MYPOS_PRIVATE_KEY: json.pk,
    MYPOS_PUBLIC_CERT: json.pc,
};

if (process.argv.includes('--toon')) {
    for (const [k, v] of Object.entries(regels)) console.log(`${k}: ${v.length} tekens`);
    process.exit(0);
}

const quote = (v) => `"${v.replace(/\r?\n/g, '\\n')}"`;
const bestaand = existsSync(env) ? readFileSync(env, 'utf8') : '';
const namen = new Set(Object.keys(regels));
const behouden = bestaand
    .split('\n')
    .filter((r) => !namen.has(r.split('=')[0]))
    .join('\n')
    .replace(/\n+$/, '');

const nieuw = Object.entries(regels).map(([k, v]) => `${k}=${quote(v)}`).join('\n');
writeFileSync(env, `${behouden}\n\n# myPOS (uit .mypos/config.b64 via scripts/mypos-config-naar-env.mjs)\n${nieuw}\n`);
console.log(`Vijf MYPOS_-regels geschreven naar ${env}.`);
