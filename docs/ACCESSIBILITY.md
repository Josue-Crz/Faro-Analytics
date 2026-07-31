# Accessibility notes

Faro targets WCAG 2.2 AA and builds on Carbon interaction patterns. The current application uses
semantic landmarks and headings, a skip link, visible focus, keyboard-operable navigation and
queues, labeled controls, table captions, status text plus icons, responsive layouts, and
`prefers-reduced-motion` handling. Charts include adjacent textual summaries and heatmaps expose an
accessible description rather than relying on color alone.

Playwright runs an axe smoke check against the unauthenticated follow-up shell in desktop and mobile
projects. Automated checks do not replace manual review. Before a production release, verify at
minimum:

- keyboard order and focus return for navigation, modals, and draft actions;
- screen-reader table navigation and dynamic status announcements;
- 200% and 400% zoom without loss of task functionality;
- light/dark and Windows forced-colors contrast;
- chart summaries against the visible dataset;
- mobile reflow at 320 CSS pixels;
- error identification and recovery without color-only cues;
- reduced-motion behavior for the beacon and loading states.
