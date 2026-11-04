import InkoopScherm from './_components/InkoopScherm';

export const dynamic = 'force-dynamic';

export default async function InkoopPage({ searchParams }: { searchParams: Promise<{ winkel?: string; vakje?: string; let?: string }> }) {
    return <InkoopScherm sp={await searchParams} plek="keuken" />;
}
