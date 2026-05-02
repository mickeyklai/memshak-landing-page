'use strict';

const { getSanityClient } = require('../../lib/sanity');

const DETAIL_QUERY = `
  *[_type == "post" && !(_id in path("drafts.**")) && slug.current == $slug][0] {
    title,
    "slug": slug.current,
    publishedAt,
    _updatedAt,
    excerpt,
    seoTitle,
    seoDescription,
    seoSnippet,
    keywords,
    focusKeyword,
    noindex,
    seoImage {
      ...,
      asset->{
        _id,
        url,
        metadata {
          dimensions {
            width,
            height
          }
        }
      }
    },
    mainImage {
      ...,
      asset->{
        _id,
        url,
        metadata {
          dimensions {
            width,
            height
          }
        }
      }
    },
    body[]{
      ...,
      _type == "image" => {
        ...,
        asset->{
          _id,
          url,
          metadata {
            dimensions {
              width,
              height
            }
          }
        }
      }
    }
  }
`;

const IMG_BODY_MAX_W = 1400;
const IMG_OG_W = 1200;
const IMG_QUALITY = 82;

const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=0, must-revalidate, s-maxage=60',
};

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function wrapMarks(text, marks, markDefs) {
    let out = text;
    for (const mark of marks || []) {
        if (mark === 'strong' || mark === 'b') {
            out = `<strong>${out}</strong>`;
        } else if (mark === 'em' || mark === 'i') {
            out = `<em>${out}</em>`;
        } else if (mark === 'strike-through') {
            out = `<del>${out}</del>`;
        } else if (mark === 'code') {
            out = `<code>${out}</code>`;
        } else if (mark === 'u' || mark === 'underline') {
            out = `<u>${out}</u>`;
        } else {
            const def = (markDefs || []).find((m) => m._key === mark);
            if (def && def._type === 'link' && def.href) {
                const href = escapeHtml(def.href);
                const ext = /^https?:\/\//i.test(def.href);
                const extra = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
                out = `<a href="${href}"${extra}>${out}</a>`;
            }
        }
    }
    return out;
}

function serializeSpans(children, markDefs) {
    if (!Array.isArray(children)) {
        return '';
    }
    return children
        .map((child) => {
            if (!child || child._type !== 'span') {
                return '';
            }
            const raw = escapeHtml(child.text || '');
            return wrapMarks(raw, child.marks, markDefs);
        })
        .join('');
}

function sanityWebpUrl(block, builder, maxWidth) {
    const asset = block && block.asset;
    if (!asset || typeof asset !== 'object') {
        return '';
    }

    let url = '';
    if (builder) {
        try {
            url = builder
                .image(block)
                .width(Math.max(320, Math.min(maxWidth, 2048)))
                .fit('max')
                .quality(IMG_QUALITY)
                .format('webp')
                .url();
        } catch (_) {
            /* malformed crop/ref */
        }
    }

    if (!url && typeof asset.url === 'string' && /^https?:\/\//i.test(asset.url)) {
        const base = asset.url.split('?')[0];
        const w = Math.max(320, Math.min(maxWidth, 2048));
        url = `${base}?w=${w}&fm=webp&q=${IMG_QUALITY}&fit=max`;
    }

    return url || '';
}

function imgDimensionScaled(block, maxDisplayWidth) {
    const d = block && block.asset && block.asset.metadata && block.asset.metadata.dimensions;
    if (!d || typeof d.width !== 'number' || typeof d.height !== 'number') {
        return '';
    }
    const wNat = Math.round(d.width);
    const hNat = Math.round(d.height);
    if (wNat <= 0 || hNat <= 0) {
        return '';
    }
    const wOut = Math.min(maxDisplayWidth, wNat);
    const hOut = Math.round((hNat * wOut) / wNat);
    return ` width="${wOut}" height="${hOut}"`;
}

