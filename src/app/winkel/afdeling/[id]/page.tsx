import { redirect } from 'next/navigation';

/** Een afdeling is nu een filter op Assortiment. Oude links blijven werken. */
export default async function AfdelingPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/voorraad/winkel?afdeling=${encodeURIComponent(id)}`);
}
