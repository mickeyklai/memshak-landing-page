#!/usr/bin/env node
/**
 * Daily blog: one Sanity `post` per run — Hebrew body (Groq), one mainImage (HF Inference Providers text-to-image).
 *
 * Required env only: SANITY_PROJECT_ID, SANITY_API_WRITE_TOKEN, GROQ_API_KEY, HF_TOKEN
 *
 * Idempotency: slug `${YYYY-MM-DD}-${topicSource}`. If that post exists → exit 0.
 * `--next-slug`: force a new slug for the same day (`…-slug-2`, `…-3`, …).
 * Optional date override: env `BLOG_RUN_DATE=YYYY-MM-DD` (manual run / cron).
 *
 * Topics: rotates built-in slug list (no filesystem topic files).
 *
 * Flags: --dry-run, --stub (needs --dry-run), --next-slug, --no-image (never call HF)
 *
 * By default, publishing requires a main image. If HF image generation/upload throws, the run fails
 * (no post is created). To bypass images explicitly: pass `--no-image`.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { InferenceClient } = require('@huggingface/inference');

function loadEnvFiles() {
    const root = path.join(__dirname, '..');
    function loadFile(name, override) {
        const full = path.join(root, name);
        if (!fs.existsSync(full)) return;
        const text = fs.readFileSync(full, 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const m = trimmed.match(/^export\s+(.+)$/);
            const body = m ? m[1].trim() : trimmed;
            const eq = body.indexOf('=');
            if (eq === -1) continue;
            const key = body.slice(0, eq).trim();
            let val = body.slice(eq + 1).trim();
            const quoted =
                (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
            if (quoted) {
                val = val.slice(1, -1);
            } else {
                val = val.replace(/\s+#.*$/, '').trim();
            }
            if (!key) continue;
            if (override || process.env[key] === undefined) process.env[key] = val;
        }
    }
    loadFile('.env', false);
    loadFile('.env.local', true);
}

loadEnvFiles();

/** Site URL baked in (matches live marketing site). CTAs link here; Groq sees it as context only. */
const SITE_PUBLIC_URL = 'https://www.maliapp.co.il';
const CONTACT_SECTION_URL = `${SITE_PUBLIC_URL}/#contact`;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
/** Routed via Inference Providers (`provider: auto`); not served on legacy hf-inference-only paths. */
const HF_IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell';

const crypto = require('crypto');
const { createClient } = require('@sanity/client');

/** Rotates by calendar day — slugs are Latin for URLs; content is Hebrew in Studio. */
const TOPIC_SLUGS = [
    'five-tips-case-folder-hygiene-national-insurance',
    'five-medical-committee-prep-habits-for-reps',
    'five-ways-to-cut-backoffice-time-mali',
    'five-client-communication-patterns-bi-reps',
    'five-document-types-that-delay-claims',
    'five-checks-before-submitting-to-bituach-leumi',
    'five-privacy-and-file-security-basics',
    'five-onboarding-habits-for-new-rep-teams',
    'five-meeting-prep-templates-committees',
    'five-kpis-to-watch-in-a-rep-practice',
    'five-handoffs-between-intake-and-litigation',
    'five-automation-wins-in-case-software',
    'five-deadline-traps-in-benefit-files',
    'five-quality-controls-for-data-entry',
    'five-scenarios-when-to-escalate-a-file',
    'five-habits-for-audit-ready-archives',
];

function randomKey() {
    return crypto.randomBytes(8).toString('hex');
}

function utcDateString(d = new Date()) {
    return d.toISOString().slice(0, 10);
}

function blogPublicUrl() {
    return SITE_PUBLIC_URL;
}

function contactCtaUrl() {
    return CONTACT_SECTION_URL;
}

/** Calendar-stable index in `0 … moduloLen-1` (used for DOCX outline rows + rotations). */
function rotatingDayIndex(isoDate, moduloLen) {
    if (!moduloLen || moduloLen < 1) return 0;
    const t = Date.parse(`${isoDate}T12:00:00Z`);
    if (Number.isNaN(t)) return 0;
    const d = new Date(t);
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    const day = Math.floor((d - start) / 86400000);
    return day % moduloLen;
}

