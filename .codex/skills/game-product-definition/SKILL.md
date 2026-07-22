---
name: game-product-definition
description: Define a new children's game completely before implementation. Use for new game ideas, major modes, redesigns, and any request where unclear rules or expectations could cause rework.
---

# Game Product Definition

## Goal

Turn an idea into a build-ready game contract before production code begins.

## Required output

Create or update a concise game brief containing:

- audience and target devices;
- one-sentence player promise;
- core loop;
- win, completion, retry, pause, exit, and resume behaviour;
- game rules and edge cases;
- screens and navigation;
- controls and feedback;
- content requirements;
- saving and progress model;
- accessibility and child-safety constraints;
- explicit non-goals;
- measurable acceptance criteria.

## Workflow

### 1. Establish the player promise

State what the child does, why it is enjoyable, and what a successful session feels like. Keep it to one sentence.

### 2. Define the smallest complete game

Separate:

- **Must have:** required for a complete, enjoyable first release.
- **Later:** useful but not required.
- **Not included:** intentionally excluded to protect scope.

Do not begin with multiple game modes unless they share the same proven core mechanic.

### 3. Specify the core loop

Write the loop as observable steps:

1. Player sees a clear goal.
2. Player takes an action.
3. Game gives immediate visual feedback.
4. State updates correctly.
5. Player understands the next action.
6. The loop reaches a clear completion state.

### 4. Resolve rules and edge cases

Specify at minimum:

- valid and invalid actions;
- what happens after a correct action;
- what happens after a mistake;
- duplicate or repeated actions;
- interrupted gestures;
- restart and new-game behaviour;
- incomplete sessions;
- corrupted or outdated saved data;
- completion and replay.

### 5. Map every screen and state

For each screen define:

- purpose;
- primary action;
- secondary actions;
- entry and exit paths;
- empty, loading, error, paused, and completed states.

Avoid hidden navigation and ambiguous icon-only controls.

### 6. Write acceptance criteria

Use observable Given/When/Then statements. Include happy paths and failure paths.

Example:

> Given a puzzle piece is dropped inside its correct snap zone, when the pointer is released, then the piece immediately renders in its final position, becomes non-draggable, progress updates once, and no second interaction is required.

### 7. Run the rework-prevention review

Do not approve implementation until these questions have explicit answers:

- Can a developer build this without guessing?
- Can a tester objectively decide whether it works?
- Are all irreversible architecture choices justified?
- Is the first release smaller than the full idea?
- Have target-device constraints been considered?
- Are visual preferences separated from functional requirements?

## Stop conditions

Pause implementation when:

- two requirements conflict;
- a core rule is undefined;
- a requested enhancement changes the core loop;
- acceptance criteria cannot be written objectively;
- a visual mock-up is needed to resolve layout or interaction uncertainty.

Return to the brief, resolve the uncertainty, and only then continue.
