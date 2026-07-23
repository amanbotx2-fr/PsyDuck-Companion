# SECURITY_TASKS.md

# PsyDuck Security Hardening Roadmap

**Project:** PsyDuck Desktop Companion

**Version:** Pre-v1.0

**Status:** Planned

**Created:** July 23, 2026

---

# Overview

This document tracks all security work required before PsyDuck v1.0 is released publicly.

A full security audit identified:

- Critical: 0
- High: 4
- Medium: 6
- Low: 5

Although no Remote Code Execution or direct Electron compromise exists, several release blockers remain.

These tasks focus on:

- Reducing attack surface
- Protecting user secrets
- Hardening Electron
- Enforcing privilege boundaries
- Improving production security

---

# Priority Levels

P0
Release blockers.
Must be completed before v1.0.

P1
High-priority hardening.
Should be completed before public release.

P2
Defense in depth.
Recommended before or shortly after v1.0.

---

# P0 — Release Blockers

---

## SEC-001
### Production URL Isolation

Priority:
P0

Status:
Pending

Problem

Packaged applications currently honor VITE_DEV_SERVER_URL.

If an attacker controls the launch environment, a production build may load attacker-controlled web content while retaining access to the preload bridge.

Goal

Production builds must never load arbitrary development URLs.

Requirements

- Ignore VITE_DEV_SERVER_URL whenever app.isPackaged.
- Production must always load the bundled renderer.
- Development mode should only allow loopback origins.
- Validate protocol.
- Validate hostname.
- Validate port.
- Reject redirects.
- Reject credentials in URLs.
- Reject fragments.
- Reject unexpected paths.
- Enforce via will-redirect and navigation handlers.

Validation

- Production build ignores all environment variables.
- Development build still works.
- Navigation tests pass.

---

## SEC-002
### Secret Isolation

Priority

P0

Status

Pending

Problem

The companion renderer currently receives API keys and privileged settings.

The companion only needs runtime configuration.

Goal

Secrets never leave the main process.

Requirements

Split settings into:

Runtime Settings

- eye tracking
- hydration
- animation
- behavior

Private Settings

- API keys
- provider credentials
- endpoints

Create separate IPC capability sets.

Companion

Read-only runtime settings.

Preferences

Credential management only.

Main Process

Secret ownership.

API keys must never be broadcast through IPC.

API keys must never be stored inside React state.

Validation

- Companion cannot read API keys.
- IPC inspection confirms secrets never leave main.
- Existing functionality preserved.

---

## SEC-003
### Secure Credential Storage

Priority

P0

Status

Pending

Problem

API keys are stored in plaintext JSON.

Goal

Credentials must be encrypted using the operating system.

Requirements

Use Electron safeStorage.

Encrypt:

- OpenAI API key
- Gemini API key
- Grok API key

Store only encrypted blobs.

Settings should expose only:

apiKeyConfigured: true/false

Decrypt only when initializing providers.

Do not cache decrypted values longer than necessary.

Migration

Existing plaintext users should migrate automatically.

Validation

- Fresh install works.
- Existing install migrates.
- Plaintext removed.
- AI providers continue working.

---

## SEC-004
### Release Signing

Priority

P0

Status

Pending

Problem

Current release artifact has an invalid signature.

Goal

Every production release must be verifiable.

Requirements

- forceCodeSigning enabled
- Developer ID signing
- Hardened Runtime
- Notarization
- Stapling
- CI verification

Validation

codesign --verify

spctl --assess

Notarization succeeds.

---

# P1 — High Priority Hardening

---

## SEC-005
### IPC Capability Separation

Goal

Every renderer receives only the APIs it actually needs.

Tasks

Separate preload bridges.

Companion

- AI chat
- runtime settings
- movement
- speech

Preferences

- settings
- credentials
- model loading
- provider testing

Validate:

- sender frame
- origin
- BrowserWindow

Reject everything else.

---

## SEC-006
### Permission Policy

Goal

Deny every Electron permission by default.

Install

- setPermissionRequestHandler
- setPermissionCheckHandler
- Device permission handler

Only allow permissions explicitly required.

Everything else returns false.

---

## SEC-007
### Ollama Network Hardening

Goal

Prevent misuse of the main process as a network proxy.

Requirements

Default:

Loopback only.

Optional:

Remote HTTPS servers.

Reject:

- metadata addresses
- multicast
- unspecified
- link-local
- unsafe redirects

Add

- timeout
- cancellation
- response size limits
- model count limits

---

## SEC-008
### AI Abuse Protection

Goal

Prevent renderer abuse.

Implement

- Rate limiting
- Request queue
- Single active request
- Cancellation
- Output limits
- Token limits

Validation

Spam requests cannot overwhelm providers.

---

## SEC-009
### Electron Fuse Hardening

Enable

- Embedded ASAR validation
- OnlyLoadAppFromAsar

Disable

- RunAsNode
- NODE_OPTIONS
- CLI Inspect

Verify production package.

---

# P2 — Defense in Depth

---

## SEC-010
### Production Renderer Hardening

Tasks

Disable

- DevTools
- Source maps

Separate

Development CSP

Production CSP

Eventually replace file:// with a secure custom protocol.

---

## SEC-011
### Secure Settings Storage

Improve

- Random temporary filenames
- Exclusive creation
- Symlink protection
- fsync
- Permission verification

Add

Schema versioning.

---

## SEC-012
### Cursor Privacy

Stop cursor sampling when eye tracking is disabled.

Do not broadcast unused cursor events.

---

## SEC-013
### Dependency Maintenance

Review

- Deprecated packages
- Electron releases
- SDK updates

Run

npm audit

before every release.

---

## SEC-014
### macOS Runtime Hardening

Review

ATS policy

TLS policy

Library validation

Entitlements

Remove unnecessary exceptions.

---

# Release Checklist

Before v1.0

Mandatory

- SEC-001
- SEC-002
- SEC-003
- SEC-004
- SEC-005
- SEC-006
- SEC-007
- SEC-008
- SEC-009

Recommended

- SEC-010
- SEC-011
- SEC-012
- SEC-013
- SEC-014

---

# Success Criteria

PsyDuck v1.0 should satisfy:

✓ No Critical vulnerabilities

✓ No High vulnerabilities

✓ Electron security checklist compliant

✓ Secrets encrypted

✓ Least-privilege IPC

✓ Production-only renderer loading

✓ Signed and notarized release

✓ Secure update path

✓ Production build reproducible

✓ Ready for public distribution