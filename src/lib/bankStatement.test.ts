import { describe, it, expect } from 'vitest';
import { parseCamt053, parseMt940, parseBankStatement, matchTransactions } from './bankStatement';

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Ntry>
        <Amt Ccy="EUR">1563.25</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-06-30</Dt></BookgDt>
        <NtryRef>REF001</NtryRef>
        <NtryDtls><TxDtls>
          <RmtInf><Ustrd>Betaling factuur F2026-015</Ustrd></RmtInf>
          <RltdPties><Dbtr><Nm>Loes Platen</Nm></Dbtr><DbtrAcct><Id><IBAN>NL00BANK0123456789</IBAN></Id></DbtrAcct></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">45.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-06-28</Dt></BookgDt>
        <NtryDtls><TxDtls><RmtInf><Ustrd>Tikkie lunch</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

describe('parseCamt053', () => {
    it('leest binnenkomend + uitgaand met juist teken', () => {
        const tx = parseCamt053(CAMT);
        expect(tx).toHaveLength(2);
        expect(tx[0].bedrag).toBe(1563.25);
        expect(tx[0].datum).toBe('2026-06-30');
        expect(tx[0].tegennaam).toBe('Loes Platen');
        expect(tx[0].tegenrekening).toBe('NL00BANK0123456789');
        expect(tx[0].omschrijving).toContain('F2026-015');
        expect(tx[1].bedrag).toBe(-45); // DBIT = negatief
        expect(tx[0].dedup_key).not.toBe(tx[1].dedup_key);
    });
});

describe('parseMt940', () => {
    it('leest :61: transactie + :86: omschrijving', () => {
        const mt = [
            ':20:STARTUP',
            ':25:NL00BANK0123456789',
            ':60F:C260601EUR100,00',
            ':61:2606300630C1563,25N123',
            ':86:/NAME/Loes Platen/REMI/Betaling factuur F2026-015',
            ':62F:C260630EUR1663,25',
        ].join('\n');
        const tx = parseMt940(mt);
        expect(tx).toHaveLength(1);
        expect(tx[0].bedrag).toBe(1563.25);
        expect(tx[0].datum).toBe('2026-06-30');
        expect(tx[0].tegennaam).toBe('Loes Platen');
        expect(tx[0].omschrijving).toContain('F2026-015');
    });

    it('debet-regel wordt negatief', () => {
        const mt = ':61:2606280628D45,00N999\n:86:Tikkie lunch';
        expect(parseMt940(mt)[0].bedrag).toBe(-45);
    });
});

describe('parseBankStatement', () => {
    it('detecteert CAMT vs MT940', () => {
        expect(parseBankStatement(CAMT)).toHaveLength(2);
        expect(parseBankStatement(':61:2606300630C10,00N1\n:86:test')).toHaveLength(1);
    });
    it('gooit fout bij onbekend formaat', () => {
        expect(() => parseBankStatement('willekeurige tekst')).toThrow();
    });
});

describe('matchTransactions', () => {
    const facturen = [
        { id: 40, nummer: 'F2026-015', client_naam: 'Loes Platen', status: 'verzonden', items: [{ qty: 37, prijs: 38.7614678899, btw: 9 }] }, // ~1563.25 incl
        { id: 16, nummer: 'F2026-012', client_naam: 'Bussemaker', status: 'verzonden', items: [{ qty: 22, prijs: 32.11, btw: 9 }] },
    ];

    it('matcht op factuurnummer + bedrag = hoog', () => {
        const tx = parseCamt053(CAMT); // eerste tx heeft F2026-015 + 1563.25
        const m = matchTransactions(tx, facturen);
        expect(m[0].factuur_nummer).toBe('F2026-015');
        expect(m[0].confidence).toBe('hoog');
        expect(m[1].confidence).toBe('geen'); // uitgaand
    });

    it('betaalde/concept facturen matchen niet', () => {
        const m = matchTransactions(
            [{ datum: '2026-06-30', bedrag: 1563.25, omschrijving: 'F2026-015', dedup_key: 'x' }],
            [{ id: 40, nummer: 'F2026-015', client_naam: 'Loes', status: 'betaald', items: [{ qty: 37, prijs: 38.76, btw: 9 }] }],
        );
        expect(m[0].confidence).toBe('geen');
    });

    it('alleen bedrag-match zonder nummer = middel', () => {
        const m = matchTransactions(
            [{ datum: '2026-06-30', bedrag: 1563.25, omschrijving: 'overboeking', dedup_key: 'x' }],
            [{ id: 40, nummer: 'F2026-015', client_naam: 'ZZZ', status: 'verzonden', items: [{ qty: 37, prijs: 38.7614678899, btw: 9 }] }],
        );
        expect(m[0].confidence).toBe('middel');
    });
});
