-- =============================================
-- Contract Tracker — Supabase 전체 테이블 설정
-- =============================================
-- Supabase Dashboard > SQL Editor 에서 실행하세요.

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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. app_settings 테이블 (스튜디오/계약유형 목록 저장)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS 정책
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON contracts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON app_settings FOR ALL USING (true) WITH CHECK (true);

-- 4. 샘플 데이터 (선택)
INSERT INTO contracts (vendor, name, type, start_date, end_date, renewal_date, auto_renew, auto_renew_notice_days, annual_cost, currency, studio, notes)
VALUES
  ('Datadog', 'APM & Infrastructure Monitoring', 'SaaS', '2025-03-01', '2026-02-28', '2025-12-28', true, 60, 48000, 'USD', 'KRAFTON', 'GS네오텍 통해 계약'),
  ('AltTester', 'Enterprise License', 'SaaS', '2025-06-01', '2026-05-31', '2026-03-31', false, 0, 15000, 'USD', 'PalM', 'PalM 스튜디오 전용'),
  ('Newzoo', 'Market Intelligence Platform', 'SaaS', '2024-07-01', '2025-06-30', '2025-04-30', true, 60, 32000, 'USD', 'KRAFTON', '자동갱신 조항 확인 필요'),
  ('Concur', 'Expense Management', 'SaaS', '2024-01-01', '2025-12-31', '2025-09-30', true, 90, 72000, 'USD', 'KRAFTON', '전사 경비관리 시스템');