function normalizeDocRawText(raw) {
    return String(raw || '')
        .replace(/\r/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/\uFF0E/g, '.')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const MIN_IDEA_CHARS = 15;

/**
 * Mali outline .docx: each post is numbered on its **own line** (`1`, `2`, …) followed by
 * category, כותרת, טקסט קצר, הנחיה לתמונה — not `1.` inline (Word table export common shape).
 */
function splitByStandaloneRowNumber(lines) {
    const chunks = [];
    let buf = [];
    let inTable = false;

    function flush() {
        const joined = buf.join('\n').trim();
        buf = [];
        if (!inTable || joined.length < MIN_IDEA_CHARS) {
            return;
        }
        chunks.push(joined);
    }

    for (const line of lines) {
        if (/^\d{1,3}$/.test(line)) {
            flush();
            inTable = true;
            continue;
        }
        if (!inTable) {
            continue;
        }
        buf.push(line);
    }
    flush();
    return chunks;
}

function splitIdeasFromDocText(raw) {
    const text = normalizeDocRawText(raw);
    if (!text) return [];

    const lines = text.split('\n').map((l) => l.replace(/\uFF0E/g, '.').trim()).filter(Boolean);

    const standaloneRows = splitByStandaloneRowNumber(lines);
    if (standaloneRows.length >= 5) {
        return standaloneRows;
    }

    const numberedDigit = /^(\d{1,3})\s*[.)]\s*(.+)$/;
    const numberedHebrew = /^([\u05d0-\u05ea]{1,2})\s*[.)]\s*(.+)$/;
    const chunks = [];
    let buf = [];
    let sawNumberedLine = false;

    function flush() {
        const joined = buf.join('\n').trim().replace(/^(\d{1,3}|[\u05d0-\u05ea]{1,2})\s*[.)]\s+/m, '').trim();
        if (joined.length >= MIN_IDEA_CHARS) chunks.push(joined);
        buf = [];
    }

    for (const line of lines) {
        const nm = line.match(numberedDigit) || line.match(numberedHebrew);
        if (nm) {
            sawNumberedLine = true;
            if (buf.length) flush();
            buf.push(nm[2]);
            continue;
        }
        buf.push(line);
    }
    flush();

    if (chunks.length >= 8 || sawNumberedLine) {
        return chunks.length ? chunks : fallbackIdeaChunks(text);
    }

    const paras = text.split(/\n\s*\n+/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length >= MIN_IDEA_CHARS);

    if (paras.length) return paras;
    return fallbackIdeaChunks(text);
}

function fallbackIdeaChunks(text) {
    const loose = text
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter((p) => p.length >= MIN_IDEA_CHARS);
    if (loose.length) return loose;
    const one = text.replace(/\s+/g, ' ').trim();
    return one.length >= MIN_IDEA_CHARS ? [one] : [];
}

function candidateDocxPaths() {
    const root = path.join(__dirname, '..');
    const paths = [];
    paths.push(path.join(root, 'data', 'blog-topics.docx'));
    paths.push(path.join(root, 'data', 'מלי_50_פוסטים.docx'));
    const home = os.homedir();
    const hebrewName = 'מלי_50_פוסטים.docx';
    if (process.platform === 'darwin' || process.platform === 'linux') {
        paths.push(path.join(home, 'Downloads', hebrewName));
    }
    if (process.platform === 'win32') {
        const base = process.env.USERPROFILE || home;
        paths.push(path.join(base, 'Downloads', hebrewName));
    }
    return [...new Set(paths)];
}

async function extractIdeasFromDocxFilesystem() {
    const mammoth = require('mammoth');
    const tried = [];
    for (const abs of candidateDocxPaths()) {
        tried.push(path.basename(abs));
        if (!fs.existsSync(abs)) continue;
        const result = await mammoth.extractRawText({ path: abs });
        const raw = result.value || '';
        const ideas = splitIdeasFromDocText(raw);
        return {
            ideas,
            sourceBasename: path.basename(abs),
            rawChars: raw.length,
            triedNames: tried,
        };
    }
    return {
        ideas: [],
        sourceBasename: null,
        rawChars: 0,
        triedNames: tried,
    };
}

function slugSegmentFromDocSeed(seedText, outlineIndexZeroBased) {
    const trimmed = String(seedText || '').trim().slice(0, 4000);
    const h = crypto.createHash('sha256').update(`${outlineIndexZeroBased}|${trimmed}`).digest('hex').slice(0, 10);
    const n = outlineIndexZeroBased + 1;
    return `doc-${n}-${h}`;
}

/**
 * Chooses topic from built-in slug list for idempotency.
 * @returns {Promise<{topicSlug:string, seedIdeaText:string, outlineIndex:number, outlineTotal:number, topicSource:string}>}
 */
async function resolveTopicOutline(runDate) {
    const len = TOPIC_SLUGS.length;
    const idx = rotatingDayIndex(runDate, len);
    const seedIdeaText = '';
    const topicSlug = TOPIC_SLUGS[idx];

    const plan = {
        topicSlug,
        seedIdeaText,
        outlineIndex: idx,
        outlineTotal: len,
        topicSource: 'topics-array',
    };

    return plan;
}

function parseArgs(argv) {
    return {
        dryRun: argv.includes('--dry-run'),
        stub: argv.includes('--stub'),
        nextSlug: argv.includes('--next-slug'),
        noImage: argv.includes('--no-image'),
        testImage: argv.includes('--test-image'),
    };
}

function envFileHint() {
    const root = path.join(__dirname, '..');
    return `Local: copy .env.example → ${path.join(root, '.env')} (optional ${path.join(root, '.env.local')}). CI: set repo Secrets SANITY_*, GROQ_API_KEY, HF_TOKEN. Then: npm run publish:daily-blog`;
}

