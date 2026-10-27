'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { HelpCircle, LayoutGrid, LogOut, Settings, ToggleRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useOrg } from '@/lib/OrgContext';
import { openTegelscherm } from './events';

/* De AI-verbruiksmeter stond altijd in de zijbalk en vroeg op elke pagina (en
   elke 2 minuten) het verbruik op. Nu pas als je dit menu opent. */
const AiUsageMeter = dynamic(() => import('@/components/AiUsageMeter'), { ssr: false });

/**
 * Wie ben je, bij welk bedrijf, en de dingen die bij jou horen:
 * AI-verbruik, Instellingen, Onderdelen aan/uit, Hulp, Uitloggen.
 * Voorheen onderaan de zijbalk.
 */
export default function GebruikerMenu() {
    const { user, signOut } = useAuth();
    const { organization, userRole, isAdmin } = useOrg();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const ankerRef = useRef<HTMLDivElement>(null);
    const knopRef = useRef<HTMLButtonElement>(null);

    const naam = (user?.user_metadata?.name as string | undefined) || user?.email?.split('@')[0] || 'Gebruiker';
    const letter = naam.charAt(0).toUpperCase();

    /* Dicht bij navigeren, Esc en een klik ernaast. */
    useEffect(function () { setOpen(false); }, [pathname]);
    useEffect(function () {
        if (!open) return;
        function opToets(e: KeyboardEvent) {
            if (e.key === 'Escape') { setOpen(false); knopRef.current?.focus(); }
        }
        function opKlik(e: MouseEvent) {
            if (ankerRef.current && !ankerRef.current.contains(e.target as Node)) setOpen(false);
        }
        window.addEventListener('keydown', opToets);
        window.addEventListener('mousedown', opKlik);
        return function () {
            window.removeEventListener('keydown', opToets);
            window.removeEventListener('mousedown', opKlik);
        };
    }, [open]);

    return (
        <div className="wr-menu-anker" ref={ankerRef}>
            <button
                ref={knopRef}
                type="button"
                className="wr-avatar"
                onClick={function () { setOpen(function (v) { return !v; }); }}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={'Menu van ' + naam}
                title={naam}
            >
                {letter}
            </button>
            {open && (
                <div className="wr-menu" role="menu" aria-label="Gebruikersmenu">
                    <div className="wr-menu-kop">
                        <div className="wr-menu-naam">{naam}</div>
                        <div className="wr-menu-sub">
                            {(userRole || 'Lid') + (organization ? ' · ' + organization.name : '')}
                        </div>
                    </div>
                    <div className="wr-menu-meter">
                        <AiUsageMeter variant="compact" />
                    </div>
                    <button
                        type="button"
                        role="menuitem"
                        className="wr-menu-item"
                        onClick={function () { setOpen(false); openTegelscherm(); }}
                    >
                        <LayoutGrid /> Alle onderdelen
                    </button>
                    <Link href="/instellingen" role="menuitem" className="wr-menu-item">
                        <Settings /> Instellingen
                    </Link>
                    {isAdmin && (
                        <Link href="/instellingen/onderdelen" role="menuitem" className="wr-menu-item">
                            <ToggleRight /> Onderdelen aan/uit
                        </Link>
                    )}
                    <Link href="/hulp" role="menuitem" className="wr-menu-item">
                        <HelpCircle /> Hulp
                    </Link>
                    <button
                        type="button"
                        role="menuitem"
                        className="wr-menu-item wr-menu-item--gevaar"
                        onClick={function () { void signOut(); }}
                    >
                        <LogOut /> Uitloggen
                    </button>
                </div>
            )}
        </div>
    );
}
