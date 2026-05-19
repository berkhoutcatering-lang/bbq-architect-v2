import PageHeader from '@/components/PageHeader';
import MenuAnalyseClient from './_client';

export const metadata = {
    title: 'Menu-analyse — Menu & Recepten',
    description: 'Marge × populariteit per gerecht — BCG-kwadrant, runners en bleeders',
};

/* P0.18 — menu-analyse is geen "Binnenkort"-stub meer; de bestaande BCG-
   matrix uit /marges leeft nu ook hier als ingebedde tab. Server Component
   shell + Client body — analoog patroon aan /gerechten/page.tsx. */
export default function MenuAnalysePage() {
    return (
        <div style={{ padding: 'var(--space-6) 0' }}>
            <PageHeader
                title="Menu-analyse"
                description="Marge × populariteit per gerecht. Ontdek runners, puzzelstukjes en marge-lekken."
            />
            <MenuAnalyseClient />
        </div>
    );
}
