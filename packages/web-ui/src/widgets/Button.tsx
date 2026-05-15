'use client';
import React, { JSX } from 'react';

export interface ButtonProps {
  widgetId: string;
  text?: string;
  action?: string;
  payload?: Record<string, any>;
  color?: string;
  width: number;
  height: number;
}

export function Button(props: ButtonProps) {
  const { widgetId, text = 'Action', action, payload, color = '#3b82f6', width, height } = props;

  const handleClick = () => {
    if (typeof document === 'undefined') return;
    document.dispatchEvent(
      new CustomEvent('widget-action', {
        detail: { widgetId, action, payload },
      })
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded text-white text-sm font-medium px-3 py-1 hover:opacity-90 active:opacity-80"
      style={{
        width,
        height,
        backgroundColor: color,
      }}
    >
      {text}
    </button>
  );
}
