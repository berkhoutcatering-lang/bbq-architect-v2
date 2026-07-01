/**
 * Bankafschrift-import + afletteren.
 *
 * parseBankStatement() leest de twee formaten die elke NL-bank exporteert:
 *   - CAMT.053 (ISO 20022 XML — de moderne standaard)
 *   - MT940 (het klassieke tekstformaat)
 * en normaliseert naar één BankTransactie-shape.
 *
 * matchTransactions() suggereert per binnenkomende betaling welke factuur erbij
 * hoort (op nummer, bedrag en klantnaam). Puur data → suggestie; de gebruiker
 * bevestigt. Geen AI in de loop.
 */

import { XMLParser } from 'fast-xml-parser';

export interface BankTransactie {
    datum: string;              /* YYYY-MM-DD */
    bedrag: number;             /* + = bij (binnenkomend), - = af (uitgaand) */
    tegenrekening?: string;
    tegennaam?: string;
    omschrijving: string;
    bank_ref?: string;
    dedup_key: string;          /* stabiele sleutel voor idempotente her-import */
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
}

function makeDedupKey(t: Omit<BankTransactie, 'dedup_key'>): string {
    return [t.datum, t.bedrag.toFixed(2), t.tegenrekening || '', (t.omschrijving || '').slice(0, 60), t.bank_ref || '']
        .join('|').toLowerCase();
}

/* ── CAMT.053 (ISO 20022 XML) ── */
export function parseCamt053(xml: string): BankTransactie[] {
    const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });
    const doc = parser.parse(xml);
    const stmts = toArray(doc?.Document?.BkToCstmrStmt?.Stmt);
    const out: BankTransactie[] = [];
    for (const stmt of stmts) {
        for (const ntry of toArray(stmt?.Ntry)) {
            const cdtDbt = String(ntry?.CdtDbtInd || 'CRDT');
            const sign = cdtDbt === 'DBIT' ? -1 : 1;
            const rawAmt = typeof ntry?.Amt === 'object' ? ntry.Amt['#text'] : ntry?.Amt;
            const bedrag = sign * (Number(String(rawAmt ?? '0').replace(',', '.')) || 0);
            const datum = ntry?.BookgDt?.Dt || ntry?.ValDt?.Dt || '';
            const bankRef = ntry?.NtryRef || ntry?.AcctSvcrRef || undefined;
            /* TxDtls kan meervoudig; we pakken de eerste voor tegenpartij + omschrijving. */
            const txDtls = toArray(ntry?.NtryDtls?.TxDtls)[0];
            const ustrd = toArray(txDtls?.RmtInf?.Ustrd).join(' ').trim();
            const omschrijving = ustrd || String(ntry?.AddtlNtryInf || '').trim();
            const partij = sign > 0 ? txDtls?.RltdPties?.Dbtr : txDtls?.RltdPties?.Cdtr;
            const tegennaam = (typeof partij === 'object' ? partij?.Nm : partij) || undefined;
            const acct = sign > 0 ? txDtls?.RltdPties?.DbtrAcct : txDtls?.RltdPties?.CdtrAcct;
            const tegenrekening = acct?.Id?.IBAN || undefined;
            const base = {
                datum: String(datum).slice(0, 10),
                bedrag: Math.round(bedrag * 100) / 100,
                tegenrekening: tegenrekening ? String(tegenrekening) : undefined,
                tegennaam: tegennaam ? String(tegennaam) : undefined,
                omschrijving,
                bank_ref: bankRef ? String(bankRef) : undefined,
            };
            out.push({ ...base, dedup_key: makeDedupKey(base) });
        }
    }
    return out;
}

