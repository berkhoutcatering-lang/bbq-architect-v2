'use client';
import { useState } from 'react';
import MetallicCard from '@/components/MetallicCard';
import PageHint from '@/components/PageHint';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface FaqItem {
    vraag: string;
    antwoord: string;
}

const FAQ_ITEMS: FaqItem[] = [
    {
        vraag: 'Hoe maak ik een offerte?',
        antwoord: 'Ga naar Offertes in het menu De Zaak en klik op "Nieuwe Offerte". Vul de klantgegevens in, voeg regels toe met gerechten en aantallen, en sla de offerte op. Je kunt de offerte direct als PDF versturen naar de klant.',
    },
    {
        vraag: 'Hoe werkt HACCP logging?',
        antwoord: 'Via het HACCP-tabblad in Beheer & Logistiek kun je temperatuurmetingen en voedselveiligheidscontroles registreren. Selecteer het event, kies het product, vul de temperatuur in en sla op. Alle registraties worden bewaard voor audits.',
    },
    {
        vraag: 'Hoe koppel ik mijn boekhouding?',
        antwoord: 'Ga naar Instellingen > Integraties. Daar kun je je boekhoudpakket (zoals Moneybird of Exact) koppelen. Facturen worden dan automatisch gesynchroniseerd.',
    },
    {
        vraag: 'Hoe beheer ik mijn voorraad?',
        antwoord: 'In het Voorraad-scherm kun je al je ingredienten en producten bijhouden. Voeg items toe met minimale voorraad, en BBQ Architect waarschuwt je wanneer je moet bijbestellen.',
    },
    {
        vraag: 'Kan ik meerdere events tegelijk plannen?',
        antwoord: 'Ja, via de Agenda en Events pagina kun je onbeperkt events aanmaken en beheren. Elk event kan zijn eigen menu, offerte en logistiek hebben. De agenda geeft een duidelijk overzicht van alle geplande events.',
    },
    {
        vraag: 'Hoe werkt de Pitmaster Studio?',
        antwoord: 'De Pitmaster Studio is je AI-assistent. Stel vragen over recepten, menusamenstelling, prijsberekening of klantcommunicatie. De AI helpt je met suggesties op basis van je data.',
    },
    {
        vraag: 'Hoe maak ik een factuur aan?',
        antwoord: 'Facturen kun je aanmaken vanuit een geaccepteerde offerte of handmatig via Facturen in het menu De Zaak. Vul de gegevens in, genereer een factuurnummer en verstuur als PDF.',
    },
    {
        vraag: 'Hoe voeg ik teamleden toe?',
        antwoord: 'Ga naar Systeem > Gebruikers en klik op "Gebruiker toevoegen". Vul de naam, e-mail en rol in. Je kunt kiezen uit Admin, Pitmaster of Medewerker. Elke rol heeft andere rechten.',
    },
    {
        vraag: 'Wat is Menu Engineering?',
        antwoord: 'Menu Engineering helpt je om je menu te optimaliseren op basis van populariteit en winstgevendheid. Je kunt gerechten categoriseren als Stars, Puzzles, Plowhorses of Dogs en strategische beslissingen nemen.',
    },
    {
        vraag: 'Hoe exporteer ik gegevens?',
        antwoord: 'De meeste overzichten hebben een export-optie. Je kunt offertes, facturen en voorraadlijsten exporteren als PDF of CSV. Ga naar het betreffende scherm en zoek de export-knop.',
    },
];

export default function FAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    function toggle(index: number) {
        setOpenIndex(openIndex === index ? null : index);
    }

    return (
        <>
            <PageHint
                id="faq"
                title="Veelgestelde vragen"
                description="Vind antwoorden op veelgestelde vragen over BBQ Architect"
            />

            <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Veelgestelde Vragen</h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                    Klik op een vraag om het antwoord te zien
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {FAQ_ITEMS.map(function (item, index) {
                    const isOpen = openIndex === index;
                    return (
                        <MetallicCard key={index} className="overflow-hidden" onClick={function () { toggle(index); }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '14px 16px', cursor: 'pointer',
                            }}>
                                <div style={{ color: '#c4a35a', flexShrink: 0, transition: 'transform 0.2s' }}>
                                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </div>
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                                    {item.vraag}
                                </span>
                            </div>
                            {isOpen && (
                                <div style={{
                                    padding: '0 16px 14px 46px',
                                    fontSize: 13, lineHeight: 1.6, color: 'var(--muted)',
                                    borderTop: '1px solid var(--border)',
                                    paddingTop: 12,
                                }}>
                                    {item.antwoord}
                                </div>
                            )}
                        </MetallicCard>
                    );
                })}
            </div>
        </>
    );
}
