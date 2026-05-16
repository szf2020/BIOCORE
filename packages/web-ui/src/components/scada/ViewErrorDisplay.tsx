'use client';
import React from 'react';
import type { ZodIssue } from 'zod';

interface Props {
  issues: ZodIssue[];
}

export function ViewErrorDisplay({ issues }: Props) {
  return (
    <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm">
      <p className="font-medium mb-2">画面数据损坏</p>
      <ul className="list-disc pl-5 space-y-1">
        {issues.map((iss, i) => (
          <li key={i}>
            <code className="font-mono">{iss.path.join('.') || '(root)'}</code>: {iss.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
