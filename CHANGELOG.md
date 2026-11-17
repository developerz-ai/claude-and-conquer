# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-14

First tagged release.

### Added

- Command-and-control tooling (`bin/cnc`) for inventorying, monitoring, and operating a fleet of worker VPS teams: `teams`, `status`, `accounts`, `usage`, `ssh`, `exec`.
- Box provisioning: `bootstrap`, `gh-setup`, `optimize`, `provision`, and `sync-repos` to mirror every repo and its secrets onto each box.
- Bitwarden-backed secret delivery from the main controller (`secrets`, `bw`), including the `--set-password` alias.
- Project registry and configuration for repositories, deployment methods, and mission records.
- Goal dispatch (`goal`) that selects ready teams, records missions in the flight log, and tracks their progress (`goals`, `logs`, `stop`).
- Deployment checks (`deploy-check`) that confirm configured projects have shipped after their work is merged.
- CI on GitHub-hosted runners: typecheck, unit tests, credential checks, offline command smoke tests, and YAML inventory parsing on the minimum supported Bun and the latest Bun.
- Tag-triggered release workflow that publishes a GitHub release with notes taken from this file.

[Unreleased]: https://github.com/developerz-ai/claude-and-conquer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/developerz-ai/claude-and-conquer/releases/tag/v0.1.0
