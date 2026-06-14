# Paceboard

Pace's canvas engine — a stripped-down fork of [Excalidraw](https://github.com/excalidraw/excalidraw) used as the whiteboard backend in the Pace app.

## What's different from upstream

- English only (58 non-English locales removed)
- No Firebase / collaboration backend
- Renamed to Paceboard throughout the UI
- Cleaned up CI, test files, and marketing assets
- Built as vendored tarballs consumed by `org-web/web/vendor/`

## Build vendor packages

```bash
yarn install
yarn build:packages
# outputs to packages/*/dist — pack into .tgz for org-web vendor
```

## Run standalone dev server

```bash
yarn start
```
