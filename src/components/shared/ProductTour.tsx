import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * First-visit walkthrough. Each step optionally points at an element marked
 * `data-tour="<target>"`; when that element is missing or off-screen (e.g. the
 * sidebar drawer on mobile, or a module the current role cannot see) the step
 * is shown as a centred card instead, so the tour never breaks.
 */
export interface TourStep {
  target?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to TriAgent',
    body:
      'An AI triage agent for regulated document workflows: it extracts data from documents, validates it against rules, routes exceptions and keeps a human in the loop for approval. This quick tour shows where everything is.',
  },
  {
    target: 'demo-banner',
    title: 'You are in demo mode',
    body:
      'AI results are simulated, so you can try every workflow without a key. To run real AI, add your own Claude, Gemini, OpenAI or OpenRouter key in Settings → AI Provider — the app switches over automatically.',
  },
  {
    target: 'nav-transfer-pipeline',
    title: 'Transfer Pipeline',
    body:
      'The main workflow for inbound account transfers, in three stages: Ingestion (upload or pick a document and extract its fields), Validation (check them against rules) and Exceptions (resolve what failed).',
  },
  {
    target: 'nav-advisor-notes',
    title: 'Advisor Notes',
    body:
      'Paste an advisor meeting note, or pick one of the samples, and check it against CIRO documentation requirements. Missing items are flagged before the note is filed.',
  },
  {
    target: 'nav-analytics',
    title: 'Analytics',
    body: 'Volume, pass rate, override and workload trends across every workflow.',
  },
  {
    target: 'nav-settings',
    title: 'Settings',
    body:
      'Admin only: manage demo users and roles, edit the validation rules the AI applies, and add your AI provider keys.',
  },
  {
    target: 'role-switcher',
    title: 'Switch roles',
    body:
      'View the app as an operations agent, financial advisor, compliance officer, manager or admin. Each role only sees the modules it is allowed to use.',
  },
  {
    target: 'tour-button',
    title: 'You are all set',
    body:
      'A good place to start is Transfer Pipeline or Advisor Notes. You can replay this tour any time from this button.',
  },
];

export const TOUR_SEEN_KEY = 'triagent.tour.v1.seen';

/** True when this browser has not completed or skipped the tour yet. */
export function shouldAutoStartTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === null;
  } catch {
    return false; // storage blocked: never trap the visitor in a tour
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6; // spotlight padding around the target
const GAP = 12; // distance between spotlight and card
const CARD_W = 340;
const LG_BREAKPOINT = 1024; // Tailwind `lg`: the sidebar is a static rail at and above this width

function findTarget(target?: string): Rect | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const visible =
    r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 &&
    r.left < window.innerWidth && r.top < window.innerHeight;
  return visible ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
}

/** Card position next to the spotlight: right, then below, then above; clamped to the viewport. */
function placeCard(rect: Rect, cardH: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 32);
  let top: number;
  let left: number;
  if (rect.left + rect.width + PAD + GAP + w <= vw - 16) {
    left = rect.left + rect.width + PAD + GAP;
    top = rect.top - PAD;
  } else if (rect.top + rect.height + PAD + GAP + cardH <= vh - 16) {
    top = rect.top + rect.height + PAD + GAP;
    left = rect.left + rect.width - w;
  } else {
    top = rect.top - PAD - GAP - cardH;
    left = rect.left + rect.width - w;
  }
  return {
    top: Math.max(16, Math.min(top, vh - cardH - 16)),
    left: Math.max(16, Math.min(left, vw - w - 16)),
  };
}

interface ProductTourProps {
  open: boolean;
  onClose: () => void;
  steps?: TourStep[];
}