function imageBlockToHtml(url, loadingAttr, block) {
    if (!url) {
        return '';
    }
    const loading = loadingAttr === 'eager' ? 'eager' : 'lazy';
    const dim = imgDimensionScaled(block, IMG_BODY_MAX_W);
    const altRaw = block && typeof block.alt === 'string' ? block.alt : '';
    const alt = escapeHtml(altRaw);
    const capRaw = block && typeof block.caption === 'string' ? block.caption.trim() : '';
    const caption =
        capRaw === ''
            ? ''
            : `<figcaption class="blog-prose-caption">${escapeHtml(capRaw)}</figcaption>`;
    return (
        '<figure class="blog-prose-figure">' +
        `<img src="${escapeHtml(url)}" alt="${alt}" loading="${loading}" decoding="async"${dim} sizes="(max-width: 900px) 100vw, 860px" />` +
        caption +
        '</figure>'
    );
}

function pickOgImageBlock(doc) {
    if (doc && doc.seoImage && doc.seoImage.asset) {
        return doc.seoImage;
    }
    if (doc && doc.mainImage && doc.mainImage.asset) {
        return doc.mainImage;
    }
    if (doc && Array.isArray(doc.body)) {
        const first = doc.body.find((b) => b && b._type === 'image' && b.asset);
        if (first) {
            return first;
        }
    }
    return null;
}

function ogImageFields(doc, imageOpts) {
    const block = pickOgImageBlock(doc);
    if (!block) {
        return { ogImage: '', ogImageWidth: null, ogImageHeight: null };
    }
    const builder =
        imageOpts.projectId &&
        String(imageOpts.projectId).trim() &&
        typeof imageOpts.createImageUrlBuilder === 'function'
            ? imageOpts.createImageUrlBuilder({
                  projectId: String(imageOpts.projectId).trim(),
                  dataset: imageOpts.dataset || 'production',
              })
            : null;
    let url = sanityWebpUrl(block, builder, IMG_OG_W);
    if (!url && block.asset && typeof block.asset.url === 'string') {
        const base = block.asset.url.split('?')[0];
        url = `${base}?w=${IMG_OG_W}&fm=webp&q=${IMG_QUALITY}&fit=max`;
    }
    const d = block.asset && block.asset.metadata && block.asset.metadata.dimensions;
    const w = d && typeof d.width === 'number' ? d.width : null;
    const h = d && typeof d.height === 'number' ? d.height : null;
    return { ogImage: url || '', ogImageWidth: w, ogImageHeight: h };
}

function collectImageUrls(blocks, { projectId, dataset, createImageUrlBuilder } = {}) {
    if (!Array.isArray(blocks)) {
        return [];
    }
    const builder =
        projectId && String(projectId).trim() && typeof createImageUrlBuilder === 'function'
            ? createImageUrlBuilder({ projectId: String(projectId).trim(), dataset: dataset || 'production' })
            : null;
    const urls = [];
    for (const block of blocks) {
        if (block && block._type === 'image') {
            const u = sanityWebpUrl(block, builder, IMG_BODY_MAX_W);
            if (u) {
                urls.push(u);
            }
        }
    }
    return urls;
}

function portableTextToHtml(blocks, { projectId, dataset, createImageUrlBuilder } = {}) {
    if (!Array.isArray(blocks)) {
        return '';
    }
    const builder =
        projectId && String(projectId).trim() && typeof createImageUrlBuilder === 'function'
            ? createImageUrlBuilder({ projectId: String(projectId).trim(), dataset: dataset || 'production' })
            : null;
    let imageIndex = 0;
    const parts = [];
    for (const block of blocks) {
        if (block && block._type === 'image') {
            const url = sanityWebpUrl(block, builder, IMG_BODY_MAX_W);
            imageIndex += 1;
            const loadingAttr = imageIndex === 1 ? 'eager' : 'lazy';
            const imgHtml = imageBlockToHtml(url, loadingAttr, block);
            if (imgHtml) {
                parts.push(imgHtml);
            }
            continue;
        }
        if (!block || block._type !== 'block' || !block.children) {
            continue;
        }
        const inner = serializeSpans(block.children, block.markDefs);
        const style = block.style || 'normal';
        if (style === 'h1') {
            parts.push(`<h1>${inner}</h1>`);
        } else if (style === 'h2') {
            parts.push(`<h2>${inner}</h2>`);
        } else if (style === 'h3') {
            parts.push(`<h3>${inner}</h3>`);
        } else if (style === 'h4') {
            parts.push(`<h4>${inner}</h4>`);
        } else if (style === 'blockquote') {
            parts.push(`<blockquote><p>${inner}</p></blockquote>`);
        } else {
            parts.push(`<p>${inner}</p>`);
        }
    }
    return parts.join('\n');
}

