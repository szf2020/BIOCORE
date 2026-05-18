import './globals.css';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProvider } from '@/hooks/useAuth';
import { LocaleProvider } from '@/i18n/useLocale';
import { InstallPrompt } from '@/components/layout/InstallPrompt';
import { UpdateToast } from '@/components/layout/UpdateToast';

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
        {/* SP-FX-44: PWA manifest */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0F766E" />
      </head>
      <body className="antialiased">
        <LocaleProvider>
          <AuthProvider>
            <AppLayout>{children}</AppLayout>
          </AuthProvider>
        </LocaleProvider>
        {/* SP-FX-44: PWA install prompt + update notification */}
        <InstallPrompt />
        <UpdateToast />
      </body>
    </html>
  );
}
