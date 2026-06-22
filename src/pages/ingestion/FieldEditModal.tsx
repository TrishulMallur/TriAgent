import { useState } from 'react';
import { Button, ConfidenceIndicator } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { Pencil } from 'lucide-react';

interface FieldEditModalProps {
  open: boolean;
  onClose: () => void;
  fieldName: string;
  aiValue: string | null;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  reasoning: string;
  onSave: (correctedValue: string) => void;
}

export function FieldEditModal({
  open,
  onClose,
  fieldName,
  aiValue,
  confidence,
  confidenceLevel,
  reasoning,
  onSave,
}: FieldEditModalProps) {
  const [correctedValue, setCorrectedValue] = useState(aiValue || '');

  const handleSave = () => {
    if (!correctedValue.trim()) return;
    onSave(correctedValue.trim());
    onClose();
  };

  const handleOpen = () => {
    setCorrectedValue(aiValue || '');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit: ${fieldName}`}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!correctedValue.trim() || correctedValue.trim() === (aiValue || '').trim()}
            className="gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            Save Correction
          </Button>
        </>
      }
    >
      <div className="space-y-4" onTransitionEnd={handleOpen}>
        {/* AI Extracted Value */}
        <div>
          <label className="block text-xs font-medium text-ws-muted mb-1">AI Extracted Value</label>
          <div className="rounded-lg border border-ws-border bg-ws-light/50 px-3 py-2 font-mono text-sm text-ws-dark">
            {aiValue || <span className="italic text-ws-muted">Not found</span>}
          </div>
        </div>

        {/* Confidence & Reasoning */}
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-ws-muted mb-1">Confidence</label>
            <div className="flex items-center gap-2">
              <ConfidenceIndicator level={confidenceLevel} />
              <span className="text-xs text-ws-dark font-medium">{Math.round(confidence * 100)}%</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ws-muted mb-1">AI Reasoning</label>
          <p className="text-xs text-ws-dark bg-ws-light/50 rounded-lg border border-ws-border px-3 py-2">
            {reasoning}
          </p>
        </div>

        {/* Corrected Value Input */}
        <div>
          <label className="block text-sm font-medium text-ws-dark mb-1">Corrected Value</label>
          <input
            type="text"
            value={correctedValue}
            onChange={(e) => setCorrectedValue(e.target.value)}
            className="w-full rounded-lg border border-ws-border bg-white px-3 py-2 text-sm text-ws-dark font-mono focus:outline-none focus:ring-2 focus:ring-ws-accent/50"
            placeholder="Enter the correct value..."
            autoFocus
          />
          <p className="text-2xs text-ws-muted mt-1">
            This field will be marked as &quot;Agent Corrected&quot; after saving.
          </p>
        </div>
      </div>
    </Modal>
  );
}
