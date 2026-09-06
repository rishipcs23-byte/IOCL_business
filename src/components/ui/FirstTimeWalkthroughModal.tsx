'use client';

import React, { useState } from 'react';
import { Fuel, Users, CheckCircle2, ChevronRight, ChevronLeft, X, ShieldCheck, DollarSign, BarChart2 } from 'lucide-react';

interface FirstTimeWalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartDutyClick?: () => void;
}

const STEPS = [
  {
    icon: Fuel,
    title: 'Welcome to Petrol Pump Manager',
    subtitle: 'Simple operations for your daily pump workflow',
    description: 'This system is designed so anyone can manage duties, track fuel sales, verify tank dips, and balance cash without accounting experience.',
    highlight: 'Everything is calculated automatically for you.'
  },
  {
    icon: Users,
    title: '1. Initialise & Assign Staff',
    subtitle: 'Start a duty by assigning staff to pumps',
    description: 'When starting a new duty, select which staff member operates each nozzle (MS-1, MS-2, HSD-1, etc.). Staff remain attached to the duty until it ends.',
    highlight: 'Never worry about unassigned nozzle sales.'
  },
  {
    icon: Fuel,
    title: '2. Record Daily Operations',
    subtitle: 'Track Oil, Credit & Expenses during duty',
    description: 'As sales happen during the duty, log oil sales, customer credit, expenses, or tank sample tests. They automatically adjust the expected cash total.',
    highlight: 'Real-time ledger updates keep records clean.'
  },
  {
    icon: CheckCircle2,
    title: '3. End Duty & Enter Readings',
    subtitle: 'Step-by-step guided closing wizard',
    description: 'When a shift ends, enter nozzle meter closing readings (opening readings auto-fill from previous duty), density, physical tank dip, and digital payments.',
    highlight: 'Built-in validations prevent typos or invalid numbers.'
  },
  {
    icon: DollarSign,
    title: '4. Cash Reconciliation & Shortage',
    subtitle: 'Automatic cash calculations',
    description: 'The system calculates expected cash: Total Revenue - Digital Payments - Credit - Expenses. Enter your bank deposit cash, and shortages or surpluses are detected automatically.',
    highlight: 'No manual cash calculations needed.'
  },
  {
    icon: BarChart2,
    title: '5. Audit & Past Duty Reports',
    subtitle: 'Complete transparency for owners & managers',
    description: 'View chronological movement ledgers, filter reports by date, staff, or pump, and download full PDF duty summaries whenever needed.',
    highlight: 'Instant audit trail for every single session.'
  }
];

export default function FirstTimeWalkthroughModal({ isOpen, onClose, onStartDutyClick }: FirstTimeWalkthroughModalProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  if (!isOpen) return null;

  const currentStep = STEPS[currentStepIndex];
  const IconComponent = currentStep.icon;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-in fade-in duration-200">
      <div className="google-card max-w-xl w-full p-6 shadow-2xl relative overflow-hidden flex flex-col">
        {/* Top Progress bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mb-6 overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300 rounded-full"
            style={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-200 dark:border-blue-800">
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium tracking-wide uppercase">
                Step {currentStepIndex + 1} of {STEPS.length}
              </span>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">{currentStep.title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="my-3 space-y-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{currentStep.subtitle}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{currentStep.description}</p>

          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{currentStep.highlight}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}
            disabled={currentStepIndex === 0}
            className="px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 flex items-center gap-1 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="btn-secondary text-xs"
            >
              Skip Tour
            </button>

            {!isLastStep ? (
              <button
                onClick={() => setCurrentStepIndex(currentStepIndex + 1)}
                className="btn-primary text-xs"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  onClose();
                  if (onStartDutyClick) onStartDutyClick();
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl flex items-center gap-1 transition-colors shadow-sm font-semibold"
              >
                Got it, Let's Start! <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
