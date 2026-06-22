import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function Select({ label, options, value, onChange, placeholder, className, size = 'md' }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-ws-dark">{label}</label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(
            'w-full appearance-none rounded-lg border border-ws-border bg-white text-ws-dark',
            'focus:outline-none focus:ring-2 focus:ring-ws-accent/50 focus:border-ws-accent',
            'transition-colors pr-8',
            {
              'px-3 py-1.5 text-xs': size === 'sm',
              'px-3 py-2 text-sm': size === 'md',
            },
            className
          )}
        >
          {placeholder && (
            <option value="" disabled>{placeholder}</option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ws-muted pointer-events-none" />
      </div>
    </div>
  );
}
