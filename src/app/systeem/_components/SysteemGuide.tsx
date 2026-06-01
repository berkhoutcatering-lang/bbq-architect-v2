import { Settings } from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';

export default function SysteemGuide() {
    return (
        <PageGuideNote
            id="systeem"
            accent="#64748b"
            icon={<Settings size={14} />}
            intro="Het bouwbord van de app — alles wat je 1× instelt en daarna nooit meer aanraakt staat hier."
            actions={[
                { lead: 'Instellingen', text: 'voor je bedrijfsgegevens, logo en huisstijl die overal terugkomen op offertes en facturen.' },
                { lead: 'Integraties', text: 'om Moneybird, Mollie en Google Calendar te koppelen — eenmalige autorisatie.' },
                { lead: 'Help Center', text: 'als je vastloopt — daar staan korte uitleg-artikelen per hub.' },
            ]}
        />
    );
}
