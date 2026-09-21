# Security Policy

## Supported versions

Only the current `main` branch is supported. Fixes are released forward; older
commits, published Play builds and previous web deployments do not receive
backports.

## Reporting a vulnerability

Report privately. Do **not** open a public issue, pull request or discussion for
a security problem.

1. Preferred: open a private advisory through
   [GitHub Security Advisories](https://github.com/torisKR/senior-club/security/advisories/new).
2. Alternative: email `privacy@clubsenior.kr` with the subject
   `SECURITY: senior-club`.

Please include:

- affected component (web, API, Android app, CI workflow) and version or commit,
- reproduction steps or a proof of concept,
- observed impact and any suggested remediation.

We aim to acknowledge a report within 3 business days and to give a remediation
plan or status update within 14 days. Please give us a reasonable window to ship
a fix before public disclosure, and we will credit you in the advisory unless you
prefer otherwise.

## Scope

In scope:

- this repository's source, infrastructure-as-code and GitHub Actions workflows,
- the production web service and public API endpoints it serves,
- the published Android application `com.toris.seniorclub`.

Out of scope:

- volumetric denial-of-service and load testing against production,
- social engineering of maintainers or users,
- reports produced solely by automated scanners with no demonstrated impact,
- vulnerabilities in third-party platforms (Google Play, AdMob, Vercel, AWS)
  that must be reported to those vendors.

Do not access, modify or exfiltrate other users' data. Use your own test
accounts.

## Handling of secrets

This repository contains no production credentials. All secrets are supplied at
runtime through GitHub Actions secrets, EAS secrets or the hosting platform's
environment configuration. Values that appear in tests, `*.env.example` files or
CI workflow definitions are deliberate non-production placeholders.

If you believe a real credential has been committed, treat it as a vulnerability
and report it privately using the process above rather than filing a public
issue.
