'use strict';

const { getSanityClient } = require('../../lib/sanity');

const SITE_ORIGIN = (
    process.env.SITE_ORIGIN ||
    process.env.URL ||
    'https://www.maliapp.co.il'
)
    .trim()
    .replace(/\/+$/, '');

const FEED_QUERY = `
  *[_type == "post" && !(_id in path("drafts.**")) && defined(slug.current)]
    | order(coalesce(publishedAt, _updatedAt) desc) [0...30] {
      title,
      "slug": slug.current,
      excerpt,
      publishedAt,
      _updatedAt,
      "imageUrl": coalesce(mainImage.asset->url, body[_type=="image"][0].asset->url),
      "imageAlt": coalesce(mainImage.alt, body[_type=="image"][0].alt)
    }
`;

const headers = {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
};

function escapeXml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function rfc822(value) {
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) {
        return new Date().toUTCString();
    }
    return d.toUTCString();
}

function postUrl(slug) {
    return `${SITE_ORIGIN}/blog/${encodeURIComponent(slug)}`;
}

function imageUrl(raw) {
    if (!raw) {
        return '';
    }
    return raw.includes('?') ? raw : `${raw}?w=1200&fm=jpg&q=82&fit=max`;
}

function itemBlock(post) {
    if (!post || !post.slug) {
        return '';
    }
    const link = postUrl(post.slug);
    const title = post.title || 'מלי — בלוג למייצגים';
    const desc =
        post.excerpt ||
        'מאמרים ועדכונים על ניהול תיקים, ביטוח לאומי ומערכת מלי למייצגים.';
    const pub = rfc822(post.publishedAt || post._updatedAt);
    const img = imageUrl(post.imageUrl);
    const enclosure = img
        ? `      <enclosure url="${escapeXml(img)}" type="image/jpeg" />\n`
        : '';
    const mediaContent = img
        ? `      <media:content url="${escapeXml(img)}" medium="image" />\n` +
          (post.imageAlt
              ? `      <media:description>${escapeXml(post.imageAlt)}</media:description>\n`
              : '')
        : '';
    return (
        '    <item>\n' +
        `      <title>${escapeXml(title)}</title>\n` +
        `      <link>${escapeXml(link)}</link>\n` +
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>\n` +
        `      <pubDate>${escapeXml(pub)}</pubDate>\n` +
        `      <description>${escapeXml(desc)}</description>\n` +
        '      <author>mali.help.app@gmail.com (מלי פלטפורמות תוכנה)</author>\n' +
        '      <category>ביטוח לאומי</category>\n' +
        '      <category>מייצגים</category>\n' +
        enclosure +
        mediaContent +
        '    </item>\n'
    );
}

exports.handler = async function handler(event) {
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
        return { statusCode: 405, headers, body: '' };
    }

    let posts = [];
    try {
        const client = getSanityClient({ useCdn: true });
        posts = await client.fetch(FEED_QUERY);
    } catch (err) {
        console.warn('feed: Sanity fetch failed; emitting empty feed:', err.message);
        posts = [];
    }

    const lastBuild = rfc822(
        (posts[0] && (posts[0].publishedAt || posts[0]._updatedAt)) || new Date(),
    );

    const channelImage = `${SITE_ORIGIN}/assets/images/memshak-screenshot.png`;

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0"',
        '     xmlns:atom="http://www.w3.org/2005/Atom"',
        '     xmlns:media="http://search.yahoo.com/mrss/"',
        '     xmlns:dc="http://purl.org/dc/elements/1.1/">',
        '  <channel>',
        `    <title>${escapeXml('מלי — בלוג למייצגים וביטוח לאומי')}</title>`,
        `    <link>${escapeXml(SITE_ORIGIN + '/blog/')}</link>`,
        `    <atom:link href="${escapeXml(SITE_ORIGIN + '/feed.xml')}" rel="self" type="application/rss+xml" />`,
        `    <description>${escapeXml('מאמרים, טיפים ועדכונים על ניהול תיקי ביטוח לאומי ומערכת מלי.')}</description>`,
        '    <language>he-IL</language>',
        '    <copyright>© מלי פלטפורמות תוכנה בע&quot;מ</copyright>',
        '    <ttl>60</ttl>',
        `    <lastBuildDate>${escapeXml(lastBuild)}</lastBuildDate>`,
        `    <generator>www.maliapp.co.il</generator>`,
        '    <image>',
        `      <url>${escapeXml(channelImage)}</url>`,
        `      <title>${escapeXml('מלי — בלוג')}</title>`,
        `      <link>${escapeXml(SITE_ORIGIN + '/blog/')}</link>`,
        '    </image>',
    ];

    for (const post of posts) {
        xml.push(itemBlock(post));
    }

    xml.push('  </channel>', '</rss>');

    return {
        statusCode: 200,
        headers,
        body: xml.join('\n'),
    };
};
