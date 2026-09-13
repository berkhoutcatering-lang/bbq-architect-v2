import { createVerify } from 'node:crypto';
import { MYPOS_TEST } from '../../src/lib/mypos/ipc';
const json = JSON.parse(`{"IPCMethod":"IPCGetTxnStatus","OrderID":"HB-2026-0001-1","OrderStatus":{"IPCmethod":"IPCPurchaseRollback","SID":"000000000000010","Amount":"164.50","Currency":"EUR","OrderID":"HB-2026-0001-1","Signature":"pXa7nGxqtdXJom5SMJt+5k4MwemR7sUhUORHdVJNOCeToWEzLIHht4Jrazo7vaawPcZ0hAu4EUJedbir/ekrBxRYnJsWZQhM44poH6ZmkP80KXDZEsjRMHGU0N8+TUEtAG9XCRJaO1fJOHNUhyo17DWYzv54rt8+5iSxXSiJ904="},"Status":0,"StatusMsg":"Success","Signature":"JHPrEV8eoafHqw583UkJTdkLRz0ZijBIHA2wbiAPmAWFSc28NpiIDnHvfMCQpCzeqEVVkuDJ5R2UUzgModd5JRpLOUc00oVgLTGrIrULjx1obo0fy/1ivHICJpByZq/hWIDxR+jvTlV5uL9jJAXngXt+VD4WAKlClImTSUirt3M="}`);
function plat(o: Record<string, unknown>, metSig: boolean): string[] {
  const uit: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (k === 'Signature' && !metSig) continue;
    if (v && typeof v === 'object') uit.push(...plat(v as Record<string, unknown>, true));
    else uit.push(String(v));
  }
  return uit;
}
for (const variant of ['binnen-sig', 'zonder-binnen-sig']) {
  const waarden = variant === 'binnen-sig' ? plat(json, false) : (() => { const c = structuredClone(json); delete c.OrderStatus.Signature; return plat(c, false); })();
  const v = createVerify('RSA-SHA256'); v.update(Buffer.from(waarden.join('-')).toString('base64'));
  console.log(variant, v.verify(MYPOS_TEST.myposCert, json.Signature, 'base64'));
}
// binnenste
const inner = json.OrderStatus; const w = plat(inner, false);
const v2 = createVerify('RSA-SHA256'); v2.update(Buffer.from(w.join('-')).toString('base64'));
console.log('binnenste apart', v2.verify(MYPOS_TEST.myposCert, inner.Signature, 'base64'));
