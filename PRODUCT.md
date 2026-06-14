# Product

## Register

brand

## Users

**Primary — Students / workshop participants (public portal, no login).** University and prospective robotics students taking part in the EIRI Battlebots 2026 workshops at Universidad del Desarrollo (Facultad de Ingeniería, Informática UDD). They arrive on phones and laptops between or during sessions to find session material, resources, the gallery, rankings, and team/bracket info. They want answers fast and want to feel part of a real competition.

**Secondary — Tutors / admins (admin panel, login).** Workshop tutors who manage all content — sessions, resources, gallery, ranking, teams, brackets — from `/admin`. The principal admin (`is_super`) additionally manages tutor accounts. Their job is fast, low-friction content management, not aesthetics; the panel SERVES the workflow even though the public portal is the primary brand surface.

## Product Purpose

A resource portal and competition hub for the EIRI robotics workshops (Battlebots 2026). Students consume material without logging in; tutors run everything from an admin panel. Success looks like: students reliably find what they need (sessions, code, resources, brackets, ranking), feel the energy of a real tournament, and the workshop reads as a credible university engineering program — all maintained by tutors with minimal effort. It is a single-instance Express + SQLite + Nunjucks app; the public portal is what most people see and what carries the brand.

## Brand Personality

Technically credible **and** competitively charged at the same time — the engineering rigor of a university program with the adrenaline of an arena tournament. Voice: confident, direct, a little electric; Spanish (Chile), concise. Three words: **competitive, technical, electric.** Emotional goals: students should feel the stakes and hype of Battlebots while trusting this is a serious, well-run engineering program — never gimmicky. The credibility keeps the energy from tipping into noise; the energy keeps the credibility from going dull.

## Anti-references

- **Generic corporate / SaaS.** No bland blue-gradient startup template, no stock photography, no cookie-cutter icon-heading-text card grids, no "trusted by" marketing scaffolding. The existing dark cyber-tech identity (deep navy, tournament gold, cyan accents) is the deliberate counter to this; preserve it.
- By extension: avoid anything that reads as interchangeable with a thousand other landing pages. The Battlebots/robotics identity should be unmistakable.

## Design Principles

1. **Energy with rigor.** Every hype element (glitch, LED glow, motion) must coexist with clarity and engineering credibility. If an effect makes the page feel less trustworthy or harder to read, it loses.
2. **Fast answers first.** Students arrive with a goal (find a session, a resource, the bracket). Information architecture and load speed beat decoration; the show never blocks the substance.
3. **Tournament, not template.** Lean into the Battlebots competition identity to stay unmistakable and far from generic SaaS. Specificity is the differentiator.
4. **Two surfaces, one identity.** The public portal is the brand showcase; the admin panel inherits the identity but optimizes for tutor speed and clarity over spectacle.
5. **Readable under pressure.** Dark theme with high-contrast text; data (rankings, brackets, code) must stay legible on phones in a noisy workshop room.

## Accessibility & Inclusion

Best-effort. No formal WCAG conformance target, but apply sensible defaults: keep body text at a comfortable contrast against the dark backgrounds (watch the muted `--text-dim` on dark surfaces), maintain legible type sizes on mobile, and keep interactive targets tappable. Given the glitch/LED/scroll effects, a `prefers-reduced-motion` fallback is encouraged where practical even though it isn't a hard requirement.
