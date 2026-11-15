# Dataset collection report

Generated on 2026-10-30 by `npm run ml:dataset-report` from `data/metadata/sources.json` and `data/metadata/rejections.json`. Do not edit by hand: re-run the script.

> **Private educational use only.** The images are copyrighted characters (© Nintendo) and many photos require attribution. They are kept out of git (`data/` is ignored) and must not be redistributed or published.

## 1. Total

**627 images** collected and validated, plus 11 pre-existing images without metadata (see section 9).

## 2. Images per category

| Category | Images |
| -------- | ------ |
| link     | 256    |
| zelda    | 163    |
| other    | 208    |

## 3. Images per game / sub-category

| Category | Sub-category         | Images |
| -------- | -------------------- | ------ |
| link     | nes                  | 0      |
| link     | a-link-to-the-past   | 0      |
| link     | ocarina-of-time      | 17     |
| link     | majoras-mask         | 8      |
| link     | wind-waker           | 6      |
| link     | twilight-princess    | 5      |
| link     | skyward-sword        | 1      |
| link     | breath-of-the-wild   | 110    |
| link     | tears-of-the-kingdom | 5      |
| link     | unspecified          | 104    |
| zelda    | nes                  | 1      |
| zelda    | a-link-to-the-past   | 1      |
| zelda    | ocarina-of-time      | 19     |
| zelda    | majoras-mask         | 0      |
| zelda    | wind-waker           | 43     |
| zelda    | twilight-princess    | 3      |
| zelda    | skyward-sword        | 3      |
| zelda    | breath-of-the-wild   | 12     |
| zelda    | tears-of-the-kingdom | 32     |
| zelda    | unspecified          | 49     |
| other    | ganondorf            | 27     |
| other    | midna                | 28     |
| other    | skull-kid            | 35     |
| other    | mipha                | 30     |
| other    | paya                 | 12     |
| other    | saria                | 11     |
| other    | malon                | 14     |
| other    | impa                 | 8      |
| other    | riju                 | 7      |
| other    | purah                | 8      |
| other    | tingle               | 4      |
| other    | fi                   | 6      |
| other    | sonia                | 1      |
| other    | ghirahim             | 3      |
| other    | urbosa               | 2      |
| other    | zant                 | 4      |
| other    | sidon                | 1      |
| other    | ravio                | 1      |
| other    | vaati                | 0      |
| other    | agitha               | 0      |
| other    | horror-kid           | 0      |
| other    | revali               | 1      |
| other    | daruk                | 0      |
| other    | hylia                | 0      |
| other    | enemies              | 0      |
| other    | npcs                 | 0      |
| other    | creatures            | 0      |
| other    | objects              | 5      |
| other    | other-characters     | 0      |

`unspecified` = the source does not say which game the outfit comes from. Guessing would make these numbers lie.

## 4. Rejected images

1432 images rejected (before or after download, or during visual review), including 2 failed downloads (network errors or HTTP errors after retries; retried on the next run).

| Reason                  | Count |
| ----------------------- | ----- |
| `manual-review`         | 584   |
| `ambiguous-subject`     | 495   |
| `off-topic`             | 214   |
| `content-rating`        | 95    |
| `unsupported-extension` | 19    |
| `duplicate-exact`       | 12    |
| `duplicate-near`        | 10    |
| `download-failed`       | 2     |
| `too-small`             | 1     |

## 5. Duplicates

22 duplicates skipped (12 byte-identical by SHA-256, 10 visually identical by perceptual hash, e.g. the same photo re-uploaded at another size).

## 6. Image quality observations

