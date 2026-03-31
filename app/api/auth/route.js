import { NextResponse } from 'next/server';

export async function POST(request) {
  const { password } = await request.json();
  const correctPassword = process.env.ACCESS_PASSWORD;

  if (!correctPassword) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  if (password === correctPassword) {
    const response = NextResponse.json({ success: true });
    response.cookies.set('ct_auth', 'authenticated', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    return response;
  }

  return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
}
