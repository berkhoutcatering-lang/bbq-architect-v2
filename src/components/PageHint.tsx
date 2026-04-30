'use client';
import { useState, useEffect, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';

interface PageHintAction {
    label: string;
    href: string;
}

interface PageHintProps {
    id: string;
    title: string;
    description: string;
    icon?: ReactNode;
    actions?: PageHintAction[];
}

export default function PageHint({ id, title, description, icon, actions }: PageHintProps) {
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        const key = 'bbq_hint_' + id;
        const stored = localStorage.getItem(key);
        if (!stored) setDismissed(false);
    }, [id]);

    function dismiss() {
        localStorage.setItem('bbq_hint_' + id, 'true');
        setDismissed(true);
    }

    if (dismissed) return null;

    return (
        <div className="page-hint">
            <div className="page-hint__icon">
                {icon || <Info size={16} />}
            </div>
            <div className="page-hint__body">
                <div className="page-hint__title">{title}</div>
                <div className="page-hint__desc">{description}</div>
                {actions && actions.length > 0 && (
                    <div className="page-hint__actions">
                        {actions.map(function (a) {
                            return (
                                <a key={a.href} href={a.href} className="page-hint__action">{a.label}</a>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="page-hint__buttons">
                <button onClick={dismiss} className="page-hint__dismiss-text">
                    Niet meer tonen
                </button>
                <button onClick={dismiss} className="page-hint__close" aria-label="Sluiten">
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
