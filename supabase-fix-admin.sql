-- =============================================
-- 관리자 권한 즉시 설정 (이것만 실행하세요)
-- =============================================

-- 1. user_roles 테이블 생성 (없으면)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. RLS 비활성화 (임시) → 데이터 삽입 → 다시 활성화
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;

-- 3. 기존 auth.users의 모든 사용자를 admin으로 등록
INSERT INTO user_roles (user_id, email, role)
SELECT id, email, 'admin'
FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- 4. RLS 다시 활성화
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 5. 정책 설정
DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
DROP POLICY IF EXISTS "Users can create own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON user_roles;

CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create own role" ON user_roles
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Admins can manage roles" ON user_roles
  FOR ALL USING (auth.role() = 'authenticated' AND (
    SELECT role FROM user_roles WHERE user_id = auth.uid()
  ) = 'admin')
  WITH CHECK (auth.role() = 'authenticated' AND (
    SELECT role FROM user_roles WHERE user_id = auth.uid()
  ) = 'admin');

-- 6. 확인
SELECT email, role FROM user_roles;
