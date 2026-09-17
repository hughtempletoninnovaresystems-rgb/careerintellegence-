import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionRoleLifecycle } from "../../app/lib/career-intelligence/domain/workflow.ts";

test("role lifecycle permits the expected forward path", () => {
  assert.equal(canTransitionRoleLifecycle("not_started", "in_progress"), true);
  assert.equal(canTransitionRoleLifecycle("not_started", "review_ready"), true);
  assert.equal(canTransitionRoleLifecycle("in_progress", "review_ready"), true);
  assert.equal(canTransitionRoleLifecycle("review_ready", "completed"), true);
});

test("role lifecycle rejects bypassing assessment/review", () => {
  assert.equal(canTransitionRoleLifecycle("not_started", "completed"), false);
  assert.equal(canTransitionRoleLifecycle("in_progress", "completed"), false);
  assert.equal(canTransitionRoleLifecycle("completed", "in_progress"), false);
});
