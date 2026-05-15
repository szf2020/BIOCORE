'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchProjects, fetchProject, type ScadaProject, type ScadaViewSummary } from '@/api/scada';
import { NewViewDialog } from '@/components/scada/editor/NewViewDialog';

export default function ScadaIndexPage() {
  const [projects, setProjects] = useState<ScadaProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [views, setViews] = useState<ScadaViewSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    fetchProjects()
      .then(ps => {
        setProjects(ps);
        if (ps.length > 0) setSelectedProject(ps[0].project_id);
      })
      .catch(e => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedProject) {
      setViews([]);
      return;
    }
    fetchProject(selectedProject)
      .then(({ views }) => setViews(views))
      .catch(e => setErr(String(e)));
  }, [selectedProject]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">SCADA 工艺画面</h1>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            disabled={projects.length === 0}
            className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            + 新建视图
          </button>
          <Link href="/dashboard" className="text-blue-600 hover:underline">← 返回 Dashboard</Link>
        </div>
      </div>

      {err && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm">{err}</div>}

      <div className="flex items-center gap-3">
        <label className="text-sm">项目:</label>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">-- 选择项目 --</option>
          {projects.map(p => (
            <option key={p.project_id} value={p.project_id}>{p.name}</option>
          ))}
        </select>
      </div>

      {projects.length === 0 && !err && (
        <div className="p-6 bg-gray-50 border rounded text-center text-gray-500 text-sm">
          暂无 SCADA 项目。 编辑器待上线 (子项目 5)。
        </div>
      )}

      {selectedProject && (
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2">视图名</th>
              <th className="text-left px-3 py-2">反应器</th>
              <th className="text-left px-3 py-2">最近保存</th>
              <th className="text-right px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {views.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-6 text-gray-400">无视图</td></tr>
            ) : (
              views.map(v => (
                <tr key={v.view_id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2">{v.name}</td>
                  <td className="px-3 py-2 text-gray-600">{v.reactor_id ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{v.updated_at}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/scada/${v.view_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      进入 →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      <NewViewDialog open={newOpen} projects={projects} onClose={() => setNewOpen(false)} />
    </div>
  );
}
