import Link from 'next/link';
import { Boxes, ChefHat, ArrowRight, Library, Compass } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import DiscoverCombosBlock from './_components/DiscoverCombosBlock';

export const metadata = {
    title: 'Inspiratie Bibliotheek',
    description: 'Componenten en gerechten — jouw zichzelf-voedende bibliotheek',
};

export default function InspiratieLandingPage() {
    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader
                title="Inspiratie Bibliotheek"
                subtitle="Componenten en gerechten — jouw zichzelf-voedende bibliotheek"
                icon={<Library size={28} />}
            />

            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
                <Compass size={18} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-muted-foreground">
                    Twee lagen, één doel: jij bouwt aan een bibliotheek die met AI-hulp organisch groeit.{' '}
                    <strong className="text-foreground">Componenten</strong> zijn atomaire bouwblokken
                    (gegrilde ananas, kokos espuma, Hanos broodje).{' '}
                    <strong className="text-foreground">Gerechten</strong> zijn samenstellingen die je
                    goedkeurt en optioneel in de offerte-wizard zet.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Link
                    href="/inspiratie/componenten"
                    className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-primary hover:shadow-md"
                >
                    <div className="flex items-start gap-4">
                        <div className="rounded-xl bg-primary/10 p-3 text-primary">
                            <Boxes size={28} />
                        </div>
                        <div className="flex-1">
                            <h2 className="mb-1 text-xl font-semibold">Componenten</h2>
                            <p className="text-sm text-muted-foreground">
                                Atomaire bouwblokken — zelf-bereid (gegrilde ananas) of inkoop (Hanos broodje).
                                Eén plek voor receptuur, kostprijs, HACCP en allergenen. Wijziging propagaert
                                automatisch door alle gerechten die de component gebruiken.
                            </p>
                            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition group-hover:opacity-100">
                                Open componenten <ArrowRight size={14} />
                            </div>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/inspiratie/gerechten"
                    className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-primary hover:shadow-md"
                >
                    <div className="flex items-start gap-4">
                        <div className="rounded-xl bg-primary/10 p-3 text-primary">
                            <ChefHat size={28} />
                        </div>
                        <div className="flex-1">
                            <h2 className="mb-1 text-xl font-semibold">Gerechten</h2>
                            <p className="text-sm text-muted-foreground">
                                Goedgekeurde gerechten samengesteld uit componenten. Marges per gerecht inline,
                                BCG-analyse als toggle. Vink aan voor de offerte-wizard en je menu groeit zonder dubbel
                                werk te doen.
                            </p>
                            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition group-hover:opacity-100">
                                Open gerechten <ArrowRight size={14} />
                            </div>
                        </div>
                    </div>
                </Link>
            </div>

            <DiscoverCombosBlock />
        </div>
    );
}
