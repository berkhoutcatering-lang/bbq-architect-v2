/**
 * Cascade-resolver voor menukaart-overrides.
 *
 *   default (template-built-in)
 *      ↓ overridden by
 *   brand   (per-tenant settings.menukaart_overrides)
 *      ↓ overridden by
 *   custom  (per-offerte offertes.menukaart_overrides)
 *
 * Lege strings en null tellen NIET als override (vallen door).
 * De source-map vertelt per key uit welke laag de waarde komt — gebruikt door
 * de cascade-badges in de editor.
 */

import type { Overrides, OverrideKey, Template } from './registry';

export type CascadeSource = 'default' | 'brand' | 'custom';
export type Resolved<T> = { value: T; source: CascadeSource };

function isPresent(v: unknown): boolean {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return true;
}

export function resolveCascade(
    template: Template,
    brand: Overrides = {},
    custom: Overrides = {},
): Record<OverrideKey, Resolved<unknown>> {
    const allKeys = new Set<OverrideKey>([
        ...Object.keys(template.defaults) as OverrideKey[],
        ...Object.keys(brand) as OverrideKey[],
        ...Object.keys(custom) as OverrideKey[],
    ]);

    const result: Partial<Record<OverrideKey, Resolved<unknown>>> = {};
    for (const k of allKeys) {
        if (isPresent(custom[k])) {
            result[k] = { value: custom[k]!, source: 'custom' };
        } else if (isPresent(brand[k])) {
            result[k] = { value: brand[k]!, source: 'brand' };
        } else if (isPresent(template.defaults[k])) {
            result[k] = { value: template.defaults[k]!, source: 'default' };
        }
    }
    return result as Record<OverrideKey, Resolved<unknown>>;
}

/** Flatten resolved cascade to plain overrides object (no source-map). */
export function flatten(resolved: Record<OverrideKey, Resolved<unknown>>): Overrides {
    const out: Overrides = {};
    for (const k of Object.keys(resolved) as OverrideKey[]) {
         
        (out as any)[k] = resolved[k].value;
    }
    return out;
}

/** Pull just the source-label for a single key. */
export function sourceOf(
    resolved: Record<OverrideKey, Resolved<unknown>>,
    key: OverrideKey,
): CascadeSource {
    return resolved[key]?.source ?? 'default';
}
