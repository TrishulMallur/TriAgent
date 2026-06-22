import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/TextArea';
import { CheckCircle2, XCircle, AlertTriangle, Shield } from 'lucide-react';

export type ReviewAction = 'approve' | 'reject' | 'escalate' | 'override';

interface HumanReviewPanelProps {
  onAction: (action: ReviewAction, reason?: string, overrideVerdict?: string) => void;
  disabled?: boolean;
  showOverride?: boolean;
  approveLabel?: string;
  rejectLabel?: string;
  escalateLabel?: string;
  escalationRequired?: boolean;
}

export function HumanReviewPanel({
  onAction,
  disabled = false,
  showOverride = true,
  approveLabel = 'Approve',
  rejectLabel = 'Reject',
  escalateLabel = 'Escalate',
  escalationRequired = false,
}: HumanReviewPanelProps) {
  const [activeModal, setActiveModal] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState('');
  const [overrideVerdict, setOverrideVerdict] = useState('');

  const handleSubmit = () => {
    if (!activeModal) return;
    onAction(activeModal, reason || undefined, overrideVerdict || undefined);
    setActiveModal(null);
    setReason('');
    setOverrideVerdict('');
  };

  const closeModal = () => {
    setActiveModal(null);
    setReason('');
    setOverrideVerdict('');
  };

  return (
    <>
      <Card className="border-ws-accent/20 bg-ws-accent/5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-ws-accent" />
            <h4 className="text-sm font-semibold text-ws-dark">Human Review Required</h4>
          </div>

          {escalationRequired && (
            <div className="flex items-center gap-2 rounded-lg bg-verdict-fail-bg px-3 py-2 border border-verdict-fail/20">
              <AlertTriangle className="w-4 h-4 text-verdict-fail" />
              <p className="text-xs font-medium text-verdict-fail">
                Escalation Required · This item has been flagged for supervisor review
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => onAction('approve')}
              disabled={disabled || escalationRequired}
              className="gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {approveLabel}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setActiveModal('reject')}
              disabled={disabled}
              className="gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              {rejectLabel}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActiveModal('escalate')}
              disabled={disabled}
              className="gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {escalateLabel}
            </Button>
            {showOverride && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveModal('override')}
                disabled={disabled}
                className="gap-1.5"
              >
                <Shield className="w-3.5 h-3.5" />
                Override
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Reject Modal */}
      <Modal
        open={activeModal === 'reject'}
        onClose={closeModal}
        title="Reject · Provide Reason"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleSubmit} disabled={!reason.trim()}>
              Confirm Rejection
            </Button>
          </>
        }
      >
        <TextArea
          label="Rejection reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this is being rejected..."
          rows={4}
        />
      </Modal>

      {/* Escalate Modal */}
      <Modal
        open={activeModal === 'escalate'}
        onClose={closeModal}
        title="Escalate to Supervisor"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!reason.trim()}>
              Confirm Escalation
            </Button>
          </>
        }
      >
        <TextArea
          label="Escalation notes"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe why this requires supervisor review..."
          rows={4}
        />
      </Modal>

      {/* Override Modal */}
      <Modal
        open={activeModal === 'override'}
        onClose={closeModal}
        title="Override AI Verdict"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!reason.trim()}>
              Confirm Override
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextArea
            label="Override reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Document why the AI verdict is being overridden..."
            rows={3}
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ws-dark">New verdict</label>
            <select
              value={overrideVerdict}
              onChange={(e) => setOverrideVerdict(e.target.value)}
              className="w-full rounded-lg border border-ws-border bg-white px-3 py-2 text-sm text-ws-dark focus:outline-none focus:ring-2 focus:ring-ws-accent/50"
            >
              <option value="">Select new verdict...</option>
              <option value="pass">Pass</option>
              <option value="needs_review">Needs Review</option>
              <option value="fail">Fail</option>
            </select>
          </div>
        </div>
      </Modal>
    </>
  );
}