export function ProductTour({ open, onClose, steps = TOUR_STEPS }: ProductTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(200);
  // Viewport width in state so a resize / rotation re-renders centred steps too.
  const [viewportW, setViewportW] = useState(() => window.innerWidth);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const last = index === steps.length - 1;

  // Every (re)open starts from the first step.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const finish = useCallback(() => {
    markTourSeen();
    onClose();
  }, [onClose]);

  // Measure the target now and whenever the layout can move it.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const measure = () => {
      setRect(findTarget(step.target));
      setViewportW(window.innerWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step]);

  useLayoutEffect(() => {
    if (open && cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [open, index, rect]);

  // Modal behaviour: everything outside the tour is inert while it is open, and
  // focus goes back to whatever opened it (e.g. the header "Quick tour" button).
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const made: HTMLElement[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el instanceof HTMLElement && el !== rootRef.current && !el.hasAttribute('inert')) {
        el.setAttribute('inert', '');
        made.push(el);
      }
    }
    return () => {
      made.forEach((el) => el.removeAttribute('inert'));
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  // Declared after the effect above so the opener is recorded before focus moves.
  useEffect(() => {
    if (open) nextRef.current?.focus();
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && cardRef.current) {
        // Keep Tab / Shift+Tab inside the card.
        const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button, [href]'));
        if (items.length === 0) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !cardRef.current.contains(active))) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && (active === lastItem || !cardRef.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish, steps.length]);

  if (!open || !step) return null;

  const cardPos = rect ? placeCard(rect, cardH) : null;

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-50" data-testid="product-tour">
      {rect ? (
        // Spotlight: a transparent box whose huge shadow dims everything else.
        <div
          aria-hidden
          className="fixed rounded-lg ring-2 ring-ws-accent pointer-events-none transition-all duration-200 ease-out-quart"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(10, 10, 10, 0.45)',
          }}
        />
      ) : (
        // Inline colour: the theme's oklch ink does not take Tailwind's /opacity modifier.
        <div aria-hidden className="fixed inset-0" style={{ backgroundColor: 'rgba(10, 10, 10, 0.45)' }} />
      )}

      {/* Centred steps are centred by a flex wrapper, not a transform: the
          slide-in animation animates `transform` and would fight a translate. */}
      <div className={cardPos ? 'contents' : 'fixed inset-0 flex items-center justify-center p-4 pointer-events-none'}>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={`${cardPos ? 'fixed' : 'relative pointer-events-auto'} bg-ws-surface rounded-xl shadow-ws-lg border border-ws-border p-5 animate-slide-in overflow-y-auto`}
        style={{
          // Never taller than the viewport (high zoom, phone landscape): the card
          // scrolls, so Close / Next always stay reachable.
          maxHeight: 'calc(100dvh - 32px)',
          ...(cardPos
            ? { top: cardPos.top, left: cardPos.left, width: `min(${CARD_W}px, calc(100vw - 32px))` }
            : { width: `min(${CARD_W + 40}px, calc(100vw - 32px))` }),
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow leading-none pt-1">
            Quick tour · {index + 1} of {steps.length}
          </p>
          <button
            onClick={finish}
            className="-mr-1.5 -mt-1.5 p-1.5 rounded-md text-ws-muted hover:text-ws-dark hover:bg-ws-sunken"
            aria-label="Close tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <h2 id="tour-title" className="mt-3 text-[15px] font-semibold tracking-tight text-ws-black">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-[13px] leading-relaxed text-ws-dark">
          {step.body}
        </p>
        {!rect && step.target?.startsWith('nav-') && (
          // Sidebar item not on screen: below `lg` the navigation lives in the ☰
          // drawer; at `lg`+ the rail is always visible, so the current role
          // simply cannot see this module.
          <p className="mt-2 text-[12px] text-ws-muted">
            {viewportW < LG_BREAKPOINT
              ? 'On a small screen, open the ☰ menu (top left) to find it.'
              : 'Your current role cannot see this module · switch roles (top right) to explore it.'}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          {last ? (
            <span />
          ) : (
            <button
              onClick={finish}
              className="text-[12px] font-medium text-ws-muted hover:text-ws-dark underline-offset-2 hover:underline"
            >
              Skip tour
            </button>
          )}
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                onClick={() => setIndex((i) => i - 1)}
                className="px-3 py-1.5 rounded-md text-[13px] font-medium text-ws-dark border border-ws-border hover:bg-ws-sunken"
              >
                Back
              </button>
            )}
            <button
              ref={nextRef}
              onClick={() => (last ? finish() : setIndex((i) => i + 1))}
              className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-ws-black text-ws-paper hover:bg-ws-dark"
            >
              {last ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}
