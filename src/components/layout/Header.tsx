import { useRole } from '@/contexts/RoleContext';
import { ROLE_LABELS, type UserRole } from '@/types';
import {
  BarChart3,
  Briefcase,
  ChevronDown,
  HelpCircle,
  KeyRound,
  Menu,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface HeaderProps {
  /** Toggles the mobile navigation drawer. Inert at `lg`+ where the rail is static. */
  onMenuClick?: () => void;
  /** Replays the first-visit walkthrough. */
  onTourClick?: () => void;
}

const ROLE_ICONS: Record<UserRole, React.ReactNode> = {
  ops_agent: <Settings className="w-4 h-4 text-ws-muted" />,
  advisor: <Briefcase className="w-4 h-4 text-ws-muted" />,
  compliance: <ShieldCheck className="w-4 h-4 text-ws-muted" />,
  manager: <BarChart3 className="w-4 h-4 text-ws-muted" />,
  admin: <KeyRound className="w-4 h-4 text-ws-muted" />,
};

export function Header({ onMenuClick, onTourClick }: HeaderProps) {
  const { currentUser, currentRole, switchRole } = useRole();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="h-14 flex-none bg-ws-surface border-b border-ws-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
      {/* Left: Menu (mobile) + Logo + eyebrow */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden -ml-1.5 flex items-center justify-center w-10 h-10 rounded-md text-ws-muted hover:text-ws-dark hover:bg-ws-sunken transition-colors duration-150 ease-out-quart"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 bg-ws-black rounded-md flex items-center justify-center flex-shrink-0">
          <span className="text-ws-paper font-semibold text-[13px] leading-none">T</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight text-ws-black leading-none">
            TriAgent
          </h1>
          <span className="hidden md:inline eyebrow leading-none">
            prototype · simulated data
          </span>
        </div>
      </div>

      {/* Right: Tour + Role Switcher */}
      <div className="flex items-center gap-1 sm:gap-2">
      {onTourClick && (
        <button
          onClick={onTourClick}
          data-tour="tour-button"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-ws-muted hover:text-ws-dark hover:bg-ws-sunken transition-colors duration-150 ease-out-quart"
          aria-label="Take the quick tour"
        >
          <HelpCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Quick tour</span>
        </button>
      )}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          data-tour="role-switcher"
          className="flex items-center gap-3 px-2.5 py-1.5 rounded-md hover:bg-ws-sunken transition-colors duration-150 ease-out-quart"
        >
          <div className="w-7 h-7 bg-ws-sunken rounded-full flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-ws-muted" />
          </div>
          <div className="text-left hidden sm:block leading-tight">
            <p className="text-[13px] font-medium text-ws-black leading-tight">
              {currentUser.name}
            </p>
            <p className="text-2xs text-ws-muted leading-tight">{ROLE_LABELS[currentRole]}</p>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-ws-muted transition-transform duration-150 ease-out-quart ${
              dropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-60 max-w-[calc(100vw-2rem)] bg-ws-surface rounded-xl shadow-ws-lg border border-ws-border overflow-hidden animate-slide-in">
            <div className="px-4 pt-3 pb-2 border-b border-ws-border">
              <p className="eyebrow leading-none">view as</p>
            </div>
            <div className="py-1">
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => {
                const active = role === currentRole;
                return (
                  <button
                    key={role}
                    onClick={() => {
                      switchRole(role);
                      setDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ease-out-quart ${
                      active
                        ? 'bg-ws-sunken'
                        : 'hover:bg-ws-sunken/60'
                    }`}
                  >
                    <span className="flex items-center justify-center w-5">
                      {ROLE_ICONS[role]}
                    </span>
                    <span
                      className={`flex-1 text-[13px] tracking-[-0.005em] ${
                        active ? 'text-ws-black font-semibold' : 'text-ws-dark font-medium'
                      }`}
                    >
                      {ROLE_LABELS[role]}
                    </span>
                    {active && (
                      <span className="w-1 h-1 rounded-full bg-ws-accent" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
