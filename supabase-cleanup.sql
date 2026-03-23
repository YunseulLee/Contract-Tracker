-- =============================================
-- ⚠️ 기존 RLS 정책 전체 삭제 (이것을 먼저 실행)
-- =============================================
-- 이 SQL을 실행한 뒤 supabase-setup.sql을 실행하세요.

-- contracts 정책 전부 삭제
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'contracts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON contracts', pol.policyname);
  END LOOP;
END $$;

-- app_settings 정책 전부 삭제
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'app_settings' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON app_settings', pol.policyname);
  END LOOP;
END $$;

-- audit_log 정책 전부 삭제
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'audit_log' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON audit_log', pol.policyname);
  END LOOP;
END $$;

-- renewal_history 정책 전부 삭제
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'renewal_history' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON renewal_history', pol.policyname);
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- user_roles 정책 전부 삭제
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'user_roles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_roles', pol.policyname);
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 확인: 남아있는 정책 출력
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('contracts', 'app_settings', 'audit_log', 'renewal_history', 'user_roles')
ORDER BY tablename;
