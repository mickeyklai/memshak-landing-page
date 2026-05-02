import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './schemaTypes/index.js';

/**
 * Requires `SANITY_STUDIO_PROJECT_ID` in `studio/.env` (see `studio/.env.example`).
 * Create a project at https://www.sanity.io/manage
 */
const projectId = (process.env.SANITY_STUDIO_PROJECT_ID || '').trim();
if (!projectId) {
  throw new Error(
    'Missing SANITY_STUDIO_PROJECT_ID. Copy studio/.env.example to studio/.env and set your Sanity project ID.',
  );
}

export default defineConfig({
  name: 'memshak-blog',
  title: 'מלי — בלוג',
  projectId,
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  plugins: [structureTool()],
  schema: {
    types: schemaTypes,
  },
});
