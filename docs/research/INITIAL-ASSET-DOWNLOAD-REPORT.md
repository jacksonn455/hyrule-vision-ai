# Initial asset download report

Attempted on 2026-10-29 with one plain HTTP request per page (no browser emulation, no challenge solving).

## Results

| Asset                               | Source page                                                                            | Target folder                        | Result                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Link (The Legend of Zelda, NES)     | <https://www.spriters-resource.com/nes/legendofzelda/asset/8366/>                      | `data/raw/link/nes/`                 | ❌ HTTP 403, `cf-mitigated: challenge` ("Just a moment…")                                                                                    |
| Princess Zelda (A Link to the Past) | <https://www.spriters-resource.com/snes/legendofzeldaalinktothepast/asset/200215/>     | `data/raw/zelda/a-link-to-the-past/` | ❌ HTTP 403, `cf-mitigated: challenge`                                                                                                       |
| Ganondorf (custom / fan-made)       | <https://www.spriters-resource.com/custom_edited/thelegendofzeldacustoms/asset/17550/> | `data/raw/other/ganondorf/`          | ❌ HTTP 403, `cf-mitigated: challenge`                                                                                                       |
| BotW / Wind Waker / OoT Link models | <https://www.models-resource.com/> (301 → <https://models.spriters-resource.com/>)     | —                                    | ❌ HTTP 403, `cf-mitigated: challenge`; individual model pages could not be opened, so no download links were identified (none were guessed) |

- **Files downloaded:** 0 · **Sprites extracted:** 0 · **Files rejected:** 0 · **Metadata entries:** 0
- `robots.txt` of both sites allows these pages; the block is Cloudflare's interactive bot check, which only a real
  browser passes. Solving or evading it would be circumventing a technical access restriction, so it was not done.
- No direct media URL was guessed.

## Manual steps (about one minute per asset)

1. Open each source page above in your browser and click the sheet's **Download** button (it saves the original PNG).
2. Save (or drag) the files here:
    - Link NES → `data/inbox/sprite-sheets/link/nes/`
    - Zelda ALttP → `data/inbox/sprite-sheets/zelda/a-link-to-the-past/`
    - Ganondorf → `data/inbox/sprite-sheets/other/ganondorf/`
3. Run, from WSL: `npm run ml:import-images`

The import then, with the existing pipeline:

- keeps the **original sheet**, unchanged, in `data/sources/sprite-sheets/<label>/<subcategory>/` (not in `data/raw`:
  a whole sheet is not a training image);
- finds each sprite (transparent or solid background, parts closer than 2 px merged, specks < 12 px dropped) and cuts
  it out as PNG **with transparency**; tiny pixel art is enlarged by a whole factor with nearest-neighbour sampling
  (no new colours), recorded as `variant: "rendition"`;
- validates, de-duplicates (SHA-256 + perceptual hash) and files each frame under `data/raw/<label>/<subcategory>/`;
- records each frame in `data/metadata/sources.json` with `derivedFrom: { path, sha256 }` of its sheet, the URL the
  browser recorded (Windows "Zone.Identifier", when present), `license: "Unknown…"` and `contentOrigin: "unknown"`
  (nothing invented);
- prints and saves a summary (`data/metadata/imports/<date>.json`).

Sheets often also contain items, effects or other characters: run `npm run ml:review-dataset -- sheets` and reject
frames that are not the expected character (`ml:review-dataset -- reject --reason "..." <path>`).

## Ready for the next step?

These three assets are **not** in the dataset yet. The rest of the dataset, collected automatically from other
sources, is described in [DATASET-COLLECTION-REPORT.md](DATASET-COLLECTION-REPORT.md).
