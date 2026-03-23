-- =============================================
-- 기존 사용자를 Admin으로 설정하는 마이그레이션
-- =============================================
-- Supabase Dashboard > SQL Editor 에서 실행하세요.
-- 이미 가입된 사용자가 user_roles에 없는 경우 추가합니다.

-- 1. 기존 사용자 중 user_roles에 없는 사용자를 admin으로 추가
INSERT INTO user_roles (user_id, email, role)
SELECT id, email, 'admin'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_roles WHERE user_id IS NOT NULL)
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- 2. 특정 이메일을 admin으로 설정 (필요 시 이메일 변경)
-- UPDATE user_roles SET role = 'admin' WHERE email = 'your-email@krafton.com';

-- 3. 현재 역할 확인
SELECT ur.email, ur.role, ur.created_at
FROM user_roles ur
ORDER BY ur.created_at;
