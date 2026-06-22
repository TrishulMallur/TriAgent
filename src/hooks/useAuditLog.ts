import { useCallback } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { post } from '@/lib/api';
import type { AuditEntry } from '@/types';

type AuditModule = AuditEntry['module'];
type AuditAction = AuditEntry['action'];

interface LogOptions {
  documentId?: string;
  aiVerdict?: string;
  humanDecision?: string;
  overrideReason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Hook for logging audit entries.
 * Automatically includes the current user from RoleContext.
 */
export function useAuditLog(module: AuditModule) {
  const { currentUser, currentRole } = useRole();

  const log = useCallback(
    async (action: AuditAction, options: LogOptions = {}) => {
      const entry = {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        module,
        action,
        documentId: options.documentId || '',
        aiVerdict: options.aiVerdict,
        humanDecision: options.humanDecision,
        overrideReason: options.overrideReason,
        metadata: options.metadata,
        timestamp: new Date().toISOString(),
      };

      try {
        await post('/api/audit', entry);
      } catch {
        // Graceful fallback. The audit entry carries user identity and any
        // override-reason free text · only echo it to the console in dev, never
        // in a production build.
        if (import.meta.env.DEV) {
          console.warn('[Audit] Backend unavailable, audit entry not persisted:', entry);
        }
      }
    },
    [currentUser, currentRole, module]
  );

  return { log };
}
