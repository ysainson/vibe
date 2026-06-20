---
name: swift-scaffold
description: The canonical shape of a VIBE Swift / macOS project - single-target SwiftUI, an @Observable single-source-of-truth with system effects behind injected protocols, Swift Testing, and a Developer ID + Sparkle release pipeline. Background knowledge for /vibe:setup when scaffolding a Swift project and for /vibe:conduct when building one.
user-invocable: false
---

# Swift scaffold — the canonical macOS project shape

This is the shape `/vibe:setup` scaffolds for a Swift / macOS project and `/vibe:conduct` builds within. The structure is proven; the versions are not pinned — resolve the current stable at scaffold time.

## Toolchain — resolve current stable at scaffold time

Look up and target the latest stable; the numbers below are a mid-2026 snapshot **to verify, never to copy**: Xcode 26.x (Swift 6.3.x), the macOS 26 SDK, deployment floor macOS 15, Swift 6 language mode with Approachable Concurrency (Default Actor Isolation = MainActor), Swift Testing for tests (XCTest only for UI/perf), Sparkle 2.9.x for updates. Record the versions you actually resolved in the project's `CLAUDE.md`.

## Project shape

- **Single-target SwiftUI app.** One app target. A menu-bar app uses `MenuBarExtra` — budget the AppKit `Settings` / `openSettings` fallback, which has been unreliable on recent macOS.
- **One `@MainActor @Observable` single source of truth** for app state: `private(set)` properties, transitions as methods. SwiftUI observes it; nothing else owns mutable state.
- **System effects behind injected protocols.** Every system API (IOKit, UserNotifications, FileManager, URLSession, clock) sits behind a small protocol, injected through the initializer with the real implementation as the default. This is what makes the logic unit-testable — see [testability.md](references/testability.md).
- **Swift Testing.** New logic ships with `@Test` coverage that drives the state machine through fakes; time is a deterministic injected seam, never a wall-clock wait.
- **`docs/specs/` and `docs/plans/`** seeded — the durable trail `/vibe:conduct` writes into.
- **Release pipeline.** Developer ID signing + notarization + DMG + Sparkle via GitHub Actions — see [distribution.md](references/distribution.md).
- **Dependencies.** Consult the `swiftui-expert-skill` and `swift-testing-expert` skills (re-exported by the `swiftui-expert` / `swift-testing-expert` plugins) for SwiftUI and Swift Testing specifics instead of guessing.

## Guardians

The overlay ships review agents the review / conduct flow dispatches: `vibe-swift:swift-concurrency` (isolation correctness), `vibe-swift:swift-testability` (the injection pattern above), `vibe-swift:swift-signing` (the release pre-flight).

## Self-check

A scaffolded project builds clean and its test target runs green at the baseline; `CLAUDE.md` records the resolved toolchain versions and the build / test / release commands; and the state type is already behind injected protocols, so the first feature does not have to retrofit testability.
