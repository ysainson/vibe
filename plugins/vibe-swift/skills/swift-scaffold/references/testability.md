# Testability — single source of truth + injected effects

The pattern that makes Swift logic unit-testable without real system APIs: one `@MainActor @Observable` state type owns the logic; each system effect sits behind a small protocol, injected with the real implementation as the default.

## 1. Put each system effect behind a small protocol

```swift
import Foundation

/// Abstraction over a system effect so the logic can be tested without it.
protocol PowerAssertionControlling: AnyObject {
    var isHeld: Bool { get }
    func acquire(reason: String) -> Bool  // idempotent; true on success
    func release()                        // idempotent
}

/// Real implementation — the default the app uses.
final class IOKitPowerAssertion: PowerAssertionControlling {
    private(set) var isHeld = false
    func acquire(reason: String) -> Bool { /* IOPMAssertionCreateWithName ... */ isHeld = true; return isHeld }
    func release() { /* IOPMAssertionRelease ... */ isHeld = false }
}
```

## 2. One @MainActor @Observable source of truth, effects injected with real defaults

```swift
import Observation

@MainActor
@Observable
final class SleepManager {
    private(set) var isActive = false
    private(set) var remainingSeconds: Int?

    private let assertion: PowerAssertionControlling
    private let autoStartTimer: Bool

    // Real default for the app; tests inject a fake. `autoStartTimer: false` is the
    // deterministic seam: in production enable() starts a Timer that calls advance(by: 1);
    // tests pass false and call advance(by:) directly, so no wall-clock waiting.
    init(
        assertion: PowerAssertionControlling = IOKitPowerAssertion(),
        autoStartTimer: Bool = true
    ) {
        self.assertion = assertion
        self.autoStartTimer = autoStartTimer
    }

    func enable(duration: TimeInterval?) {
        guard assertion.acquire(reason: "keeping the Mac awake") else {
            isActive = false   // acquire failed: don't pretend it worked
            return
        }
        isActive = true
        if let duration { remainingSeconds = Int(duration) }
        // production: if autoStartTimer, start a repeating Timer; its closure is
        // nonisolated under MainActor default isolation, so hop back with
        // MainActor.assumeIsolated { advance(by: 1) }.
    }

    func advance(by seconds: Int) {
        guard let remaining = remainingSeconds else { return }
        let next = remaining - seconds
        if next <= 0 {
            assertion.release()
            isActive = false
            remainingSeconds = nil
        } else {
            remainingSeconds = next
        }
    }
}
```

## 3. Test with a recording fake — Swift Testing, deterministic, no wall-clock

```swift
import Testing
@testable import YourApp

private final class FakeAssertion: PowerAssertionControlling {
    var isHeld = false
    private(set) var acquireCount = 0
    var acquireSucceeds = true
    func acquire(reason: String) -> Bool { acquireCount += 1; if acquireSucceeds { isHeld = true }; return isHeld }
    func release() { isHeld = false }
}

@MainActor
struct SleepManagerTests {
    private func makeSUT() -> (SleepManager, FakeAssertion) {
        let fake = FakeAssertion()
        return (SleepManager(assertion: fake, autoStartTimer: false), fake)
    }

    @Test func enable_acquiresAndActivates() {
        let (sut, fake) = makeSUT()
        sut.enable(duration: nil)
        #expect(sut.isActive)
        #expect(fake.acquireCount == 1)
    }

    @Test func countdownToZero_releasesAndDeactivates() {
        let (sut, fake) = makeSUT()
        sut.enable(duration: 3)
        sut.advance(by: 3)
        #expect(!sut.isActive)
        #expect(!fake.isHeld)
    }

    @Test func failedAcquire_staysInactive() {
        let (sut, fake) = makeSUT()
        fake.acquireSucceeds = false
        sut.enable(duration: nil)
        #expect(!sut.isActive)
    }
}
```

Why it works: the logic never touches IOKit directly, time is driven by `advance(by:)` instead of a real `Timer`, and the fake records calls — so every transition is asserted in microseconds.
