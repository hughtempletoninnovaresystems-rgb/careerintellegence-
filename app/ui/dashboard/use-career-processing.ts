"use client";

import { useRef, useState } from "react";

export type CareerProcessingAction =
  | "upload_cv" | "start_manual" | "submit_answers"
  | "review_capability" | "save_edit" | "add_capability" | "save_role" | "complete_role";

export const processingMessages: Record<CareerProcessingAction, { button: string; message: string }> = {
  upload_cv: { button: "Processing CV…", message: "Reading your CV and identifying your career history…" },
  start_manual: { button: "Assessing role…", message: "Assessing the information provided for this role…" },
  submit_answers: { button: "Recording responses…", message: "Assessing and recording your responses…" },
  review_capability: { button: "Recording review…", message: "Checking and recording your review decision…" },
  add_capability: { button: "Adding capability…", message: "Recording your capability statement for assessment…" },
  save_edit: { button: "Saving changes…", message: "Checking and recording your changes…" },
  save_role: { button: "Saving role…", message: "Checking and recording your role information…" },
  complete_role: { button: "Completing role…", message: "Compiling and recording your responses for this role…" },
};

/** CI-UX-001: ref guard closes the rapid-double-click gap before React renders. */
export function useCareerProcessing() {
  const activeRef = useRef<CareerProcessingAction | null>(null);
  const [active, setActive] = useState<CareerProcessingAction | null>(null);
  const [uncertain, setUncertain] = useState(false);

  function beginProcessing(action: CareerProcessingAction) {
    if (activeRef.current || uncertain) return false;
    activeRef.current = action;
    setActive(action);
    return true;
  }

  function finishProcessing() {
    // Known success or failure only. Uncertain outcomes need reconciliation.
    if (uncertain) return;
    activeRef.current = null;
    setActive(null);
  }

  function markResultUncertain() { setUncertain(true); }

  return {
    loading: active !== null,
    processingAction: active,
    processingMessage: active ? (uncertain
      ? "This is taking longer than expected. We’re checking whether your changes were recorded. Please avoid submitting again."
      : processingMessages[active].message) : null,
    uncertain,
    beginProcessing, finishProcessing, markResultUncertain,
  };
}
