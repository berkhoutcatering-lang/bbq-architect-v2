/**
 * De kop van de kassabon (GET status, bon_kop): naam, adres, btw- en KvK-nummer uit Instellingen.
 * Het adres staat in settings als één regel ("Tramstraat 13, 7848 BG Schoonoord"); op de bon
 * worden dat losse regels, gesplitst op de komma.
 */
import type { BonKop } from './contract';

export interface InstellingenRuw {
    bedrijfsnaam?: string | null;
    adres?: string | null;
    kvk?: string | null;
    btw?: string | null;
    btw_nummer?: string | null;
}

const schoon = (t: string | null | undefined): string | null => (t ?? '').trim() || null;

/** Zonder bedrijfsnaam geen kop: dan print de Toonbank de bon zonder bedrijfsgegevens. */
export function bonKopUitInstellingen(s: InstellingenRuw | null): BonKop | null {
    const naam = schoon(s?.bedrijfsnaam);
    if (!s || !naam) return null;
    return {
        naam,
        adresregels: (s.adres ?? '').split(',').map((r) => r.trim()).filter(Boolean),
        btw_nummer: schoon(s.btw) ?? schoon(s.btw_nummer),
        kvk_nummer: schoon(s.kvk),
        voettekst: null,
    };
}
