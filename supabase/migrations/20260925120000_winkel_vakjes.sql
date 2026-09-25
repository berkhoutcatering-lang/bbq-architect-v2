-- ════════════════════════════════════════════════════════════════════════════
--  Webshop-vakjes — elk betaald bonnetje op de dag dat het klaar moet zijn
--  Plan: docs/webshop-beheer-bouwplan.md (versie 2), §2
-- ════════════════════════════════════════════════════════════════════════════
--
--  Alles additief: nieuwe kolommen zijn NULL-baar of krijgen een backfill uit
--  wat er al staat. Bestaande code die de winkel_-tabellen leest merkt er
--  niets van.
--
--  Vier ideeën in de kolomnamen:
--    1. Een artikel weet wat de keuken ervoor maakt (gerecht_id) óf wat je
--       ervoor inkoopt (inventory_id). Nooit allebei; mag ook geen van beide
--       ("nog niet gekoppeld") — dat zegt het scherm, hier wordt niets geraden.
--    2. Elke orderregel heeft een klaar_op-dag: het moment, anders de dag van
--       de order. Dat is het vakje.
--    3. Een event kan hét vakje voor een afhaalmoment zijn (winkel_moment_id,
--       uniek). Twee betalingen tegelijk kunnen dan nooit twee events maken.
--    4. Wat de AI uit de opmerking van de klant las staat naast het origineel
--       (wensen + wensen_bron), nooit in plaats daarvan.
--
--  Golf 3 (inkoop per vakje) krijgt zijn eigen migratie op concept_inkoop_orders.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_artikelen') IS NULL
       OR to_regclass('public.winkel_orders') IS NULL
       OR to_regclass('public.winkel_order_regels') IS NULL
       OR to_regclass('public.winkel_momenten') IS NULL THEN
        RAISE EXCEPTION 'winkel_vakjes: de winkel_-tabellen ontbreken (migratie 20260913120000_winkel_kassa)';
    END IF;
    IF to_regclass('public.events') IS NULL THEN
        RAISE EXCEPTION 'winkel_vakjes: tabel public.events ontbreekt';
    END IF;
    IF to_regclass('public.gerechten') IS NULL OR to_regclass('public.inventory') IS NULL THEN
        RAISE EXCEPTION 'winkel_vakjes: gerechten of inventory ontbreekt';
    END IF;
END $$;