function sanitizeSecretEnv(s) {
    return String(s || '')
        .replace(/\s+#.*$/, '')
        .replace(/[\r\n\t]/g, '')
        .trim();
}

function getWriteClient() {
    const projectId = sanitizeSecretEnv(process.env.SANITY_PROJECT_ID);
    const token = sanitizeSecretEnv(process.env.SANITY_API_WRITE_TOKEN);
    if (!projectId) {
        throw new Error(`SANITY_PROJECT_ID is not set. ${envFileHint()}`);
    }
    if (!token) {
        throw new Error(`SANITY_API_WRITE_TOKEN is not set. ${envFileHint()}`);
    }
    return createClient({
        projectId,
        dataset: 'production',
        apiVersion: '2024-01-01',
        token,
        useCdn: false,
    });
}

async function postExists(client, slug) {
    const id = await client.fetch(`*[_type == "post" && slug.current == $slug][0]._id`, { slug });
    return Boolean(id);
}

async function resolveSlugForRun(client, baseSlug, multiplePerDay) {
    if (!client) return { slug: baseSlug, shouldSkip: false };
    if (!multiplePerDay) {
        if (await postExists(client, baseSlug)) return { slug: baseSlug, shouldSkip: true };
        return { slug: baseSlug, shouldSkip: false };
    }
    if (!(await postExists(client, baseSlug))) return { slug: baseSlug, shouldSkip: false };
    let n = 2;
    for (;;) {
        const candidate = `${baseSlug}-${n}`;
        if (!(await postExists(client, candidate))) return { slug: candidate, shouldSkip: false };
        n += 1;
        if (n > 500) throw new Error('Too many suffixes for same base slug');
    }
}

/** Clean business / legal stock aesthetic for thumbnails. */
const HF_STYLE_PREFIX =
    'Professional editorial photograph for a B2B software blog, Israeli national insurance representatives and law practice context, ';
const HF_STYLE_SUFFIX =
    ', crisp focus, natural balanced lighting, trustworthy corporate mood, 4k, no legible personal data on documents';

const HF_NEGATIVE_PROMPT =
    'text overlay, watermark, logo spoof, readable ID numbers, blurred face identity, cartoon, anime, ' +
    'gore, medical gore, cluttered mess, low resolution, children';

function enhanceImagePrompt(raw) {
    const core =
        String(raw || '').trim() ||
        'clean modern office desk, laptop with generic dashboard blur, neutral folders, coffee cup, soft window light';
    return `${HF_STYLE_PREFIX}${core}${HF_STYLE_SUFFIX}`;
}

/** Text-to-image via Hugging Face Inference Providers (avoids hf-inference-only models like SDXL-turbo). */
async function hfProvidersTextToImageBuffer(token, inputs, parameters) {
    const client = new InferenceClient(token);
    let blob;
    try {
        blob = await client.textToImage({
            model: HF_IMAGE_MODEL,
            inputs,
            provider: 'auto',
            parameters,
        });
    } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e);
        throw new Error(`HF inference providers: ${msg.slice(0, 400)}`);
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.length < 256) throw new Error('HF image returned an empty or too-small response');
    if (buf[0] === 0x7b) {
        const j = JSON.parse(buf.toString('utf8'));
        if (j && typeof j.error === 'string') throw new Error(`HF image: ${j.error}`);
    }
    return buf;
}

async function generateHfImageJpeg(imagePrompt) {
    const hfToken = sanitizeSecretEnv(process.env.HF_TOKEN);
    if (!hfToken) throw new Error('HF_TOKEN is not set');
    const inputs = enhanceImagePrompt(imagePrompt);
    const parameters = {
        num_inference_steps: 4,
        width: 1216,
        height: 832,
        negative_prompt: HF_NEGATIVE_PROMPT,
    };
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            return await hfProvidersTextToImageBuffer(hfToken, inputs, parameters);
        } catch (e) {
            lastErr = e;
            if (attempt < 3) await new Promise((r) => setTimeout(r, 2500 * attempt));
        }
    }
    const msg = lastErr && lastErr.message;
    let hint =
        ' On hf.co/settings/tokens create or edit your token and enable “Inference API” permissions (including Inference Providers billing access if prompted). Until then use: npm run publish:daily-blog -- --no-image --next-slug';
    if (msg && /inference\s*providers|hf-inference|Model not supported/i.test(msg)) {
        hint =
            ' Your HF token needs Inference Providers (and credits where required). Hugging Face → Settings → Access Tokens → enable Inference API / Inference Providers (see hf.co/settings/tokens). Or publish without images: npm run publish:daily-blog -- --no-image --next-slug';
    }
    throw new Error(`HF image failed after 3 tries: ${msg}.${hint}`);
}

function seoBlogImageFilename(slugCurrent, ext, slotIndex) {
    const safe = String(slugCurrent || 'post')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 72);
    const e = (ext || 'jpg').replace(/^\./, '').toLowerCase();
    const slot = typeof slotIndex === 'number' && slotIndex >= 1 ? `-mood-${slotIndex}` : '';
    return `memshak-mali-blog-${safe}${slot}.${e}`;
}

function sanitizeImageCaption(s) {
    return String(s || '')
        .replace(
            /\b(hugging\s*face|huggingface|flux|openai|dall-?e|midjourney|stable\s*diffusion|pexels|ai[- ]?generated|stock\s*photo)\b/gi,
            '',
        )
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, '')
        .trim()
        .slice(0, 220);
}

function figureCaptionFromMeta(slotCaption, postTitle) {
    const raw = sanitizeImageCaption(slotCaption);
    const fallback = postTitle
        ? `${String(postTitle).trim()} · מלי · ניהול תיקים`
        : 'מלי — מערכת מייצגים לביטוח לאומי';
    return raw || fallback;
}

