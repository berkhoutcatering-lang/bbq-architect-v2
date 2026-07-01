/**
 * XAF (XML Auditfile Financieel) 4.0 generator — het bestand dat NL-boekhoud-
 * software (Exact, SnelStart, Twinfield, AFAS) kan importeren.
 *
 * Sinds 1-1-2026 is XAF 4.0 de standaard (voegt <RGScode> toe onder
 * generalLedger > ledgerAccount). We bouwen dubbel-boekhouden journaalposten:
 *   - Verkoopjournaal (VK): per factuur → debiteur (D) = omzet (C) + BTW (C)
 *   - Inkoopjournaal (IN): per bon → kosten (D) + voorbelasting (D) = crediteur (C)
 * Per transactie geldt debet = credit; totalDebit == totalCredit over het geheel.
 *
 * Geen AI in de loop; puur data → XML. Bedragen intern berekend (net/BTW) zodat
 * elke transactie sluitend is, ongeacht kleine afrondingen in de bron.
 */

export interface XafCompany {
    name: string;
    kvk?: string | null;
    btw?: string | null;
}

export interface XafFactuur {
    nummer?: string;
    client_naam?: string;
    datum?: string;
    status?: string;
    items?: Array<{ qty?: number; prijs?: number; btw?: number }> | null;
}

export interface XafBon {
    id?: number | string;
    datum?: string;
    winkel?: string | null;
    netto_bedrag?: number | string | null;
    totaal_bedrag?: number | string | null;
    btw_laag_bedrag?: number | string | null;
    btw_hoog_bedrag?: number | string | null;
    rgs_code?: string | null;
    rgs_category_label?: string | null;
    categorie?: string | null;
}

export interface BuildXafOptions {
    company: XafCompany;
    facturen: XafFactuur[];
    bonnen: XafBon[];
    year: number;
    createdDate: string;      /* YYYY-MM-DD — meegegeven i.p.v. new Date() (deterministisch/testbaar) */
    softwareVersion?: string;
}

const XAF_NS = 'http://www.auditfiles.nl/XAF/4.0';

/* Vaste balansrekeningen (standaard NL-nummering). */
const ACC = {
    debiteuren: { id: '1300', desc: 'Debiteuren', tp: 'B', rgs: 'BVorDeb' },
    crediteuren: { id: '1600', desc: 'Crediteuren', tp: 'B', rgs: 'BSchCre' },
    btwHoog: { id: '1500', desc: 'Af te dragen BTW hoog (21%)', tp: 'B', rgs: 'BSchBtwOlv' },
    btwLaag: { id: '1510', desc: 'Af te dragen BTW laag (9%)', tp: 'B', rgs: 'BSchBtwOla' },
    voorbelasting: { id: '1520', desc: 'Te vorderen voorbelasting', tp: 'B', rgs: 'BVorVbe' },
    omzetLaag: { id: '8000', desc: 'Omzet catering (9%)', tp: 'P', rgs: 'WOpbCat' },
    omzetHoog: { id: '8100', desc: 'Omzet dranken/verhuur (21%)', tp: 'P', rgs: 'WOpbCatDrnk' },
} as const;

function esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function amt(n: number): string {
    return (Math.round(n * 100) / 100).toFixed(2);
}

function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

interface Line { accID: string; custSupID?: string; docRef?: string; effDate: string; desc: string; amount: number; type: 'D' | 'C'; }
interface Tx { nr: number; desc: string; period: number; date: string; lines: Line[]; }

