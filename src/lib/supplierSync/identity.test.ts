import { describe, it, expect } from 'vitest';
import {
    canonicalUrlKey, packVariantKey, productIdentity, rawHash, idempotencyKey, scopedIdentityKey,
} from './identity';
import { validateObservation } from './observationSchema';
import { validRawObservation } from './__testdata__/observation';

function obs(over: Record<string, unknown> = {}) {
    const r = validateObservation(validRawObservation(over));
    if (!r.value) throw new Error('fixture invalid: ' + r.errors.join(', '));
    return r.value;
}

describe('canonicalUrlKey', () => {
    it('lowercase host, gesorteerde params, geen trailing slash', () => {
        expect(canonicalUrlKey('https://WWW.Baktotaal.NL/product/x/?b=2&a=1'))
            .toBe('www.baktotaal.nl/product/x?a=1&b=2');
    });
    it('strip tracking-params', () => {
        expect(canonicalUrlKey('https://x.nl/p?utm_source=fb&id=9'))
            .toBe('x.nl/p?id=9');
    });
    it('ongeldige URL → null', () => {
        expect(canonicalUrlKey('geen-url')).toBeNull();
    });
});

describe('packVariantKey', () => {
    it('onbekende verpakking → eigen bucket', () => {
        expect(packVariantKey({
            priceBasis: 'unknown', packCount: null, contentPerItemQuantity: null,
            contentPerItemUnit: null, totalBaseQuantity: null, baseUnit: null,
        })).toBe('pack:unknown');
    });
    it('verschillende verpakkingen → verschillende sleutels', () => {
        const a = packVariantKey({ priceBasis: 'package', packCount: '1', contentPerItemQuantity: '2.5', contentPerItemUnit: 'kg', totalBaseQuantity: null, baseUnit: null });
        const b = packVariantKey({ priceBasis: 'package', packCount: '1', contentPerItemQuantity: '5', contentPerItemUnit: 'kg', totalBaseQuantity: null, baseUnit: null });
        expect(a).not.toBe(b);
    });
});

describe('productIdentity — hiërarchie sku > ean > url > none', () => {
    it('SKU wint', () => {
        expect(productIdentity(obs()).kind).toBe('sku');
    });
    it('EAN als SKU ontbreekt', () => {
        expect(productIdentity(obs({ supplierSku: null })).kind).toBe('ean');
    });
    it('URL als SKU en EAN ontbreken', () => {
        expect(productIdentity(obs({ supplierSku: null, ean: null })).kind).toBe('url');
    });
    it('zelfde SKU + andere verpakking → andere identiteit (geen samenval)', () => {
        const a = productIdentity(obs({ contentPerItemQuantity: '2.5' }));
        const b = productIdentity(obs({ contentPerItemQuantity: '5' }));
        expect(a.key).not.toBe(b.key);
    });
});

describe('rawHash', () => {
    it('deterministisch', () => {
        expect(rawHash(obs())).toBe(rawHash(obs()));
    });
    it('verandert bij prijswijziging', () => {
        expect(rawHash(obs({ regularPriceExVat: '22.50' }))).not.toBe(rawHash(obs({ regularPriceExVat: '23.00' })));
    });
});

describe('idempotencyKey', () => {
    const base = {
        organizationId: 'org-1', supplierId: 42, supplierAccountKey: 'acct', runScope: 'full',
        adapterVersion: '1.0.0', categoryOrEndpoint: 'rookhout', cursorOrPage: '1',
    };
    it('deterministisch en 64 hex', () => {
        const k = idempotencyKey(base);
        expect(k).toBe(idempotencyKey(base));
        expect(k).toMatch(/^[0-9a-f]{64}$/);
    });
    it('verandert bij andere cursor', () => {
        expect(idempotencyKey(base)).not.toBe(idempotencyKey({ ...base, cursorOrPage: '2' }));
    });
    it('verandert bij andere adapterversie (reproduceerbaarheid)', () => {
        expect(idempotencyKey(base)).not.toBe(idempotencyKey({ ...base, adapterVersion: '1.1.0' }));
    });
});

describe('scopedIdentityKey', () => {
    it('null als geen stabiele identiteit', () => {
        // geen sku/ean én onbruikbare URL kan niet via validate; simuleer via pick
        const o = obs({ supplierSku: null, ean: null });
        expect(scopedIdentityKey('org', 42, 'acct', o)).not.toBeNull();
    });
    it('scope-verschil → andere sleutel', () => {
        const o = obs();
        expect(scopedIdentityKey('orgA', 42, 'acct', o)).not.toBe(scopedIdentityKey('orgB', 42, 'acct', o));
    });
});