function dryHeroSlot(i, alt) {
    return { assetId: `(dry-run hero-${i + 1})`, attribution: '', alt: alt || `Mood ${i + 1}` };
}

function heroSpecForSlot(heroSpecs, idx, total, context) {
    const base = heroSpecs[idx % heroSpecs.length] || {};
    const n = idx + 1;
    const seedTitle = String((context && context.postTitle) || '').trim();
    const seedTopic = String((context && context.topicSlug) || '').trim().replace(/-/g, ' ');
    const altBase = String(base.imageAlt || `מלי — ניהול תיקי ביטוח לאומי`)
        .replace(/\(\d+\s+of\s+\d+\)$/i, '')
        .replace(/\(\d+\s+מתוך\s+\d+\)\s*$/u, '')
        .trim();
    const capBase = String(base.imageCaption || `מלי · מייצגים`).trim();
    const promptBase = String(base.imagePrompt || '').trim();
    const cycle = Math.floor(idx / heroSpecs.length);
    const anchor = [seedTitle, seedTopic].filter(Boolean).join(' | ');
    const prompt =
        cycle > 0
            ? `${promptBase}; keep same editorial theme${anchor ? ` (${anchor})` : ''}; variation ${cycle + 1}: new angle/lighting/layout, still professional corporate`
            : promptBase;
    return {
        imageAlt: total <= 1 ? altBase : `${altBase} (${n} מתוך ${total})`,
        imageCaption: `${capBase} · תמונה ${n}`,
        imagePrompt: prompt,
    };
}

async function resolveHeroImageSlots(client, runDate, dryRun, meta, heroSpecs, slotCount) {
    const hf = sanitizeSecretEnv(process.env.HF_TOKEN);
    const slugCurrent = (meta.slugCurrent && String(meta.slugCurrent).trim()) || `post-${runDate}`;
    const postTitle = meta.postTitle && String(meta.postTitle).trim();
    const topicSlug = meta.topicSlug && String(meta.topicSlug).trim();
    const totalSlots = Math.max(1, Math.floor(Number(slotCount)) || 1);

    if (!Array.isArray(heroSpecs) || heroSpecs.length < 1) throw new Error('heroSpecs required');

    if (dryRun) {
        return {
            slots: Array.from({ length: totalSlots }, (_, i) =>
                dryHeroSlot(i, heroSpecForSlot(heroSpecs, i, totalSlots, { postTitle, topicSlug }).imageAlt),
            ),
        };
    }

    if (!hf) throw new Error(`HF_TOKEN is not set. ${envFileHint()}`);

    const slots = [];
    for (let i = 0; i < totalSlots; i += 1) {
        const spec = heroSpecForSlot(heroSpecs, i, totalSlots, { postTitle, topicSlug });
        const promptFor =
            (spec.imagePrompt && String(spec.imagePrompt).trim()) ||
            'wide modern open office, blurred laptop screen showing generic charts, neatly stacked anonymized folders, plants, daylight';
        let buf;
        try {
            buf = await generateHfImageJpeg(promptFor);
        } catch (e) {
            const msg = e && e.message ? String(e.message) : String(e);
            throw new Error(`HF image generation failed (slot ${i + 1}/${totalSlots}): ${msg}`);
        }

        const filename = seoBlogImageFilename(slugCurrent, 'png', i + 1);
        let doc;
        try {
            doc = await client.assets.upload('image', buf, { filename });
        } catch (e) {
            const msg = e && e.message ? String(e.message) : String(e);
            throw new Error(`Sanity asset upload failed (slot ${i + 1}/${totalSlots}): ${msg}`);
        }
        slots.push({
            assetId: doc._id,
            attribution: figureCaptionFromMeta(spec.imageCaption, postTitle),
            alt: spec.imageAlt,
        });
    }
    return { slots };
}

function stripJsonFence(text) {
    let s = String(text || '').trim();
    if (s.startsWith('```')) {
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    }
    return s.trim();
}

function normalizeHeroImages(parsed, title) {
    const arr = parsed.heroImages;
    if (!Array.isArray(arr) || arr.length !== 3) {
        throw new Error('Groq JSON: heroImages must be exactly 3 objects');
    }
    const t = String(title || '').trim() || 'מלי';
    return arr.map((item, idx) => {
        const ip = String(item.imagePrompt || '').trim();
        const ia = String(item.imageAlt || '').trim().slice(0, 200);
        const ic = sanitizeImageCaption(
            item.imageCaption || `${t} · מלי · מייצגי ביטוח לאומי · תמונה ${idx + 1}`,
        );
        return {
            imagePrompt:
                ip ||
                'office workspace with anonymized paperwork stacks, neutral palette, daylight, trustworthy business mood',
            imageAlt: ia || `${t} — מלי (${idx + 1} מתוך 3)`,
            imageCaption: ic || `${t} · מלי`,
        };
    });
}

function truncateMiddle(s, max) {
    const t = String(s || '').trim();
    if (t.length <= max) return t;
    const head = Math.floor(max * 0.55);
    const tail = max - head - 3;
    return `${t.slice(0, head)}\n...\n${t.slice(-Math.max(tail, 1))}`;
}

