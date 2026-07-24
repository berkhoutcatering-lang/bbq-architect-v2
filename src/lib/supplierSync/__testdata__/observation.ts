/* Gedeelde test-fixture: een structureel geldige ruwe waarneming.
 * Geen .test.ts → wordt niet als test gedraaid, alleen geïmporteerd. */

export function validRawObservation(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        supplierId: 42,
        supplierAccountKey: 'sha256:acct-abc',
        supplierSku: 'BT-12345',
        ean: '8712345678901',
        productName: 'Beukenhouten rookmot 2,5 kg',
        description: null,
        category: 'Rookhout',
        productUrl: 'https://www.baktotaal.nl/product/rookmot-2500',
        currency: 'EUR',
        taxMode: 'ex_vat',
        vatPct: '9',
        regularPriceExVat: '22.50',
        promoPriceExVat: null,
        promoValidFrom: null,
        promoValidUntil: null,
        priceBasis: 'package',
        packCount: '1',
        contentPerItemQuantity: '2.5',
        contentPerItemUnit: 'kg',
        totalBaseQuantity: null,
        baseUnit: null,
        orderMultiple: null,
        variableWeight: false,
        packageDescriptionRaw: 'Zak 2,5 kg',
        capturedAt: '2026-07-23T10:00:00.000Z',
        extractionMethod: 'dom_adapter',
        adapterKey: 'baktotaal',
        adapterVersion: '1.0.0',
        sourceCursor: 'cat=rookhout&page=1',
        fieldConfidence: { productName: 1, regularPriceExVat: 0.98 },
        rawRecord: { sku: 'BT-12345', title: 'Beukenhouten rookmot', priceText: '€ 22,50' },
        ...over,
    };
}
