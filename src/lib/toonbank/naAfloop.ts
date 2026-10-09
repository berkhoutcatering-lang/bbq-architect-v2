/**
 * Na een Toonbank-boeking (contract §4.2 stap 8): de voorraadmeldingen van de
 * geraakte producten bijwerken en het ververs-signaal naar de website. Beide
 * na het antwoord (next/server `after`): de tablet wacht er nooit op.
 * Buiten een verzoek (een script of test) gaat het los. Gooit nooit.
 */
import { after } from 'next/server';
import { evalueerWinkelMeldingen } from '@/lib/voorraad/meldingen';
import { verversNaAfloop } from '@/lib/website/verversSignaal';

export function naToonbankBoekingen(orgId: string, productIds: string[]): void {
    if (!productIds.length) return;
    const werk = async () => {
        try {
            await evalueerWinkelMeldingen(orgId, productIds);
        } catch (e) {
            console.error('[toonbank] meldingen bijwerken mislukt:', e instanceof Error ? e.message : String(e));
        }
    };
    try {
        after(werk);
    } catch {
        void werk();
    }
    verversNaAfloop();
}
