## Problem Statement

The user wants a personal Android budgeting app that behaves like a narrow, local-first YNAB-style envelope budget, but uses bank SMS messages as the primary transaction source. Existing starter code provides an Expo shell only; it does not yet define the financial model, SMS ingestion workflow, review flow, reconciliation strategy, or budgeting rules needed to make the idea buildable.

The user needs a product definition that is strict enough to implement without drifting into a generic finance app, a full YNAB clone, or a parser science project. The app must reliably ingest SMS notifications from one configured bank, preserve the bank-reported running balance, route questionable imports into an inbox, and let the user assign real cash into monthly categories so every unit of money has a job.

## Solution

Build an Android-only, local-first envelope budgeting app with a bank-SMS ingestion pipeline and a derived budgeting engine. The app will treat the latest bank-reported balance from a successfully imported SMS as the authoritative account balance, while separately maintaining an editable canonical transaction ledger used for budgeting.

Incoming bank SMS messages are filtered by an explicit sender allowlist and handed off by a native Android receiver into a minimal native queue. JavaScript drains that queue, stores immutable raw SMS records, runs a hardcoded TypeScript parser for the configured bank, and produces immutable parse results plus candidate canonical transactions. A first-class Inbox screen handles needs-review transactions, unparseable messages that require manual import, and soft-flagged possible duplicates.

Budgeting follows a month-based envelope model with carryover. Approved outflows must have exactly one category. Approved inflows are categoryless and increase Ready to Assign. Budget totals such as category available, assigned this month, activity this month, Ready to Assign, and reconciliation gap are all derived from facts rather than stored as mutable totals.

The result is a tight v1: one bank profile, one visible on-budget account, one currency, local storage only, manual backup/restore, basic reports, and explicit out-of-scope boundaries to prevent complexity from exploding.

## User Stories

1. As a mobile bank customer, I want the app to show my current account balance, so that I can see how much money I actually have right now.
2. As a budgeter, I want all money to start unassigned when it comes in, so that I can intentionally give every unit of money a job.
3. As a budgeter, I want to assign money into categories such as rent, groceries, and savings, so that my account balance is divided into meaningful envelopes.
4. As a budgeter, I want category balances to carry over month to month, so that savings categories accumulate naturally.
5. As a budgeter, I want negative overspending to reduce next month’s Ready to Assign, so that budget reality matches cash reality.
6. As a budgeter, I want approved outflows to require a category, so that no spending enters the budget without being accounted for.
7. As a budgeter, I want inflows to go to Ready to Assign instead of directly into categories, so that incoming money is allocated intentionally.
8. As a user, I want the app to read transaction SMS messages from my configured bank sender, so that I do not have to enter every transaction manually.
9. As a user, I want the app to ignore unrelated SMS senders, so that the import pipeline does not create false financial events.
10. As a user, I want raw SMS messages to be stored immutably, so that parser bugs can be fixed without losing evidence.
11. As a user, I want parser output stored separately from the final editable transaction, so that I can correct mistakes without overwriting what the parser originally extracted.
12. As a user, I want new SMS transactions to appear in an Inbox for review, so that I can validate imports before they fully affect the budget.
13. As a user, I want outflow review to be a single action where I choose a category and approve, so that transaction handling is fast.
14. As a user, I want inflow review to be a simple approval step, so that income can reach Ready to Assign with minimal friction.
15. As a user, I want the current account balance header to update as soon as a valid SMS is parsed, so that the balance reflects the newest bank state even before review is complete.
16. As a user, I want unparseable SMS messages to become manual import tasks, so that I can recover data from odd messages instead of losing it.
17. As a user, I want possible duplicate SMS imports to be flagged, so that accidental double imports do not silently corrupt my budget.
18. As a user, I want to ignore duplicate or irrelevant imports, so that the Inbox only contains actionable items.
19. As a user, I want the app to ignore pre-tracking SMS by default, so that onboarding with a starting balance creates a clean cutover boundary.
20. As a user, I want onboarding to start from a manual starting balance, so that I do not need historical SMS to begin budgeting.
21. As a user, I want the app to keep working locally with no backend or login, so that my budgeting data stays on-device and the app remains simple.
22. As a user, I want a manual transaction entry path, so that I can record missing or non-SMS transactions.
23. As a user, I want to edit approved transactions, so that parser mistakes and user mistakes can be corrected without hacks.
24. As a user, I want reconciliation warnings when the approved ledger does not match the authoritative bank balance, so that I know the system needs attention.
25. As a user, I want a one-tap reconciliation adjustment action, so that I can recover from ledger drift without rewriting history.
26. As a user, I want savings categories to behave like normal budget categories, so that saving money is the same action as assigning money anywhere else.
27. As a user, I want category groups, so that the budget screen stays organized once I have many categories.
28. As a user, I want an Inbox screen that centralizes review tasks, so that import problems are not scattered across notifications and banners.
29. As a user, I want the app to show overspent categories clearly, so that I know which budget areas need money moved into them.
30. As a user, I want the app to show when Ready to Assign is negative, so that I know I have allocated more money than I currently have.
31. As a user, I want notifications to be batched and debounced, so that the app alerts me without spamming me.
32. As a user, I want notifications when transactions need review, so that I do not forget to categorize spending.
33. As a user, I want notifications when money is available to assign, so that new inflows do not sit unallocated.
34. As a user, I want notifications when categories are overspent, so that I can rebalance my budget.
35. As a user, I want monthly spending by category, so that I can see where money went during a month.
36. As a user, I want a monthly inflow versus outflow summary, so that I can see whether the month was net positive or negative.
37. As a user, I want past months to stay editable, so that late reviews and corrections update the budget accurately.
38. As a user, I want month math based on transaction occurrence time instead of review time, so that late approval does not rewrite the wrong month.
39. As a user, I want assignment changes stored as explicit events, so that moving money between categories is traceable.
40. As a user, I want backup export and full-replace restore, so that I can protect my local data without adding sync complexity.
41. As a user, I want the app to support more accounts in the schema later, so that v1 does not force a rewrite when the model expands.
42. As a developer, I want the Android receiver to do minimal work and only queue SMS payloads, so that business logic stays in the tested TypeScript domain layer.
43. As a developer, I want a hardcoded parser module for one bank, so that parser behavior is testable and not diluted by premature configurability.
44. As a developer, I want financial totals derived from stored facts instead of mutable aggregates, so that corrections and backdated edits recompute cleanly.
45. As a developer, I want a manual fake-SMS import flow before native interception, so that the core product can be validated before native plumbing is added.
46. As a developer, I want a clean separation between immutable evidence, parser interpretation, and canonical user-facing transactions, so that each layer can evolve safely.
47. As a developer, I want the parser and budget engine to live behind deep modules with stable interfaces, so that UI work does not leak into domain logic.
48. As a user, I want the app to remain useful even if a bank message has unusual wording, so that I can fall back to manual import instead of abandoning the transaction.
49. As a user, I want the app to treat refunds and reversals as normal inflows in v1, so that the cash position stays correct without building a refund-linking subsystem.
50. As a user, I want the app to remain fast and understandable, so that it feels like a focused personal finance tool instead of a bloated accounting platform.

