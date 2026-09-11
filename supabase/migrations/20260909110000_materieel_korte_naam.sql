-- Hoe een apparaat in de keuken heet.
--
-- In de database staat "METRO Professional GIC3135 inductiekookplaat". Dat is de
-- naam voor inkoop, garantie en verzekering. Op een telefoon in de keuken past
-- hij niet en niemand zegt hem zo — daar heet het ding "inductieplaat", en een
-- koelwerkbank heet "koelwerkbank 1, la 3".
--
-- De laden staan al in opslag_locaties; dit is alleen het apparaat zelf.

alter table public.materieel
  add column if not exists korte_naam text;

comment on column public.materieel.korte_naam is
  'Hoe dit ding in de keuken heet: "koelwerkbank 1", "pelletgrill", "inductieplaat". Op een telefoon in de keuken past "METRO Professional GIC3135 inductiekookplaat" niet, en niemand zegt het zo. De volledige naam blijft in naam staan voor inkoop, garantie en verzekering.';

-- Hop & Bites. Welke koelwerkbank nummer 1 is, is een keuze: 41 is de bank waar
-- je aan staat te werken (de ontleder koos hem in vrijwel elk recept als
-- werkvlak), 40 is de tweede. Omdraaien mag, het is maar een naam.
update public.materieel set korte_naam = 'pelletgrill'     where id = 21 and korte_naam is null;
update public.materieel set korte_naam = 'houtskoolgrill'  where id = 1  and korte_naam is null;
update public.materieel set korte_naam = 'inductieplaat'   where id = 38 and korte_naam is null;
update public.materieel set korte_naam = 'koelwerkbank 1'  where id = 41 and korte_naam is null;
update public.materieel set korte_naam = 'koelwerkbank 2'  where id = 40 and korte_naam is null;
update public.materieel set korte_naam = 'keukenmachine'   where id = 36 and korte_naam is null;
update public.materieel set korte_naam = 'snijmachine'     where id = 39 and korte_naam is null;
update public.materieel set korte_naam = 'vacuümmachine'   where id = 34 and korte_naam is null;
update public.materieel set korte_naam = 'thermowagen'     where id = 49 and korte_naam is null;
update public.materieel set korte_naam = 'aanhanger'       where id = 48 and korte_naam is null;
update public.materieel set korte_naam = 'vaatwasser'      where id = 35 and korte_naam is null;
