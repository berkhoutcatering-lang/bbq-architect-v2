import { MYPOS_TEST, onderteken, verifieer, type Velden } from '../../src/lib/mypos/ipc';
async function main() {
    const velden: Velden = [['IPCmethod', 'IPCGetTxnStatus'], ['IPCVersion', '1.4'], ['IPCLanguage', 'NL'], ['SID', MYPOS_TEST.sid], ['WalletNumber', MYPOS_TEST.walletNumber], ['KeyIndex', '1'], ['OrderID', process.argv[2]!], ['OutputFormat', 'json']];
    velden.push(['Signature', onderteken(velden, MYPOS_TEST.privateKey)]);
    const res = await fetch(MYPOS_TEST.ipcUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(velden).toString() });
    const tekst = await res.text();
    console.log(tekst);
    const json = JSON.parse(tekst);
    const v = Object.entries(json).map(([k, x]) => [k, String(x)]) as Velden;
    console.log('verifieert:', verifieer(v, MYPOS_TEST.myposCert));
    // Zonder geneste objecten?
    console.log(Object.entries(json).map(([k, x]) => `${k}: ${typeof x}`).join(', '));
}
main();
