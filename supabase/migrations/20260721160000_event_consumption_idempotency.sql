-- Event-verbruik idempotentie (perfect-pass, integriteit-fix).
--
-- Aanleiding (audit 2026-07-21): verbruik van een event boekte 0×, 1× of 2×
-- afhankelijk van welke knop de gebruiker toevallig gebruikte:
--   - service-mode trekt per geserveerde gang de mise af,
--   - EventEditor 'Afgerond' trekt het HELE menu nóg een keer af,
--   - reflectie 'Afronden' (de canonieke flow) trekt NIETS af.
-- Gevolg: current_stock — precies het getal waar de bestellijst op leunt — kon
-- stil corrupt raken.
--
-- Deze stamp fungeert als het ENE coördinatiepunt: het eerste boekpad (serve of
-- afronden) zet 'm; elk volgend afrond-pad ziet 'm en wordt een no-op. De
-- "update ... where inventory_drained_at is null" doet dienst als slot, zodat
-- ook gelijktijdige afrondingen exact één keer boeken.
alter table public.events add column if not exists inventory_drained_at timestamptz;

comment on column public.events.inventory_drained_at is
  'Wanneer het verbruik van dit event op de voorraad is geboekt (serve of afronden). NULL = nog niet geboekt. Fungeert als idempotency-slot zodat verbruik per event exact 1× telt.';
