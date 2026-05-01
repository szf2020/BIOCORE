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
