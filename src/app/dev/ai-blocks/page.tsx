'use client';

import BlockRenderer from '@/components/ai/BlockRenderer';
import type { Block } from '@/lib/ai/blocks';

// Voorbeeld-blocks die de 8 types dekken. Sam gebruikt deze pagina om visueel
// te checken of elke block correct rendert. Geen API-calls hier — pure UI.
const SAMPLE_BLOCKS: Block[] = [
    {
        type: 'metric',
        title: 'Volgende event',
        value: 'Bruiloft Berkhout',
        delta: { value: 'over 6 uur', tone: 'neutral' },
    },
    {
        type: 'metric',
        title: 'Marge mei',
        value: '68%',
        delta: { value: '+4% vs april', tone: 'positive' },
        text: 'Boven 60% target, ruim binnen Pro-tier streefcijfer.',
    },
    // ─── NIEUW: klikbare metric (route + label) ───
    {
        type: 'metric',
        title: 'Totale pipeline-omzet',
        value: '€10.051,58',
        text: '6 events · 404 gasten',
        route: '/offertes',
        label: 'Open offertes',
    },
    {
        type: 'info',
        title: 'Prep-tijdlijn voor 60 gasten',
        text: 'Berekend op basis van menu × gasten. Kerntijden: pekel D-3, rub D-2, smoker aan D-1 om 06:00.',
    },
    {
        type: 'success',
        title: 'Inkooplijst aangemaakt',
        text: '23 items, automatisch gecategoriseerd per leverancier. Bekijk via de inkoop-pagina.',
    },
    {
        type: 'warning',
        title: 'HACCP nog niet ingericht',
        text: 'Geen temp-registraties voor vandaag — schakel veldmodus in zodra je begint.',
        severity: 'medium',
    },
    {
        type: 'warning',
        title: 'Geen allergeen-check',
        text: 'Klant heeft geen lijst aangeleverd — vraag voor je inkoop bestelt.',
        severity: 'high',
    },
    {
        type: 'bullets',
        title: 'Menu (4 gangen)',
        items: [
            'Bites: Buikspek lolly',
            'Voorgerecht: Beef tartaar',
            'Hoofd: Pulled pork brioche',
            'Dessert: Smoked cheesecake',
        ],
    },
    // ─── NIEUW: bullets met klikbare items per entity (Sam's vraag) ───
    {
        type: 'bullets',
        title: 'Aankomende events op een rij',
        items: [
            { text: '20 jun — Mariel Velema · 44 gasten · €1.554', route: '/events/12', icon: 'Calendar', badge: { text: 'menu OK', tone: 'success' } },
            { text: '27 jun — Offerte Platen · 40 gasten · €1.700', route: '/events/13', icon: 'Calendar', badge: { text: 'geen menu', tone: 'danger' } },
            { text: '09 aug — Miranda Berkhout · 45 gasten · €1.733', route: '/events/14', icon: 'Calendar', badge: { text: 'geen menu', tone: 'danger' } },
            { text: '16 aug — Cor Berkhout · 60 gasten · €2.490', route: '/events/15', icon: 'Calendar', badge: { text: 'geen menu', tone: 'danger' } },
            'Plus 2 meer (sleep om te scrollen)',
        ],
    },
    {
        type: 'action_hint',
        title: 'Tip',
        text: 'Bel klant Berkhout morgen voor allergeen-check. Heb je 5 dagen geleden de offerte gestuurd.',
    },
    // ─── De Sam-vraag: nav_card ───
    {
        type: 'nav_card',
        title: 'Inkooplijst voor Bruiloft Berkhout',
        summary: '23 items, €847 totaal, event over 2 dagen',
        route: '/inkoop?event=12',
        label: 'Open inkooplijst',
        icon: 'ShoppingCart',
        badge: { text: '3 items low stock', tone: 'warning' },
        preview: [
            '12 kg buikspek (Slager Jansen)',
            '5 kg pulled pork (Slager Jansen)',
            '4 broden brioche (Bakker De Korenmolen)',
            '2 kg salade-mix (Versmarkt)',
            '+19 andere items',
        ],
    },
    {
        type: 'nav_card',
        title: 'Mise-en-place check',
        summary: '12 prep-taken, 3 nog open',
        route: '/agenda',
        label: 'Naar prep',
        icon: 'CheckSquare',
        badge: { text: '3 open', tone: 'warning' },
    },
    {
        type: 'nav_card',
        title: 'Marges deze maand',
        summary: 'Stars: 4 · Plowhorses: 2 · Puzzles: 1 · Dogs: 0',
        route: '/marges',
        label: 'Open marges',
        icon: 'BarChart3',
        badge: { text: 'gezond', tone: 'success' },
    },
    // ─── action_card ───
    {
        type: 'action_card',
        title: 'Maak inkooplijst voor Bruiloft Berkhout aan',
        summary: '23 items, automatisch berekend uit menu × 60 gasten. Voorraad wordt afgetrokken.',
        action: { type: 'create_inkooplijst', data: { event_id: 12 } },
        confirm_label: 'Maak aan',
    },
    {
        type: 'action_card',
        title: 'Verwijder gerecht "Garnalen-cocktail"',
        summary: 'Niet gekoppeld aan events sinds 2026-01. Wordt definitief verwijderd.',
        action: { type: 'delete_gerecht', data: { id: 'abc-123' } },
        confirm_label: 'Verwijder',
        cancel_label: 'Annuleer',
        destructive: true,
    },
];

export default function AiBlocksPreviewPage() {
    return (
        <main
            style={{
                maxWidth: 720,
                margin: '0 auto',
                padding: 'var(--space-6) var(--space-4)',
                color: 'var(--text)',
            }}
        >
            <header style={{ marginBottom: 'var(--space-6)' }}>
                <h1
                    style={{
                        fontSize: 'var(--text-xl)',
                        fontWeight: 700,
                        marginBottom: 'var(--space-2)',
                    }}
                >
                    AI Block Renderer — preview
                </h1>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-light)', lineHeight: 1.5 }}>
                    Sprint 1 deliverable: alle 8 block-types met realistische voorbeeld-data.
                    Klik op een nav_card om te navigeren. Klik action_card "Maak aan" om de
                    confirm-flow te zien (in deze preview-page is geen echte handler — log only).
                </p>
            </header>

            <BlockRenderer
                blocks={SAMPLE_BLOCKS}
                onNavigate={() => {
                    // log only — echte palette/drawer sluit hier
                    console.log('[ai-blocks] nav_card geklikt');
                }}
                onExecute={async (action) => {
                    console.log('[ai-blocks] action_card uitgevoerd:', action);
                    // simuleer een 600ms server-roundtrip zodat je de spinner ziet
                    await new Promise((resolve) => setTimeout(resolve, 600));
                }}
            />

            <footer
                style={{
                    marginTop: 'var(--space-8)',
                    paddingTop: 'var(--space-4)',
                    borderTop: '1px solid var(--border)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--muted)',
                }}
            >
                <p>
                    Sprint 1 van het plan{' '}
                    <a
                        href="/Users/mathi/.claude/plans/ga-een-super-goede-scalable-jellyfish.md"
                        style={{ color: 'var(--brand)' }}
                    >
                        ga-een-super-goede-scalable-jellyfish.md
                    </a>
                    . Geen breaking changes voor de huidige <code>respond_with_blocks</code> tool —
                    Sprint 2 voegt nav_card en action_card toe aan het tool-schema.
                </p>
            </footer>
        </main>
    );
}
