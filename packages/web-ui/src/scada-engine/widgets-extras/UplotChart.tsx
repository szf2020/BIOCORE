import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';

export interface UplotSeries {
  x: number[];
  y: number[];
  label?: string;
  stroke?: string;
}

export interface UplotChartProps {
  series: UplotSeries[];
  width: number;
  height: number;
  title?: string;
}

function seriesToData(series: UplotSeries[]): uPlot.AlignedData {
  if (series.length === 0) return [[]] as uPlot.AlignedData;
  const xs = series[0]!.x;
  const ys = series.map((s) => s.y);
  return [xs, ...ys] as uPlot.AlignedData;
}

function seriesToOpts(series: UplotSeries[], width: number, height: number, title?: string): uPlot.Options {
  return {
    width,
    height,
    title,
    series: [
      {},
      ...series.map((s, i) => ({
        label: s.label ?? `s${i}`,
        stroke: s.stroke ?? '#3b82f6',
      })),
    ],
  };
}

export function UplotChart({ series, width, height, title }: UplotChartProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (width <= 0 || height <= 0) return;
    const opts = seriesToOpts(series, width, height, title);
    const data = seriesToData(series);
    instanceRef.current = new uPlot(opts, data, containerRef.current);
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!instanceRef.current) return;
    if (width <= 0 || height <= 0) return;
    instanceRef.current.setData(seriesToData(series));
    instanceRef.current.setSize({ width, height });
  }, [series, width, height]);

  if (width <= 0 || height <= 0) return null;

  return <div ref={containerRef} data-widget="uplot-chart" style={{ width, height }} />;
}
