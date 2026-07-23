# PsyDuck Development Roadmap

> This document defines the active development roadmap for PsyDuck.
> It should be treated as the current project plan.
> Unless explicitly instructed, future tasks should follow this roadmap and should not redesign completed systems.

---

# Vision

PsyDuck is a desktop companion.

It is **not** intended to become a productivity suite or calendar application.

The goal is to create a friendly assistant that lives on the user's desktop, remembers them, helps them stay focused, reminds them about important things, and feels alive.

The architecture should remain modular, reusable, and milestone-based.

---

# Core Principles

- Build reusable systems.
- Avoid duplicate implementations.
- Keep renderer logic inside the renderer.
- Keep Electron-specific logic inside the main process.
- Use existing services whenever possible.
- Prefer extending existing systems over creating new ones.
- Do not perform unrelated refactors.
- Do not create commits unless explicitly requested.

---

# Existing Core Systems (Completed)

✓ Electron desktop companion

✓ Transparent always-on-top window

✓ Pixel-art companion

✓ Animation Engine

✓ Eye Tracking

✓ Drag System

✓ Behavior Engine

✓ Speech Bubble

✓ AI Chat

✓ Water Reminder

✓ Theme System

✓ Secure IPC

✓ Widget Stack

✓ Settings Infrastructure

✓ Pomodoro Timer

✓ Personal Identity (AST-001)

✓ Reminder Foundation (AST-002A)

---

# Widget Stack

The CompanionWidgetStack is now the single layout manager for floating widgets.

Widgets should never use hardcoded positions.

Current stack order:

Temporary Floating Panel

↓

AI Bubble

↓

Speech Bubble

↓

Pomodoro Widget

↓

PsyDuck

Future widgets must integrate into this stack rather than positioning themselves manually.

---

# Reminder Architecture

AST-002A has already been completed.

The following already exist:

- Reminder model
- ReminderService
- Reminder validation
- Reminder persistence
- Reminder IPC
- Settings migration

ReminderService is the only supported API for reminder CRUD.

Renderers must never modify reminder settings directly.

No scheduler or UI has been implemented yet.

---

# User Identity

The user can define their name.

The companion should use this name naturally.

Examples:

"Good morning, Aman."

"Aman, your meeting starts in 10 minutes."

"Welcome back, Aman."

Future assistant features should use the stored user name whenever appropriate.

---

# Product Direction

PsyDuck should feel like a desktop companion.

Do NOT turn PsyDuck into:

- Google Calendar
- Outlook
- Apple Calendar
- Email client
- Slack client
- Teams client
- Enterprise productivity software

Calendar synchronization is intentionally NOT part of the roadmap.

---

# Upcoming Milestones

## AST-002B

Reminder Scheduler

Implement:

- reminder scheduling
- restore reminders after restart
- efficient scheduling
- sleep/wake recovery

Do NOT create UI.

---

## AST-002C

Reminder Creation Panel

Implement a floating reminder panel.

Allow:

- title
- optional message
- date/time selection

Save reminders through ReminderService.

---

## AST-002D

Reminder Widget

When reminders trigger:

Reminder Widget

↓

AI Bubble

↓

Speech Bubble

↓

Pomodoro

↓

PsyDuck

Provide:

- Dismiss
- Snooze (5 minutes)

No manual positioning.

Use CompanionWidgetStack.

---

## AST-002E

Reminder Manager

Allow users to:

- view reminders
- edit reminders
- delete reminders
- mark completed

Reuse ReminderService.

---

## AST-003

Sticky Message

Persistent message always visible above PsyDuck until removed.

Requirements:

- persistent storage
- editable
- removable
- integrated with Widget Stack

---

## AST-004

Daily Planner

Generate a morning overview using reminders already stored locally.

Example:

Good Morning, Aman.

Today's Schedule:

• Team Meeting — 2 PM

• Finish Assignment

• Gym — 7 PM

No external calendar integrations.

---

## AST-005

Recurring Reminders

Examples:

- Drink water every hour
- Stretch every 2 hours
- Medicine every day

Should extend ReminderService rather than creating a second reminder implementation.

---

## AST-006

AI Assistant Actions

Allow the AI to create reminders automatically.

Example:

"Remind me tomorrow at 5 PM to call John."

↓

ReminderService.createReminder(...)

No duplicate scheduling logic.

---

## AST-007

Companion Personality

Expand PsyDuck's personality.

Examples:

- Welcome back
- Good morning
- Good night
- Celebrate completed Pomodoros
- Congratulate finished reminders
- Random encouraging messages

The companion should feel alive while remaining non-intrusive.


---

# Development Guidelines

Every milestone should:

- build on existing systems
- remain modular
- avoid regressions
- reuse ReminderService where applicable
- reuse Widget Stack
- reuse SettingsService
- reuse FloatingCompanionPanel where appropriate

Always validate:

- npm run build
- npm test

Do not create commits unless explicitly requested.

When a milestone is complete, stop and wait for the next task.