/* ── MT940 (tekst) ── */
export function parseMt940(text: string): BankTransactie[] {
    const out: BankTransactie[] = [];
    /* Splits op :61: transactieregels; :86: volgt met omschrijving. */
    const blocks = text.split(/(?=:61:)/).filter(b => b.startsWith(':61:'));
    for (const block of blocks) {
        const m61 = /:61:(\d{6})(\d{4})?([CD])R?([\d.,]+)/.exec(block);
        if (!m61) continue;
        const [, yymmdd, , dc, amtRaw] = m61;
        const yy = Number(yymmdd.slice(0, 2));
        const datum = `20${yy < 70 ? String(yy).padStart(2, '0') : yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
        const sign = dc === 'D' ? -1 : 1;
        const bedrag = sign * (Number(amtRaw.replace(/\./g, '').replace(',', '.')) || 0);
        const m86 = /:86:([\s\S]*?)(?=(:6\d:|:86:|$))/.exec(block);
        const info86 = (m86?.[1] || '').replace(/\s+/g, ' ').trim();
        /* SEPA-subvelden /NAME/ /IBAN/ /REMI/ eruit peuteren als aanwezig. */
        const tegennaam = /\/(?:NAME|NAAM)\/([^/]+)/i.exec(info86)?.[1]?.trim();
        const tegenrekening = /\/(?:IBAN)\/([A-Z0-9]+)/i.exec(info86)?.[1]?.trim();
        const remi = /\/(?:REMI|OMSCHRIJVING)\/([^/]+)/i.exec(info86)?.[1]?.trim();
        const omschrijving = remi || info86;
        const base = {
            datum,
            bedrag: Math.round(bedrag * 100) / 100,
            tegenrekening,
            tegennaam,
            omschrijving,
            bank_ref: undefined as string | undefined,
        };
        out.push({ ...base, dedup_key: makeDedupKey(base) });
    }
    return out;
}

export function parseBankStatement(content: string): BankTransactie[] {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('<?xml') || trimmed.includes('<Document')) return parseCamt053(content);
    if (content.includes(':61:')) return parseMt940(content);
    throw new Error('Onbekend bankformaat — verwacht CAMT.053 (XML) of MT940 (.sta/.940).');
}

/* ── Afletteren: match binnenkomende betalingen aan openstaande facturen ── */

export interface MatchFactuur {
    id: number | string;
    nummer?: string;
    client_naam?: string;
    status?: string;
    items?: Array<{ qty?: number; prijs?: number; btw?: number }> | null;
}

export type MatchConfidence = 'hoog' | 'middel' | 'laag' | 'geen';

export interface MatchSuggestie {
    transactie: BankTransactie;
    factuur_id?: number | string;
    factuur_nummer?: string;
    confidence: MatchConfidence;
    reden: string;
}

function factuurTotaalIncl(f: MatchFactuur): number {
    let t = 0;
    for (const it of f.items || []) {
        const net = (Number(it.qty) || 0) * (Number(it.prijs) || 0);
        t += net * (1 + (Number(it.btw) || 0) / 100);
    }
    return Math.round(t * 100) / 100;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function matchTransactions(transacties: BankTransactie[], facturen: MatchFactuur[]): MatchSuggestie[] {
    /* Alleen open facturen zijn matchbaar (niet al betaald/geannuleerd/concept). */
    const open = facturen
        .filter(f => f.status !== 'betaald' && f.status !== 'geannuleerd' && f.status !== 'concept')
        .map(f => ({ f, totaal: factuurTotaalIncl(f) }));

    return transacties.map(t => {
        /* Uitgaande betalingen letteren we (nog) niet af aan verkoopfacturen. */
        if (t.bedrag <= 0) return { transactie: t, confidence: 'geen' as const, reden: 'Uitgaande betaling — geen verkoopfactuur' };

        const haystack = normalize(`${t.omschrijving} ${t.tegennaam || ''}`);
        let best: { f: MatchFactuur; totaal: number; score: number; reden: string } | null = null;

        for (const cand of open) {
            let score = 0;
            const redenen: string[] = [];
            const nummer = cand.f.nummer ? normalize(cand.f.nummer) : '';
            if (nummer && haystack.includes(nummer)) { score += 55; redenen.push(`factuurnummer ${cand.f.nummer}`); }
            if (Math.abs(cand.totaal - t.bedrag) < 0.01 && cand.totaal > 0) { score += 45; redenen.push('bedrag komt exact overeen'); }
            const klant = cand.f.client_naam ? normalize(cand.f.client_naam) : '';
            if (klant && klant.length >= 3 && haystack.includes(klant)) { score += 25; redenen.push('klantnaam'); }
            if (score > 0 && (!best || score > best.score)) best = { ...cand, score, reden: redenen.join(' + ') };
        }

        if (!best) return { transactie: t, confidence: 'geen' as const, reden: 'Geen openstaande factuur gevonden' };
        const confidence: MatchConfidence = best.score >= 80 ? 'hoog' : best.score >= 45 ? 'middel' : 'laag';
        return { transactie: t, factuur_id: best.f.id, factuur_nummer: best.f.nummer, confidence, reden: best.reden };
    });
}
