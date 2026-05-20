import { describe, it, expect } from 'vitest';
import {
    SettingsSchema,
    AccountingConfigSchema,
    HexColor,
} from './settings';

describe('SettingsSchema (allowlist)', () => {
    it('accepteert lege input (geen velden verplicht)', () => {
        const result = SettingsSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('accepteert volledige identiteit + contact-velden', () => {
        const result = SettingsSchema.safeParse({
            bedrijfsnaam: 'Hop & Bites',
            ondertitel: 'BBQ-catering Drenthe',
            email: 'info@hopandbites.nl',
            telefoon: '06-12345678',
            adres: 'Dorpsstraat 1, Schoonoord',
            kvk: '12345678',
            btw: 'NL001234567B01',
            iban: 'NL00ABNA1234567890',
        });
        expect(result.success).toBe(true);
    });

    it('weigert ongeldig email-adres', () => {
        const result = SettingsSchema.safeParse({ email: 'niet-een-email' });
        expect(result.success).toBe(false);
    });

    it('accepteert lege string als email (opt-out)', () => {
        const result = SettingsSchema.safeParse({ email: '' });
        expect(result.success).toBe(true);
    });

    /* ─── Security: strip-modus dropt niet-allowlisted velden ─── */

    it('strip-modus dropt `tier` (alleen via billing-webhook)', () => {
        const result = SettingsSchema.safeParse({
            bedrijfsnaam: 'Test',
            tier: 'enterprise',
        } as unknown);
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as Record<string, unknown>).tier).toBeUndefined();
        }
    });

    it('strip-modus dropt `organization_id` (RLS doet de echte check)', () => {
        const result = SettingsSchema.safeParse({
            bedrijfsnaam: 'Test',
            organization_id: 'andere-tenant-uuid',
        } as unknown);
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as Record<string, unknown>).organization_id).toBeUndefined();
        }
    });

    it('strip-modus dropt `id` en `created_at`', () => {
        const result = SettingsSchema.safeParse({
            id: 1,
            created_at: '2026-01-01',
            updated_at: '2026-05-20',
            internal_notes: 'admin-only',
        } as unknown);
        expect(result.success).toBe(true);
        if (result.success) {
            const data = result.data as Record<string, unknown>;
            expect(data.id).toBeUndefined();
            expect(data.created_at).toBeUndefined();
            expect(data.updated_at).toBeUndefined();
            expect(data.internal_notes).toBeUndefined();
        }
    });

    /* ─── Document-instellingen ─── */

    it('coerced default_btw + betaaltermijn van string-numbers', () => {
        const result = SettingsSchema.safeParse({
            default_btw: '9',
            betaaltermijn: '30',
            offerte_geldig: '14',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.default_btw).toBe(9);
            expect(result.data.betaaltermijn).toBe(30);
            expect(result.data.offerte_geldig).toBe(14);
        }
    });

    it('weigert default_btw boven 100', () => {
        const result = SettingsSchema.safeParse({ default_btw: 150 });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve betaaltermijn', () => {
        const result = SettingsSchema.safeParse({ betaaltermijn: -10 });
        expect(result.success).toBe(false);
    });

    it('weigert betaaltermijn boven 365 dagen', () => {
        const result = SettingsSchema.safeParse({ betaaltermijn: 400 });
        expect(result.success).toBe(false);
    });

    it('weigert factuur_prefix langer dan 20 chars', () => {
        const result = SettingsSchema.safeParse({ factuur_prefix: 'x'.repeat(21) });
        expect(result.success).toBe(false);
    });

    /* ─── Huisstijl: hex-color validatie (CSS-injection vector) ─── */

    it('brand_primary accepteert geldige hex-kleur', () => {
        const result = SettingsSchema.safeParse({ brand_primary: '#1a2b3c' });
        expect(result.success).toBe(true);
    });

    it('brand_primary weigert non-hex string (CSS-injection vector)', () => {
        const result = SettingsSchema.safeParse({
            brand_primary: 'red; }} body { display: none',
        });
        expect(result.success).toBe(false);
    });

    it('brand_primary weigert hex zonder hash', () => {
        const result = SettingsSchema.safeParse({ brand_primary: '1a2b3c' });
        expect(result.success).toBe(false);
    });

    it('brand_primary mag null zijn (reset to default)', () => {
        const result = SettingsSchema.safeParse({ brand_primary: null });
        expect(result.success).toBe(true);
    });

    it('logo_url accepteert geldige URL', () => {
        const result = SettingsSchema.safeParse({
            logo_url: 'https://cdn.example.com/logo.png',
        });
        expect(result.success).toBe(true);
    });

    it('logo_url weigert ongeldige URL', () => {
        const result = SettingsSchema.safeParse({ logo_url: 'niet-een-url' });
        expect(result.success).toBe(false);
    });

    it('logo_url accepteert lege string (reset)', () => {
        const result = SettingsSchema.safeParse({ logo_url: '' });
        expect(result.success).toBe(true);
    });

    /* ─── Accounting config (jsonb sub-schema) ─── */

    it('accounting_config accepteert labor_cost_per_hour binnen 0-500', () => {
        const result = SettingsSchema.safeParse({
            accounting_config: { labor_cost_per_hour: 35 },
        });
        expect(result.success).toBe(true);
    });

    it('accounting_config weigert labor_cost_per_hour boven 500', () => {
        const result = SettingsSchema.safeParse({
            accounting_config: { labor_cost_per_hour: 600 },
        });
        expect(result.success).toBe(false);
    });

    it('accounting_config passthrough: onbekende velden blijven behouden', () => {
        const result = SettingsSchema.safeParse({
            accounting_config: {
                labor_cost_per_hour: 35,
                custom_field: 'value',
                deep: { nested: true },
            },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            const cfg = result.data.accounting_config as Record<string, unknown>;
            expect(cfg.custom_field).toBe('value');
            expect(cfg.deep).toEqual({ nested: true });
        }
    });

    it('accepteert volledige happy-path settings-update', () => {
        const result = SettingsSchema.safeParse({
            bedrijfsnaam: 'Hop & Bites',
            email: 'info@hopandbites.nl',
            factuur_prefix: 'HB-',
            offerte_prefix: 'OFF-',
            default_btw: 9,
            betaaltermijn: 30,
            offerte_geldig: 14,
            logo_url: 'https://cdn.example.com/logo.png',
            brand_primary: '#d4a574',
            brand_accent: '#2a2a2a',
            brand_background: '#ffffff',
            accounting_config: {
                labor_cost_per_hour: 35,
                labor_cost_per_hour_weekend: 42,
            },
        });
        expect(result.success).toBe(true);
    });
});

