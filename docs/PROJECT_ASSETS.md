# Project image assets

Faro keeps upload-ready project artwork separate from screenshots of the running application. Both
final assets use PNG, one of the requested upload formats, and are below the 5 MB limit.

## Upload-ready files

| Asset                | File                                                                           | Dimensions | Size    | Intended use                         |
| -------------------- | ------------------------------------------------------------------------------ | ---------- | ------- | ------------------------------------ |
| Project logo         | [`assets/faro-project-logo.png`](assets/faro-project-logo.png)                 | 100 × 100  | 3.3 KB  | Square project/avatar upload         |
| Dashboard background | [`assets/faro-dashboard-background.png`](assets/faro-dashboard-background.png) | 1672 × 941 | 1.59 MB | Wide project-cover/background upload |

### Project logo

![Faro square lighthouse project logo](assets/faro-project-logo.png)

The PNG is a rasterization of the canonical
[`assets/faro-mark.svg`](assets/faro-mark.svg), preserving the existing charcoal, cobalt, teal, and
off-white Faro identity. The SVG remains the source of truth for scalable product and documentation
use.

### Dashboard background

![Faro dashboard project-cover background](assets/faro-dashboard-background.png)

The background was created with the built-in image-generation workflow using
[`screenshots/dashboard.png`](screenshots/dashboard.png) as the product reference. The brief asked
for a wide, professional SaaS project cover that preserves Faro's recognizable dashboard structure,
Carbon-inspired hierarchy, lighthouse signal motif, and restrained charcoal/blue/teal palette.

This is promotional artwork: it uses a dark project-cover treatment and is not a literal screenshot
or proof of an additional implemented theme. Product documentation and submissions that require
evidence should use the Playwright-captured files under `docs/screenshots/`.

## Validate upload constraints

From the repository root:

```bash
identify -format '%f %wx%h %b\n' \
  docs/assets/faro-project-logo.png \
  docs/assets/faro-dashboard-background.png
```

Expected output:

```text
faro-project-logo.png 100x100 3341B
faro-dashboard-background.png 1672x941 1.58919MB
```

If either source asset changes, regenerate the derived PNG, rerun the validation, visually inspect
the result, and keep the file below 5 MB. Do not overwrite the real dashboard screenshot with
promotional artwork.
