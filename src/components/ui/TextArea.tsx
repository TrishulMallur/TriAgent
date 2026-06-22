import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  showCount?: boolean;
  maxLength?: number;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, helperText, error, showCount, maxLength, className, value, ...props }, ref) => {
    const charCount = typeof value === 'string' ? value.length : 0;

    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-ws-dark">{label}</label>
        )}
        <textarea
          ref={ref}
          value={value}
          maxLength={maxLength}
          className={clsx(
            'w-full rounded-lg border px-3 py-2.5 text-sm text-ws-dark placeholder:text-ws-muted/60',
            'focus:outline-none focus:ring-2 focus:ring-ws-accent/50 focus:border-ws-accent',
            'transition-colors resize-y',
            error
              ? 'border-verdict-fail bg-verdict-fail-bg/30'
              : 'border-ws-border bg-white',
            className
          )}
          {...props}
        />
        <div className="flex justify-between">
          {(helperText || error) && (
            <p className={clsx('text-xs', error ? 'text-verdict-fail' : 'text-ws-muted')}>
              {error || helperText}
            </p>
          )}
          {showCount && (
            <p className="text-xs text-ws-muted ml-auto">
              {charCount}{maxLength ? `/${maxLength}` : ''}
            </p>
          )}
        </div>
      </div>
    );
  }
);

TextArea.displayName = 'TextArea';
