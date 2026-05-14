import './globals.css';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata = { title: 'BIOCore MES -- 发酵控制平台', description: '实验室R&D发酵智能控制系统' };

// 防 FOUC: 在 React 水合前根据 localStorage / OS 偏好设置 <html>.dark
const themeInitScript = `
(function() {
  try {
    var v = localStorage.getItem('biocore_theme') || 'system';
    var dark = v === 'dark' || (v === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <AppLayout>{children}</AppLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
