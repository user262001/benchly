/*
# Benchly — Seed data & admin functions

1. Schema changes
- `analyses`: add `run_email` (text) so history can show who ran an analysis without needing to read other users' profiles.
- New SECURITY DEFINER functions `admin_set_user_role(uuid, text)` and `admin_set_user_active(uuid, boolean)`: let an administrator change another user's role / activation through RPC, avoiding a broad column-level UPDATE grant that would let users promote themselves.
- Recreate the signup trigger so a signup carrying `admin_code = 'BENCHLY-ADMIN-2026'` in user metadata is created as `administrateur` (bootstrap for the first admin).

2. Seed data (fixed UUIDs so foreign keys resolve deterministically on any rebuild)
- Inflation rates 2018-2026 (percent per year).
- 6 suppliers across Algerian regions.
- 3 projects (Alger, Oran, Constantine) with budgets in DA.
- 6 historical reference contracts (`offers.is_reference = true`, 2019-2024) with 5 items each = 30 reference items.
- 1 current supplier offer on project 1 with 10 items whose designations semantically match the reference items.
- A few audit log entries.

3. Security
- New admin RPCs: EXECUTE revoked from PUBLIC/anon, granted to authenticated (function itself verifies `is_admin()`).
*/

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS run_email text;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user uuid, p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_role NOT IN ('administrateur','utilisateur','lecteur') THEN RAISE EXCEPTION 'Rôle invalide'; END IF;
  UPDATE profiles SET role = p_role WHERE id = p_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(p_user uuid, p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE profiles SET is_active = p_active WHERE id = p_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text), public.admin_set_user_active(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := 'utilisateur';
BEGIN
  IF NEW.raw_user_meta_data->>'admin_code' = 'BENCHLY-ADMIN-2026' THEN
    v_role := 'administrateur';
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), v_role);
  RETURN NEW;
END;
$$;

-- ===== Seed: inflation rates =====
INSERT INTO inflation_rates (year, rate) VALUES
  (2018, 5.9),(2019, 2.2),(2020, 3.4),(2021, 7.4),(2022, 9.3),(2023, 4.3),(2024, 4.0),(2025, 3.5),(2026, 0.0)
ON CONFLICT (year) DO NOTHING;

-- ===== Seed: suppliers =====
INSERT INTO suppliers (id, name, nif, region, contact_name, contact_email, contact_phone) VALUES
  ('a1000000-0000-0000-0000-000000000001','SARL Electro Distribution','0987654321098','Alger','Karim Belhadj','contact@electrodist.dz','021 45 67 89'),
  ('a1000000-0000-0000-0000-000000000002','EURL Nord Câbles','1234567890123','Oran','Samira Ould Ali','info@nordcables.dz','041 33 22 11'),
  ('a1000000-0000-0000-0000-000000000003','SPA Matériaux Industriels','4567891234567','Constantine','Rachid Amrani','contact@matindus.dz','031 92 11 44'),
  ('a1000000-0000-0000-0000-000000000004','SARL Confort Électrique','7891234567890','Annaba','Nadia Cherif','n.cherif@confortelec.dz','038 55 44 33'),
  ('a1000000-0000-0000-0000-000000000005','EURL Sahra Travaux','2345678901234','Ouargla','Yacine Brahimi','sahra.travaux@gmail.com','029 71 22 55'),
  ('a1000000-0000-0000-0000-000000000006','SARL Composants Pro','3456789012345','Blida','Farid Zerrouki','f.zerrouki@composantspro.dz','025 41 88 66')
ON CONFLICT (id) DO NOTHING;

-- ===== Seed: projects =====
INSERT INTO projects (id, title, budget, target_year, region, status) VALUES
  ('b1000000-0000-0000-0000-000000000001','Extension réseau MT Alger Centre',48000000,2026,'Alger','actif'),
  ('b1000000-0000-0000-0000-000000000002','Électrification rurale Oran Sud',32500000,2026,'Oran','actif'),
  ('b1000000-0000-0000-0000-000000000003','Réhabilitation poste Constantine Est',21750000,2025,'Constantine','actif')
ON CONFLICT (id) DO NOTHING;

