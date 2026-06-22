import { clsx } from 'clsx';

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  size?: 'sm' | 'md';
}

export function Tabs({ tabs, activeTab, onChange, size = 'md' }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-ws-border overflow-x-auto" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'relative font-medium transition-colors duration-150 ease-out-quart -mb-px shrink-0 whitespace-nowrap',
            {
              'px-3 py-2 text-xs': size === 'sm',
              'px-4 py-2.5 text-sm': size === 'md',
            },
            activeTab === tab.id
              ? 'text-ws-black border-b-2 border-ws-accent'
              : 'text-ws-muted border-b border-transparent hover:text-ws-dark'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={clsx(
                'ml-1.5 inline-flex items-center justify-center rounded-md text-[10.5px] font-medium tabular-nums min-w-[1.25rem] h-[18px] px-1.5 border',
                activeTab === tab.id
                  ? 'bg-ws-accent/[0.08] text-ws-accent border-ws-accent/15'
                  : 'bg-ws-sunken text-ws-muted border-ws-border'
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