function mergeKeywords(doc) {
    const out = [];
    const seen = new Set();
    function add(s) {
        const x = String(s || '').trim();
        if (!x) return;
        const k = x.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        out.push(x);
    }
    if (Array.isArray(doc.keywords)) {
        doc.keywords.forEach((item) => add(item));
    }
    if (doc.focusKeyword) {
        add(doc.focusKeyword);
    }
    return out.slice(0, 24);
}

exports.handler = async function handler(event) {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    const slug =
        event.queryStringParameters && event.queryStringParameters.slug
            ? String(event.queryStringParameters.slug).trim()
            : '';

    if (!slug) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing slug' }),
        };
    }

    try {
        const client = getSanityClient({ useCdn: false });
        const doc = await client.fetch(DETAIL_QUERY, { slug });
        if (!doc) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Not found' }),
            };
        }

        const { createImageUrlBuilder } = await import('@sanity/image-url');
        const imageOpts = {
            projectId: process.env.SANITY_PROJECT_ID,
            dataset: process.env.SANITY_DATASET || 'production',
            createImageUrlBuilder,
        };
        const builder =
            imageOpts.projectId &&
            String(imageOpts.projectId).trim() &&
            typeof createImageUrlBuilder === 'function'
                ? createImageUrlBuilder({
                      projectId: String(imageOpts.projectId).trim(),
                      dataset: imageOpts.dataset || 'production',
                  })
                : null;

        /** Hero image from the "Main image" field — it is not part of Portable Text `body`. */
        let leadHtml = '';
        const leadUrls = [];
        if (doc.mainImage && doc.mainImage.asset) {
            let u = sanityWebpUrl(doc.mainImage, builder, IMG_BODY_MAX_W);
            if (!u && doc.mainImage.asset.url && /^https?:\/\//i.test(String(doc.mainImage.asset.url))) {
                const base = String(doc.mainImage.asset.url).split('?')[0];
                u = `${base}?w=${IMG_BODY_MAX_W}&fm=webp&q=${IMG_QUALITY}&fit=max`;
            }
            if (u) {
                leadHtml = imageBlockToHtml(u, 'eager', doc.mainImage);
                leadUrls.push(u);
            }
        }

        const bodyCore = portableTextToHtml(doc.body, imageOpts);
        const bodyHtml = leadHtml ? `${leadHtml}\n${bodyCore}` : bodyCore;

        const fromBody = collectImageUrls(doc.body, imageOpts);
        const imageUrls = leadUrls.slice();
        for (const u of fromBody) {
            if (u && !imageUrls.includes(u)) {
                imageUrls.push(u);
            }
        }

        const og = ogImageFields(doc, imageOpts);

        const seoTitle = (doc.seoTitle && String(doc.seoTitle).trim()) || '';
        const seoDescription = (doc.seoDescription && String(doc.seoDescription).trim()) || '';
        const seoSnippet = (doc.seoSnippet && String(doc.seoSnippet).trim()) || '';
        const metaDescription =
            seoDescription || seoSnippet || (doc.excerpt && String(doc.excerpt).trim()) || '';

        const mergedKeywords = mergeKeywords(doc);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                title: doc.title,
                slug: doc.slug,
                publishedAt: doc.publishedAt,
                _updatedAt: doc._updatedAt,
                excerpt: doc.excerpt,
                seoTitle,
                seoDescription,
                seoSnippet,
                noindex: doc.noindex === true,
                focusKeyword: doc.focusKeyword,
                bodyHtml,
                imageUrls,
                ogTitle: seoTitle || doc.title || '',
                ogDescription: metaDescription,
                ogImage: og.ogImage,
                ogImageWidth: og.ogImageWidth,
                ogImageHeight: og.ogImageHeight,
                keywords: mergedKeywords.length ? mergedKeywords : doc.keywords || [],
            }),
        };
    } catch (err) {
        console.error('blog-post:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: err.message || 'Failed to fetch post',
            }),
        };
    }
};
