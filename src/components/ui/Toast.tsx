import { useToast, type ToastType } from '@/contexts/ToastContext';
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { clsx } from 'clsx';

const TOAST_CONFIG: Record<ToastType, { icon: typeof CheckCircle2; className: string }> = {
  success: { icon: CheckCircle2, className: 'bg-green-50 border-green-200 text-green-800' },
  error: { icon: XCircle, className: 'bg-red-50 border-red-200 text-red-800' },
  warning: { icon: AlertTriangle, className: 'bg-amber-50 border-amber-200 text-amber-800' },
  info: { icon: Info, className: 'bg-blue-50 border-blue-200 text-blue-800' },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const config = TOAST_CONFIG[toast.type];
        const Icon = config.icon;
        return (
          <div
            key={toast.id}
            className={clsx(
              'flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg animate-slide-in',
              config.className
            )}
            role="alert"
          >
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 hover:opacity-70"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
