import { NextResponse } from 'next/server';
import { createAuthToken } from '../../../lib/auth-token';

export async function POST(request) {
  try {
    const { password } = await request.json();
    const correctPassword = process.env.ACCESS_PASSWORD;

    if (!correctPassword) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }
    if (!process.env.AUTH_SECRET) {
      return NextResponse.json({ error: '서버 설정 오류: AUTH_SECRET 미설정' }, { status: 500 });
    }

    if (password === correctPassword) {
      const ttl = 60 * 60 * 24 * 30; // 30 days
      const token = await createAuthToken(ttl);
      const response = NextResponse.json({ success: true });
      const isProduction = process.env.NODE_ENV === 'production';
      response.cookies.set('ct_auth', token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: ttl,
        path: '/',
      });
      return response;
    }

    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
}
