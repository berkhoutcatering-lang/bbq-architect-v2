import Link from 'next/link';
import { Boxes, ChefHat, Sparkles, ArrowRight, Library } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PageGuideNote from '@/components/PageGuideNote';

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

            <PageGuideNote>
                <p>
                    Twee lagen, één doel: jij bouwt aan een bibliotheek die met AI-hulp organisch groeit.
                    <strong> Componenten</strong> zijn atomaire bouwblokken (gegrilde ananas, kokos espuma, Hanos broodje).
                    <strong> Gerechten</strong> zijn samenstellingen die je goedkeurt en optioneel in de offerte-wizard zet.
                </p>
            </PageGuideNote>

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

            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5">
                <div className="flex items-start gap-3">
                    <Sparkles size={20} className="mt-0.5 text-primary" />
                    <div>
                        <h3 className="font-medium">AI als Creative Chef</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Vraag de AI om een component te genereren, twee componenten te combineren tot een gerecht
                            of een passend Hanos/Sligro-product te zoeken. Jij blijft pitmaster — AI suggereert, jij keurt goed.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
