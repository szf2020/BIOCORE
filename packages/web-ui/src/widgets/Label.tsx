'use client';
import React from 'react';

export interface LabelProps {
  text?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  width: number;
  height: number;
}

export function Label(props: LabelProps) {
  const { text = '', fontSize = 14, color, bold = false, align = 'left', width, height } = props;
  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };

  return (
    <div
      className="w-full h-full flex items-center"
      style={{
        width,
        height,
        justifyContent: justifyMap[align],
      }}
    >
      <span
        style={{
          fontSize: `${fontSize}px`,
          color,
          fontWeight: bold ? 'bold' : undefined,
        }}
      >
        {text}
      </span>
    </div>
  );
}