-- ===== Seed: historical reference contracts =====
INSERT INTO offers (id, project_id, supplier_id, is_reference, offer_date, total_amount, item_count, entrepreneur, contract_ref) VALUES
  ('c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',true,'2019-05-12',18700000,5,'ETS Benaïssa','CT-2019-014'),
  ('c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',true,'2020-09-03',22400000,5,'SARL Hidou & Fils','CT-2020-031'),
  ('c1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003',true,'2021-03-18',15900000,5,'ETS Kaci','CT-2021-007'),
  ('c1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004',true,'2022-11-22',27300000,5,'ETS Meziane','CT-2022-045'),
  ('c1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000006',true,'2023-06-30',19800000,5,'SPA TekNord','CT-2023-018'),
  ('c1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000005',true,'2024-02-14',24100000,5,'ETS Bouzid','CT-2024-022')
ON CONFLICT (id) DO NOTHING;

INSERT INTO offer_items (id, offer_id, code, designation, unit, quantity, unit_price, total_price) VALUES
  ('d1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','TR-400','Transformateur de distribution immergé 400 kVA 30/0,4 kV','U',2,3200000,6400000),
  ('d1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','CB-035','Câble électrique U-1000 R2V 4G35 mm²','ML',2500,2100,5250000),
  ('d1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001','PO-024','Poteau béton armé 9 m pour réseau aérien','U',120,8500,1020000),
  ('d1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000001','CP-MON','Comptage monophasé 220 V avec disjoncteur','ENS',400,9800,3920000),
  ('d1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000001','TR-RAV','Raccordement et travaux divers réseau basse tension','FOR',1,2100000,2100000),
  ('d1000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000002','TR-400','Transformateur immergé 400 kVA 30 kV','U',2,3450000,6900000),
  ('d1000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000002','CB-035','Câble U1000 R2V 4G35 cuivre','ML',2500,2280,5700000),
  ('d1000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000002','PO-024','Poteau ciment armé 9 mètres','U',140,9100,1274000),
  ('d1000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000002','CP-MON','Compteur monophasé + disjoncteur 220V','ENS',420,10300,4326000),
  ('d1000000-0000-0000-0000-000000000010','c1000000-0000-0000-0000-000000000002','TR-RAV','Travaux divers de raccordement BT','FOR',1,4200000,4200000),
  ('d1000000-0000-0000-0000-000000000011','c1000000-0000-0000-0000-000000000003','TR-250','Transformateur de distribution 250 kVA huile','U',1,2350000,2350000),
  ('d1000000-0000-0000-0000-000000000012','c1000000-0000-0000-0000-000000000003','CB-016','Câble U-1000 R2V 3G16 mm²','ML',1800,1420,2556000),
  ('d1000000-0000-0000-0000-000000000013','c1000000-0000-0000-0000-000000000003','PO-024','Poteau béton 9 m réseau aérien','U',100,8900,890000),
  ('d1000000-0000-0000-0000-000000000014','c1000000-0000-0000-0000-000000000003','CP-TRI','Comptage triphasé 380 V avec disjoncteur','ENS',150,18600,2790000),
  ('d1000000-0000-0000-0000-000000000015','c1000000-0000-0000-0000-000000000003','CO-SOU','Coupe-joint et soutènement pour pose réseau','ENS',300,4200,1260000),
  ('d1000000-0000-0000-0000-000000000016','c1000000-0000-0000-0000-000000000004','TR-400','Transformateur de distribution immergé 400 kVA','U',2,3680000,7360000),
  ('d1000000-0000-0000-0000-000000000017','c1000000-0000-0000-0000-000000000004','CB-035','Câble U-1000 R2V 4G35 mm² cuivre nu','ML',2600,2520,6552000),
  ('d1000000-0000-0000-0000-000000000018','c1000000-0000-0000-0000-000000000004','PO-024','Poteau béton armé de 9 m','U',150,9800,1470000),
  ('d1000000-0000-0000-0000-000000000019','c1000000-0000-0000-0000-000000000004','CP-MON','Comptage monophasé 220 V complet','ENS',450,11200,5040000),
  ('d1000000-0000-0000-0000-000000000020','c1000000-0000-0000-0000-000000000004','TR-RAV','Raccordement BT et travaux divers','FOR',1,6880000,6880000),
  ('d1000000-0000-0000-0000-000000000021','c1000000-0000-0000-0000-000000000005','TR-250','Transformateur immergé 250 kVA 30/0,4 kV','U',1,2620000,2620000),
  ('d1000000-0000-0000-0000-000000000022','c1000000-0000-0000-0000-000000000005','CB-016','Câble U1000 R2V 3G16','ML',1900,1610,3059000),
  ('d1000000-0000-0000-0000-000000000023','c1000000-0000-0000-0000-000000000005','PO-024','Poteau béton armé 9m','U',110,10200,1122000),
  ('d1000000-0000-0000-0000-000000000024','c1000000-0000-0000-0000-000000000005','CP-TRI','Comptage triphasé 380V','ENS',160,20400,3264000),
  ('d1000000-0000-0000-0000-000000000025','c1000000-0000-0000-0000-000000000005','CO-SOU','Soutènement et coupe-joint réseau','ENS',320,4800,1536000),
  ('d1000000-0000-0000-0000-000000000026','c1000000-0000-0000-0000-000000000006','TR-250','Transformateur de distribution 250 kVA','U',2,2890000,5780000),
  ('d1000000-0000-0000-0000-000000000027','c1000000-0000-0000-0000-000000000006','CB-016','Câble électrique U-1000 R2V 3G16 mm²','ML',2000,1780,3560000),
  ('d1000000-0000-0000-0000-000000000028','c1000000-0000-0000-0000-000000000006','CP-TRI','Comptage triphasé 380 V complet','ENS',170,21900,3723000),
  ('d1000000-0000-0000-0000-000000000029','c1000000-0000-0000-0000-000000000006','PO-024','Poteau ciment armé 9 m pour ligne aérienne','U',120,10800,1296000),
  ('d1000000-0000-0000-0000-000000000030','c1000000-0000-0000-0000-000000000006','TR-RAV','Travaux divers raccordement réseau BT','FOR',1,9747000,9747000)
