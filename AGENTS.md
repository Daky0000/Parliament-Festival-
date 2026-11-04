<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Planning & Architecture Workflow: Elephant-Goldfish Model (EGM)
Whenever the user requests planning, architecture design, or structural changes:
- Always use the **Elephant-Goldfish Model (EGM)** workflow from the installed `egm` plugin (`https://github.com/google/elephant-goldfish-model`).
- **Phase 1: The Elephant (Deep Context & Exploration)**
  - Explore requirements, constraints, and trade-offs.
  - Draft formal specification documents under `docs/designs/` (`/egm-brainstorm`, `/egm-draft`).
  - Write **zero production code** during the planning phase until the specification is finalized and approved.
- **Phase 2: The Goldfish (Adversarial Zero-Context Review)**
  - Deploy fresh, zero-context review subagents (`/egm-review`, `/egm-review-loop`) using EGM review agents (`egm-design`, `egm-comprehension`, `egm-structural`, `egm-implementation-readiness`).
  - Stress-test the design draft with no historical conversation bias to uncover unstated assumptions, gaps, and edge cases.
- **Phase 3: Resolution & Implementation Readiness**
  - Systematically work through review findings with the user (`/egm-resolve`) to agree on architectural adjustments.
  - Proceed with code implementation only after the spec is approved, and verify alignment with `/egm-drift-report`.

