import { NextResponse } from 'next/server';
import { verifyAuthToken } from './lib/auth-token';

const ALLOWED_IPS = ['103.114.126.33', '103.114.126.34', '127.0.0.1', '::1'];

// 인증을 건너뛸 API 경로 (Cron/서버-서버 호출 또는 인증 자체)
const API_AUTH_SKIP = ['/api/auth', '/api/cron', '/api/confluence-sync', '/api/confluence-debug'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // auth 페이지와 _next 리소스는 항상 통과
  if (pathname.startsWith('/auth') || pathname.startsWith('/_next/')) {
    return NextResponse.next();
  }

  // API: 허용 목록은 인증 스킵, 그 외 /api/* 는 쿠키 검증 필요
  if (pathname.startsWith('/api/')) {
    if (API_AUTH_SKIP.some(p => pathname === p || pathname.startsWith(p + '/'))) {
      return NextResponse.next();
    }
    const token = request.cookies.get('ct_auth')?.value;
    if (token && await verifyAuthToken(token)) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  // Check IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             request.ip || '';

  if (ALLOWED_IPS.includes(ip)) {
    return NextResponse.next();
  }

  // Check auth cookie
  const token = request.cookies.get('ct_auth')?.value;
  if (token && await verifyAuthToken(token)) {
    return NextResponse.next();
  }

  // Redirect to auth page
  const url = request.nextUrl.clone();
  url.pathname = '/auth';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
