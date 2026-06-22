import { useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  compact?: boolean;
  /** Column key used as the lead/title line in the mobile card view. Defaults to the first column. */
  cardTitleKey?: string;
}

type SortDirection = 'asc' | 'desc';

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data available',
  compact = false,
  cardTitleKey,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const handleSort = (col: Column<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  const sortedData = [...data];
  if (sortKey) {
    const col = columns.find((c) => c.key === sortKey);
    if (col?.sortValue) {
      sortedData.sort((a, b) => {
        const aVal = col.sortValue!(a);
        const bVal = col.sortValue!(b);
        const cmp = typeof aVal === 'string' ? aVal.localeCompare(String(bVal)) : (aVal as number) - (bVal as number);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
  }

  const titleCol = columns.find((c) => c.key === cardTitleKey) ?? columns[0];

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
        <thead>
          <tr className="border-b border-ws-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  'text-xs font-semibold text-ws-muted uppercase tracking-wider',
                  compact ? 'px-3 py-2' : 'px-4 py-3',
                  col.sortable && 'cursor-pointer select-none hover:text-ws-dark'
                )}
                style={col.width ? { width: col.width } : undefined}
                onClick={() => handleSort(col)}
              >
                <span className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-sm text-ws-muted py-8">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={keyExtractor(row)}
                className={clsx(
                  'border-b border-ws-border/50 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-ws-light/50'
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'text-sm text-ws-dark',
                      compact ? 'px-3 py-2' : 'px-4 py-3'
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden">
        {sortedData.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ws-muted">{emptyMessage}</p>
        ) : (
          <ul className="divide-y divide-ws-border/50">
            {sortedData.map((row) => {
              const fieldCols = columns.filter((c) => c.key !== titleCol.key && c.header);
              const footCols = columns.filter((c) => c.key !== titleCol.key && !c.header);
              return (
                <li
                  key={keyExtractor(row)}
                  className={clsx(
                    'px-4 py-3',
                    onRowClick && 'cursor-pointer hover:bg-ws-light/50'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  <div className="text-sm font-medium text-ws-dark">{titleCol.render(row)}</div>
                  <dl className="mt-2 space-y-1.5">
                    {fieldCols.map((col) => (
                      <div key={col.key} className="flex items-baseline justify-between gap-3">
                        <dt className="text-xs font-semibold text-ws-muted uppercase tracking-wider flex-shrink-0">
                          {col.header}
                        </dt>
                        <dd className="text-sm text-ws-dark text-right min-w-0 break-words">
                          {col.render(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {footCols.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {footCols.map((col) => (
                        <div key={col.key}>{col.render(row)}</div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