export function buildXafAuditfile(opts: BuildXafOptions): string {
    const { company, facturen, bonnen, year, createdDate } = opts;
    const y = String(year);

    const usedAccounts = new Map<string, { id: string; desc: string; tp: string; rgs?: string }>();
    const use = (a: { id: string; desc: string; tp: string; rgs?: string }) => { if (!usedAccounts.has(a.id)) usedAccounts.set(a.id, a); return a.id; };
    const customers = new Map<string, string>();   /* id → naam */
    const suppliers = new Map<string, string>();

    const periodOf = (d: string) => Math.min(12, Math.max(1, Number(d.slice(5, 7)) || 1));

    /* ── Verkoopjournaal ── */
    const salesTx: Tx[] = [];
    let salesNr = 0;
    for (const f of facturen) {
        if (!f.datum || !f.datum.startsWith(y)) continue;
        if (f.status === 'concept' || f.status === 'geannuleerd') continue;
        let netLaag = 0, netHoog = 0, btwLaag = 0, btwHoog = 0;
        for (const it of f.items || []) {
            const net = num(it.qty) * num(it.prijs);
            const pct = num(it.btw);
            if (pct === 21) { netHoog += net; btwHoog += net * 0.21; }
            else { netLaag += net; btwLaag += net * (pct === 9 ? 0.09 : 0); }
        }
        const totaal = netLaag + netHoog + btwLaag + btwHoog;
        if (totaal === 0) continue;
        const custId = 'D' + (f.client_naam ? f.client_naam.replace(/\s+/g, '').slice(0, 20) : 'ONBEKEND');
        customers.set(custId, f.client_naam || 'Onbekend');
        const lines: Line[] = [];
        lines.push({ accID: use(ACC.debiteuren), custSupID: custId, docRef: f.nummer, effDate: f.datum, desc: `Factuur ${f.nummer || ''}`.trim(), amount: totaal, type: 'D' });
        if (netLaag) lines.push({ accID: use(ACC.omzetLaag), docRef: f.nummer, effDate: f.datum, desc: 'Omzet 9%', amount: netLaag, type: 'C' });
        if (netHoog) lines.push({ accID: use(ACC.omzetHoog), docRef: f.nummer, effDate: f.datum, desc: 'Omzet 21%', amount: netHoog, type: 'C' });
        if (btwLaag) lines.push({ accID: use(ACC.btwLaag), docRef: f.nummer, effDate: f.datum, desc: 'BTW 9%', amount: btwLaag, type: 'C' });
        if (btwHoog) lines.push({ accID: use(ACC.btwHoog), docRef: f.nummer, effDate: f.datum, desc: 'BTW 21%', amount: btwHoog, type: 'C' });
        salesTx.push({ nr: ++salesNr, desc: `Factuur ${f.nummer || ''} — ${f.client_naam || ''}`.trim(), period: periodOf(f.datum), date: f.datum, lines });
    }

    /* ── Inkoopjournaal ── */
    const purchaseTx: Tx[] = [];
    let purchaseNr = 0;
    for (const b of bonnen) {
        if (!b.datum || !String(b.datum).startsWith(y)) continue;
        const btwL = num(b.btw_laag_bedrag), btwH = num(b.btw_hoog_bedrag);
        const netto = (b.netto_bedrag != null && b.netto_bedrag !== '')
            ? num(b.netto_bedrag)
            : num(b.totaal_bedrag) - btwL - btwH;
        const totaal = netto + btwL + btwH;
        if (totaal === 0) continue;
        /* Kostenrekening per RGS-code (of overig). */
        const rgs = b.rgs_code || 'WKostOv';
        const accId = 'K' + rgs;
        use({ id: accId, desc: b.rgs_category_label || b.categorie || 'Overige kosten', tp: 'P', rgs });
        const supId = 'C' + (b.winkel ? String(b.winkel).replace(/\s+/g, '').slice(0, 20) : 'DIV');
        suppliers.set(supId, b.winkel || 'Diverse');
        const ref = b.id != null ? `BON-${b.id}` : 'BON';
        const lines: Line[] = [];
        lines.push({ accID: accId, docRef: ref, effDate: String(b.datum), desc: 'Inkoop/kosten', amount: netto, type: 'D' });
        if (btwL + btwH > 0) lines.push({ accID: use(ACC.voorbelasting), docRef: ref, effDate: String(b.datum), desc: 'Voorbelasting', amount: btwL + btwH, type: 'D' });
        lines.push({ accID: use(ACC.crediteuren), custSupID: supId, docRef: ref, effDate: String(b.datum), desc: 'Crediteur', amount: totaal, type: 'C' });
        purchaseTx.push({ nr: ++purchaseNr, desc: `Bon ${ref} — ${b.winkel || 'Diverse'}`, period: periodOf(String(b.datum)), date: String(b.datum), lines });
    }

    /* ── Totalen ── */
    const allTx = [...salesTx, ...purchaseTx];
    let totalDebit = 0, totalCredit = 0, linesCount = 0;
    for (const t of allTx) for (const l of t.lines) { linesCount++; if (l.type === 'D') totalDebit += l.amount; else totalCredit += l.amount; }

    /* ── XML opbouwen ── */
    const glXml = [...usedAccounts.values()].map(a =>
        `      <ledgerAccount>\n` +
        `        <accID>${esc(a.id)}</accID>\n` +
        `        <accDesc>${esc(a.desc)}</accDesc>\n` +
        `        <accTp>${esc(a.tp)}</accTp>\n` +
        (a.rgs ? `        <RGScode>${esc(a.rgs)}</RGScode>\n` : '') +
        `      </ledgerAccount>`
    ).join('\n');

    const custXml = [...customers.entries()].map(([id, naam]) =>
        `      <customerSupplier>\n        <custSupID>${esc(id)}</custSupID>\n        <custSupName>${esc(naam)}</custSupName>\n        <custSupTp>C</custSupTp>\n      </customerSupplier>`
    ).join('\n');
    const supXml = [...suppliers.entries()].map(([id, naam]) =>
        `      <customerSupplier>\n        <custSupID>${esc(id)}</custSupID>\n        <custSupName>${esc(naam)}</custSupName>\n        <custSupTp>S</custSupTp>\n      </customerSupplier>`
    ).join('\n');

    const txXml = (t: Tx) =>
        `        <transaction>\n` +
        `          <nr>${t.nr}</nr>\n` +
        `          <desc>${esc(t.desc)}</desc>\n` +
        `          <periodNumber>${t.period}</periodNumber>\n` +
        `          <trDt>${esc(t.date)}</trDt>\n` +
        t.lines.map((l, i) =>
            `          <trLine>\n` +
            `            <nr>${i + 1}</nr>\n` +
            `            <accID>${esc(l.accID)}</accID>\n` +
            (l.custSupID ? `            <custSupID>${esc(l.custSupID)}</custSupID>\n` : '') +
            (l.docRef ? `            <docRef>${esc(l.docRef)}</docRef>\n` : '') +
            `            <effDate>${esc(l.effDate)}</effDate>\n` +
            `            <desc>${esc(l.desc)}</desc>\n` +
            `            <amnt>${amt(l.amount)}</amnt>\n` +
            `            <amntTp>${l.type}</amntTp>\n` +
            `          </trLine>`
        ).join('\n') + '\n' +
        `        </transaction>`;

    const journals: string[] = [];
    if (salesTx.length) {
        journals.push(
            `      <journal>\n        <jrnID>VK</jrnID>\n        <desc>Verkoopjournaal</desc>\n        <jrnTp>S</jrnTp>\n` +
            salesTx.map(txXml).join('\n') + '\n' +
            `      </journal>`
        );
    }
    if (purchaseTx.length) {
        journals.push(
            `      <journal>\n        <jrnID>IN</jrnID>\n        <desc>Inkoopjournaal</desc>\n        <jrnTp>P</jrnTp>\n` +
            purchaseTx.map(txXml).join('\n') + '\n' +
            `      </journal>`
        );
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<auditfile xmlns="${XAF_NS}">
  <header>
    <fiscalYear>${year}</fiscalYear>
    <startDate>${year}-01-01</startDate>
    <endDate>${year}-12-31</endDate>
    <curCode>EUR</curCode>
    <dateCreated>${esc(createdDate)}</dateCreated>
    <softwareDesc>BBQ Architect</softwareDesc>
    <softwareVersion>${esc(opts.softwareVersion || '1.0')}</softwareVersion>
  </header>
  <company>
    <companyName>${esc(company.name)}</companyName>
    <taxRegistrationCountry>NL</taxRegistrationCountry>
    <taxRegIdent>${esc(company.btw || '')}</taxRegIdent>
    <generalLedger>
${glXml}
    </generalLedger>
    <customersSuppliers>
${[custXml, supXml].filter(Boolean).join('\n')}
    </customersSuppliers>
    <transactions>
      <linesCount>${linesCount}</linesCount>
      <totalDebit>${amt(totalDebit)}</totalDebit>
      <totalCredit>${amt(totalCredit)}</totalCredit>
${journals.join('\n')}
    </transactions>
  </company>
</auditfile>`;
}
