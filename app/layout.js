import './globals.css';
import AuthProvider from '@/components/AuthProvider';

export const metadata = { title: 'Contract Tracker — IT Procurement', description: '계약 일정 관리 앱' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
