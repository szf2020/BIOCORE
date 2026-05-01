// ============================================================
// DashboardLayoutEditor -- Dashboard 布局自定义面板
//
// 功能: 拖拽排序大字参数卡片 + 显隐切换 + 模块开关
// 使用 @dnd-kit/sortable 实现拖拽, localStorage 持久化
// ============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { GripVertical, RotateCcw, Save, Eye, EyeOff } from 'lucide-react';

// 类型和工具函数从轻量模块导入, 避免 @dnd-kit 污染其他页面 chunk
import {
  type BigParamConfig, type DashboardLayout,
  DEFAULT_LAYOUT, loadDashboardLayout, saveDashboardLayout,
} from './dashboard-layout-config';

// re-export 供外部使用
export type { BigParamConfig, DashboardLayout };
export { loadDashboardLayout };

// ── 可拖拽参数行 ──────────────────────────────────────────────

interface SortableParamRowProps {
  param: BigParamConfig;
  onToggleVisible: (key: string) => void;
}

function SortableParamRow({ param, onToggleVisible }: SortableParamRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: param.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2 rounded-md border transition-colors
        ${param.visible ? 'border-border bg-card' : 'border-border/50 bg-muted/20 opacity-60'}`}
    >
      {/* 拖拽手柄 */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* 参数信息 */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{param.label}</div>
        <div className="text-xs text-muted-foreground">
          {param.key} | {param.unit}{param.sv !== undefined ? ` | SP: ${param.sv}` : ''}
        </div>
      </div>

      {/* 可见切换 */}
      <button
        onClick={() => onToggleVisible(param.key)}
        className={`p-1 rounded transition-colors ${
          param.visible ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground'
        }`}
        title={param.visible ? '隐藏' : '显示'}
      >
        {param.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────

interface DashboardLayoutEditorProps {
  open: boolean;
  onClose: () => void;
}

export function DashboardLayoutEditor({ open, onClose }: DashboardLayoutEditorProps) {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // 加载初始配置
  useEffect(() => {
    if (open) {
      setLayout(loadDashboardLayout());
    }
  }, [open]);

  // 拖拽排序
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLayout(prev => {
      const oldIdx = prev.bigParams.findIndex(p => p.key === active.id);
      const newIdx = prev.bigParams.findIndex(p => p.key === over.id);
      return {
        ...prev,
        bigParams: arrayMove(prev.bigParams, oldIdx, newIdx),
      };
    });
  }, []);

  // 切换参数可见性
  const toggleVisible = useCallback((key: string) => {
    setLayout(prev => ({
      ...prev,
      bigParams: prev.bigParams.map(p =>
        p.key === key ? { ...p, visible: !p.visible } : p,
      ),
    }));
  }, []);

  // 切换模块开关
  const toggleModule = useCallback((mod: 'showTrends' | 'showAlarms' | 'showCalculated') => {
    setLayout(prev => ({ ...prev, [mod]: !prev[mod] }));
  }, []);

  // 恢复默认
  const resetDefaults = useCallback(() => {
    setLayout({ ...DEFAULT_LAYOUT, bigParams: DEFAULT_LAYOUT.bigParams.map(p => ({ ...p })) });
  }, []);

  // 保存
  const handleSave = useCallback(() => {
    saveDashboardLayout(layout);
    onClose();
  }, [layout, onClose]);

  const visibleCount = layout.bigParams.filter(p => p.visible).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dashboard 布局设置</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 大字参数卡片排序 */}
          <div>
            <Label className="mb-2 block text-sm font-medium">
              参数卡片排序 ({visibleCount}/{layout.bigParams.length} 显示)
            </Label>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={layout.bigParams.map(p => p.key)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {layout.bigParams.map(param => (
                    <SortableParamRow
                      key={param.key}
                      param={param}
                      onToggleVisible={toggleVisible}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* 模块显隐开关 */}
          <div className="space-y-3 pt-2 border-t border-border">
            <Label className="block text-sm font-medium">模块显示</Label>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">实时趋势图</span>
              <Switch
                checked={layout.showTrends}
                onCheckedChange={() => toggleModule('showTrends')}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">报警信息</span>
              <Switch
                checked={layout.showAlarms}
                onCheckedChange={() => toggleModule('showAlarms')}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">软件测算值</span>
              <Switch
                checked={layout.showCalculated}
                onCheckedChange={() => toggleModule('showCalculated')}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={resetDefaults} className="mr-auto">
            <RotateCcw className="w-4 h-4 mr-1.5" /> 恢复默认
          </Button>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-1.5" /> 保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
