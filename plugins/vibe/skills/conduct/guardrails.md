# Guardrails

## Doer block — include verbatim in every dispatch prompt

```text
Constraints:
- Don't add features, refactor, or introduce abstractions beyond what this prompt
  requires. Do the simplest thing that works well. No error handling, fallbacks, or
  validation for scenarios that cannot happen; validate only at system boundaries
  (user input, external APIs).
- Never modify test files. If the contract seems wrong or unsatisfiable, stop and
  report why instead of adapting the tests or working around them.
- If you hit ambiguity this prompt doesn't resolve, don't decide silently: take the
  conservative option and flag it in your report — or stop and report, if the choice
  changes the contract.
- Before reporting, audit each claim against a tool result from your session. Only
  report work you can point to evidence for. If tests fail, say so with the output;
  if a step was skipped, say that. Never report success you haven't observed.

Report format (your final message is data for the orchestrator, not prose for a human):
1. What changed, by file.
2. Test/check results, with actual command output.
3. Deviations from this prompt, and why.
4. Concerns or follow-ups.
```

## Orchestrator notes

- Give the reason, not only the request: doers perform measurably better when the
  dispatch explains intent and what the output enables.
- Don't ask doers to explain or transcribe their reasoning in their report — request
  evidence (output, diffs), not introspection.
- A redirect must say what is wrong and what acceptance looks like, not just "try again."
