import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploadDialog } from '../FileUploadDialog';

function makeFile(name: string, size: number, type = 'image/svg+xml'): File {
  const f = new File(['x'.repeat(size)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('FileUploadDialog (SP-FX-2)', () => {
  it('renders the choose-file label', () => {
    render(<FileUploadDialog open accept=".svg" onUpload={async () => {}} onCancel={() => {}} />);
    expect(screen.getByText(/选择文件/i)).toBeInTheDocument();
  });

  it('rejects files larger than maxSizeBytes inline', async () => {
    const onUpload = vi.fn(async () => {});
    render(<FileUploadDialog open accept=".svg" maxSizeBytes={1024} onUpload={onUpload} onCancel={() => {}} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('big.svg', 2048)] } });
    await waitFor(() => expect(screen.getByText(/文件过大/i)).toBeInTheDocument());
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('calls onUpload with the file array on valid selection', async () => {
    const onUpload = vi.fn(async () => {});
    render(<FileUploadDialog open accept=".svg" onUpload={onUpload} onCancel={() => {}} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('ok.svg', 500)] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0][0].name).toBe('ok.svg');
  });

  it('shows error message when onUpload rejects', async () => {
    const onUpload = vi.fn(async () => { throw new Error('网络断开'); });
    render(<FileUploadDialog open accept=".svg" onUpload={onUpload} onCancel={() => {}} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('a.svg', 100)] } });
    await waitFor(() => expect(screen.getByText(/网络断开/)).toBeInTheDocument());
  });

  it('accepts multiple files when multiple=true', async () => {
    const onUpload = vi.fn(async () => {});
    render(<FileUploadDialog open accept=".svg" multiple onUpload={onUpload} onCancel={() => {}} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    fireEvent.change(input, { target: { files: [makeFile('a.svg', 100), makeFile('b.svg', 100)] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0]).toHaveLength(2);
  });
});