/** מסמך מלי: לרוב 4 שורות לפוסט — קטגוריה, כותרת, טקסט קצר, הנחיה לתמונה (מאמר אחד, לא listicle טיפים). */
function seedLooksLikeSpreadsheetOutline(seed) {
    const lines = seed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.length >= 3 && seed.length > 60;
}

async function generateCopy({ runDate, topicSlug, stub, seedIdeaText }) {
    if (stub) {
        const t = `חמישה טיפים למייצגים — טיוטה ${runDate}`;
        return {
            title: t,
            excerpt: 'טיוטת בדיקה למערך האוטומציה.',
            seoTitle: 'חמישה טיפים למייצגי ביטוח לאומי',
            seoDescription: 'מדריך קצר לניהול תיקים עם מלי — טיוטה.',
            seoSnippet: 'חמישה טיפים מעשיים למייצגי ביטוח לאומי, עם מלי לניהול תיקים.',
            focusKeyword: 'מייצגים ביטוח לאומי',
            keywords: ['ביטוח לאומי', 'מייצגים', 'מלי', 'ניהול תיקים'],
            paragraphs: [
                'פסקה ראשונה לדוגמה — נושא היום.',
                'טיפ ראשון לדוגמה עם פירוט קצר.',
                'טיפ שני לדוגמה עם פירוט קצר.',
                'טיפ שלישי לדוגמה עם פירוט קצר.',
                'טיפ רביעי לדוגמה עם פירוט קצר.',
                'טיפ חמישי לדוגמה עם פירוט קצר.',
                'גשר למערכת מלי והדגמה — בלי להדביק קישורים גולמיים.',
            ],
            heroImages: [
                {
                    imageAlt: 'משרד מודרני ומסמכים מאורגנים',
                    imageCaption: 'מלי · ארגון תיקים',
                    imagePrompt:
                        'clean legal office desk, stacked neutral folders without readable text, silver laptop slightly blurred screen, succulent plant, daylight from side window',
                },
                {
                    imageAlt: 'פגישת צוות מקצועית',
                    imageCaption: 'מלי · שיתוף פעולה',
                    imagePrompt:
                        'small professional team reviewing printed charts on conference table, candid business mood, neutral suits, shallow depth',
                },
                {
                    imageAlt: 'תכנון לוח זמנים',
                    imageCaption: 'מלי · שליטה בלוחות זמנים',
                    imagePrompt:
                        'close hands pointing at planner on desk next to muted keyboard, analog clock blurred background, trustworthy productivity',
                },
            ],
        };
    }

    const apiKey = sanitizeSecretEnv(process.env.GROQ_API_KEY);
    if (!apiKey) throw new Error('GROQ_API_KEY is not set');

    const model = GROQ_MODEL;
    const themeHint = topicSlug.replace(/-/g, ' ');
    const siteOrigin = blogPublicUrl();
    const demoUrl = contactCtaUrl();
    const seed = String(seedIdeaText || '').trim();
    const outlineMode = seedLooksLikeSpreadsheetOutline(seed);

    const seedBlock = seed.length
        ? outlineMode
            ? `טיוטה עורכית ממערכת ההפצה של מלי בפורמט של עד ארבע שורות בתוך המרכאות (בדרך כלל: קטגוריה, כותרת הטור, טקסט קצר למאמר השלם, ובסוף **הנחיה לתמונה** למעצב/לתמונה). במאמר הנשלח הפכו את הרעיון למאמר **אחיד** ארוך ובהיר: כוונה צריכה להישמר; מותר ניסוח מלא מחדש; אין העתקה מילולית. שורת ההנחיה לתמונה חייבת לשמש בסיס ברור לאנגלית ב-imagePrompt.\n"""${truncateMiddle(seed, 3400)}"""\n\n`
            : `רעיון מומלץ מתוך מסמך הנושאים (שמרו את הכוונה; כתבו טקסט מלא משלכם, לא העתקה).\n"""${truncateMiddle(seed, 3400)}"""\n\n`
        : '';

    const outlineArticleSpec = `
${seedBlock}בנו **מאמר אחד מגובש** סביב הטיוטה — למייצגים ובעלי משרדים הנוגעים לביטוח לאומי, עומס תיק ומלי. **לא** listicle בשם «חמישה טיפים».

מבנה:
- כותרת למאמר: מתאימה לשורת הכותרת בטיוטה אך בהירה ומתוחכמת; אל תגרעו מהמתח העיקרי של הנושא.
- בדיוק 7 פסקאות קצרות־בינוניות בלי bullets וללא HTML:
  פסקה 1 — פיתוח פתיחה מהכותרת / הבטחת הפתיח מהטיוטה, מנקודת מבט המייצג או הצוות.
  פסקאות 2–5 — הרחבת **הטקסט הקצר** לזוויות שונות (השלכות, דוגמה, דילמה מקצועית, פעולה מעשית) כתבנית רציפה — בלי מתכונת דיבור בסגנון "טיפ ראשון, טיפ שני".
  פסקה 6 — דיון בשינוי ההרגלים ובדחיפת עומס ארגון מידע (בלי ייעוץ משפטי ישיר).
  פסקה 7 — גשר לעבודה דיגיטלית ובשימוש בכלים כמו מלי — בלי URL ובלי טקסט https.

`;

    const listicleSpec = `
${seedBlock}בחרו מתוך המידע הנ"ל ובנו מאמר עם **חמישה טיפים מעשיים** ברורים למייצגים (לא ספרות ולא ציטוט מאמר חיצוני). אם הגיע טקסט יעד ממסמך — הפוסט צריך לשרת במדויק את אותה כוונה.

מבנה:
- כותרת בפורמט "חמישה …" הרלוונטי לנושא (מילות חיפוש: ניהול תיקים, ביטוח לאומי, מייצגים).
- בדיוק 7 פסקאות קצרות־בינוניות, בלי bullets ובלי HTML:
  פסקה 1 — פתיחה שמתארת את כאבי המייצגים בהקשר הנושא.
  פסקאות 2–6 — בכל פסקה טיפ מעשי אחד, מעוגן בשפה (למשל "הטיפ הראשון...") בסך חמישה טיפים על חמש הפסקאות הללו.
  פסקה 7 — גשר קצר למערכת מלי (ארגון דיגיטלי, חיסכון בזמן) — בלי URL.

`;

    const heroImageSpecListicle =
        'heroImages: בדיוק 3 אובייקטים עם imageAlt ו-imageCaption בעברית; כל שדה imagePrompt באנגלית (לייצוג תמונה) באורך כ-28–42 מילים — התמונה **משקפת את התוכן** בכותרת ובפרקים (לא משרד גנרי בלבד). שלוש הסצינות שונות. מסמכים מטושטשים בלבד ללא טקסט קריא, ללא תמונה של קטינים, ללא אלימות או פרוצדורות רפואיות גלויות.';

    const heroImageSpecOutline =
        'heroImages: בדיוק 3 אובייקטים עם imageAlt ו-imageCaption בעברית. כל imagePrompt באנגלית באורך כ-28–42 מילים — שלוש סצינות שונות מההנחיה לתמונה בשורת הסיום ובהמשך הגיוני לגוף המאמר, למשל שעון ומספרים, אינפוגרפיקה מטושטשת, השוואה לפני ואחרי, לוגו מטושטש. אל תכללו טקסט קריא על מסמכים ואל צלם אלימות רפואית מפורשת או ילדים.';

    const prompt = `אתם כותבים תוכן שיווקי־חינוכי בעברית לבלוג של "מלי" — תוכנה לניהול תיקים למייצגי ביטוח לאומי ולמשרדי ייצוג (לא עורך דין מתאר את עצמו כנותן ייעוץ משפטי; הטון מקצועי־כללי ובטוח משפטית).

כל הפלט בעברית מודרנית, RTL. הפלט — אובייקט JSON בלבד.

תאריך לוגי: ${runDate}. slug טכני: "${topicSlug}". עזרה: "${themeHint}".

אל תכללו ב-paragraphs כתובת https גולמית או קישור לדמו; קישור הדגמה נוסף אוטומטית למאמר.
הקשר: אתר ציבורי ${siteOrigin} · טופס יצירת קשר / הדגמה: ${demoUrl}.

${outlineMode ? outlineArticleSpec : listicleSpec}

שדות SEO:
seoTitle עד כ-62 תווים, seoDescription ~145–165 תווים, seoSnippet משפט אחד עד ~200 תווים, focusKeyword בעברית, keywords 7–12 ללא תו #.

${outlineMode ? heroImageSpecOutline : heroImageSpecListicle}

החוזה:
{
  "title": "...",
  "excerpt": "...",
  "seoTitle": "...",
  "seoDescription": "...",
  "seoSnippet": "...",
  "focusKeyword": "...",
  "keywords": ["..."],
  "paragraphs": ["..."],
  "heroImages": [
    { "imageAlt": "...", "imageCaption": "...", "imagePrompt": "english scene description..." },
    { "imageAlt": "...", "imageCaption": "...", "imagePrompt": "..." },
    { "imageAlt": "...", "imageCaption": "...", "imagePrompt": "..." }
  ]
}

החזירו רק את אובייקט ה-JSON, ללא markdown.`;

    async function groqCall(attempt) {
        const strictSystem =
            'You MUST output a single valid JSON object only. ' +
            'No markdown. No code fences. Do not wrap in ```json. ' +
            'Output must start with { and end with }. Hebrew user-facing strings.';
        const strictUser =
            prompt +
            '\n\nאילוץ טכני: הפלט חייב להתחיל בתו { ולהסתיים בתו } בלבד. בלי ``` ובלי טקסט מסביב.';

        const useResponseFormat = attempt === 1; // If Groq rejects json_object, fallback to plain completion.
        const temperature = attempt === 1 ? 0.55 : attempt === 2 ? 0.25 : 0.15;

        const body = {
            model,
            temperature,
            max_tokens: 6144,
            messages: [
                { role: 'system', content: strictSystem },
                { role: 'user', content: strictUser },
            ],
        };
        if (useResponseFormat) {
            body.response_format = { type: 'json_object' };
        }

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            const clipped = errText.slice(0, 700);
            const hint =
                res.status === 400 && /json_validate_failed|Failed to generate JSON/i.test(errText)
                    ? ' (Groq json_validate_failed; retrying with stricter settings)'
                    : '';
            const err = new Error(`Groq ${res.status}: ${clipped}${hint}`);
            err._groqStatus = res.status;
            err._groqBody = errText;
            throw err;
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        return JSON.parse(stripJsonFence(content));
    }

    let parsed;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            parsed = await groqCall(attempt);
            break;
        } catch (e) {
            lastErr = e;
            if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 1200 * attempt));
                continue;
            }
        }
    }
    if (!parsed) throw lastErr || new Error('Groq failed');

    if (!parsed.title || !Array.isArray(parsed.paragraphs)) {
        throw new Error('Groq JSON missing title or paragraphs');
    }

    const paragraphs = parsed.paragraphs.map((p) => String(p).trim()).filter(Boolean);
    if (paragraphs.length < 7) {
        throw new Error(
            outlineMode
                ? `Need ≥7 paragraphs (outline article + Mali bridge), got ${paragraphs.length}`
                : `Need ≥7 paragraphs (intro + 5 tips + Mali bridge), got ${paragraphs.length}`,
        );
    }

    const title = String(parsed.title).trim();
    const heroImages = normalizeHeroImages(parsed, title);

    return {
        title,
        excerpt: String(parsed.excerpt || '').trim(),
        seoTitle: String(parsed.seoTitle || '').trim().slice(0, 70),
        seoDescription: String(parsed.seoDescription || '').trim().slice(0, 320),
        seoSnippet: String(parsed.seoSnippet || '').trim().slice(0, 280) || String(parsed.seoDescription || '').trim().slice(0, 200),
        focusKeyword: String(parsed.focusKeyword || '').trim().slice(0, 80),
        keywords: Array.isArray(parsed.keywords)
            ? parsed.keywords.map((k) => String(k || '').trim()).filter(Boolean).slice(0, 12)
            : [],
        paragraphs,
        heroImages,
    };
}

