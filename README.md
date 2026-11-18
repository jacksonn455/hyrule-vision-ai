# Hyrule Vision AI

An educational full-stack application that recognises **Zelda-series characters** (Link, Midna, Ganondorf, Skull Kid,
…) in an image or **live from a webcam**, and guesses **which game** a Link image comes from. Built with TensorFlow.js:
first with a CNN trained from scratch (to learn how each part works), then with **MobileNet V2 transfer learning**
(for accuracy).

> **Status:** dataset of ~44 000 images, automatic cleaning, two models (12 characters: **81.4%**, 9 games:
> **66.0%** test accuracy), inference API, upload UI and live webcam mode. See [Results](#results).

<img width="883" height="1755" alt="image" src="https://github.com/user-attachments/assets/d6472ece-ee9f-43b0-a84c-5b65007b1897" />
<img width="909" height="1608" alt="image" src="https://github.com/user-attachments/assets/87feda96-264f-4e5d-866a-786cc9d63f2d" />
<img width="886" height="1574" alt="image" src="https://github.com/user-attachments/assets/2ce00688-2e28-49f2-8969-6a6474b583ba" />
<img width="878" height="1514" alt="image" src="https://github.com/user-attachments/assets/c0f5715b-6c96-457b-a569-412826917724" />

## Features

- **Upload an image** → the character, its probability and every class's probability bar; for Link, also the game.
- **Live webcam** (below the upload) → point the webcam at a screen, e.g. a Nintendo Switch 2: a frame is sent to the
  API every 1.5 s and the same results panel shows the character, its probability and Link's game.
- **Trained classes** → every character and game the models know, with its test recall.

## Stack

| Layer            | Technology                                                     |
| ---------------- | -------------------------------------------------------------- |
| Frontend         | React 19 + TypeScript + Vite (webcam via `getUserMedia`)       |
| Backend          | Node.js 22 + TypeScript + Fastify                              |
| Machine learning | TensorFlow.js (`@tensorflow/tfjs-node`) + MobileNet V2 + Sharp |
| Tooling          | npm workspaces, ESLint, Prettier, Vitest                       |

## Project structure

```
.
├── apps/
│   ├── web/              # React UI: upload, live webcam, results, trained classes
│   └── api/              # Fastify HTTP API: GET /api/health, POST /api/classify
├── packages/
│   ├── shared/           # Labels, display names and API types
│   └── ml/               # Collection, dataset, preprocessing, models, training and inference
├── data/                 # Images, splits and caches (git-ignored) → see data/README.md
├── models/               # Trained models + MobileNet download (git-ignored)
├── docs/
│   ├── architecture.md   # Responsibilities and technical decisions
│   └── concepts/         # AI concepts, one note per step
└── examples/
    └── customer-tiers/   # Earlier TF.js study (dense network on tabular data), kept for reference
```

## Requirements

- **WSL 2** (Ubuntu) with **Node.js 22.18+** (`nvm use` reads `.nvmrc`).
  `@tensorflow/tfjs-node` has no working prebuilt binary for native Windows; see [docs/architecture.md](docs/architecture.md).
- Prefer keeping the project **on the WSL filesystem** (e.g. `~/projetos/hyrule-vision-ai`): file access through
  `/mnt/c` is much slower. Install dependencies **from inside WSL** (native `tfjs-node` and `sharp` binaries).
- A webcam for the live mode. Browsers only allow it on `localhost` or HTTPS.

## Getting started

```bash
npm install
npm run ml:check-env   # verifies native TensorFlow + Sharp work on this machine
npm run ml:train:all   # split data/raw + train the character and game models (minutes once features are cached)
npm run dev            # API on http://127.0.0.1:3333, web on http://localhost:5173
```

The first training downloads MobileNet V2 from TF Hub to `models/mobilenet-v2/` and extracts the features of every
image (~25 images/s on CPU); later trainings read them from `data/cache/features/` and take a few minutes.

## Scripts

| Script                            | Description                                                              |
| --------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                     | Starts API and web together                                              |
| `npm run dev:api`                 | API only (restarts on change)                                            |
| `npm run dev:web`                 | Web only (Vite dev server, proxies `/api` to the API)                    |
| `npm run build`                   | Type-checks and builds the web app                                       |
| `npm run ml:check-env`            | Runs a convolution on the native TF backend + Sharp test                 |
| `npm run ml:collect-dataset`      | Downloads, validates and files the raw dataset (resumable)               |
| `npm run ml:import-images`        | Imports images/sprite sheets saved by hand into `data/inbox`             |
| `npm run ml:web-search`           | Bulk image search into `data/inbox` (private study, see below)           |
| `npm run ml:review-dataset`       | Contact sheets for visual review / reject images                         |
| `npm run ml:dataset-report`       | Writes `docs/research/DATASET-COLLECTION-REPORT.md`                      |
| `npm run ml:sync-metadata`        | Updates `sources.json` after moving/deleting files by hand               |
| `npm run ml:find-suspects`        | Moves likely mislabelled images to `data/review/suspects` (k-fold)       |
| `npm run ml:split-dataset`        | Discovers classes, stratified 70/15/15 split into `data/dataset`         |
| `npm run ml:train:transfer`       | Character model, MobileNet transfer learning → `models/hyrule-cnn`       |
| `npm run ml:train:transfer:games` | Game model (Link / Zelda), transfer learning → `models/hyrule-cnn-games` |
| `npm run ml:train:all`            | `split-dataset` + both transfer-learning trainings                       |
| `npm run ml:train`                | Character CNN from scratch (slower, less accurate; for comparison)       |
| `npm run ml:train:games`          | Game CNN from scratch                                                    |
| `npm run ml:reorganize-raw`       | Re-files images when sub-folder rules change                             |
| `npm run typecheck`               | `tsc` in every workspace                                                 |
| `npm run lint`                    | ESLint (type-aware)                                                      |
| `npm run format`                  | Prettier                                                                 |
| `npm test`                        | Vitest                                                                   |
| `npm run check`                   | typecheck + lint + format check + tests                                  |

## How it works

1. **Collection:** images are filed in `data/raw/<character>/` and, for Link and Zelda,
   `data/raw/<character>/<game>/`. Duplicates (perceptual hash), corrupt and tiny images are rejected;
   `data/metadata/` remembers every source and rejection.
2. **Cleaning:** `ml:find-suspects` trains 5 classifiers, each on 4/5 of the images, and scores the 1/5 it never saw.
   Images that this unbiased model puts in another class with ≥ 90% confidence (fan art, group pictures, wrong
   character) are moved to `data/review/suspects/` for review. Nothing is deleted.
3. **Classes and split:** `ml:split-dataset` turns folders into classes and makes a stratified 70/15/15 split.
4. **Features:** MobileNet V2 (pre-trained on ImageNet) turns each 224×224 image into 1280 numbers, cached once per image.
5. **Classifier:** a small head (dropout → dense 256 → dropout → softmax) is trained on those features, with `sqrt`
   class weights and early stopping on validation loss; the test set is only used for the final metrics.
6. **Inference:** the API runs the same preprocessing + MobileNet + head, then the game model when the character is
   one it knows (Link).

### Where each step lives

| Step                                                        | Code                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Preprocessing (decode → letterbox → RGB bytes)              | [packages/ml/src/preprocessing.ts](packages/ml/src/preprocessing.ts)                                     |
| Classes from `data/raw` folders, excluded characters, other | [packages/ml/src/dataset/classes.ts](packages/ml/src/dataset/classes.ts)                                 |
| Stratified split                                            | [packages/ml/src/dataset/split.ts](packages/ml/src/dataset/split.ts)                                     |
| Pixel cache and batches (CNN from scratch)                  | [packages/ml/src/dataset/load.ts](packages/ml/src/dataset/load.ts)                                       |
| MobileNet feature extractor (download, 224×224 input)       | [packages/ml/src/feature-extractor.ts](packages/ml/src/feature-extractor.ts)                             |
| Feature cache (one row per image)                           | [packages/ml/src/dataset/features.ts](packages/ml/src/dataset/features.ts)                               |
| Transfer head and class weights                             | [packages/ml/src/transfer-head.ts](packages/ml/src/transfer-head.ts)                                     |
| Transfer-learning training                                  | [packages/ml/src/scripts/train-transfer.ts](packages/ml/src/scripts/train-transfer.ts)                   |
| Mislabelled-image detection                                 | [packages/ml/src/scripts/find-suspects.ts](packages/ml/src/scripts/find-suspects.ts)                     |
| CNN from scratch + augmentation                             | [packages/ml/src/model.ts](packages/ml/src/model.ts), [augmentation.ts](packages/ml/src/augmentation.ts) |
| Metrics (confusion matrix, precision/recall, class weights) | [packages/ml/src/metrics.ts](packages/ml/src/metrics.ts)                                                 |
| Inference (load models + classify a buffer)                 | [packages/ml/src/classifier.ts](packages/ml/src/classifier.ts)                                           |
| `POST /api/classify`                                        | [apps/api/src/routes/classify.ts](apps/api/src/routes/classify.ts)                                       |
| Upload + probability bars                                   | [apps/web/src/components/ResultsPanel.tsx](apps/web/src/components/ResultsPanel.tsx)                     |
| Live webcam                                                 | [apps/web/src/components/WebcamClassifier.tsx](apps/web/src/components/WebcamClassifier.tsx)             |

The models are saved to `models/hyrule-cnn/` and `models/hyrule-cnn-games/` (`model.json`, `weights.bin`,
`labels.json`, `metrics.json`). A training writes to `<model>.training/` and only replaces the model when it
finishes, so an interrupted run never breaks the API. Everything in `models/` and `data/` is git-ignored.

## Choosing the classes

The classes are **not hard-coded**: they come from the folders in `data/raw`, in
[classes.ts](packages/ml/src/dataset/classes.ts).

- **Characters:** every top-level folder with at least 10 images (`--min-images`) is a class, except:
    - `EXCLUDED_CHARACTERS`: zelda, impa, tingle, paya, malon, fi, zant and riju stayed below 50% recall and are left
      out. Their images stay in `data/raw`.
    - `INCLUDE_OTHER = false`: small characters and `objects`/`enemies`/`npcs`/`creatures` are not trained as an
      "other" class (too varied), so the model always answers one of the trained characters.
- **Games:** images in `data/raw/<character>/<game>/` (Link and Zelda) train the game model; the two characters are
  pooled per game because the game is mostly the art style. `unspecified` and games with fewer than 10 images are
  skipped. The UI shows the game only for characters the game model knows.
- To bring a character back or add a new one, edit the lists / add `data/raw/<name>/`, then run `npm run ml:train:all`
  and restart the API. The page lists every trained class with its **test recall**.

**Bulk web search (private study only).** `ml:web-search` downloads Bing Images results (SafeSearch strict) into
`data/inbox/`; `ml:import-images` validates them, drops duplicates and files them in `data/raw`. The licence of these
images is unknown: like everything in `data/`, they are git-ignored and must not be published. In-game screenshots
work best:

```bash
npm run ml:web-search -- --per-query 300 --suffix "gameplay screenshot"
npm run ml:import-images && npm run ml:find-suspects && npm run ml:sync-metadata && npm run ml:train:all
```

## API

```bash
curl -X POST http://127.0.0.1:3333/api/classify \
  -H "Content-Type: image/jpeg" --data-binary @my-image.jpg
# {"prediction":"link","probabilities":[{"label":"link","probability":0.91}, ...],
#  "game":{"prediction":"breath-of-the-wild","probabilities":[...]}}
```

Accepted types: `image/jpeg`, `image/png`, `image/webp` (max 10 MB). Errors: `415` wrong type, `422` unreadable image,
`503` no trained model. `GET /api/health` returns `modelLoaded`, the labels and the test metrics of both models
(`model`, `gameModel`). Set `MODEL_DIR` / `GAME_MODEL_DIR` to use other model folders.

## Results

Same split for every run; settings are chosen on validation, and the test images are only used for the numbers below.

**Character model (current, 2026-11-18): 12 classes, test accuracy 81.4%** (chance 8.3%).

| Character | Recall | Character | Recall | Character | Recall |
| --------- | ------ | --------- | ------ | --------- | ------ |
| link      | 91%    | midna     | 64%    | ganondorf | 61%    |
| sidon     | 70%    | skull-kid | 64%    | purah     | 57%    |
| mipha     | 70%    | revali    | 63%    | saria     | 56%    |
| daruk     | 70%    | urbosa    | 63%    | ghirahim  | 55%    |

**Game model (current): 9 games, test accuracy 66.0%** (chance 11.1%). Recall: Twilight Princess 78%, NES 77%,
Wind Waker 73%, Skyward Sword 66%, Majora's Mask 65%, Tears of the Kingdom 64%, Ocarina of Time 60%, A Link to the
Past 58%, Breath of the Wild 58%. BotW and TotK share an art style and are often confused with each other.

### How we got here

| Character model                                             | Classes | Test accuracy |
| ----------------------------------------------------------- | ------- | ------------- |
| CNN from scratch, 96×96, ~660 images (Link / Zelda / Other) | 3       | 68.4%         |
| CNN from scratch, 96×96, ~660 images                        | 10      | 52.6%         |
| CNN from scratch, 96×96, ~44 000 web images (stopped, ~3 h) | 21      | ~26.5% (val.) |
| MobileNet + head, `balanced` class weights                  | 21      | 35.9%         |
| MobileNet + head, no class weights                          | 21      | 60.7%         |
| MobileNet + head, `sqrt` class weights                      | 21      | 58.6%         |
| + automatic cleaning (`ml:find-suspects`, 252 images moved) | 21      | 60.4%         |
| + only characters ≥ 50% recall, no "other" class            | 12      | **81.4%**     |

| Game model                              | Classes | Test accuracy |
| --------------------------------------- | ------- | ------------- |
| CNN from scratch, ~660 images           | 4       | 50%           |
| MobileNet + head                        | 9       | 64.8%         |
| + automatic cleaning (278 images moved) | 9       | **66.0%**     |

Lessons:

- On ~44 000 noisy web images (fan art, cosplay, screenshots, sprites), a CNN from scratch stays weak on CPU;
  MobileNet features are far better and retraining takes minutes.
- `balanced` class weights made the model avoid Link (most of the images); no weights made it answer "Link" too often.
  `sqrt` weights are the compromise.
- Removing mislabelled images helps a little; removing classes the data cannot support (Zelda is usually in the same
  picture as Link, small characters had too few clean images) helps a lot.

## Testing manually

1. In WSL: `npm run ml:train:all` (skip if `models/hyrule-cnn/model.json` exists).
2. `npm run dev`; the API log lists the character and game classes it loaded.
3. Open http://localhost:5173: drop a JPEG/PNG/WebP image and read the bars.
4. Live mode: click **Start webcam**, allow the camera and point it at the Switch 2 screen (fill the frame with the
   game, avoid reflections). The result updates every 1.5 s; **Stop webcam** releases the camera.
5. Without a model, the page shows the 503 message explaining how to train one.

## Learning notes

- [01 · Image classification: framing the problem](docs/concepts/01-image-classification.md)
- [Architecture and decisions](docs/architecture.md)