ON CONFLICT (id) DO NOTHING;

-- ===== Seed: current supplier offer on project 1 =====
INSERT INTO offers (id, project_id, supplier_id, is_reference, offer_date, total_amount, item_count, file_name) VALUES
  ('c1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',false,'2025-10-02',56234000,10,'offre_electrodist_2025.xlsx')
ON CONFLICT (id) DO NOTHING;

INSERT INTO offer_items (id, offer_id, code, designation, unit, quantity, unit_price, total_price) VALUES
  ('d1000000-0000-0000-0000-000000000101','c1000000-0000-0000-0000-000000000010','TR-400','Transformateur de distribution immergé 400 kVA 30/0,4 kV','U',2,5150000,10300000),
  ('d1000000-0000-0000-0000-000000000102','c1000000-0000-0000-0000-000000000010','CB-035','Câble U-1000 R2V 4G35 mm² cuivre','ML',2600,3180,8268000),
  ('d1000000-0000-0000-0000-000000000103','c1000000-0000-0000-0000-000000000010','PO-024','Poteau béton armé 9 m','U',150,12600,1890000),
  ('d1000000-0000-0000-0000-000000000104','c1000000-0000-0000-0000-000000000010','CP-MON','Comptage monophasé 220 V avec disjoncteur','ENS',450,14700,6615000),
  ('d1000000-0000-0000-0000-000000000105','c1000000-0000-0000-0000-000000000010','TR-RAV','Raccordement et travaux divers réseau BT','FOR',1,9840000,9840000),
  ('d1000000-0000-0000-0000-000000000106','c1000000-0000-0000-0000-000000000010','TR-250','Transformateur immergé 250 kVA 30/0,4 kV','U',1,3920000,3920000),
  ('d1000000-0000-0000-0000-000000000107','c1000000-0000-0000-0000-000000000010','CB-016','Câble U-1000 R2V 3G16 mm²','ML',2000,2240,4480000),
  ('d1000000-0000-0000-0000-000000000108','c1000000-0000-0000-0000-000000000010','CP-TRI','Comptage triphasé 380 V complet','ENS',160,27300,4368000),
  ('d1000000-0000-0000-0000-000000000109','c1000000-0000-0000-0000-000000000010','CO-SOU','Coupe-joint et soutènement pour pose réseau','ENS',320,6900,2208000),
  ('d1000000-0000-0000-0000-000000000110','c1000000-0000-0000-0000-000000000010','PA-MAS','Protection antichute et masse de sécurité','ENS',85,5100,4335000)
ON CONFLICT (id) DO NOTHING;

-- ===== Seed: audit entries =====
INSERT INTO audit_logs (action, entity, details, user_email, user_role, created_at) VALUES
  ('INFLATION_UPDATE','inflation_rates','{"year":2024,"value":4.0}','system@benchly.dz','administrateur', now() - interval '20 days'),
  ('IMPORT_OFFER','offers','{"file":"offre_electrodist_2025.xlsx","items":10}','import@benchly.dz','utilisateur', now() - interval '15 days'),
  ('ANALYSIS_RUN','analyses','{"items":10}','analyse@benchly.dz','utilisateur', now() - interval '10 days')
ON CONFLICT DO NOTHING;