function textBlock(text, style) {
    return {
        _type: 'block',
        _key: randomKey(),
        style: style || 'normal',
        markDefs: [],
        children: [{ _type: 'span', marks: [], text }],
    };
}

function imageBlock(assetId, alt, caption) {
    return {
        _type: 'image',
        _key: randomKey(),
        asset: { _type: 'reference', _ref: assetId },
        alt: alt || '',
        ...(caption ? { caption } : {}),
    };
}

function stripContactUrls(paragraphs, contactUrl) {
    const nu = String(contactUrl || '').trim();
    const origin = blogPublicUrl();
    const needles = [...new Set([nu, `${origin}/#contact`, `${origin}#contact`, origin].filter(Boolean))];
    return paragraphs.map((p) => {
        let t = String(p);
        for (const pat of needles) {
            const esc = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            t = t.replace(new RegExp(esc, 'gi'), ' ');
        }
        return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
    });
}

function contactCtaBlock(url) {
    const href = String(url || '').trim() || contactCtaUrl();
    const linkKey = randomKey();
    const linkLabel = 'קבעו הדגמה חינם';
    const before = 'רוצים לראות איך מלי חוסכת זמן בניהול התיקים? ';
    const after = 'מתוך טופס יצירת הקשר בעמוד.';

    return {
        _type: 'block',
        _key: randomKey(),
        style: 'normal',
        markDefs: [{ _type: 'link', _key: linkKey, href }],
        children: [
            { _type: 'span', marks: [], text: `${before}` },
            { _type: 'span', marks: [linkKey], text: linkLabel },
            { _type: 'span', marks: [], text: ` ${after}` },
        ],
    };
}

