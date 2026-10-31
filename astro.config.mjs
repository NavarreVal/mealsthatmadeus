// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://mealsthatmadeus.com',
	// Pages serves directory indexes at the trailing-slash URL and 308s the
	// no-slash form to it. Canonicals and the sitemap follow that URL.
	trailingSlash: 'always',
	integrations: [mdx(), sitemap()],
});
