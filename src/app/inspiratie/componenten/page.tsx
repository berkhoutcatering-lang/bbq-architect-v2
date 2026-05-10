import Link from 'next/link';
import { Boxes, ArrowLeft, Construction } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

export const metadata = {
    title: 'Componenten — Inspiratie Bibliotheek',
    description: 'Atomaire bouwblokken voor je gerechten',
};

export default function ComponentenPage() {
    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <Link
                href="/inspiratie"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft size={14} /> Inspiratie Bibliotheek
            </Link>

            <PageHeader
                title="Componenten"
                subtitle="Atomaire bouwblokken — zelf-bereid en inkoop, één concept"
                icon={<Boxes size={28} />}
            />

            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center">
                <Construction size={48} className="mx-auto mb-4 text-muted-foreground" />
                <h2 className="mb-2 text-lg font-semibold">Componenten-bibliotheek komt in PR2</h2>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    Hier landt de CRUD voor componenten: zelf-bereid (gegrilde ananas, kokos espuma) en inkoop
                    (Hanos broodje, Sligro saus). Plus AI-genereer, allergeen-suggesties en HACCP-punten per onderdeel.
                </p>
                <div className="mt-6 text-xs text-muted-foreground">
                    Foundation gelegd in <code className="rounded bg-muted px-1.5 py-0.5">20260510120000_inspiratie_bibliotheek_foundation.sql</code>
                </div>
            </div>
        </div>
    );
}
