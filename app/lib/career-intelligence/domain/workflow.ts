export type RoleLifecycleStatus =
  | "not_started"
  | "in_progress"
  | "review_ready"
  | "submitted"
  | "completed";

const allowedTransitions: Record<RoleLifecycleStatus, RoleLifecycleStatus[]> = {
  not_started: ["in_progress", "review_ready"],
  in_progress: ["review_ready"],
  review_ready: ["in_progress", "submitted", "completed"],
  submitted: ["completed"],
  completed: [],
};

export function canTransitionRoleLifecycle(
  from: RoleLifecycleStatus,
  to: RoleLifecycleStatus,
) {
  if (from === to) {
    return true;
  }

  return allowedTransitions[from].includes(to);
}
