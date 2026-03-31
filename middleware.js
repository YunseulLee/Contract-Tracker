import { NextResponse } from 'next/server';

const ALLOWED_IPS = ['103.114.126.33', '103.114.126.34'];

export function middleware(request) {
  // Skip auth page and API routes
  if (request.nextUrl.pathname.startsWith('/auth') ||
      request.nextUrl.pathname.startsWith('/api/') ||
      request.nextUrl.pathname.startsWith('/_next/')) {
    return NextResponse.next();
  }

  // Check IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             request.ip || '';

  if (ALLOWED_IPS.includes(ip)) {
    return NextResponse.next();
  }

  // Check auth cookie
  const authCookie = request.cookies.get('ct_auth');
  if (authCookie?.value === 'authenticated') {
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
