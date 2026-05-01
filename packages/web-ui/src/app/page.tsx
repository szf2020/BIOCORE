import { redirect } from 'next/navigation';

// 根路径重定向到监控面板
export default function RootPage() {
  redirect('/dashboard');
}
