import { NavLink, useLocation } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import {
  ArrowRightLeft,
  FileText,
  BarChart3,
  Settings,
  ChevronRight,
  FileSearch,
  ShieldAlert,
  AlertOctagon,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  module: string;
  children?: { label: string; path: string; icon: React.ReactNode }[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'transfer-pipeline',
    label: 'Transfer Pipeline',
    path: '/transfer',
    icon: <ArrowRightLeft className="w-4 h-4" />,
    module: 'transfer-pipeline',
    children: [
      { label: 'Stage 1 · Ingestion', path: '/transfer/ingestion', icon: <FileSearch className="w-3.5 h-3.5" /> },
      { label: 'Stage 2 · Validation', path: '/transfer/validation', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
      { label: 'Stage 3 · Exceptions', path: '/transfer/exceptions', icon: <AlertOctagon className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: 'advisor-notes',
    label: 'Advisor Notes',
    path: '/advisor-notes',
    icon: <FileText className="w-4 h-4" />,
    module: 'advisor-notes',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/analytics',
    icon: <BarChart3 className="w-4 h-4" />,
    module: 'analytics',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: <Settings className="w-4 h-4" />,
    module: 'settings',
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { hasAccess } = useRole();
  const location = useLocation();

  const visibleItems = NAV_ITEMS.filter((item) => hasAccess(item.module));

  return (
    <>
      {/* Mobile backdrop — sits below the header so the menu button stays tappable */}
      {open && (
        <div
          className="fixed left-0 right-0 bottom-0 top-14 z-30 bg-ws-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed top-14 bottom-0 left-0 z-40 w-64 bg-ws-surface border-r border-ws-border flex flex-col transition-transform duration-200 ease-out-quart lg:static lg:z-auto lg:h-auto lg:translate-x-0 lg:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto" aria-label="Primary">
        {visibleItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const isExpanded = isActive && item.children;

          return (
            <div key={item.id}>
              <NavLink
                to={item.path}
                onClick={onClose}
                data-tour={`nav-${item.id}`}
                className={() =>
                  `group relative flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium tracking-[-0.005em] transition-colors duration-150 ease-out-quart ${
                    isActive
                      ? 'bg-ws-sunken text-ws-black font-semibold'
                      : 'text-ws-muted hover:text-ws-dark hover:bg-ws-sunken/60'
                  }`
                }
              >
                <span
                  className={
                    isActive ? 'text-ws-black' : 'text-ws-muted group-hover:text-ws-dark'
                  }
                >
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.children && (
                  <ChevronRight
                    className={`w-3.5 h-3.5 text-ws-faint transition-transform duration-150 ease-out-quart ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                )}
                {isActive && !item.children && (
                  <span className="w-1 h-1 rounded-full bg-ws-accent" aria-hidden />
                )}
              </NavLink>

              {/* Sub-navigation */}
              {isExpanded && item.children && (
                <div className="ml-5 mt-1 mb-1 space-y-0.5 border-l border-ws-border pl-4">
                  {item.children.map((child) => {
                    const childActive = location.pathname === child.path;
                    return (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        onClick={onClose}
                        className={() =>
                          `group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12px] tracking-tight transition-colors duration-150 ease-out-quart ${
                            childActive
                              ? 'bg-ws-sunken text-ws-black font-semibold'
                              : 'text-ws-muted hover:text-ws-dark hover:bg-ws-sunken/60'
                          }`
                        }
                      >
                        <span
                          className={
                            childActive
                              ? 'text-ws-black'
                              : 'text-ws-faint group-hover:text-ws-muted'
                          }
                        >
                          {child.icon}
                        </span>
                        <span className="flex-1">{child.label}</span>
                        {childActive && (
                          <span className="w-1 h-1 rounded-full bg-ws-accent" aria-hidden />
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-ws-border space-y-1">
        <p className="eyebrow leading-none">v2.0</p>
        <p className="eyebrow leading-none text-ws-faint">simulated data</p>
      </div>
      </aside>
    </>
  );
}
