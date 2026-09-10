---
name: semantic-commits
description: Creates git commits with semantic types and gitmoji. Use when the user asks to commit, git commit, write a commit message, stage and commit, or amend a commit in this repo.
---

# Semantic commits

Commit format (from [semantic-commit-messages-with-emojis](https://gist.github.com/alpteo/e93d754e5e09907c6362c4230fb66f87)):

```
<emoji> <type>(<scope>): <summary>. <issue_reference>
```

Example:

```
:sparkles: feat(Component): Add a new feature. Closes: #
^--------^ ^--^ ^-------^   ^---------------^  ^------^
|          |    |           |                  |
|          |    |           |                  +--> (Optional) Issue reference
|          |    |           |
|          |    |           +---------------------> Commit summary
|          |    |
|          |    +---------------------------------> (Optional) Scope
|          |
|          +--------------------------------------> Type
|
+-------------------------------------------------> Type emoji (required here)
```

Write the subject with Unicode emoji, not the `:shortcode:`. Git log should show `✨ feat(...)`, not `:sparkles: feat(...)`.

## Workflow

Copy this checklist and complete every item:

```
- [ ] User asked to commit (or amend under the amend rules)
- [ ] Parallel gather: git status, git diff (staged + unstaged), git log -5
- [ ] Draft semantic subject (+ body if needed)
- [ ] Stage only the files that belong in this commit
- [ ] Commit via HEREDOC
- [ ] git status confirms success
```

**Gather.** Run these in parallel:

```bash
git status
git diff
git diff --staged
git log -5 --oneline
```

**Draft.** One subject line. Imperative, sentence case after the type, period at the end of the summary. Focus on why. Match recent `git log` tone.

**Stage + commit.** Sequential:

```bash
git add <files>
git commit -m "$(cat <<'EOF'
✨ feat(inbox): Add SMS recovery on Inbox.

EOF
)"
git status
```

Include a body only when the subject needs a why. Blank line between subject and body. No co-author trailers unless the user asked.

## Types and emojis

| Type | Emoji | When |
| --- | --- | --- |
| `feat` | ✨ `:sparkles:` | new feature |
| `fix` | 🐛 `:bug:` | bug fix |
| `docs` | 📝 `:memo:` | documentation |
| `refactor` | ♻️ `:recycle:` | production-code refactor |
| `build` / `conf` | 👷 `:construction_worker:` | build, scripts, config, dependencies |
| `test` | ✅ `:white_check_mark:` | tests only |
| `ci` | 💚 `:green_heart:` | CI/CD |
| `style` | 🎨 `:art:` | formatting, no behavior change |
| `chore` | 🔧 `:wrench:` | chores, no production-code change |
| `perf` | ⚡️ `:zap:` | backward-compatible performance |

Pick **one** type from the table. Type emoji is required.

Extra gitmojis as suffixes when they add meaning (`:arrow_up:` on a bump, `:fire:` on a deletion). Lookup: [gitmoji.md](gitmoji.md).

## Scope

Optional. One lowercase token for the area touched. Derive from the diff, not a fixed enum. Common here: `inbox`, `sms`, `budget`, `storage`, `android`, `onboarding`, `transactions`, `money`.

Omit scope when the change spans the repo or the area is obvious from the type (`docs`, `ci`).

## Issue reference

Optional. Only when the commit actually closes/fixes that issue. Keywords: `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`.

Phrase: `Fixes: #1` or `Fixes #1`. Same for `Closes`.

## Examples

**Feature with scope + issue:**

```
✨ feat(inbox): Recover unparseable SMS as canonical transactions. Closes: #12
```

**Fix:**

```
🐛 fix(sms): Keep raw SMS immutable when parse fails.
```

**Refactor:**

```
♻️ refactor(budget): Extract the transaction review workflow.
```

**Build + extra gitmoji:**

```
👷 build(android): Bump Gradle 8 to 9 ⬆️
```

**Docs:**

```
📝 docs: Record the budget domain in CONTEXT.md.
```

**Tests:**

```
✅ test(storage): Cover web persistence fallback.
```

## Safety

- Commit only when the user asked.
- No `git config`. No `--no-verify` / `--no-gpg-sign`. No `-i`.
- No force push to main/master. No hard reset. No push unless asked.
- Amend only when all of: user asked (or a hook rewrote a commit you just created), HEAD is yours, and the commit is unpushed. If a hook rejected the commit, make a new commit — do not amend.
- Do not commit secrets (`.env`, credentials). Warn if asked to.
- No empty commits.
