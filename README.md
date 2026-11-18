# Hyrule Vision AI

An educational full-stack application that recognises **Zelda-series characters** (Link, Zelda, Midna, Skull Kid,
Ganondorf, …) and guesses **which game** a Link or Zelda image comes from, using **convolutional neural networks
trained from scratch** with TensorFlow.js. No pretrained models: the point is to
understand how each part of an image classifier works by building it.

> **Status:** all roadmap steps are implemented: dataset (~660 images), preprocessing, split, CNN, training with
> data augmentation, evaluation, inference API and UI. Accuracy is still modest (see [Results](#results)).

<img width="909" height="1608" alt="image" src="https://github.com/user-attachments/assets/87feda96-264f-4e5d-866a-786cc9d63f2d" />
<img width="887" height="1579" alt="image" src="https://github.com/user-attachments/assets/2f095f38-0467-4a6d-9dc5-7a9965f66e20" />
<img width="886" height="1574" alt="image" src="https://github.com/user-attachments/assets/2ce00688-2e28-49f2-8969-6a6474b583ba" />
<img width="878" height="1514" alt="image" src="https://github.com/user-attachments/assets/c0f5715b-6c96-457b-a569-412826917724" />



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
npm run ml:train:all   # split data/raw + train the character model + train the game model (minutes on CPU)
npm run dev            # API on http://127.0.0.1:3333, web on http://localhost:5173
```

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
10. ✅ **Transfer learning:** MobileNet V2 (pre-trained on ImageNet) extracts 1280 features per image; only a small
    classifier is trained on top. Far more accurate than the CNN from scratch on ~30 000 noisy web images, and
    retraining takes minutes because the features are cached.

### Where each step lives

| Step                                                              | Code                                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Preprocessing (decode → letterbox 96×96 → RGB bytes)              | [packages/ml/src/preprocessing.ts](packages/ml/src/preprocessing.ts)                   |
| Classes discovered from `data/raw` folders (characters and games) | [packages/ml/src/dataset/classes.ts](packages/ml/src/dataset/classes.ts)               |
| Stratified split                                                  | [packages/ml/src/dataset/split.ts](packages/ml/src/dataset/split.ts)                   |
| Loading tensors (`[0, 1]` floats + one-hot labels)                | [packages/ml/src/dataset/load.ts](packages/ml/src/dataset/load.ts)                     |
| CNN architecture                                                  | [packages/ml/src/model.ts](packages/ml/src/model.ts)                                   |
| Training + early stopping + test evaluation                       | [packages/ml/src/scripts/train.ts](packages/ml/src/scripts/train.ts)                   |
| Data augmentation                                                 | [packages/ml/src/augmentation.ts](packages/ml/src/augmentation.ts)                     |
| MobileNet feature extractor (download, 224×224 input)             | [packages/ml/src/feature-extractor.ts](packages/ml/src/feature-extractor.ts)           |
| Feature cache + transfer-learning training                        | [packages/ml/src/scripts/train-transfer.ts](packages/ml/src/scripts/train-transfer.ts) |
| Inference (load model + classify a buffer)                        | [packages/ml/src/classifier.ts](packages/ml/src/classifier.ts)                         |
| `POST /api/classify`                                              | [apps/api/src/routes/classify.ts](apps/api/src/routes/classify.ts)                     |
| Probability bars                                                  | [apps/web/src/components/ResultsPanel.tsx](apps/web/src/components/ResultsPanel.tsx)   |
| Metrics (confusion matrix, precision/recall, class weights)       | [packages/ml/src/metrics.ts](packages/ml/src/metrics.ts)                               |

The trained models are saved to `models/hyrule-cnn/` and `models/hyrule-cnn-games/` (`model.json`, `weights.bin`,
`labels.json`, `metrics.json`), git-ignored. Transfer-learning models have `featureExtractor` in `metrics.json`: the
API then runs MobileNet (downloaded once from TF Hub to `models/mobilenet-v2/`) before the classifier. Caches of
decoded pixels and MobileNet features live in `data/cache/` (git-ignored, rebuilt automatically when a split changes).

## Adding characters and improving accuracy

The classes are **not hard-coded**: they come from the folders in `data/raw`.

- **Characters:** every top-level folder of `data/raw` (`link`, `midna`, `skull-kid`, …) with at least 10 images
  (`--min-images`) becomes a class. Smaller folders, and `objects`/`enemies`/`npcs`/`creatures`, are merged into
  `other`. To add a character, create `data/raw/<name>/` with images.
- **Games:** images in `data/raw/<character>/<game>/` (Link and Zelda today) train a second CNN that guesses the game;
  Link and Zelda are pooled per game because the game is mostly the art style. `unspecified` is ignored, and games with
  fewer than 10 images are skipped. The UI shows the game under the name only for characters this model knows.
- After adding images, run `npm run ml:train:all` and restart the API. The page lists every trained character and
  game with its **test recall** (how many of its test images were recognised): ≥ 70% is marked _good_, lower is
  _learning_. Classes with only 1–2 test images have very noisy scores: more images fix both problems.

```bash
npm run ml:split-dataset -- --min-images 15   # stricter: only characters with 15+ images get their own class
```

**Bulk web search (private study only).** `ml:web-search` downloads Bing Images results (SafeSearch strict) into
`data/inbox/<link|zelda>/<game>/` and `data/inbox/other/<character>/`; `ml:import-images` then validates them, drops
duplicates and files them in `data/raw`. The licence of these images is unknown: like everything in `data/`, they are
git-ignored and must not be published. In-game screenshots work best, so run several passes with a suffix:

```bash
npm run ml:web-search -- --per-query 300 --suffix "gameplay screenshot"
npm run ml:web-search -- --only midna,link/twilight-princess --suffix "cutscene screenshot"
npm run ml:import-images && npm run ml:train:all
```

## API

```bash
curl -X POST http://127.0.0.1:3333/api/classify \n  -H "Content-Type: image/jpeg" --data-binary @my-image.jpg
# {"prediction":"link","probabilities":[{"label":"link","probability":0.81}, ...],
#  "game":{"prediction":"breath-of-the-wild","probabilities":[...]}}
```

Accepted types: `image/jpeg`, `image/png`, `image/webp` (max 10 MB). Errors: `415` wrong type, `422` unreadable image,
`503` no trained model (`GET /api/health` shows `modelLoaded`). Set `MODEL_DIR` / `GAME_MODEL_DIR` to use other model folders.
`GET /api/health` also returns the trained classes with their test metrics (`model`, `gameModel`).

## Results

**Current models (2026-11-17, ~44 000 images after the bulk web search, 21 characters, 9 games).** Same split for
every run; the test images are never used to choose settings (validation is).

| Character model (21 classes, chance 4.8%)              | Validation acc. | Test accuracy |
| ------------------------------------------------------ | --------------- | ------------- |
| CNN from scratch, 96×96 (stopped at epoch 47, ~3 h)    | 26.5%           | —             |
| MobileNet + classifier, `balanced` class weights       | 33%             | 35.9%         |
| MobileNet + classifier, `sqrt` class weights (default) | 60.0%           | **58.6%**     |
| MobileNet + classifier, no class weights               | 61.6%           | 60.7%         |
| MobileNet `sqrt`, after `ml:find-suspects` cleaning    | —               | **60.4%**     |

`balanced` weights made the model avoid Link and Zelda (63% of the images): their recall fell to ~20%. Without
weights it answers "Link" too often (93% Link recall, 9% for Malon and Paya). `sqrt` is the default: almost the same
accuracy, much better for the small characters. Weakest classes: Zelda (often in the same picture as Link), Paya,
Malon and Fi.

**Automatic cleaning** (`npm run ml:find-suspects`, 5-fold out-of-fold predictions, threshold 90%): 252 character
and 278 game images that a model which never saw them classified as another class with ≥ 90% confidence were moved
to `data/review/suspects/` (not deleted), then the dataset was re-split and both models retrained.

Per-character test recall (`sqrt`, after cleaning): link 82%, sidon 69%, mipha 69%, revali 68%, midna 67%,
daruk 65%, skull-kid 61%, ghirahim 60%, urbosa 58%, purah 57%, saria 54%, ganondorf 53%, riju 48%, zant 43%, fi 40%,
zelda 31%, impa 28%, paya 27%, malon 27%, tingle 25%.

**Game model (Link + Zelda, 9 games, chance 11.1%):** MobileNet + classifier, test accuracy **66.0%** after cleaning
(64.8% before), up from 50% on 4 games with the CNN from scratch. Recall: Twilight Princess 78%, NES 77%, Wind Waker
73%, Skyward Sword 66%, Majora's Mask 65%, Tears of the Kingdom 64%, Ocarina of Time 60%, A Link to the Past 58%,
Breath of the Wild 58%. BotW and TotK share an art style and are often confused with each other.

Earlier runs, before the bulk web search (CNN from scratch):

Test set (95 images never seen during training), CNN from scratch, 96×96 input:

| Run                                              | Test accuracy | Link recall | Zelda recall | Other recall |
| ------------------------------------------------ | ------------- | ----------- | ------------ | ------------ |
| No augmentation (stopped at epoch 22, best 14)   | 66.3%         | 78%         | 57%          | 58%          |
| With augmentation (stopped at epoch 52, best 37) | **68.4%**     | 71%         | 57%          | 74%          |

Chance level is 33.3%. Without augmentation the training accuracy kept rising (86%) while validation fell: the network
was memorising. Augmentation delays that, but ~470 training images of mixed styles (cosplay, screenshots, fan art,
sprites) remain the main limit; Zelda (fewest images) is the weakest class. Exact numbers vary slightly between runs.

**Per-character model (10 classes, 2026-11-16):** test accuracy **52.6%** (chance 10%). Recall per class:
link 56%, zelda 43%, skull-kid 80%, mipha 60%, midna 50%, ganondorf 75%, malon 50%, paya 100%, saria 0%, other 29%.
Splitting "other" into named characters makes the task much harder than Link/Zelda/Other, and the small characters
have only 2–5 test images, so their scores swing a lot between runs. More images per character is the main lever.

**Game model (Link + Zelda, 4 games):** test accuracy **50%** (chance 25%). Breath of the Wild 79% recall
(85 training images); Wind Waker, Ocarina of Time and Tears of the Kingdom are still below 35% with 26–36 images each.
Twilight Princess (9), Majora's Mask (8), NES (7) and Skyward Sword (5) need a few more images to become classes.

## Testing manually

1. In WSL: `npm run ml:train:all` (skip if `models/hyrule-cnn/model.json` exists).
2. `npm run dev`; the API log lists the character and game classes it loaded.
3. Open http://localhost:5173: the header shows the API status; drop a JPEG/PNG/WebP image and read the bars.
4. Without a model, the page shows the 503 message explaining how to train one.

## Learning notes

- [01 · Image classification: framing the problem](docs/concepts/01-image-classification.md)
- [Architecture and decisions](docs/architecture.md)
