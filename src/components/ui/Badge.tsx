import { clsx } from 'clsx';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-ws-sunken text-ws-dark border-ws-border',
  success: 'bg-verdict-pass-bg/70 text-verdict-pass border-verdict-pass/20',
  warning: 'bg-verdict-review-bg/70 text-verdict-review border-verdict-review/20',
  error:   'bg-verdict-fail-bg/70 text-verdict-fail border-verdict-fail/20',
  info:    'bg-ws-accent/[0.08] text-ws-accent border-ws-accent/15',
  outline: 'bg-transparent text-ws-dark border-ws-border',
};

export function Badge({ children, variant = 'default', size = 'sm', dot }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-medium rounded-md border whitespace-nowrap',
        VARIANT_CLASSES[variant],
        {
          'px-1.5 py-0.5 text-[10.5px]': size === 'sm',
          'px-2 py-0.5 text-[11.5px]': size === 'md',
        }
      )}
    >
      {dot && (
        <span
          className={clsx('w-1.5 h-1.5 rounded-full', {
            'bg-ws-muted': variant === 'default' || variant === 'outline',
            'bg-verdict-pass': variant === 'success',
            'bg-verdict-review': variant === 'warning',
            'bg-verdict-fail': variant === 'error',
            'bg-ws-accent': variant === 'info',
          })}
        />
      )}
      {children}
    </span>
  );
}
