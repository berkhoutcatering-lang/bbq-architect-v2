/* Lokale doorloop van de webhook-keten tegen de echte database, met een eigen
   sleutelpaar in de rol van myPOS. */
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}
import { MYPOS_TEST, onderteken, type Velden } from '../../src/lib/mypos/ipc';
import { maakSupabaseStore } from '../../src/lib/winkel/supabaseStore';
import { haalStatus, verwerkBetaalbericht, type KassaContext } from '../../src/lib/winkel/kassa';
import { stuurBevestigingsmail } from '../../src/lib/winkel/mail';

const paar = generateKeyPairSync('rsa', { modulusLength: 2048 });
const priv = paar.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
const pub = paar.publicKey.export({ type: 'spki', format: 'pem' }) as string;

const token = process.argv[2];
const orderId = process.argv[3];
const bedrag = process.argv[4];
const trn = process.argv[5] ?? `LOKAAL-${Date.now()}`;

const ctx: KassaContext = {
    store: maakSupabaseStore(),
    mypos: { ...MYPOS_TEST, myposCert: pub },
    appUrl: 'http://localhost:3000',
    mail: stuurBevestigingsmail,
};

async function main() {
    const velden: Velden = [
        ['IPCmethod', 'IPCPurchaseNotify'], ['SID', MYPOS_TEST.sid], ['Amount', bedrag], ['Currency', 'EUR'], ['OrderID', orderId],
        ['IPC_Trnref', trn], ['RequestDateTime', '20260913160000'], ['RequestSTAN', '000007'], ['PaymentMethod', '1'], ['CardType', '1'],
    ];
    const body = new URLSearchParams([...velden, ['Signature', onderteken(velden, priv)]]).toString();
    console.log('webhook 1:', await verwerkBetaalbericht(ctx, 'hop-en-bites', body));
    console.log('webhook 2 (zelfde bericht):', await verwerkBetaalbericht(ctx, 'hop-en-bites', body));
    const kapot = body.replace(`Amount=${encodeURIComponent(bedrag)}`, 'Amount=1.00');
    console.log('webhook 3 (vervalste handtekening):', await verwerkBetaalbericht(ctx, 'hop-en-bites', kapot));
    const s = await haalStatus(ctx, 'hop-en-bites', token);
    console.log('status:', JSON.stringify((s.body as any).status, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
