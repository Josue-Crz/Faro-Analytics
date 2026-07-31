# Faro Analytics image assets

Faro keeps upload-ready project artwork separate from screenshots of the running application. Both
final assets use PNG, one of the requested upload formats, and are below the 5 MB limit.

## Upload-ready files

| Asset                | File                                                                           | Dimensions | Size    | Intended use                         |
| -------------------- | ------------------------------------------------------------------------------ | ---------- | ------- | ------------------------------------ |
| Project logo         | [`assets/faro-project-logo.png`](assets/faro-project-logo.png)                 | 100 × 100  | 3.0 KB  | Square project/avatar upload         |
| Dashboard background | [`assets/faro-dashboard-background.png`](assets/faro-dashboard-background.png) | 1672 × 941 | 1.37 MB | Wide project-cover/background upload |

### Project logo

![Faro square lighthouse project logo](assets/faro-project-logo.png)

The PNG is a fresh rasterization of the canonical
[`assets/faro-mark.svg`](assets/faro-mark.svg). Its geometry matches the product's lighthouse mark
and signal beam, using the current charcoal, cobalt, teal, and off-white design tokens. The SVG
remains the scalable source of truth; the application favicon uses the same paths and palette.

### Dashboard background

![Faro dashboard project-cover background](assets/faro-dashboard-background.png)

The background was regenerated with the built-in image-generation workflow using
[`screenshots/dashboard.png`](screenshots/dashboard.png) only as a current palette and visual-system
reference. It deliberately contains no generated dashboard, labels, metrics, or product claims:
the abstract charcoal data grid, teal lighthouse beam, and restrained cobalt nodes are brand
artwork, not an interface mockup.

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
faro-project-logo.png 100x100 3013B
faro-dashboard-background.png 1672x941 1.36768MB
```

If either source asset changes, regenerate the derived PNG, rerun the validation, visually inspect
the result, run `pnpm docs:check`, and keep the file below 5 MB. Do not overwrite the real dashboard
screenshot with promotional artwork.
