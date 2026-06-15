'use strict';

const OWNER = 'mickeyklai';
const REPO = 'memshak-deployment';
const GITHUB_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

async function getLatestAsset() {
    const res = await fetch(GITHUB_API, {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'mali-download-page',
        },
    });

    if (!res.ok) {
        throw new Error(`GitHub API ${res.status}`);
    }

    const data = await res.json();
    const asset = data.assets.find(
        (a) => a.name.endsWith('.exe') && !a.name.toLowerCase().includes('staging')
    );

    if (!asset) {
        return null;
    }

    return {
        tag: data.tag_name,
        size: asset.size,
        publishedAt: data.published_at,
        filename: asset.name,
        downloadUrl: asset.browser_download_url,
    };
}

exports.handler = async (event) => {
    const wantsFile = event.queryStringParameters?.dl === '1';

    try {
        const release = await getLatestAsset();

        if (!release) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify({ ok: false, error: 'no_asset' }),
            };
        }

        if (wantsFile) {
            return {
                statusCode: 302,
                headers: {
                    Location: release.downloadUrl,
                    'Cache-Control': 'no-store',
                },
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=120, s-maxage=120',
            },
            body: JSON.stringify({
                ok: true,
                tag: release.tag,
                size: release.size,
                publishedAt: release.publishedAt,
                filename: release.filename,
            }),
        };
    } catch (err) {
        console.error('latest-download:', err);
        return {
            statusCode: 502,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ ok: false, error: 'fetch_failed' }),
        };
    }
};
