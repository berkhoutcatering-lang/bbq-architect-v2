import UitCatalogusClient from './_components/UitCatalogusClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Receptuur uit de groothandel · Gerechten',
    description: 'Pin een product uit je leverancier-catalogus vast en laat de AI het gerecht eromheen bouwen.',
};

export default function UitCatalogusPage() {
    return <UitCatalogusClient />;
}