- Every image was checked on numbered contact sheets (`npm run ml:review-dataset -- sheets`); 383 images were removed with a reason (`manual-review` in rejections.json).
- Danbooru fan art rated "sensitive" (s) turned out to be mostly sexualised (swimsuits, bunny suits, pin-up poses), especially for female `other` characters (Midna, Purah, Mipha, Urbosa, Paya, Malon): all 270 such `other` images were removed, plus 15 Zelda ones; 27 Link and 29 Zelda "s" images that are not sexualised were kept. The collector now only accepts rating g (general) from this source.
- Breath of the Wild screenshots: many show Link very small or from behind, and some show no character at all (fire, laser, shrine interiors, menus, map, dialogue and horse-registration screens). 82 screenshots were removed in total (including the wrong-caption cases below); the remaining ones still often show Link at a small scale, which is realistic but harder for a small CNN.
- Caption-based labels of the BotW dataset were wrong in a few cases (e.g. Urbosa's memory scenes captioned as Zelda, Link visible next to enemies): removed as wrong or ambiguous subject.
- Removed for wrong/several characters: Four Swords poster with many Links, Link with the King of Red Lions, Fierce Deity cosplay, a genderbent Link, group cosplay photos, Zelda statue images.
- Wikipedia NES screenshots (Link and Ganon in The Legend of Zelda, 1986) show the character as a few pixels on a map: removed; NES coverage therefore needs sprites (manual Spriters Resource download).
- Art-style mix is wide: anime/manga fan art, painterly fan art, chibi drawings, cel-shaded Wind Waker art, real cosplay photos, in-game 3D screenshots and official artwork.

## 7. Sources and content origin

| Source                                          | link | zelda | other | Total |
| ----------------------------------------------- | ---- | ----- | ----- | ----- |
| English Wikipedia (official artwork)            | 2    | 5     | 5     | 12    |
| Hugging Face: XeIaso/botw-screenshots-captioned | 76   | 3     | 7     | 86    |
| Hugging Face: deepghs/character_index           | 77   | 106   | 85    | 268   |
| Wikimedia Commons                               | 101  | 49    | 111   | 261   |

| Content origin | link | zelda | other |
| -------------- | ---- | ----- | ----- |
| official       | 78   | 8     | 12    |
| fan-made       | 178  | 155   | 191   |
| unknown        | 0    | 0     | 5     |

All sources investigated:

| Source                                                                                                               | Status               | License                                                                                    | Findings                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Hugging Face: deepghs/character_index](https://huggingface.co/datasets/deepghs/character_index)                     | used                 | Index dataset MIT; each image is fan art © its artist, characters © Nintendo               | 28 Zelda characters, each with images.zip of ~50 person crops from Danbooru fan art plus post metadata (rating, artist, source, game tags). Kept only ratings g/s, single-person crops of the expected character; game sub-folder from the post copyright tags. Sheik, Wolf Link, Fierce Deity, Navi, Korok, Majora, Revali left out. |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Cosplay_of_The_Legend_of_Zelda)                      | used                 | Per file: CC BY, CC BY-SA, CC0 or public domain (verified per image from Commons metadata) | Public MediaWiki API, no account needed. Freely licensed cosplay photos of Link, Zelda and ~40 other Zelda characters, plus photos of Zelda objects. Attribution is required for CC BY/BY-SA: recorded per image. Rate limit for clients without contact info is 10 req/min (we stay below it). The fan-art category has 2 files.     |
| [English Wikipedia (character articles)](<https://en.wikipedia.org/wiki/Link_(The_Legend_of_Zelda)>)                 | used                 | Non-free official artwork © Nintendo, hosted under fair use                                | 17 hand-picked official artworks/screenshots (one character each) from the Link, Zelda, Ganon, Midna, Tingle and Navi articles, read through the MediaWiki API. Small, but the only automatable official art across generations.                                                                                                      |
| [Hugging Face: XeIaso/botw-screenshots-captioned](https://huggingface.co/datasets/XeIaso/botw-screenshots-captioned) | used                 | None stated. Screenshots of a Nintendo game (© Nintendo)                                   | 728 captioned Breath of the Wild screenshots (1280×720). Public and not gated; read through the official datasets-server API. No license file, so the images are used only locally for private, non-commercial training and must not be redistributed. Captions are pre-labels only (some are wrong) and were reviewed visually.      |
| [The Spriters Resource / The Models Resource](https://www.spriters-resource.com/)                                    | manual step required | Ripped Nintendo assets (© Nintendo); custom sheets © their makers. The site owns no rights | robots.txt allows asset pages, but every page and download answers automated clients with HTTP 403 "cf-mitigated: challenge" (Cloudflare bot check), which we do not bypass. Download sheets in a browser into data/inbox/sprite-sheets/<label>/<subcategory>/ and run ml:import-images: frames are cut out automatically.            |
| [Hugging Face: nroggendorff/zelda-style](https://huggingface.co/datasets/nroggendorff/zelda-style)                   | not used             | Tagged MIT, no provenance (third-party art)                                                | 75 BotW-style artworks with generic auto-captions that never name the character ("a cartoon image of a man with a hammer"); many show several characters or landscapes. Usable only by labelling by hand.                                                                                                                             |
| [Hugging Face: other "zelda" datasets](https://huggingface.co/datasets?search=zelda)                                 | not used             | Mixed / unknown                                                                            | DJ-Research/GameBoy-legend_of_zelda_*: 160×144 gameplay frames where Link is a few pixels. jomarie04/all_zelda_games: a 17-row CSV. FileUploader/Legend_of_zelda: no images, looks like spam. Others are audio, NLP or reinforcement-learning data.                                                                                   |
| [Kaggle](https://www.kaggle.com/datasets?search=zelda)                                                               | manual step required | Per dataset                                                                                | No Zelda character image dataset found (only tabular game lists). Searching and downloading need a Kaggle account and API token (~/.kaggle/kaggle.json). Any dataset found later can go through data/inbox.                                                                                                                           |
| [GitHub](https://github.com/search?q=zelda+dataset&type=repositories)                                                | not used             | n/a                                                                                        | Repository search for Zelda image/sprite datasets returned no relevant repositories.                                                                                                                                                                                                                                                  |
| [Zelda Wiki (zeldawiki.wiki)](https://zeldawiki.wiki/)                                                               | not used             | Official artwork and screenshots © Nintendo                                                | Best catalogue of official character art per game, but its robots.txt disallows AI crawlers entirely (ClaudeBot, GPTBot, ImagesiftBot, Meta-ExternalAgent: "Disallow: /"). Treated as an explicit opt-out.                                                                                                                            |
| [Zeldapedia (Fandom) / Zelda Dungeon](https://zelda.fandom.com/)                                                     | not used             | Official artwork and screenshots © Nintendo                                                | Both answer automated requests with a Cloudflare JavaScript challenge (HTTP 403). Not bypassed.                                                                                                                                                                                                                                       |
| [Openverse (Flickr CC photos)](https://openverse.org/)                                                               | manual step required | Per image: CC licenses incl. NC/ND                                                         | ~240 results for Link/Zelda cosplay, but the Terms of Service forbid scraping the catalogue and require a registered API key for heavy use. Could be used with a registered key and modest, documented queries.                                                                                                                       |
| [Google Images](https://images.google.com/)                                                                          | manual step required | Unknown per image                                                                          | Automated access to Google Search is prohibited by Google's terms. Images saved by hand can be imported with ml:import-images (bulk, drag-and-drop folders); the browser-recorded source URL is kept when present.                                                                                                                    |

## 8. Licenses and restrictions

| License                                                                         | Images |
| ------------------------------------------------------------------------------- | ------ |
| Unknown: fan art © its artist, character © Nintendo (index dataset itself: MIT) | 268    |
| CC BY 2.0                                                                       | 106    |
| CC BY-SA 2.0                                                                    | 105    |
| No license stated (game screenshots © Nintendo)                                 | 86     |
| CC BY-SA 4.0                                                                    | 16     |
| Fair use (non-free content © Nintendo, used on Wikipedia under fair use)        | 12     |
| CC BY 4.0                                                                       | 11     |
| CC BY-SA 3.0                                                                    | 10     |
| CC BY 3.0                                                                       | 7      |
| CC0                                                                             | 5      |
| Public domain                                                                   | 1      |

- **CC BY / CC BY-SA:** credit the author (the `attribution` field of each image in `sources.json`) wherever an image is shown, e.g. in slides or a demo. CC BY-SA also requires sharing adaptations under the same license.
- **Characters, costumes and game screenshots are © Nintendo.** A free license on a photo covers the photo, not Nintendo's character design. Fine for private study; not for redistribution or commercial use.
- **Screenshots without a license** (Hugging Face BotW dataset): local, private training only.

## 9. Missing categories and insufficient coverage

- `link/nes`: 0 images.
- `link/a-link-to-the-past`: 0 images.
- `link/majoras-mask`: 8 images.
- `link/wind-waker`: 6 images.
- `link/twilight-princess`: 5 images.
- `link/skyward-sword`: 1 images.
- `link/tears-of-the-kingdom`: 5 images.
- `zelda/nes`: 1 images.
- `zelda/a-link-to-the-past`: 1 images.
- `zelda/majoras-mask`: 0 images.
- `zelda/twilight-princess`: 3 images.
- `zelda/skyward-sword`: 3 images.
- `other/impa`: 8 images.
- `other/riju`: 7 images.
- `other/purah`: 8 images.
- `other/tingle`: 4 images.
- `other/fi`: 6 images.
- `other/sonia`: 1 images.
- `other/ghirahim`: 3 images.
- `other/urbosa`: 2 images.
- `other/zant`: 4 images.
- `other/sidon`: 1 images.
- `other/ravio`: 1 images.
- `other/vaati`: 0 images.
- `other/agitha`: 0 images.
- `other/horror-kid`: 0 images.
- `other/revali`: 1 images.
- `other/daruk`: 0 images.
- `other/hylia`: 0 images.
- `other/enemies`: 0 images.
- `other/npcs`: 0 images.
- `other/creatures`: 0 images.
- `other/objects`: 5 images.
- `other/other-characters`: 0 images.
- 11 images in `data/raw` have no recorded origin or license: `data/raw/link/nes/link-01.webp`, `data/raw/link/nes/link-02.jpg`, `data/raw/link/nes/link-03.jpg`, `data/raw/link/nes/link-04.png`, `data/raw/link/nes/link-05.webp`, `data/raw/link/nes/link-06.jpg`, `data/raw/link/unspecified/link-07.png`, `data/raw/link/unspecified/link-08.png`, `data/raw/link/unspecified/link-09.jpg`, `data/raw/link/unspecified/link-10.webp`, `data/raw/link/unspecified/link-11.png`. Document their source or move them out before training.
- **link** style mix: 30% official game content, 70% fan-made (cosplay photos, fan art), 0% unknown.
- **zelda** style mix: 5% official game content, 95% fan-made (cosplay photos, fan art), 0% unknown.
- **other** style mix: 6% official game content, 92% fan-made (cosplay photos, fan art), 2% unknown.

## 10. Recommendations

1. **Balance at split time:** cap the larger classes or use class weights during training, instead of deleting images.
2. **Add game art for other generations** (NES, A Link to the Past, Wind Waker, Twilight Princess, Skyward Sword, Tears of the Kingdom): your own screenshots, or manual downloads from The Spriters Resource / Models Resource for private study (crop one character per image).
3. **Use Kaggle or Openverse with your own account/API key** to add more licensed photos, then run the collector again (it skips duplicates).
4. **Set `HYRULE_COLLECTOR_CONTACT`** before re-running: Wikimedia allows 20× more requests per minute to clients that identify themselves.
5. **Make `other` broader** (see `data/README.md`): add non-Zelda images (people, animals, other games) so the model does not learn "anything Zelda-looking that is not Link/Zelda".
6. **Split by source group, not by image:** photos from the same photo shoot should land in the same split, otherwise near-identical shots in train and test inflate accuracy.
