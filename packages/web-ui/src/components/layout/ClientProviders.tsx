'use client';

import { AuthProvider } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';

// Next.js 15: 客户端组件包装器, 确保 useRouter/usePathname 在 App Router 上下文内
export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppLayout>{children}</AppLayout>
    </AuthProvider>
  );
}
