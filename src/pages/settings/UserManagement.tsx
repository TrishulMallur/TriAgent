import { useState } from 'react';
import { Card, Button, Badge, DataTable, Modal, Select } from '@/components/ui';
import type { Column } from '@/components/ui';
import type { User, UserRole } from '@/types';
import { ROLE_LABELS } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { Pencil, Shield, Users } from 'lucide-react';

// 5 demo users matching RoleContext
const INITIAL_USERS: User[] = [
  { id: 'usr_001', name: 'Sarah Chen', role: 'ops_agent', email: 'sarah.chen@triagent.com', team: 'Transfer Operations' },
  { id: 'usr_002', name: 'Michael Rivera', role: 'advisor', email: 'michael.rivera@triagent.com', team: 'Financial Advisory' },
  { id: 'usr_003', name: 'Aisha Patel', role: 'compliance', email: 'aisha.patel@triagent.com', team: 'Compliance' },
  { id: 'usr_004', name: 'David Kim', role: 'manager', email: 'david.kim@triagent.com', team: 'Operations Management' },
  { id: 'usr_005', name: 'Emma Thompson', role: 'admin', email: 'emma.thompson@triagent.com', team: 'Platform Admin' },
];

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

const ROLE_BADGE_VARIANT: Record<UserRole, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  ops_agent: 'info',
  advisor: 'default',
  compliance: 'warning',
  manager: 'success',
  admin: 'error',
};

export function UserManagement() {
  const { addToast } = useToast();
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setSelectedRole(user.role);
  };

  const handleSaveRole = () => {
    if (!editingUser || !selectedRole) return;
    setUsers((prev) =>
      prev.map((u) =>
        u.id === editingUser.id ? { ...u, role: selectedRole as UserRole } : u
      )
    );
    addToast('success', `Updated ${editingUser.name}'s role to ${ROLE_LABELS[selectedRole as UserRole]}`);
    setEditingUser(null);
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-ws-accent/10 flex items-center justify-center text-ws-accent font-semibold text-xs">
            {row.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <div>
            <div className="font-medium text-ws-dark">{row.name}</div>
            <div className="text-xs text-ws-muted">{row.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      sortValue: (row) => row.role,
      render: (row) => (
        <Badge variant={ROLE_BADGE_VARIANT[row.role]} dot>
          {ROLE_LABELS[row.role]}
        </Badge>
      ),
    },
    {
      key: 'team',
      header: 'Team',
      sortable: true,
      sortValue: (row) => row.team,
      render: (row) => <span className="text-ws-muted">{row.team}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '100px',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleEditClick(row);
          }}
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit Role
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-ws-accent/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-ws-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ws-dark">User Management</h3>
            <p className="text-sm text-ws-muted">Manage demo user accounts and role assignments</p>
          </div>
        </div>
        <Badge variant="info">{users.length} Users</Badge>
      </div>

      {/* Role Legend */}
      <Card padding="sm">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-ws-muted" />
          <span className="text-xs font-semibold text-ws-muted uppercase tracking-wider">Role Permissions</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <div key={role} className="flex items-center gap-2 text-xs text-ws-muted">
              <Badge variant={ROLE_BADGE_VARIANT[role as UserRole]} size="sm" dot>{label}</Badge>
              <span className="text-ws-muted">
                {role === 'admin' && '· Full access + settings'}
                {role === 'manager' && '· Pipeline + notes + analytics'}
                {role === 'compliance' && '· Pipeline + notes + analytics'}
                {role === 'advisor' && '· Notes + analytics only'}
                {role === 'ops_agent' && '· Pipeline + analytics only'}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Users Table */}
      <Card padding="none">
        <DataTable
          columns={columns}
          data={users}
          keyExtractor={(row) => row.id}
        />
      </Card>

      {/* Edit Role Modal */}
      <Modal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Edit User Role"
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveRole}
              disabled={selectedRole === editingUser?.role}
            >
              Save Changes
            </Button>
          </>
        }
      >
        {editingUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-ws-light rounded-lg">
              <div className="w-10 h-10 rounded-full bg-ws-accent/10 flex items-center justify-center text-ws-accent font-semibold text-sm">
                {editingUser.name.split(' ').map((n) => n[0]).join('')}
              </div>
              <div>
                <div className="font-medium text-ws-dark">{editingUser.name}</div>
                <div className="text-xs text-ws-muted">{editingUser.email}</div>
              </div>
            </div>

            <Select
              label="Assign Role"
              options={ROLE_OPTIONS}
              value={selectedRole}
              onChange={setSelectedRole}
            />

            {selectedRole !== editingUser.role && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <Shield className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-xs text-amber-700">
                  Changing role from <strong>{ROLE_LABELS[editingUser.role]}</strong> to{' '}
                  <strong>{ROLE_LABELS[selectedRole as UserRole]}</strong> will update this user's module access immediately.
                </span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
