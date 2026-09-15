# Architecture

The repository keeps two editable source roots:

- `source/` contains the Electron main, host, coordinator, local-exec, shared,
  and protocol reconstruction.
- `frontend/` contains the React renderer reconstruction.

The upstream 0.18.0 application is an external, checksum-pinned build input.
`npm run bootstrap` extracts its `dist` tree to ignored `src/app/dist`. Build
scripts stage that baseline, compile reviewed source runtimes, overlay eligible
clean outputs, apply the reconstructed updater guard, and pack a new ASAR.

Small manifests remain checked in only where the build consumes them directly.
Large recovery reports, source capsules, rejected candidate evidence, and
screenshots live only in the private forensic history and are not part of this
branch's product tree.

## Control platforms

The control plane has three execution platforms:

- **Mac client**: command entry point and future desktop UI.
- **Windows server**: `computer-worker.mjs`, receiving Windows tasks through
  `grokbot.computer.control`.
- **Android device**: `worker.mjs`, receiving phone tasks through
  `grokbot.phone.control` and executing them through ADB.

The currently connected Android device is a Xiaomi Mi 9 Transparent Edition,
serial `4677a559`, Android 11. Set `ADB_SERIAL=4677a559` when more than one
device may be attached.