/** @param {Array<{ assetId: string, alt: string, attribution?: string }>} slots */
function buildBodyWithImages(paragraphs, slots, contactUrl) {
    const cta = String(contactUrl || '').trim() || contactCtaUrl();
    const cleaned = stripContactUrls(Array.isArray(paragraphs) ? paragraphs : [], cta).filter(Boolean);
    const n = Array.isArray(slots) ? slots.length : 0;
    if (n > 0 && cleaned.length < 7) throw new Error(`Need ≥7 paragraphs when using inline images, got ${cleaned.length}`);
    if (n > cleaned.length) throw new Error(`Need ≥${n} paragraphs to place ${n} inline images`);
    const body = [];
    for (let i = 0; i < n; i += 1) {
        body.push(textBlock(cleaned[i], 'normal'));
        body.push(imageBlock(slots[i].assetId, slots[i].alt, slots[i].attribution));
    }
    for (let i = n; i < cleaned.length; i += 1) {
        body.push(textBlock(cleaned[i], 'normal'));
    }
    body.push(contactCtaBlock(cta));
    return body;
}

async function testHfImageOnly() {
    const outDir = path.join(__dirname, '..', 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'hf-test.png');

    const prompt =
        process.env.BLOG_TEST_IMAGE_PROMPT ||
        'clean modern office desk, anonymized folders (no readable text), laptop with blurred dashboard, daylight, trustworthy corporate mood';

    console.log('[publish-daily-blog] --test-image: generating one HF image…');
    const buf = await generateHfImageJpeg(prompt);
    fs.writeFileSync(outPath, buf);
    console.log('[publish-daily-blog] --test-image: wrote', outPath, `(${buf.length} bytes)`);
}