describe('AccountingConfigSchema', () => {
    it('accepteert lege config', () => {
        const result = AccountingConfigSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('weigert negatieve labor_cost_per_hour', () => {
        const result = AccountingConfigSchema.safeParse({ labor_cost_per_hour: -10 });
        expect(result.success).toBe(false);
    });

    it('coerced labor_cost_per_hour van string-number', () => {
        const result = AccountingConfigSchema.safeParse({ labor_cost_per_hour: '35.50' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.labor_cost_per_hour).toBe(35.5);
        }
    });
});

describe('HexColor', () => {
    it('accepteert standaard 6-char hex (#RRGGBB)', () => {
        expect(HexColor.safeParse('#1a2b3c').success).toBe(true);
    });

    it('accepteert 3-char hex (#RGB)', () => {
        expect(HexColor.safeParse('#abc').success).toBe(true);
    });

    it('accepteert 8-char hex met alpha (#RRGGBBAA)', () => {
        expect(HexColor.safeParse('#1a2b3cff').success).toBe(true);
    });

    it('weigert hex met meer dan 8 chars', () => {
        expect(HexColor.safeParse('#1a2b3c4d5e').success).toBe(false);
    });

    it('weigert non-hex characters', () => {
        expect(HexColor.safeParse('#zzzzzz').success).toBe(false);
    });

    it('weigert hex zonder hash-prefix', () => {
        expect(HexColor.safeParse('1a2b3c').success).toBe(false);
    });
});
