import { type ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './index';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, footer, maxWidth = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }, [open]);

  if (!open) return null;

  const widthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  }[maxWidth];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[oklch(0.22_0.008_75_/_0.4)] backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Content */}
      <div
        ref={dialogRef}
        className={`relative bg-ws-surface rounded-xl shadow-ws-lg border border-ws-border w-full mx-4 my-4 max-h-[calc(100vh-2rem)] flex flex-col ${widthClass} animate-scale-in`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ws-border shrink-0">
          <h2 id="modal-title" className="text-lg font-semibold text-ws-black">{title}</h2>
          <button
            onClick={onClose}
            className="text-ws-muted hover:text-ws-dark transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ws-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
