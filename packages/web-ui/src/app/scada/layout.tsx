'use client';
import React from 'react';
import { ScadaToast } from '@/components/scada/suggestions/ScadaToast';

export default function ScadaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ScadaToast />
    </>
  );
}
