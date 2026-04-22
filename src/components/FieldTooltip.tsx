'use client';
import { useState, useRef, useEffect } from 'react';

interface FieldTooltipProps {
    text: string;
    position?: 'top' | 'right' | 'bottom' | 'left';
}

export default function FieldTooltip({ text, position = 'top' }: FieldTooltipProps) {
    const [visible, setVisible] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(function () {
        if (!visible) return;
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setVisible(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return function () { document.removeEventListener('mousedown', handleClickOutside); };
    }, [visible]);

    const arrowSize = 5;

    const tooltipPositionStyles: Record<string, React.CSSProperties> = {
        top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 },
        bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8 },
        left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 8 },
        right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 8 },
    };

    const arrowStyles: Record<string, React.CSSProperties> = {
        top: {
            position: 'absolute', bottom: -arrowSize, left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: `${arrowSize}px solid transparent`,
            borderRight: `${arrowSize}px solid transparent`, borderTop: `${arrowSize}px solid var(--card-solid)`,
        },
        bottom: {
            position: 'absolute', top: -arrowSize, left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: `${arrowSize}px solid transparent`,
            borderRight: `${arrowSize}px solid transparent`, borderBottom: `${arrowSize}px solid var(--card-solid)`,
        },
        left: {
            position: 'absolute', right: -arrowSize, top: '50%', transform: 'translateY(-50%)',
            width: 0, height: 0, borderTop: `${arrowSize}px solid transparent`,
            borderBottom: `${arrowSize}px solid transparent`, borderLeft: `${arrowSize}px solid var(--card-solid)`,
        },
        right: {
            position: 'absolute', left: -arrowSize, top: '50%', transform: 'translateY(-50%)',
            width: 0, height: 0, borderTop: `${arrowSize}px solid transparent`,
            borderBottom: `${arrowSize}px solid transparent`, borderRight: `${arrowSize}px solid var(--card-solid)`,
        },
    };

    return (
        <span
            ref={ref}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4, cursor: 'pointer', verticalAlign: 'middle', padding: 4, minWidth: 28, minHeight: 28, justifyContent: 'center' }}
            onMouseEnter={function () { setVisible(true); }}
            onMouseLeave={function () { setVisible(false); }}
            onClick={function (e) { e.preventDefault(); e.stopPropagation(); setVisible(!visible); }}
            role="button"
            tabIndex={0}
            onKeyDown={function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVisible(!visible); } }}
        >
            <span style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1, userSelect: 'none' }} aria-hidden="true">
                &#8505;&#65039;
            </span>
            <span className="sr-only">Meer informatie</span>
            <span
                style={{
                    position: 'absolute',
                    ...tooltipPositionStyles[position],
                    background: 'var(--card-solid)',
                    color: 'var(--text)',
                    fontSize: 12,
                    lineHeight: 1.4,
                    padding: '8px 12px',
                    borderRadius: 8,
                    maxWidth: 250,
                    width: 'max-content',
                    zIndex: 1000,
                    pointerEvents: 'none',
                    boxShadow: '0 4px 16px rgba(0,0,0,.5)',
                    border: '1px solid rgba(130,130,130,.15)',
                    opacity: visible ? 1 : 0,
                    visibility: visible ? 'visible' : 'hidden',
                    transition: 'opacity 0.15s ease, visibility 0.15s ease',
                }}
            >
                {text}
                <span style={arrowStyles[position]} />
            </span>
        </span>
    );
}
