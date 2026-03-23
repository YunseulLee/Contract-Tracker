-- =============================================
-- Contract Tracker — Supabase 전체 테이블 설정
-- =============================================
-- Supabase Dashboard > SQL Editor 에서 실행하세요.
-- ⚠️ 재실행 안전: 기존 정책을 모두 정리 후 새로 생성합니다.

-- 0. 기존 RLS 정책 전체 클린업 (에러 방지)
DO $$ BEGIN
  -- contracts
  DROP POLICY IF EXISTS "Allow all access" ON contracts;
  DROP POLICY IF EXISTS "Authenticated users full access" ON contracts;
  DROP POLICY IF EXISTS "Viewers can read contracts" ON contracts;
  DROP POLICY IF EXISTS "Admins can modify contracts" ON contracts;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  -- app_settings
  DROP POLICY IF EXISTS "Allow all access" ON app_settings;
  DROP POLICY IF EXISTS "Authenticated users full access" ON app_settings;
  DROP POLICY IF EXISTS "Viewers can read settings" ON app_settings;
  DROP POLICY IF EXISTS "Admins can modify settings" ON app_settings;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  -- audit_log
  DROP POLICY IF EXISTS "Allow all access" ON audit_log;
  DROP POLICY IF EXISTS "Authenticated users full access" ON audit_log;
  DROP POLICY IF EXISTS "Authenticated can read audit" ON audit_log;
  DROP POLICY IF EXISTS "Admins can write audit" ON audit_log;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  -- renewal_history
  DROP POLICY IF EXISTS "Authenticated can read renewal_history" ON renewal_history;
  DROP POLICY IF EXISTS "Admins can write renewal_history" ON renewal_history;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  -- user_roles
  DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
  DROP POLICY IF EXISTS "Users can create own role" ON user_roles;
  DROP POLICY IF EXISTS "Admins can manage roles" ON user_roles;
EXCEPTION WHEN undefined_table THEN NULL;
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
  renewal_status TEXT DEFAULT 'none',  -- 'none' | 'pending_review' | 'approved' | 'cancelled'
  renewal_count INTEGER DEFAULT 0,
  renewal_decided_at TIMESTAMPTZ,
  renewal_decided_by TEXT,
  renewal_notes TEXT,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
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

-- 3. audit_log 테이블 (계약 수정 이력)
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

-- 3-1. renewal_history 테이블 (갱신 이력)
CREATE TABLE IF NOT EXISTS renewal_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  renewal_number INTEGER NOT NULL,          -- 몇 차 갱신인지
  decision TEXT NOT NULL,                   -- 'approved' | 'cancelled'
  previous_end_date DATE NOT NULL,          -- 이전 종료일
  new_end_date DATE,                        -- 갱신된 새 종료일 (approved 시)
  new_annual_cost NUMERIC,                  -- 갱신된 비용 (변경 시)
  decided_by TEXT DEFAULT '',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renewal_history_contract_id ON renewal_history(contract_id);

-- 4. user_roles 테이블 (사용자 역할 관리)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',  -- 'admin' | 'viewer'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_email ON user_roles(email);

-- 역할 확인 헬퍼 함수
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT role FROM user_roles WHERE user_id = auth.uid()),
    'viewer'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 5. RLS 정책 (역할 기반 접근 제어)

-- contracts: viewer는 읽기만, admin은 전체 접근
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON contracts;
DROP POLICY IF EXISTS "Authenticated users full access" ON contracts;
DROP POLICY IF EXISTS "Viewers can read contracts" ON contracts;
DROP POLICY IF EXISTS "Admins can modify contracts" ON contracts;

CREATE POLICY "Viewers can read contracts" ON contracts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can modify contracts" ON contracts
  FOR ALL USING (auth.role() = 'authenticated' AND get_user_role() = 'admin')
  WITH CHECK (auth.role() = 'authenticated' AND get_user_role() = 'admin');

