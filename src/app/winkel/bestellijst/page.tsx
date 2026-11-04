import InkoopScherm from '@/app/inkoop/_components/InkoopScherm';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Bestellijst',
    description: 'Wat de winkel moet bestellen, per leverancier.',
};

export default function WinkelBestellijstPage() {
    return <div className="pagina-rand" style={{ paddingTop: 20 }}><InkoopScherm sp={{}} plek="winkel" /></div>;
}
