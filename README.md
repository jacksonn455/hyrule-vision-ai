# Hyrule Vision AI

An educational full-stack application that classifies an image as **Link**, **Zelda** or **Other** using a
**convolutional neural network trained from scratch** with TensorFlow.js. No pretrained models: the point is to
understand how each part of an image classifier works by building it.

> **Status:** all roadmap steps are implemented: dataset (~660 images), preprocessing, split, CNN, training with
> data augmentation, evaluation, inference API and UI. Accuracy is still modest (see [Results](#results)).

<img width="1042" height="658" alt="image" src="https://github.com/user-attachments/assets/e0b63612-3ec6-40a3-b3da-47f6db8a256f" />


## Stack

| Layer            | Technology                                      |
| ---------------- | ----------------------------------------------- |
| Frontend         | React 19 + TypeScript + Vite                    |
| Backend          | Node.js 22 + TypeScript + Fastify               |
| Machine learning | TensorFlow.js (`@tensorflow/tfjs-node`) + Sharp |
| Tooling          | npm workspaces, ESLint, Prettier, Vitest        |

## Project structure

```
.
├── apps/
│   ├── web/              # React UI: upload an image, show class probabilities
│   └── api/              # Fastify HTTP API: receives images, will run inference
├── packages/
│   ├── shared/           # Class labels (order = model output order) + API types
│   └── ml/               # Preprocessing, dataset, CNN model, training scripts
├── data/                 # Dataset folders (images are git-ignored) → see data/README.md
├── models/               # Trained model artifacts (git-ignored)
├── docs/
│   ├── architecture.md   # Responsibilities and technical decisions
│   └── concepts/         # AI concepts, one note per step
└── examples/
    └── customer-tiers/   # Earlier TF.js study (dense network on tabular data), kept for reference
```

## Requirements

- **WSL 2** (Ubuntu) with **Node.js 22.18+** (`nvm use` reads `.nvmrc`).
  `@tensorflow/tfjs-node` has no working prebuilt binary for native Windows; see [docs/architecture.md](docs/architecture.md).
- Keep the project **on the WSL filesystem** (e.g. `~/projetos/hyrule-vision-ai`), not under `/mnt/c/...`.
  File access through `/mnt/c` is about 100× slower, which makes the API start in seconds instead of milliseconds
  and would make loading the dataset painfully slow. Open it from WSL with `code .` (VS Code WSL extension).
- Install dependencies **from inside WSL**: native packages (`tfjs-node`, `sharp`) download Linux binaries.

## Getting started

```bash
npm install
npm run ml:check-env   # verifies native TensorFlow + Sharp work on this machine
npm run ml:split-dataset   # data/raw → data/dataset/{train,validation,test}
npm run ml:train           # trains and saves models/hyrule-cnn (a few minutes on CPU)
npm run dev            # API on http://127.0.0.1:3333, web on http://localhost:5173
```

## Scripts

| Script                       | Description                                                         |
| ---------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                | Starts API and web together                                         |
| `npm run dev:api`            | API only (restarts on change)                                       |
| `npm run dev:web`            | Web only (Vite dev server, proxies `/api` to the API)               |
| `npm run build`              | Type-checks and builds the web app                                  |
| `npm run ml:check-env`       | Runs a convolution on the native TF backend + Sharp test            |
| `npm run ml:collect-dataset` | Downloads, validates and files the raw dataset (resumable)          |
| `npm run ml:import-images`   | Imports images/sprite sheets saved by hand into `data/inbox`        |
| `npm run ml:review-dataset`  | Contact sheets for visual review / reject images                    |
| `npm run ml:dataset-report`  | Writes `docs/research/DATASET-COLLECTION-REPORT.md`                 |
| `npm run ml:sync-metadata`   | Updates `sources.json` after moving/deleting files by hand          |
| `npm run ml:split-dataset`   | Stratified, seeded 70/15/15 split of `data/raw` into `data/dataset` |
| `npm run ml:train`           | Trains the CNN, early stopping, evaluates on test → `models/`       |
| `npm run ml:reorganize-raw`  | Re-files images when sub-folder rules change                        |
| `npm run typecheck`          | `tsc` in every workspace                                            |
| `npm run lint`               | ESLint (type-aware)                                                 |
| `npm run format`             | Prettier                                                            |
| `npm test`                   | Vitest                                                              |
| `npm run check`              | typecheck + lint + format check + tests                             |

## Roadmap

Each step is small and comes with a note in `docs/concepts/`.

1. ✅ **Foundation:** monorepo, tooling, API health endpoint, upload UI shell, environment check.
2. ✅ **Preprocessing pipeline:** decode → resize → RGB → normalise to `[0, 1]` → tensor, shared by training and API.
3. ✅ **Dataset:** stratified train/validation/test split script, loading images + one-hot labels in batches.
4. ✅ **CNN from scratch:** conv → pooling → dense → softmax, explained layer by layer.
5. ✅ **Training:** loss/accuracy per epoch, early stopping on validation loss, saving to `models/`.
6. ✅ **Evaluation:** test-set accuracy, confusion matrix, per-class precision/recall.
7. ✅ **Inference API:** `POST /api/classify` (raw image body) using the saved model.
8. ✅ **UI results:** probability bars per class, error states.
9. ✅ **Improvements:** data augmentation (flip, zoom/crop, brightness) and dropout. Next ideas: more/balanced data,
   comparing architectures, grouping near-duplicate images in the split.

### Where each step lives

| Step                                                                                    | Code                                                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Preprocessing (decode → letterbox 96×96 → RGB bytes)                                    | [packages/ml/src/preprocessing.ts](packages/ml/src/preprocessing.ts)                 |
| Split (class = first folder under `data/raw`: `link`, `zelda`, anything else = `other`) | [packages/ml/src/dataset/split.ts](packages/ml/src/dataset/split.ts)                 |
| Loading tensors (`[0, 1]` floats + one-hot labels)                                      | [packages/ml/src/dataset/load.ts](packages/ml/src/dataset/load.ts)                   |
| CNN architecture                                                                        | [packages/ml/src/model.ts](packages/ml/src/model.ts)                                 |
| Training + early stopping + test evaluation                                             | [packages/ml/src/scripts/train.ts](packages/ml/src/scripts/train.ts)                 |
| Data augmentation                                                                       | [packages/ml/src/augmentation.ts](packages/ml/src/augmentation.ts)                   |
| Inference (load model + classify a buffer)                                              | [packages/ml/src/classifier.ts](packages/ml/src/classifier.ts)                       |
| `POST /api/classify`                                                                    | [apps/api/src/routes/classify.ts](apps/api/src/routes/classify.ts)                   |
| Probability bars                                                                        | [apps/web/src/components/ResultsPanel.tsx](apps/web/src/components/ResultsPanel.tsx) |
| Metrics (confusion matrix, precision/recall, class weights)                             | [packages/ml/src/metrics.ts](packages/ml/src/metrics.ts)                             |

The trained model is saved to `models/hyrule-cnn/` (`model.json`, `weights.bin`, `metrics.json`), git-ignored.

## API

```bash
curl -X POST http://127.0.0.1:3333/api/classify \n  -H "Content-Type: image/jpeg" --data-binary @my-image.jpg
# {"prediction":"link","probabilities":[{"label":"link","probability":0.81}, ...]}
```

Accepted types: `image/jpeg`, `image/png`, `image/webp` (max 10 MB). Errors: `415` wrong type, `422` unreadable image,
`503` no trained model (`GET /api/health` shows `modelLoaded`). Set `MODEL_DIR` to use another model folder.

## Results

Test set (95 images never seen during training), CNN from scratch, 96×96 input:

| Run                                              | Test accuracy | Link recall | Zelda recall | Other recall |
| ------------------------------------------------ | ------------- | ----------- | ------------ | ------------ |
| No augmentation (stopped at epoch 22, best 14)   | 66.3%         | 78%         | 57%          | 58%          |
| With augmentation (stopped at epoch 52, best 37) | **68.4%**     | 71%         | 57%          | 74%          |

Chance level is 33.3%. Without augmentation the training accuracy kept rising (86%) while validation fell: the network
was memorising. Augmentation delays that, but ~470 training images of mixed styles (cosplay, screenshots, fan art,
sprites) remain the main limit; Zelda (fewest images) is the weakest class. Exact numbers vary slightly between runs.

## Testing manually

1. In WSL: `npm run ml:split-dataset && npm run ml:train` (skip if `models/hyrule-cnn/model.json` exists).
2. `npm run dev`; the API log should say `model loaded`.
3. Open http://localhost:5173: the header shows the API status; drop a JPEG/PNG/WebP image and read the bars.
4. Without a model, the page shows the 503 message explaining how to train one.

## Learning notes

- [01 · Image classification: framing the problem](docs/concepts/01-image-classification.md)
- [Architecture and decisions](docs/architecture.md)
