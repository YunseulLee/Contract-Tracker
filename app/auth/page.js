'use client';

import { useState, useRef, useEffect } from 'react';

export default function AuthPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        window.location.href = '/';
      } else {
        setError(data.error || '인증에 실패했습니다.');
        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0D0E14',
      fontFamily: "'Inter', 'Noto Sans KR', sans-serif",
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        padding: '0 20px',
        animation: 'fadeIn 0.4s ease',
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 40,
        }}>
          <img src="/krafton-logo.png" alt="KRAFTON" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <h1 style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#EDEEF0',
            marginBottom: 8,
            letterSpacing: '-0.3px',
          }}>
            Contract Tracker
          </h1>
          <p style={{
            fontSize: 13,
            color: '#6B7280',
          }}>
            접근이 제한된 페이지입니다
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <input
              ref={inputRef}
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 14,
                color: '#EDEEF0',
                background: '#0D0E14',
                border: '1px solid #2A2D38',
                borderRadius: 8,
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = '#4A9FD8'}
              onBlur={(e) => e.target.style.borderColor = '#2A2D38'}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 13,
              color: '#F87171',
              marginBottom: 16,
              textAlign: 'center',
              animation: 'fadeIn 0.2s ease',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 600,
              color: '#EDEEF0',
              background: loading || !password.trim()
                ? 'linear-gradient(135deg, #4A9FD888, #3D8EC688)'
                : 'linear-gradient(135deg, #4A9FD8, #3D8EC6)',
              border: 'none',
              borderRadius: 8,
              cursor: loading || !password.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
          >
            {loading ? '확인 중...' : '확인'}
          </button>
        </form>
      </div>
    </div>
  );
}
