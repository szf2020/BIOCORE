'use client';
import React from 'react';

interface Props {
  widgetId: string;
  w: number;
  h: number;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class SvgErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(`SvgErrorBoundary widgetId=${this.props.widgetId}`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <g>
          <rect width={this.props.w} height={this.props.h} fill="#fee" stroke="#c33" />
          <text x={4} y={14} fontSize={10} fill="#c33">error</text>
        </g>
      );
    }
    return this.props.children;
  }
}
