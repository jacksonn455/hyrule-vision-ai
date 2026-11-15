/**
 * Findings of the source investigation (October 2026). Kept as data so the collection report always states
 * which sources were considered, which were used and why the others were not.
 * The full comparison is in docs/research/IMAGE-SOURCES-RESEARCH.md.
 */
export interface SourceFinding {
    name: string
    url: string
    status: 'used' | 'not used' | 'manual step required'
    license: string
    findings: string
}

export const SOURCE_FINDINGS: readonly SourceFinding[] = [
    {
        name: 'Hugging Face: deepghs/character_index',
        url: 'https://huggingface.co/datasets/deepghs/character_index',
        status: 'used',
        license: 'Index dataset MIT; each image is fan art © its artist, characters © Nintendo',
        findings:
            '28 Zelda characters, each with images.zip of ~50 person crops from Danbooru fan art plus post metadata ' +
            '(rating, artist, source, game tags). Kept only ratings g/s, single-person crops of the expected character; ' +
            'game sub-folder from the post copyright tags. Sheik, Wolf Link, Fierce Deity, Navi, Korok, Majora, Revali left out.',
    },
    {
        name: 'Wikimedia Commons',
        url: 'https://commons.wikimedia.org/wiki/Category:Cosplay_of_The_Legend_of_Zelda',
        status: 'used',
        license: 'Per file: CC BY, CC BY-SA, CC0 or public domain (verified per image from Commons metadata)',
        findings:
            'Public MediaWiki API, no account needed. Freely licensed cosplay photos of Link, Zelda and ~40 other Zelda ' +
            'characters, plus photos of Zelda objects. Attribution is required for CC BY/BY-SA: recorded per image. ' +
            'Rate limit for clients without contact info is 10 req/min (we stay below it). The fan-art category has 2 files.',
    },
    {
        name: 'English Wikipedia (character articles)',
        url: 'https://en.wikipedia.org/wiki/Link_(The_Legend_of_Zelda)',
        status: 'used',
        license: 'Non-free official artwork © Nintendo, hosted under fair use',
        findings:
            '17 hand-picked official artworks/screenshots (one character each) from the Link, Zelda, Ganon, Midna, Tingle ' +
            'and Navi articles, read through the MediaWiki API. Small, but the only automatable official art across generations.',
    },
    {
        name: 'Hugging Face: XeIaso/botw-screenshots-captioned',
        url: 'https://huggingface.co/datasets/XeIaso/botw-screenshots-captioned',
        status: 'used',
        license: 'None stated. Screenshots of a Nintendo game (© Nintendo)',
        findings:
            '728 captioned Breath of the Wild screenshots (1280×720). Public and not gated; read through the official ' +
            'datasets-server API. No license file, so the images are used only locally for private, non-commercial ' +
            'training and must not be redistributed. Captions are pre-labels only (some are wrong) and were reviewed visually.',
    },
    {
        name: 'The Spriters Resource / The Models Resource',
        url: 'https://www.spriters-resource.com/',
        status: 'manual step required',
        license: 'Ripped Nintendo assets (© Nintendo); custom sheets © their makers. The site owns no rights',
        findings:
            'robots.txt allows asset pages, but every page and download answers automated clients with HTTP 403 ' +
            '"cf-mitigated: challenge" (Cloudflare bot check), which we do not bypass. Download sheets in a browser into ' +
            'data/inbox/sprite-sheets/<label>/<subcategory>/ and run ml:import-images: frames are cut out automatically.',
    },
    {
        name: 'Hugging Face: nroggendorff/zelda-style',
        url: 'https://huggingface.co/datasets/nroggendorff/zelda-style',
        status: 'not used',
        license: 'Tagged MIT, no provenance (third-party art)',
        findings:
            '75 BotW-style artworks with generic auto-captions that never name the character ("a cartoon image of a man ' +
            'with a hammer"); many show several characters or landscapes. Usable only by labelling by hand.',
    },
    {
        name: 'Hugging Face: other "zelda" datasets',
        url: 'https://huggingface.co/datasets?search=zelda',
        status: 'not used',
        license: 'Mixed / unknown',
        findings:
            'DJ-Research/GameBoy-legend_of_zelda_*: 160×144 gameplay frames where Link is a few pixels. ' +
            'jomarie04/all_zelda_games: a 17-row CSV. FileUploader/Legend_of_zelda: no images, looks like spam. ' +
            'Others are audio, NLP or reinforcement-learning data.',
    },
    {
        name: 'Kaggle',
        url: 'https://www.kaggle.com/datasets?search=zelda',
        status: 'manual step required',
        license: 'Per dataset',
        findings:
            'No Zelda character image dataset found (only tabular game lists). Searching and downloading need a Kaggle ' +
            'account and API token (~/.kaggle/kaggle.json). Any dataset found later can go through data/inbox.',
    },
    {
        name: 'GitHub',
        url: 'https://github.com/search?q=zelda+dataset&type=repositories',
        status: 'not used',
        license: 'n/a',
        findings: 'Repository search for Zelda image/sprite datasets returned no relevant repositories.',
    },
    {
        name: 'Zelda Wiki (zeldawiki.wiki)',
        url: 'https://zeldawiki.wiki/',
        status: 'not used',
        license: 'Official artwork and screenshots © Nintendo',
        findings:
            'Best catalogue of official character art per game, but its robots.txt disallows AI crawlers entirely ' +
            '(ClaudeBot, GPTBot, ImagesiftBot, Meta-ExternalAgent: "Disallow: /"). Treated as an explicit opt-out.',
    },
    {
        name: 'Zeldapedia (Fandom) / Zelda Dungeon',
        url: 'https://zelda.fandom.com/',
        status: 'not used',
        license: 'Official artwork and screenshots © Nintendo',
        findings: 'Both answer automated requests with a Cloudflare JavaScript challenge (HTTP 403). Not bypassed.',
    },
    {
        name: 'Openverse (Flickr CC photos)',
        url: 'https://openverse.org/',
        status: 'manual step required',
        license: 'Per image: CC licenses incl. NC/ND',
        findings:
            '~240 results for Link/Zelda cosplay, but the Terms of Service forbid scraping the catalogue and require a ' +
            'registered API key for heavy use. Could be used with a registered key and modest, documented queries.',
    },
    {
        name: 'Google Images',
        url: 'https://images.google.com/',
        status: 'manual step required',
        license: 'Unknown per image',
        findings:
            "Automated access to Google Search is prohibited by Google's terms. Images saved by hand can be imported " +
            'with ml:import-images (bulk, drag-and-drop folders); the browser-recorded source URL is kept when present.',
    },
]
