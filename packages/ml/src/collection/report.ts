import { COLLECTION_LABELS } from '@hyrule/shared'

import type { SourceFinding } from './sources/source-research.ts'
import { RAW_SUBCATEGORIES } from './taxonomy.ts'
import type { ImageRecord, Rejection } from './types.ts'

export interface ReportInput {
    images: readonly ImageRecord[]
    rejections: readonly Rejection[]
    sources: readonly SourceFinding[]
    /** Images found in data/raw that have no metadata (added by hand, origin unknown). */
    unaudited: readonly string[]
    /** Findings of the visual review, written by the person who did it. */
    observations?: readonly string[]
    generatedAt: Date
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
    return counts
}

function table(headers: string[], rows: (string | number)[][]): string {
    return [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`),
    ].join('\n')
}

/** Builds docs/research/DATASET-COLLECTION-REPORT.md from the metadata files. Pure: easy to test and regenerate. */
export function buildCollectionReport({
    images,
    rejections,
    sources,
    unaudited,
    observations = [],
    generatedAt,
}: ReportInput): string {
    const byLabel = countBy(images, (i) => i.label)
    const bySub = countBy(images, (i) => `${i.label}/${i.subcategory}`)
    const byReason = countBy(rejections, (r) => r.reason)
    const duplicates = (byReason.get('duplicate-exact') ?? 0) + (byReason.get('duplicate-near') ?? 0)
    const bySourceLabel = countBy(images, (i) => `${i.sourceName}|${i.label}`)
    const sourceNames = [...new Set(images.map((i) => i.sourceName))].sort()
    const byOriginLabel = countBy(images, (i) => `${i.contentOrigin}|${i.label}`)
    const origins = ['official', 'fan-made', 'unknown'] as const
    const failed = rejections.filter((r) => r.reason === 'download-failed')
    const byLicense = countBy(images, (i) => i.license)
    const counts = COLLECTION_LABELS.map((label) => byLabel.get(label) ?? 0)
    const max = Math.max(...counts)

    const gaps: string[] = []
    for (const label of COLLECTION_LABELS) {
        const count = byLabel.get(label) ?? 0
        if (count < 100) gaps.push(`**${label}** has ${count} images, below the initial target of 100.`)
        if (max > 0 && count < max * 0.5)
            gaps.push(`**${label}** has less than half the images of the largest class (imbalance).`)
        for (const sub of RAW_SUBCATEGORIES[label]) {
            if (sub === 'unspecified') continue
            const n = bySub.get(`${label}/${sub}`) ?? 0
            if (n < 10) gaps.push(`\`${label}/${sub}\`: ${n} images.`)
        }
    }

    const sections = [
        '# Dataset collection report',
        '',
        `Generated on ${generatedAt.toISOString().slice(0, 10)} by \`npm run ml:dataset-report\` from ` +
            '`data/metadata/sources.json` and `data/metadata/rejections.json`. Do not edit by hand: re-run the script.',
        '',
        '> **Private educational use only.** The images are copyrighted characters (© Nintendo) and many photos require ' +
            'attribution. They are kept out of git (`data/` is ignored) and must not be redistributed or published.',
        '',
        '## 1. Total',
        '',
        `**${images.length} images** collected and validated` +
            (unaudited.length
                ? `, plus ${unaudited.length} pre-existing images without metadata (see section 9).`
                : '.'),
        '',
        '## 2. Images per category',
        '',
        table(
            ['Category', 'Images'],
            COLLECTION_LABELS.map((label) => [label, byLabel.get(label) ?? 0]),
        ),
        '',
        '## 3. Images per game / sub-category',
        '',
        table(
            ['Category', 'Sub-category', 'Images'],
            COLLECTION_LABELS.flatMap((label) =>
                RAW_SUBCATEGORIES[label].map((sub) => [label, sub, bySub.get(`${label}/${sub}`) ?? 0]),
            ),
        ),
        '',
        '`unspecified` = the source does not say which game the outfit comes from. Guessing would make these numbers lie.',
        '',
        '## 4. Rejected images',
        '',
        `${rejections.length} images rejected (before or after download, or during visual review), including ` +
            `${failed.length} failed downloads (network errors or HTTP errors after retries; retried on the next run).`,
        '',
        table(
            ['Reason', 'Count'],
            [...byReason].sort((a, b) => b[1] - a[1]).map(([reason, count]) => [`\`${reason}\``, count]),
        ),
        '',
        '## 5. Duplicates',
        '',
        `${duplicates} duplicates skipped (${byReason.get('duplicate-exact') ?? 0} byte-identical by SHA-256, ` +
            `${byReason.get('duplicate-near') ?? 0} visually identical by perceptual hash, e.g. the same photo re-uploaded at another size).`,
        '',
        '## 6. Image quality observations',
        '',
        ...(observations.length ? observations.map((o) => `- ${o}`) : ['- No visual review recorded yet.']),
        '',
        '## 7. Sources and content origin',
        '',
        table(
            ['Source', ...COLLECTION_LABELS, 'Total'],
            sourceNames.map((source) => {
                const perLabel = COLLECTION_LABELS.map((label) => bySourceLabel.get(`${source}|${label}`) ?? 0)
                return [source, ...perLabel, perLabel.reduce((a, b) => a + b, 0)]
            }),
        ),
        '',
        table(
            ['Content origin', ...COLLECTION_LABELS],
            origins.map((origin) => [
                origin,
                ...COLLECTION_LABELS.map((label) => byOriginLabel.get(`${origin}|${label}`) ?? 0),
            ]),
        ),
        '',
        'All sources investigated:',
        '',
        table(
            ['Source', 'Status', 'License', 'Findings'],
            sources.map((s) => [`[${s.name}](${s.url})`, s.status, s.license, s.findings]),
        ),
        '',
        '## 8. Licenses and restrictions',
        '',
        table(
            ['License', 'Images'],
            [...byLicense].sort((a, b) => b[1] - a[1]).map(([license, count]) => [license, count]),
        ),
        '',
        '- **CC BY / CC BY-SA:** credit the author (the `attribution` field of each image in `sources.json`) wherever an ' +
            'image is shown, e.g. in slides or a demo. CC BY-SA also requires sharing adaptations under the same license.',
        '- **Characters, costumes and game screenshots are © Nintendo.** A free license on a photo covers the photo, not ' +
            "Nintendo's character design. Fine for private study; not for redistribution or commercial use.",
        '- **Screenshots without a license** (Hugging Face BotW dataset): local, private training only.',
        '',
        '## 9. Missing categories and insufficient coverage',
        '',
        ...(gaps.length ? gaps.map((gap) => `- ${gap}`) : ['- None.']),
        ...(unaudited.length
            ? [
                  `- ${unaudited.length} images in \`data/raw\` have no recorded origin or license: ` +
                      unaudited.map((file) => `\`${file}\``).join(', ') +
                      '. Document their source or move them out before training.',
              ]
            : []),
        ...COLLECTION_LABELS.map((label) => {
            const total = byLabel.get(label) ?? 0
            const share = (origin: string) =>
                Math.round((100 * (byOriginLabel.get(`${origin}|${label}`) ?? 0)) / (total || 1))
            return `- **${label}** style mix: ${share('official')}% official game content, ${share('fan-made')}% fan-made (cosplay photos, fan art), ${share('unknown')}% unknown.`
        }),
        '',
        '## 10. Recommendations',
        '',
        '1. **Balance at split time:** cap the larger classes or use class weights during training, instead of deleting images.',
        '2. **Add game art for other generations** (NES, A Link to the Past, Wind Waker, Twilight Princess, Skyward Sword, ' +
            'Tears of the Kingdom): your own screenshots, or manual downloads from The Spriters Resource / Models Resource ' +
            'for private study (crop one character per image).',
        '3. **Use Kaggle or Openverse with your own account/API key** to add more licensed photos, then run the ' +
            'collector again (it skips duplicates).',
        '4. **Set `HYRULE_COLLECTOR_CONTACT`** before re-running: Wikimedia allows 20× more requests per minute to clients that identify themselves.',
        '5. **Make `other` broader** (see `data/README.md`): add non-Zelda images (people, animals, other games) so ' +
            'the model does not learn "anything Zelda-looking that is not Link/Zelda".',
        '6. **Split by source group, not by image:** photos from the same photo shoot should land in the same split, ' +
            'otherwise near-identical shots in train and test inflate accuracy.',
        '',
    ]
    return sections.join('\n')
}
