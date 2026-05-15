'use client';

import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'brand' | 'ghost' | 'red' | 'green' | 'cyan' | 'gold' | 'gold-outline';
type ButtonSize = 'default' | 'sm' | 'icon' | 'touch';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: ReactNode;
    children?: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
    brand: 'btn btn-brand',
    ghost: 'btn btn-ghost',
    red: 'btn btn-red',
    green: 'btn btn-green',
    cyan: 'btn btn-cyan',
    gold: 'btn btn-gold',
    'gold-outline': 'btn btn-gold-outline',
};

const sizeClass: Record<ButtonSize, string> = {
    default: '',
    sm: 'btn-sm',
    icon: 'btn-icon',
    touch: 'btn-touch',
};

export default function Button({
    variant = 'brand',
    size = 'default',
    loading = false,
    icon,
    children,
    className,
    disabled,
    ...rest
}: ButtonProps) {
    const classes = [
        variantClass[variant],
        sizeClass[size],
        className || '',
    ].filter(Boolean).join(' ');

    return (
        <button
            className={classes}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...rest}
        >
            {loading ? (
                <Loader2
                    size={size === 'sm' ? 12 : 14}
                    style={{ animation: 'spin 1s linear infinite', display: 'inline-block', verticalAlign: 'middle' }}
                    aria-hidden="true"
                />
            ) : icon ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }} aria-hidden="true">
                    {icon}
                </span>
            ) : null}
            {children && (
                <span style={{ marginLeft: (loading || icon) ? 6 : 0 }}>
                    {children}
                </span>
            )}
        </button>
    );
}
