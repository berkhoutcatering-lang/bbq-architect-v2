'use client';

import { useState, useCallback, useRef } from 'react';

// ── Validation rule types ───────────────────────────────────────────────────

type ValidationRule =
    | { required: string }
    | { min: [number, string] }
    | { minLength: [number, string] }
    | { pattern: [RegExp, string] }
    | { custom: (value: unknown, allValues: Record<string, unknown>) => string | null };

export type FieldRules = ValidationRule[];

export type ValidationSchema = Record<string, FieldRules>;

export interface UseFormValidationReturn {
    errors: Record<string, string>;
    validateField: (name: string, value: unknown, allValues?: Record<string, unknown>) => string | null;
    validateAll: (values: Record<string, unknown>) => boolean;
    clearError: (name: string) => void;
    clearAllErrors: () => void;
    setError: (name: string, message: string) => void;
    hasErrors: boolean;
    /** Returns props to spread on an input for blur validation */
    fieldProps: (name: string, value: unknown, allValues?: Record<string, unknown>) => {
        'aria-invalid': boolean;
        'aria-describedby': string | undefined;
        onBlur: () => void;
    };
}

// ── Validate a single value against its rules ───────────────────────────────

function runRules(rules: FieldRules, value: unknown, allValues: Record<string, unknown>): string | null {
    for (const rule of rules) {
        if ('required' in rule) {
            if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
                return rule.required;
            }
        }
        if ('min' in rule) {
            const num = typeof value === 'number' ? value : parseFloat(String(value));
            if (isNaN(num) || num < rule.min[0]) {
                return rule.min[1];
            }
        }
        if ('minLength' in rule) {
            if (typeof value === 'string' && value.length < rule.minLength[0]) {
                return rule.minLength[1];
            }
        }
        if ('pattern' in rule) {
            if (typeof value === 'string' && !rule.pattern[0].test(value)) {
                return rule.pattern[1];
            }
        }
        if ('custom' in rule) {
            const msg = rule.custom(value, allValues);
            if (msg) return msg;
        }
    }
    return null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useFormValidation(schema: ValidationSchema): UseFormValidationReturn {
    const [errors, setErrors] = useState<Record<string, string>>({});
    const touchedRef = useRef<Set<string>>(new Set());

    const validateField = useCallback(function (name: string, value: unknown, allValues?: Record<string, unknown>): string | null {
        const rules = schema[name];
        if (!rules) return null;

        const msg = runRules(rules, value, allValues || {});

        setErrors(function (prev) {
            if (msg) {
                if (prev[name] === msg) return prev;
                return Object.assign({}, prev, { [name]: msg });
            }
            if (!prev[name]) return prev;
            const next = Object.assign({}, prev);
            delete next[name];
            return next;
        });

        touchedRef.current.add(name);
        return msg;
    }, [schema]);

    const validateAll = useCallback(function (values: Record<string, unknown>): boolean {
        const newErrors: Record<string, string> = {};

        for (const name of Object.keys(schema)) {
            const msg = runRules(schema[name], values[name], values);
            if (msg) newErrors[name] = msg;
            touchedRef.current.add(name);
        }

        setErrors(newErrors);

        // Focus first invalid field
        if (Object.keys(newErrors).length > 0) {
            const firstName = Object.keys(newErrors)[0];
            requestAnimationFrame(function () {
                const el = document.querySelector<HTMLElement>('[name="' + firstName + '"], #' + firstName);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.focus();
                }
            });
        }

        return Object.keys(newErrors).length === 0;
    }, [schema]);

    const clearError = useCallback(function (name: string) {
        setErrors(function (prev) {
            if (!prev[name]) return prev;
            const next = Object.assign({}, prev);
            delete next[name];
            return next;
        });
    }, []);

    const clearAllErrors = useCallback(function () {
        setErrors({});
        touchedRef.current.clear();
    }, []);

    const setError = useCallback(function (name: string, message: string) {
        setErrors(function (prev) {
            if (prev[name] === message) return prev;
            return Object.assign({}, prev, { [name]: message });
        });
    }, []);

    const fieldProps = useCallback(function (name: string, value: unknown, allValues?: Record<string, unknown>) {
        const hasError = !!errors[name];
        return {
            'aria-invalid': hasError,
            'aria-describedby': hasError ? name + '-error' : undefined,
            onBlur: function () {
                // Only validate on blur if the field has rules
                if (schema[name]) {
                    validateField(name, value, allValues);
                }
            },
        };
    }, [errors, schema, validateField]);

    return {
        errors,
        validateField,
        validateAll,
        clearError,
        clearAllErrors,
        setError,
        hasErrors: Object.keys(errors).length > 0,
        fieldProps,
    };
}
