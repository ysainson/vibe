---
name: clarify
description: How to ask the user clarifying questions - always via the AskUserQuestion tool with concrete options and a recommended default. Use when a request is underspecified in ways that change the outcome.
user-invocable: false
---

# Clarify — ask with AskUserQuestion, or don't ask at all

Ask only when the answer changes what you build: multiple plausible interpretations, scope or constraint unknowns that eliminate whole branches of work, or irreversible/risky choices (data migration, public release, deletion). Never ask what a quick read of the code, config, or docs can answer. For choices with a conventional default, state the assumption and proceed.

When you do ask:

- **Always use the AskUserQuestion tool** — never hand-formatted question lists in plain text. No "reply 1a 2b" formats.
- Batch related questions into one call (up to 4); prefer questions that eliminate whole branches of work.
- Options must be concrete and mutually exclusive, with the recommended option first and "(Recommended)" in its label. Put trade-offs in the option descriptions.
- **Make every question self-contained.** The user may not see any text outside the question UI — all context needed to answer belongs inside the question and option descriptions, never in the surrounding message.
- Use `multiSelect` when choices aren't mutually exclusive.

After answers arrive, restate the locked decisions briefly in your next user-facing message, then proceed — don't re-ask or re-litigate.

**Subagents:** you cannot prompt the user. If your dispatch is ambiguous in a way that changes the contract, stop and report the open question back to the orchestrator instead of guessing.
