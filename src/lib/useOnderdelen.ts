'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useSettings } from '@/lib/useSupabase';
import { zichtbareWerkruimtes, type NavSection, type ZichtbaarheidOpties } from '@/lib/navigation';

/* Platformbeheerders staan in een e-mail-allowlist (zelfde bron als AppShell
   en de /api/admin-routes). Alleen zij zien "Platform Beheer". */
function platformAdminEmails(): string[] {
    return (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS || '')
        .split(',')
        .map(function (e) { return e.trim().toLowerCase(); })
        .filter(Boolean);
}

export function useIsPlatformAdmin(): boolean {
    const { user } = useAuth();
    const email = (user?.email || '').toLowerCase();
    return email !== '' && platformAdminEmails().includes(email);
}

/**
 * Welke onderdelen dit bedrijf uitzette (Instellingen → Onderdelen) en de
 * werkruimtes zoals deze gebruiker ze ziet. Leest de gedeelde instellingen-
 * rij, dus geen extra vraag aan de database. Ontbreekt de kolom nog (migratie
 * niet gedraaid), dan is alles zichtbaar.
 */
export function useOnderdelen(): {
    verborgen: string[];
    opties: ZichtbaarheidOpties;
    werkruimtes: NavSection[];
    loading: boolean;
} {
    const { settings, loading } = useSettings();
    const isPlatformAdmin = useIsPlatformAdmin();
    const raw: unknown = settings?.verborgen_onderdelen;
    const verborgen = useMemo(function () {
        return Array.isArray(raw) ? raw.filter(function (x): x is string { return typeof x === 'string'; }) : [];
    }, [raw]);
    const opties = useMemo(function () { return { verborgen, isPlatformAdmin }; }, [verborgen, isPlatformAdmin]);
    const werkruimtes = useMemo(function () { return zichtbareWerkruimtes(opties); }, [opties]);
    return { verborgen, opties, werkruimtes, loading };
}
