import type { ReactNode } from 'react';
import VoorraadTabs from '@/components/VoorraadTabs';

/* /voorraad/inkoop-checker — hernoemde route voor wat voorheen /price-intelligence
   was. Sam: "vind de naam price intelligence niet duidelijk voor de nuchtere
   drent". Backend en sub-componenten blijven hetzelfde (re-use van
   PriceIntelligenceClient); alleen URL + label veranderen.

   VoorraadTabs hier expliciet ingevoegd zodat de hub-navigatie blijft werken,
   net als op de oude /price-intelligence route. */
export default function InkoopCheckerLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <div style={{ padding: '16px 32px 0' }}>
                <VoorraadTabs />
            </div>
            {children}
        </>
    );
}
