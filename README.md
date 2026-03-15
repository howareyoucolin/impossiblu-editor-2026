# Local Data Viewer

An Electron + React desktop app for browsing, editing, searching, and exporting files from a local `local-data/` folder.

## Features

- Browse top-level files in `local-data/`
- Open multiple files in tabs
- Lock and unlock files for editing
- Save, rename, create, and delete files
- Auto-commit file changes inside the `local-data` git repo
- Search across all files from the sidebar
- Search within the active file
- Copy open files into a prompt-ready export block
- View recent commit history

## Custom Tags

These tags are rendered specially in readonly mode:

- `[copy=value]`
  - Displays `value`
  - Click to copy it
- `[pass=value]`
  - Displays masked text like `********`
  - Click to copy the real value
- `[link=value]`
  - Displays `value` as a link
  - Click to open it in Google Chrome

In edit mode, the raw tag text stays visible.

## Setup

If `local-data/` does not exist, the app shows a setup screen that will:

- create `local-data/`
- apply full permissions to that folder
- initialize an empty git repository inside it

## Development

Install dependencies:

```bash
npm install
```

Run the React dev server and Electron together:

```bash
npm run dev
```

Important:

- changes to React files hot reload
- changes to `main.js` or `preload.js` require a full restart:

```bash
Ctrl+C
npm run dev
```

## Build

Build the React app:

```bash
npm run build
```

Package the Electron app:

```bash
npm run dist
```

## Data Repo Behavior

File actions inside `local-data/` create git commits automatically:

- create
- save
- remove
- rename

The app also provides a recent-commits modal and a button to open Terminal in `local-data/`.

## Packaged App Data Location

In development, the app uses the repo-local `local-data/` folder.

In the packaged macOS app, `local-data/` is stored under Electron `userData`, which should be:

```bash
~/Library/Application Support/ImpossibluEditor/local-data
```

You can open it in Finder with:

```bash
open ~/Library/Application\ Support/ImpossibluEditor/local-data
```
