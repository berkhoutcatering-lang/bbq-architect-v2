-- =============================================
-- BBQ Architect — Supabase Schema
-- Kopieer ALLES en plak in de SQL Editor, klik Run
-- =============================================

-- 1. Settings (enkele rij voor bedrijfsgegevens)
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bedrijfsnaam TEXT DEFAULT 'Hop en Bites',
  ondertitel TEXT DEFAULT 'BBQ Catering Drenthe',
  email TEXT DEFAULT 'info@hopenbites.nl',
  telefoon TEXT DEFAULT '',
  adres TEXT DEFAULT 'Drenthe, Nederland',
  kvk TEXT DEFAULT '',
  btw TEXT DEFAULT '',
  iban TEXT DEFAULT '',
  factuur_prefix TEXT DEFAULT 'F2026-',
  offerte_prefix TEXT DEFAULT 'OFF-2026-',
  default_btw INT DEFAULT 21,
  betaaltermijn INT DEFAULT 14,
  offerte_geldig INT DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. Recepten
CREATE TABLE IF NOT EXISTS recepten (
  id SERIAL PRIMARY KEY,
  naam TEXT NOT NULL DEFAULT '',
  categorie TEXT DEFAULT 'Vlees',
  porties INT DEFAULT 4,
  preptime INT DEFAULT 30,
  ingredienten JSONB DEFAULT '[]',
  instructies TEXT DEFAULT '',
  notitie TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Facturen
CREATE TABLE IF NOT EXISTS facturen (
  id SERIAL PRIMARY KEY,
  nummer TEXT NOT NULL DEFAULT '',
  status TEXT DEFAULT 'concept',
  client_naam TEXT DEFAULT '',
  client_adres TEXT DEFAULT '',
  datum TEXT DEFAULT '',
  vervaldatum TEXT DEFAULT '',
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Offertes
CREATE TABLE IF NOT EXISTS offertes (
  id SERIAL PRIMARY KEY,
  nummer TEXT NOT NULL DEFAULT '',
  status TEXT DEFAULT 'concept',
  client_naam TEXT DEFAULT '',
  client_adres TEXT DEFAULT '',
  datum TEXT DEFAULT '',
  geldig_tot TEXT DEFAULT '',
  notitie TEXT DEFAULT '',
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Events
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  date TEXT DEFAULT '',
  guests INT DEFAULT 50,
  location TEXT DEFAULT '',
  ppp NUMERIC(10,2) DEFAULT 45.00,
  status TEXT DEFAULT 'pending',
  client_naam TEXT DEFAULT '',
  client_adres TEXT DEFAULT '',
  client_tel TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  type TEXT DEFAULT 'Particulier',
  notitie TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Prep Tasks (Agenda)
CREATE TABLE IF NOT EXISTS prep_tasks (
  id SERIAL PRIMARY KEY,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  text TEXT DEFAULT '',
  dagen INT DEFAULT -1,
  done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. RTR Items (Logistiek checklist)
CREATE TABLE IF NOT EXISTS rtr_items (
  id SERIAL PRIMARY KEY,
  text TEXT DEFAULT '',
  done BOOLEAN DEFAULT false
);

INSERT INTO rtr_items (text) VALUES
  ('Smoker opwarmen'),
  ('Houtskool laden'),
  ('Thermometers kalibreren'),
  ('Vlees uit koeling halen'),
  ('BBQ gereedschap klaarleggen'),
  ('Serveermateriaal controleren');

-- 8. Pack Lists (Logistiek paklijsten)
CREATE TABLE IF NOT EXISTS pack_lists (
  id SERIAL PRIMARY KEY,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. HACCP Records
CREATE TABLE IF NOT EXISTS haccp_records (
  id SERIAL PRIMARY KEY,
  event_id INT,
  datum TEXT DEFAULT '',
  tijd TEXT DEFAULT '',
  wat TEXT DEFAULT '',
  temp NUMERIC(5,1) DEFAULT 0,
  type TEXT DEFAULT 'kern',
  notitie TEXT DEFAULT '',
  status TEXT DEFAULT 'ok',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Leveranciers (Inkoop)
CREATE TABLE IF NOT EXISTS leveranciers (
  id SERIAL PRIMARY KEY,
  naam TEXT NOT NULL DEFAULT '',
  type TEXT DEFAULT 'Overig',
  contact TEXT DEFAULT '',
  email TEXT DEFAULT '',
  tel TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Inkooplijsten (Inkoop)
CREATE TABLE IF NOT EXISTS inkooplijsten (
  id SERIAL PRIMARY KEY,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Materieel
CREATE TABLE IF NOT EXISTS materieel (
  id SERIAL PRIMARY KEY,
  naam TEXT NOT NULL DEFAULT '',
  type TEXT DEFAULT 'Overig',
  status TEXT DEFAULT 'ok',
  aanschaf_datum TEXT DEFAULT '',
  notitie TEXT DEFAULT '',
  logboek JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RLS Policies (toegangsrechten)
-- =============================================
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON settings FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE recepten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON recepten FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE facturen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON facturen FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE offertes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON offertes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON events FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE prep_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON prep_tasks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE rtr_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON rtr_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE pack_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON pack_lists FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE haccp_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON haccp_records FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE leveranciers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON leveranciers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE inkooplijsten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON inkooplijsten FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE materieel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON materieel FOR ALL USING (true) WITH CHECK (true);
