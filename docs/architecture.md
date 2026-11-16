# Architecture and decisions

## Overview

```
              ┌───────────────┐   HTTP (JSON / multipart)   ┌───────────────┐
  Browser ──► │   apps/web    │ ──────────────────────────► │   apps/api    │
              │ React + Vite  │      /api/* (Vite proxy)    │   Fastify     │
              └───────┬───────┘                             └───────┬───────┘
                      │                                             │ imports
                      │ imports labels + API types                  ▼
                      │                                     ┌───────────────┐   reads    data/
                      └───────────────► packages/shared ◄── │  packages/ml  │ ─────────► models/
                                        (labels, contract)  │ TF.js + Sharp │   writes
                                                            └───────────────┘
```

| Workspace         | Responsibility                                                                        |
| ----------------- | ------------------------------------------------------------------------------------- |
| `packages/shared` | Class labels (and their order) and the HTTP contract types. No runtime dependencies.  |
| `packages/ml`     | Everything about the neural network: preprocessing, dataset loading, model, training. |
| `apps/api`        | HTTP layer only: validates uploads, calls `ml` to preprocess + predict, returns JSON. |
| `apps/web`        | UI only: image selection, preview, displaying probabilities.                          |

### Why the API depends on `ml` instead of re-implementing inference

An image must be preprocessed **exactly** the same way at training time and at prediction time (same size,
same resize method, same pixel scaling). If the API had its own copy of that code, any drift between the two
copies would silently degrade predictions. This problem is called **training/serving skew**, and the simple
fix is to have one preprocessing function used by both.

### Why the label order is saved next to the model

The model's output is just an array like `[0.81, 0.12, 0.07, …]`. Its meaning comes entirely from the order of the
classes. Classes are discovered from the `data/raw` folders by `ml:split-dataset` (`data/dataset/<task>/classes.json`),
and training writes that order to `models/<model>/labels.json` before saving any weights. The API reads it from there
and checks it matches the number of model outputs, so adding a character never needs a code change and a model is
never paired with the wrong labels.

## Technical decisions

| Decision                                         | Reason                                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| npm workspaces monorepo                          | One install, one lint/format/test setup, shared code without publishing packages. No extra tools (Nx/Turbo) needed at this size.                                                                                               |
| Run in **WSL** (Linux), Node 22.18+              | `@tensorflow/tfjs-node` publishes prebuilt native binaries for Linux, but the Windows prebuilt for 4.22.0 returns 404 and would need a full C++ toolchain to compile.                                                          |
| Project on the WSL filesystem (`~/…`)            | Through `/mnt/c`, file access is ~100× slower (measured: Fastify start ≈22 s on `/mnt/c` vs ≈0.1 s on `~`). Training reads thousands of images, so this matters.                                                               |
| `@tensorflow/tfjs-node` (not `@tensorflow/tfjs`) | Runs operations in the native TensorFlow C library instead of JavaScript: training a CNN on CPU is far faster.                                                                                                                 |
| Sharp for image decoding/resizing                | Fast (libvips), handles JPEG/PNG/WebP, and gives raw pixel buffers we can turn into tensors ourselves, which keeps every step visible for learning purposes.                                                                   |
| No build step for Node code                      | Node 22.18+ strips TypeScript types natively, so `node src/server.ts` just works. `tsc` is used only as a type checker (`noEmit`). This requires `erasableSyntaxOnly` (no `enum`/`namespace`) and `.ts` extensions in imports. |
| Fastify                                          | First-class TypeScript types, built-in JSON logging, `inject()` for testing routes without opening a port, and an official multipart plugin for uploads.                                                                       |
| `buildApp()` separate from `server.ts`           | Tests build the app without listening on a port. `server.ts` only reads config, listens and handles shutdown.                                                                                                                  |
| Vite dev proxy for `/api`                        | The browser talks to one origin in development, so no CORS configuration is needed.                                                                                                                                            |
| TypeScript 6.0 (not 7)                           | `typescript-eslint` (type-aware linting) supports TypeScript `<6.1` at the time of writing.                                                                                                                                    |
| ESLint with type-aware rules + Prettier          | Type-aware rules catch real bugs (e.g. unhandled promises). Prettier owns formatting, and `eslint-config-prettier` turns off the ESLint rules that would conflict with it.                                                     |
| Vitest                                           | Fast, ESM/TypeScript-native, same config style as Vite.                                                                                                                                                                        |

## Known issues

- `npm audit` reports vulnerabilities in `tar`, `adm-zip` and `@mapbox/node-pre-gyp`. All three are pulled in by
  `@tensorflow/tfjs-node`'s **install script**, which uses them to download and unpack its own TensorFlow binary from
  Google's storage. They are not used at runtime, and `npm audit fix --force` would replace tfjs-node with an
  incompatible version. Accepted for this educational project. Check again when tfjs-node releases an update.
- tfjs-node prints a `util.isNullOrUndefined` deprecation warning on Node 22. It comes from the library and is harmless.
