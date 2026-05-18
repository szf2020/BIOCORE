import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
  );
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const root = ref.current;
    const initial = getFocusables(root);
    if (initial.length > 0) initial[0]!.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const items = getFocusables(root);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !items.includes(active!)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [isOpen, ref]);
}
