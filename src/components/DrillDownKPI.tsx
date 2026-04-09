'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import MetallicCard from './MetallicCard';

interface DrillDownItem {
    label: string;
    value: string;
    href?: string;
    color?: string;
}

interface DrillDownKPIProps {
    icon: React.ReactNode;
    label: string;
    value: string;
    subtitle?: string;
    trend?: string;
    accentColor?: string;
    href?: string;
    items?: DrillDownItem[];
}

export default function DrillDownKPI({ icon, label, value, subtitle, trend, accentColor = 'var(--muted)', href, items }: DrillDownKPIProps) {
    const [expanded, setExpanded] = useState(false);

    function handleClick(e: React.MouseEvent) {
        if (items && items.length > 0) {
            e.preventDefault();
            setExpanded(!expanded);
        }
    }

    const card = (
        <MetallicCard className="group" accent={expanded ? accentColor : undefined}>
            <div className="p-4 md:p-6" onClick={handleClick} style={{ cursor: items && items.length > 0 ? 'pointer' : href ? 'pointer' : 'default' }}>
                <div className="flex items-start justify-between mb-3 md:mb-4">
                    <div
                        className="p-2 md:p-2.5 rounded-xl"
                        style={{
                            background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}08)`,
                            border: `1px solid ${accentColor}20`,
                        }}
                    >
                        {icon}
                    </div>
                    <div className="flex items-center gap-2">
                        {trend && (
                            <span className={`text-[10px] md:text-[11px] font-medium px-1.5 md:px-2 py-0.5 md:py-1 rounded-full ${trend.startsWith('+') ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
                                {trend}
                            </span>
                        )}
                        {items && items.length > 0 && (
                            <ChevronDown
                                size={14}
                                style={{
                                    color: 'var(--muted)',
                                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s',
                                }}
                            />
                        )}
                    </div>
                </div>
                <p className="text-[10px] md:text-[11px] font-medium uppercase tracking-[0.12em] md:tracking-[0.15em] text-[var(--muted)] mb-1">{label}</p>
                <p className="text-xl md:text-2xl font-light text-white tracking-tight">{value}</p>
                {subtitle && <p className="text-[11px] md:text-[12px] text-[var(--muted-light)] mt-1 line-clamp-2">{subtitle}</p>}
            </div>

            {/* Drill-down panel */}
            {expanded && items && items.length > 0 && (
                <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: '8px 16px 12px',
                    maxHeight: 200,
                    overflowY: 'auto' as const,
                }}>
                    {items.map(function (item, idx) {
                        const inner = (
                            <div
                                key={idx}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 4px',
                                    borderBottom: idx < items.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                                }}
                            >
                                <span style={{ fontSize: 12, color: item.color || 'var(--text)', fontWeight: 500 }}>
                                    {item.label}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{item.value}</span>
                                    {item.href && <ChevronRight size={12} style={{ color: 'var(--muted)' }} />}
                                </div>
                            </div>
                        );

                        if (item.href) {
                            return <Link key={idx} href={item.href} style={{ textDecoration: 'none' }}>{inner}</Link>;
                        }
                        return inner;
                    })}

                    {href && (
                        <Link href={href} style={{ textDecoration: 'none' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '8px 0 4px', marginTop: 4,
                                fontSize: 11, fontWeight: 600, color: accentColor,
                                textTransform: 'uppercase' as const, letterSpacing: '0.1em',
                            }}>
                                Alles bekijken <ArrowRight size={12} />
                            </div>
                        </Link>
                    )}
                </div>
            )}
        </MetallicCard>
    );

    // If no drill-down items but has href, wrap in Link
    if (!items?.length && href) {
        return <Link href={href}>{card}</Link>;
    }

    return card;
}
