---
name: child-first-game-ux
description: Design and review game interfaces for children, especially touch-first browser games. Use for layouts, controls, onboarding, feedback, accessibility, animations, and responsive behaviour.
---

# Child-First Game UX

## Goal

Make the game immediately understandable, forgiving, responsive, and enjoyable for the intended child age range.

## Principles

### Show the next action

At every moment the child should understand:

- what the goal is;
- what can be touched or dragged;
- what just happened;
- what to do next.

Prefer visual demonstration and direct manipulation over instructions.

### Design for touch first

- Use large targets with generous spacing.
- Never depend on hover.
- Prevent accidental browser scrolling or selection during game gestures.
- Keep critical controls away from common gesture edges when practical.
- Support pointer cancellation, off-target release, and interrupted drags.
- Make drag previews and snap zones visually clear without clutter.

### Give immediate truthful feedback

Input, state, and rendering must update in the same interaction. Never require a second tap or drag to reveal a successful action.

Feedback should distinguish:

- selected;
- moving;
- valid target;
- incorrect attempt;
- correct placement;
- completion.

Animation may explain a state change but must not delay or hide the actual state update.

### Make mistakes safe

- Allow easy retry.
- Avoid loss of unrelated progress.
- Do not use harsh sounds, red warning overload, or shame language.
- Confirm only genuinely destructive actions.
- Provide undo where it materially reduces frustration.

### Keep the interface calm

- One dominant action per screen.
- Minimal text.
- Consistent control positions.
- Avoid unnecessary menus, counters, badges, and effects.
- Celebrate completion without blocking replay or exit for too long.

## Required UX specification

For every screen or game mode, define:

1. Primary player goal.
2. Primary interaction.
3. Visual hierarchy.
4. Touch target and gesture behaviour.
5. Success feedback.
6. Mistake feedback.
7. Exit, restart, help, and resume paths.
8. Small-screen and landscape behaviour.
9. Keyboard support where practical.
10. Reduced-motion and muted-audio behaviour.

## Prototype gate

Before production implementation, prototype any interaction that involves:

- drag and drop;
- snapping;
- rotation, scaling, drawing, or multi-touch;
- unusual navigation;
- dense game boards;
- responsive repositioning of pieces or controls.

Test the prototype at the smallest supported screen size and with an actual touch device.

## Review checklist

Reject the UX when any answer is no:

- Can a child start without adult explanation?
- Is the main action obvious within three seconds?
- Does every input produce immediate feedback?
- Is a correct action visibly committed immediately?
- Can the child recover from a mistake?
- Can the game be paused or left safely?
- Is progress preserved as promised?
- Are controls usable in portrait and landscape where supported?
- Is essential information available without sound or colour alone?
- Are completion and replay clear?
