import { createContext, useContext, useState, type ReactNode } from 'react';
import type { UserRole, User } from '@/types';

// Demo users for each role
const DEMO_USERS: Record<UserRole, User> = {
  ops_agent: {
    id: 'usr_001',
    name: 'Sarah Chen',
    role: 'ops_agent',
    email: 'sarah.chen@triagent.com',
    team: 'Transfer Operations',
  },
  advisor: {
    id: 'usr_002',
    name: 'Michael Rivera',
    role: 'advisor',
    email: 'michael.rivera@triagent.com',
    team: 'Financial Advisory',
  },
  compliance: {
    id: 'usr_003',
    name: 'Aisha Patel',
    role: 'compliance',
    email: 'aisha.patel@triagent.com',
    team: 'Compliance',
  },
  manager: {
    id: 'usr_004',
    name: 'David Kim',
    role: 'manager',
    email: 'david.kim@triagent.com',
    team: 'Operations Management',
  },
  admin: {
    id: 'usr_005',
    name: 'Emma Thompson',
    role: 'admin',
    email: 'emma.thompson@triagent.com',
    team: 'Platform Admin',
  },
};

interface RoleContextType {
  currentUser: User;
  currentRole: UserRole;
  switchRole: (role: UserRole) => void;
  hasAccess: (module: string) => boolean;
}

const RoleContext = createContext<RoleContextType | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [currentRole, setCurrentRole] = useState<UserRole>('admin');
  const currentUser = DEMO_USERS[currentRole];

  const ROLE_MODULES: Record<UserRole, string[]> = {
    ops_agent: ['transfer-pipeline', 'analytics'],
    advisor: ['advisor-notes', 'analytics'],
    compliance: ['transfer-pipeline', 'advisor-notes', 'analytics'],
    manager: ['transfer-pipeline', 'advisor-notes', 'analytics'],
    admin: ['transfer-pipeline', 'advisor-notes', 'analytics', 'settings'],
  };

  const hasAccess = (module: string) => {
    return ROLE_MODULES[currentRole]?.includes(module) ?? false;
  };

  return (
    <RoleContext.Provider value={{ currentUser, currentRole, switchRole: setCurrentRole, hasAccess }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within a RoleProvider');
  return context;
}