async function main() {
    const { dryRun, stub, nextSlug, noImage, testImage } = parseArgs(process.argv.slice(2));

    if (testImage) {
        await testHfImageOnly();
        process.exit(0);
    }
    // Default: require image unless explicitly disabled.
    const requireImage = sanitizeSecretEnv(process.env.BLOG_REQUIRE_IMAGE).toLowerCase() !== 'false';
    const runDate = process.env.BLOG_RUN_DATE || utcDateString();
    const outline = await resolveTopicOutline(runDate);
    const topicSlug = outline.topicSlug;
    const baseSlug = `${runDate}-${topicSlug}`;
    const multiplePerDay = Boolean(nextSlug);

    const publishedAt = new Date().toISOString();

    let client = null;
    if (!dryRun || (process.env.SANITY_API_WRITE_TOKEN && process.env.SANITY_PROJECT_ID)) {
        try {
            client = getWriteClient();
        } catch (e) {
            if (!dryRun) throw e;
        }
    }
    if (!dryRun) {
        const pid = sanitizeSecretEnv(process.env.SANITY_PROJECT_ID);
        console.log(`[publish-daily-blog] Sanity: projectId=${pid || '(missing)'} dataset=production`);
    }

    const { slug: slugCurrent, shouldSkip } = await resolveSlugForRun(client, baseSlug, multiplePerDay);
    if (shouldSkip) {
        console.log(
            dryRun
                ? `[dry-run] Post exists — skip (slug ${slugCurrent}).`
                : `[publish-daily-blog] Post exists — idempotent exit (slug ${slugCurrent}).`,
        );
        process.exit(0);
    }

    if (noImage && !dryRun) {
        console.log('[publish-daily-blog] --no-image: creating post without mainImage (Groq + Sanity only).');
    }

    console.log(
        multiplePerDay && slugCurrent !== baseSlug
            ? `UTC ${runDate} topic ${topicSlug} slug ${slugCurrent} (multipart)`
            : `UTC ${runDate} topic ${topicSlug} slug ${slugCurrent}`,
    );

    const copy = await generateCopy({ runDate, topicSlug, stub, seedIdeaText: outline.seedIdeaText });
    const bodyImageCount = 0;
    const heroSlotCount = noImage ? 0 : 1;
    let slots = [];
    if (noImage) {
        if (dryRun) {
            slots = Array.from({ length: 1 }, (_, i) => dryHeroSlot(i, '— no image (dry run)'));
        }
    } else {
        try {
            const r = await resolveHeroImageSlots(client || {}, runDate, dryRun, {
                slugCurrent,
                postTitle: copy.title,
                topicSlug,
            }, copy.heroImages, heroSlotCount);
            slots = r.slots;
        } catch (imgErr) {
            if (dryRun) throw imgErr;
            if (requireImage) throw imgErr;
            console.warn(
                '[publish-daily-blog] Image generation failed; publishing post without mainImage.',
                imgErr && imgErr.message,
            );
            slots = [];
        }
    }

    const cUrl = contactCtaUrl();
    const allDrySlots = slots.length > 0 && slots.every((s) => String(s.assetId).startsWith('('));
    const omitMainImage = noImage || allDrySlots || slots.length < 1;
    const bodySlots = slots.slice(0, bodyImageCount);
    const body =
        copy.paragraphs.length >= 7
            ? buildBodyWithImages(copy.paragraphs, bodySlots, cUrl)
            : [
                  textBlock(copy.paragraphs[0] || 'מבוא'),
                  textBlock(copy.paragraphs[1] || ''),
                  contactCtaBlock(cUrl),
              ];

    const firstHero = slots[0];
    const evergreen = ['ביטוח לאומי', 'מלי', 'מייצגים'];
    const mergedKeywords = [];
    const seenKw = new Set();
    for (const raw of [
        ...(copy.keywords || []),
        ...(copy.focusKeyword ? [copy.focusKeyword] : []),
        ...evergreen,
    ]) {
        const k = String(raw || '').trim();
        if (!k) continue;
        const low = k.toLowerCase();
        if (seenKw.has(low)) continue;
        seenKw.add(low);
        mergedKeywords.push(k);
        if (mergedKeywords.length >= 22) break;
    }

    const doc = {
        _type: 'post',
        title: copy.title,
        slug: { _type: 'slug', current: slugCurrent },
        publishedAt,
        excerpt: copy.excerpt,
        ...(copy.seoTitle ? { seoTitle: copy.seoTitle } : {}),
        ...(copy.seoDescription ? { seoDescription: copy.seoDescription } : {}),
        ...(copy.seoSnippet ? { seoSnippet: copy.seoSnippet } : {}),
        ...(copy.focusKeyword ? { focusKeyword: copy.focusKeyword } : {}),
        ...(mergedKeywords.length ? { keywords: mergedKeywords } : {}),
        ...(omitMainImage || !firstHero
            ? {}
            : {
                  mainImage: {
                      _type: 'image',
                      asset: { _type: 'reference', _ref: firstHero.assetId },
                      alt: firstHero.alt,
                  },
              }),
        body,
    };

    if (dryRun) {
        console.log('[dry-run] Document preview:', JSON.stringify(doc, null, 2));
        process.exit(0);
    }

    if (!client) throw new Error('Sanity client unavailable');

    const created = await client.create(doc);
    console.log('Created post:', created._id, slugCurrent);

    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