-- ── 1. winkel_artikelen — wat de keuken maakt of wat je inkoopt ─────────────
ALTER TABLE public.winkel_artikelen
    ADD COLUMN IF NOT EXISTS gerecht_id       UUID     REFERENCES public.gerechten(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS inventory_id     INTEGER  REFERENCES public.inventory(id)  ON DELETE SET NULL,
    -- Hoeveel van het voorraad-item één besteld stuk kost, in de eenheid van
    -- dat item. Leeg = 1 (een fles is een fles).
    ADD COLUMN IF NOT EXISTS inkoop_per_stuk  NUMERIC  CHECK (inkoop_per_stuk IS NULL OR inkoop_per_stuk > 0),
    ADD COLUMN IF NOT EXISTS dieet            TEXT     CHECK (dieet IS NULL OR dieet IN ('vegetarisch', 'veganistisch')),
    -- Het laatste voorstel van de koppel-voorsteller; blijft staan tot er
    -- gekozen is. { soort, id, naam, zekerheid, reden }
    ADD COLUMN IF NOT EXISTS koppel_voorstel  JSONB;

DO $$ BEGIN
    ALTER TABLE public.winkel_artikelen
        ADD CONSTRAINT winkel_artikelen_een_koppeling
        CHECK (gerecht_id IS NULL OR inventory_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.winkel_artikelen.gerecht_id IS
    'De keuken maakt dit gerecht voor het artikel (Kerst-Box, plank). Leeg = de keuken ziet alleen aantallen.';
COMMENT ON COLUMN public.winkel_artikelen.inventory_id IS
    'Dit koop je in voor het artikel (bier, saus). Leeg en geen gerecht = nog niet gekoppeld; het scherm zegt dat.';

-- De vegetarische Kerst-Box is vegetarisch. Dat is een feit uit de catalogus,
-- geen gok; de rest blijft leeg.
UPDATE public.winkel_artikelen SET dieet = 'vegetarisch'
 WHERE slug = 'kerst-box-vegetarisch' AND dieet IS NULL;


-- ── 2. winkel_order_regels — de dag van het vakje ───────────────────────────
ALTER TABLE public.winkel_order_regels
    ADD COLUMN IF NOT EXISTS klaar_op       DATE,
    ADD COLUMN IF NOT EXISTS event_id       INTEGER REFERENCES public.events(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS klaargezet_at  TIMESTAMPTZ;

-- Backfill: het moment op de regel, anders het moment van de order, anders de
-- dag waarop de order is aangemaakt (Europe/Amsterdam).
UPDATE public.winkel_order_regels r
   SET klaar_op = COALESCE(
        (SELECT m.datum FROM public.winkel_momenten m WHERE m.id = r.moment_id),
        (SELECT m.datum FROM public.winkel_orders o JOIN public.winkel_momenten m ON m.id = o.moment_id WHERE o.id = r.order_id),
        (SELECT (o.created_at AT TIME ZONE 'Europe/Amsterdam')::date FROM public.winkel_orders o WHERE o.id = r.order_id)
   )
 WHERE klaar_op IS NULL;

ALTER TABLE public.winkel_order_regels ALTER COLUMN klaar_op SET NOT NULL;

CREATE INDEX IF NOT EXISTS winkel_order_regels_klaar_op_idx ON public.winkel_order_regels(organization_id, klaar_op);
CREATE INDEX IF NOT EXISTS winkel_order_regels_event_idx    ON public.winkel_order_regels(event_id) WHERE event_id IS NOT NULL;

COMMENT ON COLUMN public.winkel_order_regels.klaar_op IS
    'De dag van het vakje: het afhaalmoment/de afhaaldag, anders de dag van de order. Altijd gevuld.';
COMMENT ON COLUMN public.winkel_order_regels.event_id IS
    'Het event waarin deze regel is geplaatst. Leeg = vaste bak Vandaag (geen moment) of nog niet geplaatst.';


-- ── 3. winkel_orders — wat er gelezen is en hoe de plaatsing ging ───────────
ALTER TABLE public.winkel_orders
    ADD COLUMN IF NOT EXISTS wensen            JSONB,
    ADD COLUMN IF NOT EXISTS wensen_bron       TEXT CHECK (wensen_bron IS NULL OR wensen_bron IN ('geen', 'ai', 'handmatig', 'mislukt')),
    ADD COLUMN IF NOT EXISTS plaatsing_status  TEXT CHECK (plaatsing_status IS NULL OR plaatsing_status IN ('geplaatst', 'vaste_bak', 'mislukt')),
    ADD COLUMN IF NOT EXISTS plaatsing_fout    TEXT,
    ADD COLUMN IF NOT EXISTS plaatsing_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.winkel_orders.wensen IS
    'Uit de opmerking van de klant gelezen: { vegetarisch, veganistisch, glutenvrij, allergenen[], overig[] }. NULL = niets gelezen. Staat altijd naast de originele opmerking.';
COMMENT ON COLUMN public.winkel_orders.plaatsing_status IS
    'geplaatst = in een event; vaste_bak = alleen losse producten/verzenden; mislukt = zie plaatsing_fout, knop Plaats opnieuw.';


-- ── 4. events — het event kent zijn afhaalmoment ────────────────────────────
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS winkel_moment_id  UUID REFERENCES public.winkel_momenten(id) ON DELETE SET NULL,
    -- Per gerecht het aantal gasten: { "<gerecht-uuid>": 17, "<vega-uuid>": 3 }.
    -- Waar dit een getal heeft rekent de keuken daarmee in plaats van met guests.
    ADD COLUMN IF NOT EXISTS menu_gasten       JSONB;

-- Eén event per afhaalmoment. Botsende webhooks vangt deze index; de tweede
-- leest het bestaande event.
CREATE UNIQUE INDEX IF NOT EXISTS events_winkel_moment_uniek
    ON public.events(winkel_moment_id) WHERE winkel_moment_id IS NOT NULL;

COMMENT ON COLUMN public.events.winkel_moment_id IS
    'Dit event is het vakje voor dit afhaalmoment van de webshop. Uniek: nooit twee events voor één moment.';
COMMENT ON COLUMN public.events.menu_gasten IS
    'Aantal per gerecht-uuid. Gevuld door de webshop-plaatsing; de MEP/kookbord/bulkSchedule rekenen hiermee als het er is, anders met guests.';
