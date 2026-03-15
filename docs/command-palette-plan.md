# RinkLink Command Palette Plan

This document captures the command palette concept for later implementation.

The goal is not a generic global search box. The useful version for RinkLink is a focused power-user launcher for navigation, context switching, and a small set of common actions.

## Purpose

- reduce repetitive sidebar navigation
- speed up team and season switching
- surface high-value actions without forcing users through multiple screens
- support keyboard-heavy desktop workflows

## Trigger

- `Cmd+K` on macOS
- `Ctrl+K` on Windows/Linux
- optional visible trigger in the header or mobile drawer later, if needed

## Recommended V1 Scope

### 1. Navigation

- Go to Dashboard
- Go to Schedule
- Go to Games
- Go to Proposals
- Go to Find Opponents
- Go to Practice
- Go to Competitions
- Go to Standings
- Go to Teams
- Go to Associations
- Go to Rinks

### 2. Context Switching

- Switch active team
- Switch season

These are especially high value because they are used constantly and currently require header selects.

### 3. Common Actions

- Add schedule entry
- Book practice
- Find opponents
- Add player
- Add team
- Add rink
- Reset demo data
- Toggle theme

### 4. Attention / Urgency Targets

- Open incoming proposals
- Open games to confirm
- Open accepted proposals

These should reflect current app state rather than being static commands.

## V1 Structure

The palette should group results into sections:

- Navigation
- Teams
- Seasons
- Actions
- Attention

That structure is important. A single flat list will become noisy quickly.

## Interaction Model

- open on keyboard shortcut
- fuzzy filter as the user types
- up/down arrows move selection
- `Enter` executes
- `Esc` closes
- clear visual grouping and active-row highlight

## What Not To Build In V1

- full-text search across every game, proposal, practice, rink, and association
- multi-step workflow execution from the palette
- deep creation flows like “propose game with Team X on Date Y at Rink Z”
- anything that depends on future auth/permissions not yet implemented

## Why This Scope Makes Sense

RinkLink is operational software, not a document database. The command palette is most valuable when it behaves like a fast launcher:

- jump to a screen
- switch team
- switch season
- start a common action

That is the highest-value version with the lowest implementation risk.

## Why We Are Not Building It Yet

- the app still gets more value from direct workflow polish than from a keyboard launcher
- mobile users will get limited benefit from it
- a too-broad first version would add complexity without enough usage

## Recommended Implementation Shape

- `CommandPaletteProvider` for global open/close state
- `CommandPalette` modal/overlay component
- a command registry composed from:
  - static navigation entries
  - current teams
  - current seasons
  - a small number of dynamic urgency items
- reuse existing dialog, badge, and list-row visual language

## Next Step When This Is Revisited

Before coding, define the exact V1 command inventory and execution behavior for:

- navigation commands
- team-switch commands
- season-switch commands
- common actions
- attention-state commands

That should be approved before implementation so the first version stays narrow and useful.