## Implementation Decisions

- The app will be Android-only in v1. Expo remains the application shell, but the product explicitly depends on Android-native SMS access through Expo prebuild/dev client rather than pretending to be a cross-platform managed-only app.
- The current repository is a starter Expo Router and NativeWind scaffold. The PRD therefore introduces the core domain model, application modules, and testing seams from scratch rather than modifying an established finance codebase.
- The main deep modules will be:
  - an SMS ingestion module that drains raw queued SMS payloads, normalizes them, and persists immutable message records;
  - a bank parser module that converts one bank’s SMS format into structured parse results;
  - an import orchestration module that turns parse results into candidate transactions, duplicate flags, manual-import tasks, or ignored imports;
  - a budgeting engine that derives Ready to Assign, category availability, monthly activity, carryover, and reconciliation gap from stored facts;
  - a transaction workflow module that enforces review and approval invariants;
  - a reporting module that exposes read-only monthly summaries;
  - a backup/restore module for snapshot export and full-replace import.
- The native Android receiver should do the minimum possible work: filter by sender allowlist, append raw payloads into a small native queue, and return quickly. The receiver must not contain business logic, parsing logic, or canonical transaction creation.
- JavaScript is the source of truth for parsing and finance logic. The parser will be a hardcoded TypeScript module for one bank profile, keyed by parser identifier and version, rather than a user-configurable regex system or generic parser builder.
- SMS ingestion is gated by an explicit sender allowlist plus parser profile. Only matched senders are candidates for import.
- The data model is layered intentionally:
  - immutable raw SMS messages preserve original evidence;
  - immutable parse results preserve what the parser inferred at a specific parser version;
  - editable canonical transactions represent what the budget actually uses.
