import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { TextArea } from '@/components/ui/TextArea';
import { Mail, Eye, Edit3 } from 'lucide-react';

interface EmailDraft {
  subject: string;
  body: string;
}

interface EmailDraftEditorProps {
  draft: EmailDraft;
  recipientName: string;
  recipientEmail: string;
  onDraftChange: (draft: EmailDraft) => void;
}

export function EmailDraftEditor({
  draft,
  recipientName,
  recipientEmail,
  onDraftChange,
}: EmailDraftEditorProps) {
  const [isPreview, setIsPreview] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-ws-accent" />
          <h3 className="text-sm font-semibold text-ws-dark">Client Email Draft</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsPreview(!isPreview)}
          className="gap-1.5"
        >
          {isPreview ? (
            <>
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              Preview
            </>
          )}
        </Button>
      </div>

      {/* Recipient info */}
      <div className="flex items-center gap-4 mb-3 text-xs">
        <div>
          <span className="text-ws-muted">To: </span>
          <span className="font-medium text-ws-dark">{recipientName}</span>
          <span className="text-ws-muted ml-1">&lt;{recipientEmail}&gt;</span>
        </div>
      </div>

      {isPreview ? (
        /* Preview Mode */
        <div className="rounded-lg border border-ws-border bg-ws-light/30 p-4 space-y-3">
          <div>
            <p className="text-2xs text-ws-muted mb-0.5">Subject</p>
            <p className="text-sm font-semibold text-ws-dark">{draft.subject}</p>
          </div>
          <hr className="border-ws-border" />
          <div className="text-sm text-ws-dark leading-relaxed whitespace-pre-line">
            {draft.body}
          </div>
        </div>
      ) : (
        /* Edit Mode */
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ws-dark">Subject</label>
            <input
              type="text"
              value={draft.subject}
              onChange={(e) => onDraftChange({ ...draft, subject: e.target.value })}
              className="w-full rounded-lg border border-ws-border bg-white px-3 py-2 text-sm text-ws-dark focus:outline-none focus:ring-2 focus:ring-ws-accent/50"
            />
          </div>

          <TextArea
            label="Body"
            value={draft.body}
            onChange={(e) => onDraftChange({ ...draft, body: e.target.value })}
            rows={10}
            className="max-h-48 lg:max-h-none"
            helperText="AI-drafted · review and edit before sending"
          />
        </div>
      )}
    </Card>
  );
}
