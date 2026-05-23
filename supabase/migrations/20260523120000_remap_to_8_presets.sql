-- Remap legacy 6-preset hex signatures into the new 8-preset library.
--
-- Each UPDATE matches on (brand_background, brand_primary) only — that
-- pair is unique across the legacy 6, so no false positives are possible.
-- Custom hex that doesn't exact-match a legacy preset is left untouched
-- (tenant kept their own customization).
--
-- New presets that have no legacy equivalent (drents-eik, zandstrand)
-- are reachable through the picker but not auto-assigned.

-- smokehouse → smoke-and-steel
update public.settings set
    brand_background = '#110c0a',
    brand_card       = '#221b18',
    brand_text       = '#f3f2ee',
    brand_primary    = '#e78a45',
    brand_accent     = '#5c8f9f',
    brand_secondary  = '#050302'
where lower(brand_background) = '#181412' and lower(brand_primary) = '#d49b4d';

-- graphite → nordic-graphite
update public.settings set
    brand_background = '#0c0d0f',
    brand_card       = '#1d1f23',
    brand_text       = '#f4f5f7',
    brand_primary    = '#c8b778',
    brand_accent     = '#9199a5',
    brand_secondary  = '#030304'
where lower(brand_background) = '#0e1014' and lower(brand_primary) = '#d8c277';

-- cellar → brandstapel
update public.settings set
    brand_background = '#160909',
    brand_card       = '#2f1c1c',
    brand_text       = '#f1eee9',
    brand_primary    = '#cba553',
    brand_accent     = '#c8635d',
    brand_secondary  = '#090303'
where lower(brand_background) = '#241015' and lower(brand_primary) = '#dac786';

-- linen → witte-berken
update public.settings set
    brand_background = '#f5f1e9',
    brand_card       = '#fefcf7',
    brand_text       = '#1c1411',
    brand_primary    = '#6e401e',
    brand_accent     = '#9a5240',
    brand_secondary  = '#e6e0d7'
where lower(brand_background) = '#f4eed8' and lower(brand_primary) = '#9a6a3e';

-- studio → studio-paper
update public.settings set
    brand_background = '#f5f5f5',
    brand_card       = '#ffffff',
    brand_text       = '#121212',
    brand_primary    = '#141618',
    brand_accent     = '#c53637',
    brand_secondary  = '#e8e8e8'
where lower(brand_background) = '#f6f6f6' and lower(brand_primary) = '#222222';

-- garden → moestuin
update public.settings set
    brand_background = '#eff0e1',
    brand_card       = '#fcfcf5',
    brand_text       = '#191c12',
    brand_primary    = '#465e2c',
    brand_accent     = '#9b4630',
    brand_secondary  = '#dedfd1'
where lower(brand_background) = '#ece9d6' and lower(brand_primary) = '#6b7847';
