import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

interface CellDef { type: 'label' | 'variable'; value?: string; variableId?: string; }
interface RowDef { cells: CellDef[]; }

function TableView({ rows, cellValues }: { rows: RowDef[]; cellValues: Map<string, GaugeValue> }): JSX.Element {
  if (rows.length === 0) {
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody><tr><td>无数据</td></tr></tbody>
      </table>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.cells.map((cell, ci) => {
              const content = cell.type === 'variable' && cell.variableId
                ? (() => {
                    const snap = cellValues.get(cell.variableId!);
                    return snap && !snap.isStale ? String(snap.value ?? '--') : '--';
                  })()
                : (cell.value ?? '');
              return (
                <td key={ci} style={{ border: '1px solid #52525b', padding: '2px 4px', color: '#f4f4f5' }}>
                  {content}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

class HtmlTableGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private mountDiv: HTMLDivElement | null = null;
  private reactRoot: Root | null = null;
  private cellValues = new Map<string, GaugeValue>();
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 200;
    const h = (widget as any).h ?? 150;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const div = document.createElement('div');
    div.style.width = `${w}px`;
    div.style.height = `${h}px`;
    div.style.overflow = 'auto';
    fo.appendChild(div);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.mountDiv = div;

    try {
      this.reactRoot = createRoot(div);
      this._rerender();
    } catch { /* jsdom guard */ }
  }

  onUnmount(): void {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.mountDiv = null;
  }

  onProcess(value: GaugeValue): void {
    const rows: RowDef[] = (this.widget.property as any)?.options?.rows ?? [];
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.type === 'variable' && cell.variableId) {
          this.cellValues.set(cell.variableId, value);
        }
      }
    }
    this._rerender();
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    this.cellValues.clear();
    this._rerender();
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj || !this.mountDiv) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
    this.mountDiv.style.width = `${w}px`;
    this.mountDiv.style.height = `${h}px`;
    this._rerender();
  }

  private _rerender(): void {
    if (!this.reactRoot) return;
    const rows: RowDef[] = (this.widget.property as any)?.options?.rows ?? [];
    this.reactRoot.render(<TableView rows={rows} cellValues={this.cellValues} />);
  }
}

export const htmlTableMeta: GaugeMeta = {
  widgetType: 'svg-ext-own_ctrl-table',
  create: () => new HtmlTableGauge(),
  getSignals: (w) => {
    const p = w.property as any;
    const ids: string[] = [];
    if (p?.options?.rows) {
      for (const row of p.options.rows as RowDef[]) {
        for (const cell of (row.cells ?? [])) {
          if (cell.type === 'variable' && cell.variableId) ids.push(cell.variableId);
        }
      }
    }
    return ids;
  },
};
