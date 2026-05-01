// 全局路由切换 loading 状态 — 在 Next.js App Router 中创建 Suspense 边界
// 页面导航时立即显示此组件, 避免等待页面 JS 编译/下载/数据加载的空白延迟
import { Activity } from 'lucide-react';

export default function Loading() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Activity className="w-6 h-6 text-primary animate-pulse" />
        <span className="text-sm text-muted-foreground">加载中...</span>
      </div>
    </div>
  );
}
