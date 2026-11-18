/*
# Benchly — Core schema: profiles, projects, suppliers, offers, items, inflation, analyses, audit logs

1. New Tables
- `profiles`: one row per app user, linked to `auth.users`. Holds `role` (administrateur | utilisateur | lecteur), `full_name`, `region`, `is_active`. Created automatically on signup via trigger.
- `projects`: benchmarking projects. `title`, `budget` (numeric, DA), `target_year` (int), `region`, `status` (actif | cloture), `created_by`.
- `suppliers`: supplier directory. `name`, `nif`, `region`, `contact_name`, `contact_email`, `contact_phone`.
- `offers`: uploaded supplier offers linked to a project + supplier. `offer_date`, `total_amount` (numeric DA), `item_count` (int), `file_name`. Historical reference contracts use `is_reference` = true with `contract_ref` and `entrepreneur`.
- `offer_items`: parsed line items of an offer. `code`, `designation`, `unit`, `quantity`, `unit_price`, `total_price`.
- `inflation_rates`: editable annual inflation rates keyed by `year` (unique int, percent value numeric).
- `analyses`: AI analysis runs. `project_id`, `offer_id`, `status` (en_cours | terminee), `params` (jsonb), `summary` (jsonb), `run_by`.
- `analysis_items`: per-item results of a run: `decision` (bon_prix | prix_correct | a_negocier), `reference_price`, `method_used`, `matches` (jsonb).
- `audit_logs`: system log. `action`, `entity`, `details` (jsonb), `user_email`, `user_role`, `created_at`.

2. Security
- RLS enabled on every table. All policies `TO authenticated`.
- Role helper functions `is_admin()` and `can_write()` (SECURITY DEFINER) created AFTER the tables and BEFORE the policies that use them.
- Writes restricted to `utilisateur`/`administrateur`; deletes on projects to admins; audit logs readable by admins only.
- Trigger `on_auth_user_created` inserts a profile (default role `utilisateur`) on every signup.

3. Notes
- Historical reference contracts are offers with `is_reference` = true plus their items.
*/

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'utilisateur' CHECK (role IN ('administrateur','utilisateur','lecteur')),
  region text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  budget numeric NOT NULL DEFAULT 0,
  target_year int NOT NULL,
  region text NOT NULL,
  status text NOT NULL DEFAULT 'actif' CHECK (status IN ('actif','cloture')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nif text,
  region text,
  contact_name text,
  contact_email text,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Offers (supplier offers AND historical reference contracts via is_reference)
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  is_reference boolean NOT NULL DEFAULT false,
  offer_date date,
  total_amount numeric NOT NULL DEFAULT 0,
  item_count int NOT NULL DEFAULT 0,
  file_name text,
  entrepreneur text,
  contract_ref text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Offer line items
CREATE TABLE IF NOT EXISTS offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  code text,
  designation text NOT NULL,
  unit text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Inflation rates
CREATE TABLE IF NOT EXISTS inflation_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL UNIQUE,
  rate numeric NOT NULL DEFAULT 0
);

-- Analyses
CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES offers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours','terminee')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb,
  run_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Analysis item results
CREATE TABLE IF NOT EXISTS analysis_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  offer_item_id uuid REFERENCES offer_items(id) ON DELETE SET NULL,
  decision text NOT NULL DEFAULT 'prix_correct' CHECK (decision IN ('bon_prix','prix_correct','a_negocier')),
  reference_price numeric,
  method_used text,
  matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  user_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offers_project ON offers(project_id);
CREATE INDEX IF NOT EXISTS idx_offers_supplier ON offers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_items_offer ON offer_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_analyses_project ON analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_analysis_items_analysis ON analysis_items(analysis_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- Role helper functions (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'administrateur');
$$;

CREATE OR REPLACE FUNCTION public.can_write() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrateur','utilisateur') AND is_active);
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(), public.can_write() TO authenticated;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (full_name, region) ON profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Grants for data tables
GRANT SELECT, INSERT, UPDATE, DELETE ON projects, suppliers, offers, offer_items, inflation_rates, analyses, analysis_items, audit_logs TO authenticated;

-- Policies: readable by all authenticated; writable only by utilisateur/administrateur
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated USING (public.can_write()) WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT TO authenticated WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE TO authenticated USING (public.can_write()) WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "suppliers_delete" ON suppliers;
CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE TO authenticated USING (public.can_write());

DROP POLICY IF EXISTS "offers_select" ON offers;
CREATE POLICY "offers_select" ON offers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "offers_insert" ON offers;
CREATE POLICY "offers_insert" ON offers FOR INSERT TO authenticated WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "offers_update" ON offers;
CREATE POLICY "offers_update" ON offers FOR UPDATE TO authenticated USING (public.can_write()) WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "offers_delete" ON offers;
CREATE POLICY "offers_delete" ON offers FOR DELETE TO authenticated USING (public.can_write());

DROP POLICY IF EXISTS "offer_items_select" ON offer_items;
CREATE POLICY "offer_items_select" ON offer_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "offer_items_insert" ON offer_items;
CREATE POLICY "offer_items_insert" ON offer_items FOR INSERT TO authenticated WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "offer_items_update" ON offer_items;
CREATE POLICY "offer_items_update" ON offer_items FOR UPDATE TO authenticated USING (public.can_write()) WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "offer_items_delete" ON offer_items;
CREATE POLICY "offer_items_delete" ON offer_items FOR DELETE TO authenticated USING (public.can_write());

DROP POLICY IF EXISTS "inflation_select" ON inflation_rates;
CREATE POLICY "inflation_select" ON inflation_rates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "inflation_insert" ON inflation_rates;
CREATE POLICY "inflation_insert" ON inflation_rates FOR INSERT TO authenticated WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "inflation_update" ON inflation_rates;
CREATE POLICY "inflation_update" ON inflation_rates FOR UPDATE TO authenticated USING (public.can_write()) WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "inflation_delete" ON inflation_rates;
CREATE POLICY "inflation_delete" ON inflation_rates FOR DELETE TO authenticated USING (public.can_write());

DROP POLICY IF EXISTS "analyses_select" ON analyses;
CREATE POLICY "analyses_select" ON analyses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "analyses_insert" ON analyses;
CREATE POLICY "analyses_insert" ON analyses FOR INSERT TO authenticated WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "analyses_update" ON analyses;
CREATE POLICY "analyses_update" ON analyses FOR UPDATE TO authenticated USING (public.can_write()) WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "analyses_delete" ON analyses;
CREATE POLICY "analyses_delete" ON analyses FOR DELETE TO authenticated USING (public.can_write());

DROP POLICY IF EXISTS "analysis_items_select" ON analysis_items;
CREATE POLICY "analysis_items_select" ON analysis_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "analysis_items_insert" ON analysis_items;
CREATE POLICY "analysis_items_insert" ON analysis_items FOR INSERT TO authenticated WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "analysis_items_update" ON analysis_items;
CREATE POLICY "analysis_items_update" ON analysis_items FOR UPDATE TO authenticated USING (public.can_write()) WITH CHECK (public.can_write());
DROP POLICY IF EXISTS "analysis_items_delete" ON analysis_items;
CREATE POLICY "analysis_items_delete" ON analysis_items FOR DELETE TO authenticated USING (public.can_write());

DROP POLICY IF EXISTS "audit_select" ON audit_logs;
CREATE POLICY "audit_select" ON audit_logs FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (public.can_write());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 'utilisateur');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
