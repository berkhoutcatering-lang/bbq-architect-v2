-- ════════════════════════════════════════════════════════════════════════════
--  Migration — arrangementen.min_gasten
--
--  Configureerbaar minimum aantal gasten per arrangement. De cateraar stelt dit
--  in de bouwer in (bv. 20); de publieke configurator én de server-side POST
--  dwingen het af zodat een klant niet onder het minimum kan aanvragen.
--
--  Additief + defaulted (1) → geen impact op bestaande rijen. CHECK borgt >= 1.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.arrangementen
  ADD COLUMN IF NOT EXISTS min_gasten INTEGER NOT NULL DEFAULT 1 CHECK (min_gasten >= 1);

COMMENT ON COLUMN public.arrangementen.min_gasten IS 'Minimum aantal gasten dat de klant in de configurator kan kiezen. Door de cateraar ingesteld; server-side afgedwongen.';
