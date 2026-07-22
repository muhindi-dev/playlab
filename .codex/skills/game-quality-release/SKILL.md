---
name: game-quality-release
description: Validate a children's browser game before release. Use for test planning, bug fixing, regression checks, deployment readiness, and deciding whether a build can go live.
---

# Game Quality and Release

## Goal

Prove that the delivered game matches its written contract, works on target devices, and does not regress existing play.

## Test strategy

Use four layers:

### 1. Rule tests

Test pure game logic separately from rendering:

- valid and invalid moves;
- scoring and progress;
- completion detection;
- reset and replay;
- save migration and recovery;
- boundary values and repeated actions.

### 2. Interaction tests

Verify complete player actions rather than isolated functions:

- tap or drag begins correctly;
- visual state updates during the gesture;
- release commits or rejects correctly;
- correct actions render immediately;
- accidental duplicate events do not double-count;
- interrupted gestures clean up safely.

### 3. Journey tests

Test full sessions:

- first launch to first successful action;
- start to completion;
- pause, leave, reload, and resume;
- restart and replay;
- empty or missing content;
- invalid saved state;
- offline/static-host behaviour where applicable.

### 4. Device and presentation tests

Verify on actual target classes:

- small phone portrait;
- phone landscape;
- tablet portrait and landscape;
- desktop browser if supported;
- touch and mouse input;
- slower device or throttled CPU where practical.

Check clipping, scrolling, safe areas, orientation changes, text size, button reach, animation smoothness, and audio controls.

## Bug-fix discipline

For every defect:

1. Write exact reproduction steps.
2. Identify expected versus actual behaviour.
3. Locate the state-transition or rendering failure.
4. Add a failing regression test where feasible.
5. Apply the smallest complete fix.
6. Re-run the affected journey and all core smoke tests.
7. Record any new invariant or lesson in documentation.

Do not mask state defects with timing delays, forced rerenders, unrelated state changes, or duplicated event handling.

## Severity

- **Blocker:** cannot start, complete, save, resume, or safely use the game.
- **High:** core mechanic is wrong, misleading, or frequently frustrating.
- **Medium:** degraded but recoverable experience.
- **Low:** cosmetic issue with no meaningful gameplay effect.

No blocker or high-severity defect may knowingly ship.

## Release gates

A build may go live only when:

- written acceptance criteria pass;
- build and automated tests pass;
- first-play, complete-game, restart, and resume journeys pass;
- target-device touch testing passes;
- there are no blocker or high defects;
- save data is backward-compatible or safely migrated/reset;
- errors are handled without blank or trapped screens;
- deployment configuration and asset paths are verified;
- a rollback point exists;
- release notes state what changed and any known low-risk limitations.

## Post-release smoke test

Immediately verify the deployed URL:

1. Hard refresh/new private session.
2. Start a new game.
3. Complete the core interaction.
4. Save or create progress.
5. Reload and resume.
6. Complete or replay.
7. Check mobile layout and console/network errors.

A successful local build is not proof of a successful deployment.
