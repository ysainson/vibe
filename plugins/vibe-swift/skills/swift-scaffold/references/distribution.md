# Distribution — Developer ID, notarization, Sparkle

The release path for a Developer-ID-distributed macOS app. Ship this first; defer the Mac App Store behind a thin updater abstraction, since MAS forbids Sparkle. Resolve current tool versions at build time — don't embed them.

## Pipeline (GitHub Actions, on release published)

1. Import the Developer ID Application certificate from a CI secret (`.p12` + password).
2. `xcodebuild archive`, then `xcodebuild -exportArchive` with a `developer-id` export — Hardened Runtime on, signed `--options runtime`, minimal entitlements.
3. Build the DMG (`hdiutil` or `create-dmg`).
4. `xcrun notarytool submit <dmg> --wait` using a notary API key (`.p8` + key id + issuer id from secrets); fail the build on rejection.
5. `xcrun stapler staple <dmg>` (and the app).
6. `gh release upload <tag> <dmg>`.
7. Sparkle: `sign_update <dmg>` with the EdDSA private key (secret), then update the appcast `enclosure` (length, `edSignature`, `sparkle:minimumSystemVersion` = the real deployment floor) and commit it.

## Secrets (referenced by name, never committed)

`DEVELOPER_ID_CERT_P12`, `DEVELOPER_ID_CERT_PASSWORD`, `APPLE_TEAM_ID`, `NOTARY_API_KEY_P8`, `NOTARY_KEY_ID`, `NOTARY_ISSUER_ID`, `SPARKLE_PRIVATE_KEY`.

## Sparkle wiring

- Add Sparkle via SPM (resolve the current stable; its SPM floor sits well below macOS 15, so a macOS 15 deployment target is safe).
- Info.plist: `SUFeedURL` (the appcast URL) and `SUPublicEDKey` (matches the signing key).
- If sandboxed, the updater needs `com.apple.security.network.client` plus the Sparkle XPC mach-lookup temporary-exception entitlements.

## Local fallback

A `tools/release.sh` can archive + sign + notarize + DMG locally for a maintainer without CI; parameterize the scheme and app name, and resolve `notarytool` / Sparkle versions at build time rather than embedding them.
