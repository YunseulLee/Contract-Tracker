-- =============================================
-- Contract Tracker — Supabase 전체 테이블 설정
-- =============================================
-- Supabase Dashboard > SQL Editor 에서 실행하세요.
-- 재실행 안전: 기존 정책 정리 + 누락 컬럼 자동 추가

-- 0. 기존 RLS 정책 전체 클린업
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies
    WHERE tablename IN ('contracts','app_settings','audit_log','renewal_history','user_roles') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 1. contracts 테이블
CREATE TABLE IF NOT EXISTS contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'SaaS',
  start_date DATE,
  end_date DATE NOT NULL,
  renewal_date DATE,
  auto_renew BOOLEAN DEFAULT false,
  auto_renew_notice_days INTEGER DEFAULT 30,
  annual_cost NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'active',
  notes TEXT,
  studio TEXT DEFAULT 'KRAFTON',
  owner_name TEXT,
  owner_email TEXT,
  wiki_url TEXT,
  supplier TEXT,
  installment_enabled BOOLEAN DEFAULT false,
  installment_schedule TEXT DEFAULT '[]',
  renewal_status TEXT DEFAULT 'none',
  renewal_count INTEGER DEFAULT 0,
  renewal_decided_at TIMESTAMPTZ,
  renewal_decided_by TEXT,
  renewal_notes TEXT,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 기존 테이블에 누락된 컬럼 자동 추가
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_status TEXT DEFAULT 'none';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_count INTEGER DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_decided_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_decided_by TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_notes TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS wiki_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS installment_enabled BOOLEAN DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS installment_schedule TEXT DEFAULT '[]';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- 2. app_settings 테이블
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. audit_log 테이블
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_contract_id ON audit_log(contract_id);

-- 4. renewal_history 테이블
CREATE TABLE IF NOT EXISTS renewal_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  renewal_number INTEGER NOT NULL,
  decision TEXT NOT NULL,
  previous_end_date DATE NOT NULL,
  new_end_date DATE,
  new_annual_cost NUMERIC,
  decided_by TEXT DEFAULT '',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_renewal_history_contract_id ON renewal_history(contract_id);

-- 5. RLS 정책 (전체 접근 허용)
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON contracts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON app_settings FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON audit_log FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE renewal_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON renewal_history FOR ALL USING (true) WITH CHECK (true);

-- 6. 샘플 데이터 (최초 1회만)
INSERT INTO contracts (vendor, name, type, start_date, end_date, renewal_date, auto_renew, auto_renew_notice_days, annual_cost, currency, studio, notes)
SELECT * FROM (VALUES
  ('Datadog', 'APM & Infrastructure Monitoring', 'SaaS', '2025-03-01'::DATE, '2026-02-28'::DATE, '2025-12-28'::DATE, true, 60, 48000::NUMERIC, 'USD', 'KRAFTON', 'GS네오텍 통해 계약'),
  ('AltTester', 'Enterprise License', 'SaaS', '2025-06-01'::DATE, '2026-05-31'::DATE, '2026-03-31'::DATE, false, 0, 15000::NUMERIC, 'USD', 'PalM', 'PalM 스튜디오 전용'),
  ('Newzoo', 'Market Intelligence Platform', 'SaaS', '2024-07-01'::DATE, '2025-06-30'::DATE, '2025-04-30'::DATE, true, 60, 32000::NUMERIC, 'USD', 'KRAFTON', '자동갱신 조항 확인 필요'),
  ('Concur', 'Expense Management', 'SaaS', '2024-01-01'::DATE, '2025-12-31'::DATE, '2025-09-30'::DATE, true, 90, 72000::NUMERIC, 'USD', 'KRAFTON', '전사 경비관리 시스템')
) AS v(vendor, name, type, start_date, end_date, renewal_date, auto_renew, auto_renew_notice_days, annual_cost, currency, studio, notes)
WHERE NOT EXISTS (SELECT 1 FROM contracts LIMIT 1);
