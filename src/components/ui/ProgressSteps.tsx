import { clsx } from 'clsx';
import { Check } from 'lucide-react';

interface Step {
  id: string;
  label: string;
}

interface ProgressStepsProps {
  steps: Step[];
  currentStep: string;
  completedSteps?: string[];
}

export function ProgressSteps({ steps, currentStep, completedSteps = [] }: ProgressStepsProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center gap-2" role="navigation" aria-label="Progress">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id) || index < currentIndex;
        const isCurrent = step.id === currentStep;
        const isFuture = !isCompleted && !isCurrent;

        return (
          <div key={step.id} className="flex items-center gap-2">
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              <div
                className={clsx(
                  'w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold tabular-nums transition-colors',
                  isCompleted && 'bg-ws-accent text-ws-paper',
                  isCurrent && 'border-2 border-ws-accent text-ws-accent bg-ws-paper',
                  isFuture && 'bg-ws-surface text-ws-muted border border-ws-border-strong'
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
              </div>
              <span
                className={clsx(
                  'hidden sm:inline text-sm font-medium whitespace-nowrap',
                  isCurrent ? 'text-ws-black' : isCompleted ? 'text-ws-dark' : 'text-ws-muted'
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {index < steps.length - 1 && (
              <div
                className={clsx(
                  'w-4 sm:w-8 h-px',
                  index < currentIndex ? 'bg-ws-accent' : 'bg-ws-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
