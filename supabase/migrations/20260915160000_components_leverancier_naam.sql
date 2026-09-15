-- Eigen inkoop-bouwstenen dragen bij wie ze gekocht worden ("Paprikapoeder —
-- Van Beekum"). Zonder dit veld ziet de kok in de zoekbalk alleen "eigen
-- bibliotheek" en niet of het de slager of de specerijenman is. Vrije tekst,
-- geen FK: de slager en Van Beekum hebben geen prijslijst in de app en hoeven
-- daarvoor geen leverancierskaart met alles erop en eraan.
alter table public.components add column if not exists leverancier_naam text;
comment on column public.components.leverancier_naam is
    'Bij wie deze inkoop-bouwsteen gekocht wordt (vrije tekst). Gezet bij "zelf invullen" in het ingrediënt-paneel.';