-- app_settings: viewer는 읽기만, admin은 전체 접근
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON app_settings;
DROP POLICY IF EXISTS "Authenticated users full access" ON app_settings;
DROP POLICY IF EXISTS "Viewers can read settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can modify settings" ON app_settings;

CREATE POLICY "Viewers can read settings" ON app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can modify settings" ON app_settings
  FOR ALL USING (auth.role() = 'authenticated' AND get_user_role() = 'admin')
  WITH CHECK (auth.role() = 'authenticated' AND get_user_role() = 'admin');

-- audit_log: 모든 인증 사용자 읽기 가능, admin만 쓰기
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON audit_log;
DROP POLICY IF EXISTS "Authenticated users full access" ON audit_log;
DROP POLICY IF EXISTS "Authenticated can read audit" ON audit_log;
DROP POLICY IF EXISTS "Admins can write audit" ON audit_log;

CREATE POLICY "Authenticated can read audit" ON audit_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can write audit" ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND get_user_role() = 'admin');

-- renewal_history: 모든 인증 사용자 읽기 가능, admin만 쓰기
ALTER TABLE renewal_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read renewal_history" ON renewal_history;
DROP POLICY IF EXISTS "Admins can write renewal_history" ON renewal_history;

CREATE POLICY "Authenticated can read renewal_history" ON renewal_history
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can write renewal_history" ON renewal_history
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND get_user_role() = 'admin');

-- user_roles: 자기 역할만 읽기, admin만 전체 관리
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON user_roles;

CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create own role" ON user_roles
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Admins can manage roles" ON user_roles
  FOR ALL USING (auth.role() = 'authenticated' AND get_user_role() = 'admin')
  WITH CHECK (auth.role() = 'authenticated' AND get_user_role() = 'admin');

-- 6. 첫 번째 사용자를 admin으로 설정하는 트리거
-- (최초 가입자가 자동으로 admin이 됩니다)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin') THEN
    INSERT INTO user_roles (user_id, email, role) VALUES (NEW.id, NEW.email, 'admin');
  ELSE
    INSERT INTO user_roles (user_id, email, role) VALUES (NEW.id, NEW.email, 'viewer');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 7. 샘플 데이터 (선택 — 최초 1회만 실행)
-- 중복 방지: 데이터가 없을 때만 삽입
INSERT INTO contracts (vendor, name, type, start_date, end_date, renewal_date, auto_renew, auto_renew_notice_days, annual_cost, currency, studio, notes)
SELECT * FROM (VALUES
  ('Datadog', 'APM & Infrastructure Monitoring', 'SaaS', '2025-03-01'::DATE, '2026-02-28'::DATE, '2025-12-28'::DATE, true, 60, 48000::NUMERIC, 'USD', 'KRAFTON', 'GS네오텍 통해 계약'),
  ('AltTester', 'Enterprise License', 'SaaS', '2025-06-01'::DATE, '2026-05-31'::DATE, '2026-03-31'::DATE, false, 0, 15000::NUMERIC, 'USD', 'PalM', 'PalM 스튜디오 전용'),
  ('Newzoo', 'Market Intelligence Platform', 'SaaS', '2024-07-01'::DATE, '2025-06-30'::DATE, '2025-04-30'::DATE, true, 60, 32000::NUMERIC, 'USD', 'KRAFTON', '자동갱신 조항 확인 필요'),
  ('Concur', 'Expense Management', 'SaaS', '2024-01-01'::DATE, '2025-12-31'::DATE, '2025-09-30'::DATE, true, 90, 72000::NUMERIC, 'USD', 'KRAFTON', '전사 경비관리 시스템')
) AS v(vendor, name, type, start_date, end_date, renewal_date, auto_renew, auto_renew_notice_days, annual_cost, currency, studio, notes)
WHERE NOT EXISTS (SELECT 1 FROM contracts LIMIT 1);
