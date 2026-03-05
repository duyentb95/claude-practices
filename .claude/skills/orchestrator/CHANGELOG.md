# Changelog — hl-orchestrator

---

## [2.0.0] - 2026-03-05

### Added
- **Standard pipeline definitions** for all 4 workflow types: daily-report, scan-token,
  investigate, optimize-strategy — with explicit agent assignments, model choices, and output directories.
- **File ownership map**: strict per-agent directory assignments to prevent write conflicts.
- **Error handling matrix**: defined fallback for each possible agent failure mode.
- **Output synthesis phase**: mandatory cross-agent insight generation (cluster × score correlation).
- **Custom team construction template**: rules for building ad-hoc agent teams (max 4 agents,
  unique directories, sequential dependency declaration).

### Changed
- Agent model assignments clarified: `sonnet` for data-fetcher/report-writer, `opus` for analysis agents.
- Pipeline diagrams updated to reflect actual agent names and output paths.
- Routing table expanded with all standard commands and fast-path rules.

---

## [1.0.0] - 2026-03-05

### Added
- Initial orchestrator skill with task routing, multi-skill workflow coordination,
  file-system-based data flow between agents, and token budget awareness.