- Canonical transactions need support for these sources: SMS, manual, reconciliation, and starting balance.
- Canonical transactions need support for these workflow states: needs review, approved, and ignored.
- Approved outflows must always have exactly one category. Approved inflows are categoryless in v1 and increase Ready to Assign.
- The account header balance is authoritative from the newest known balance-after value by transaction occurrence time, not by SMS receipt time and not by transaction approval time.
- Manual transactions may omit balance-after because balance-after is treated as bank evidence rather than a mandatory property of every transaction.
- Refunds and reversals are modeled as normal inflows in v1. They are not linked back to prior outflows.
- The onboarding flow uses a manual starting balance transaction and sets the tracking cutover at onboarding completion time. SMS messages earlier than that cutover are ignored by default.
- The visible product surface is single-account in v1, but the schema should support multiple accounts so future expansion does not require a full rewrite.
- The budget is month-based with carryover. Current-month budgeting is the only assignment target in v1; future-month assignment is out of scope.
- Budget assignment is event-sourced at the month-category level. Assignment changes are stored as explicit events rather than overwriting a monthly assigned total.
- Budget numbers must be fully derived. Category available, assigned this month, activity this month, Ready to Assign, and reconciliation gap should not be stored as mutable totals maintained by UI screens.
- Positive category balances carry forward between months. Negative overspending does not persist in the category; instead it reduces next month’s Ready to Assign.
- The Inbox is a first-class product surface with at least three sections: needs review, needs manual import, and possible duplicates.
- The initial main app surfaces should be Budget, Transactions, Inbox, Reports, and Settings.
- The reporting scope is deliberately narrow in v1: monthly spending by category and monthly inflow versus outflow only. Reports must use approved transactions only.
- The local data layer uses SQLite with Drizzle ORM. The persistence layer needs tables for accounts, category groups, categories, assignment events, SMS messages, parse results, canonical transactions, and settings.
- Reconciliation is explicit. The app shows the gap between authoritative balance and approved-ledger balance and provides a user-driven reconciliation adjustment action instead of silently fixing history.
- Normal product UI should not support hard deletion of canonical transactions. Recovery paths are edit, ignore, manual import, and reconciliation adjustment.
- Backup and restore are local-only. Export produces a complete snapshot; restore replaces all local data rather than merging.
- Basic notifications are in scope, but only as debounced summaries of actionable states such as items needing review, money to assign, overspent categories, or over-assigned budget.
- The implementation order should deliberately start with schema, budgeting engine, onboarding, fake/manual SMS import, parser fixtures, and review flows before native SMS interception. This keeps the hard product logic testable before native plumbing is introduced.

## Testing Decisions

- Good tests in this project should verify externally visible financial behavior and workflow invariants, not implementation details such as internal state shape or specific SQL query construction.
- The highest-value tests should target deep modules with stable interfaces:
  - bank SMS parser behavior using realistic redacted SMS fixtures;
  - import orchestration behavior, including accepted imports, ignored imports, duplicate flags, and manual-import fallbacks;
  - budgeting engine calculations for Ready to Assign, category availability, carryover, overspending rollover, and reconciliation gap;
  - transaction workflow invariants, especially approval rules for inflows versus outflows;
  - reporting queries for monthly spending by category and monthly inflow versus outflow;
  - backup export and full-replace restore behavior.
- The budgeting engine should be designed as a pure domain layer so it can be tested independently of React components and independently of the native SMS receiver.
- The parser should be tested with fixture-driven cases that include normal messages, duplicate-looking messages, malformed messages, pre-tracking messages, and redacted reversal/refund examples.
- UI tests should focus on critical workflow seams rather than snapshot noise: Inbox review for outflows, manual import for unparseable SMS, assignment event creation, and reconciliation adjustment flows.
- Native Android coverage should stay narrow. The receiver mainly needs a smoke-level integration check proving it queues raw SMS payloads and respects sender allowlist configuration; the business logic remains tested in TypeScript.
- There is currently no meaningful prior art for tests inside the repository beyond the starter scaffold, so this work should establish the project’s testing style instead of imitating existing finance tests.
- Test data should prefer redacted but structurally realistic bank messages and month-transition scenarios, because these reveal domain bugs faster than isolated unit examples.

## Out of Scope

- iOS support.
- Backend services, cloud sync, authentication, or multi-device conflict resolution.
- Generic multi-bank parsing or user-configurable parser builders.
- Historical SMS backfill during v1 onboarding.
- Payee modeling.
- Split transactions.
- Category targets, goals, or funding suggestions.
- Future-month budgeting.
- Month lock or month-close workflows.
- App lock, biometrics, or row-level encryption.
- Hard deletion of imported financial records in normal UI.
- Advanced analytics, trend dashboards, forecasting, or net-worth reporting.
- Automatic refund matching back to original outflows.
- Native-side finance logic beyond raw message capture and queueing.

## Further Notes

- The core framing should stay narrow: this is not a full YNAB clone and not a generic SMS finance parser. It is a local-first envelope budgeting app with SMS-driven transaction ingestion and authoritative running-balance awareness.
- The most important architectural discipline is to store facts and derive financial state. Violating that by storing mutable totals in many places will create silent drift and make backdated edits or parser corrections unreliable.
- The most important delivery discipline is to validate the full product loop with fake/manual SMS imports before integrating native Android interception. That sequencing reduces risk more than any individual implementation detail.
