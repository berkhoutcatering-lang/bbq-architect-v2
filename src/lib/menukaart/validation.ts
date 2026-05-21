/**
 * Server-side validatie van overrides tegen de allow-list per template.
 * Gebruikt door Server Actions zodat de client geen waardes buiten bereik
 * kan posten.
 */

import type { Overrides, OverrideKey, Template, AllowList } from './registry';

const HEX = /^#[0-9a-fA-F]{6}$/;

export type ValidationError = { key: string; reason: string };

export function validateOverrides(
    template: Template,
    input: Record<string, unknown>,
): { ok: true; clean: Overrides } | { ok: false; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    const clean: Overrides = {};
    const allow = template.allowList;

    for (const [rawKey, rawValue] of Object.entries(input)) {
        const key = rawKey as OverrideKey;
        const rule = allow[key as keyof AllowList];

        if (!rule) {
            errors.push({ key, reason: `Key "${key}" niet toegestaan voor template ${template.id}` });
            continue;
        }
        // Null/undefined = explicit clear → toegestaan, value blijft weg
        if (rawValue === null || rawValue === undefined) continue;

        switch (rule.type) {
            case 'color': {
                if (typeof rawValue !== 'string' || !HEX.test(rawValue)) {
                    errors.push({ key, reason: 'Moet een hex-kleur zijn (#RRGGBB)' });
                    break;
                }
                 
                (clean as any)[key] = rawValue;
                break;
            }
            case 'font': {
                if (typeof rawValue !== 'string' || !rule.options.includes(rawValue)) {
                    errors.push({ key, reason: `Font moet één van ${rule.options.join(', ')} zijn` });
                    break;
                }
                 
                (clean as any)[key] = rawValue;
                break;
            }
            case 'size': {
                const n = typeof rawValue === 'number' ? rawValue : Number(rawValue);
                if (!Number.isFinite(n) || n < rule.min || n > rule.max) {
                    errors.push({ key, reason: `Moet tussen ${rule.min} en ${rule.max} liggen` });
                    break;
                }
                 
                (clean as any)[key] = Math.round(n);
                break;
            }
            case 'weight': {
                const n = typeof rawValue === 'number' ? rawValue : Number(rawValue);
                if (!rule.options.includes(n)) {
                    errors.push({ key, reason: `Weight moet één van ${rule.options.join(', ')} zijn` });
                    break;
                }
                 
                (clean as any)[key] = n;
                break;
            }
            case 'enum': {
                if (typeof rawValue !== 'string' || !rule.options.includes(rawValue as never)) {
                    errors.push({ key, reason: `Moet één van ${rule.options.join(', ')} zijn` });
                    break;
                }
                 
                (clean as any)[key] = rawValue;
                break;
            }
            case 'text': {
                if (typeof rawValue !== 'string') {
                    errors.push({ key, reason: 'Moet tekst zijn' });
                    break;
                }
                if (rawValue.length > rule.max) {
                    errors.push({ key, reason: `Maximaal ${rule.max} tekens` });
                    break;
                }
                 
                (clean as any)[key] = rawValue;
                break;
            }
            case 'toggle': {
                if (typeof rawValue !== 'boolean') {
                    errors.push({ key, reason: 'Moet boolean zijn' });
                    break;
                }
                 
                (clean as any)[key] = rawValue;
                break;
            }
        }
    }

    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, clean };
}
