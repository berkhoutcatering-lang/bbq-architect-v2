"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LayoutGrid } from "lucide-react";
import { vindWerkruimte, werkruimteStart } from "@/lib/navigation";
import { useOnderdelen } from "@/lib/useOnderdelen";
import { openTegelscherm } from "@/components/werkruimte/events";

/* Onderbalk op de telefoon: Vandaag, drie werkruimtes, en Meer (= het
   tegelscherm met alle onderdelen). Labels en kleuren komen uit dezelfde
   bron als de werkruimtebalk (navigation.tsx), zodat telefoon en laptop
   dezelfde kaart van de app hebben.

   Volgorde = hoe vaak iemand het nodig heeft (Lars > Pro-tier > Mathijs):
   Plannen en Verkoop dagelijks, Keuken op event-dagen. Staat een van die
   drie uit, dan schuift de volgende werkruimte op. */
const VOORKEUR = ["plannen", "verkoop", "gerechten", "voorraad", "geld", "team"];
/* Vijf vakken op 375 px: lange namen passen niet onder een icoon. */
const KORT: Record<string, string> = { "Inkoop & Voorraad": "Voorraad", "Team & Operatie": "Team" };

export default function BottomNav() {
    const pathname = usePathname();
    const { werkruimtes } = useOnderdelen();
    const huidige = vindWerkruimte(pathname)?.section.slug ?? null;

    const vakken = VOORKEUR
        .map(function (slug) { return werkruimtes.find(function (w) { return w.slug === slug; }); })
        .filter(function (w): w is NonNullable<typeof w> { return !!w; })
        .slice(0, 3);
    const meerActief = huidige !== null && !vakken.some(function (v) { return v.slug === huidige; });

    return (
        <nav className="bottom-nav" role="navigation" aria-label="Mobiele navigatie">
            <Link
                href="/"
                className={"bottom-nav__tab" + (pathname === "/" ? " bottom-nav__tab--active" : "")}
                aria-current={pathname === "/" ? "page" : undefined}
            >
                <span className="bottom-nav__icon"><LayoutDashboard size={22} /></span>
                <span className="bottom-nav__label">Vandaag</span>
            </Link>
            {vakken.map(function (w) {
                const actief = huidige === w.slug;
                return (
                    <Link
                        key={w.slug}
                        href={werkruimteStart(w)}
                        className={"bottom-nav__tab" + (actief ? " bottom-nav__tab--active" : "")}
                        aria-current={actief ? "page" : undefined}
                    >
                        <span className="bottom-nav__icon bottom-nav__icon--groot">{w.icon}</span>
                        <span className="bottom-nav__label">{KORT[w.title] ?? w.title}</span>
                    </Link>
                );
            })}
            <button
                type="button"
                onClick={openTegelscherm}
                className={"bottom-nav__tab" + (meerActief ? " bottom-nav__tab--active" : "")}
                aria-label="Alle onderdelen"
            >
                <span className="bottom-nav__icon"><LayoutGrid size={22} /></span>
                <span className="bottom-nav__label">Meer</span>
            </button>
        </nav>
    );
}
