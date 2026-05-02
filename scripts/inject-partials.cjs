'use strict';

/**
 * Inlines partials into HTML files between region markers (idempotent).
 * Edit partials/contact-modal.html only, then run: npm run build
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const START_MARK = '<!-- @partial contact-modal.html -->';
const END_MARK = '<!-- @/partial contact-modal.html -->';
const PARTIAL_PATH = path.join(ROOT, 'partials', 'contact-modal.html');

const TARGETS = [
    path.join(ROOT, 'index.html'),
    path.join(ROOT, 'blog', 'index.html'),
    path.join(ROOT, 'blog', 'post.html'),
];

function buildRegion(partialBody) {
    const lines = partialBody.replace(/\r\n/g, '\n').trimEnd().split('\n');
    const indented = lines.map((line) => '    ' + line).join('\n');
    return `    ${START_MARK}\n${indented}\n    ${END_MARK}`;
}

function main() {
    const partialRaw = fs.readFileSync(PARTIAL_PATH, 'utf8');
    const region = buildRegion(partialRaw);
    const regionRe = new RegExp(
        `[ \\t]*${escapeRe(START_MARK)}[\\s\\S]*?[ \\t]*${escapeRe(END_MARK)}`,
        'm',
    );

    for (const file of TARGETS) {
        let html = fs.readFileSync(file, 'utf8');
        if (!html.includes(START_MARK) || !html.includes(END_MARK)) {
            throw new Error(
                `${path.relative(ROOT, file)}: missing partial region markers for contact-modal`,
            );
        }
        if (!regionRe.test(html)) {
            throw new Error(`${path.relative(ROOT, file)}: could not match partial region`);
        }
        html = html.replace(regionRe, region);
        fs.writeFileSync(file, html, 'utf8');
    }

    console.log('inject-partials: synced contact-modal.html →', TARGETS.length, 'pages');
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main();
