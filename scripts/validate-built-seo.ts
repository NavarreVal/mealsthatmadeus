import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildRecipeJsonLd, recipeMarkdown, resolveLocalImageUrl } from '../src/lib/recipe-schema.ts';

const DIST = path.join(process.cwd(), 'dist');
const SITE = 'https://mealsthatmadeus.com';
const RECIPES = path.join(process.cwd(), 'src/content/recipes');

function walkHtml(dir: string): string[] {
	const found: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) found.push(...walkHtml(full));
		else if (entry.name.endsWith('.html')) found.push(full);
	}
	return found;
}

function pagePath(file: string): string {
	const relative = path.relative(DIST, file).split(path.sep).join('/');
	if (relative === 'index.html') return '/';
	assert.ok(relative.endsWith('/index.html'), relative);
	return `/${relative.slice(0, -'index.html'.length)}`;
}

function jsonLdBlocks(html: string): unknown[] {
	const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
	return blocks.map((match) => JSON.parse(match[1]) as unknown);
}

function canonicals(html: string): string[] {
	return [...html.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((match) => match[1]);
}

function frontmatterValue(raw: string, key: string): string | undefined {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
	assert.ok(match);
	const line = match[1].match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
	if (!line) return undefined;
	return line[1].trim().replace(/^"(.*)"$/, '$1');
}

function dateValue(value: string | undefined): Date | undefined {
	return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function tagsValue(value: string | undefined): string[] {
	if (!value) return [];
	return [...value.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

assert.ok(fs.existsSync(DIST), 'dist/ is missing; run npm run build first');

const htmlFiles = walkHtml(DIST);
const paths = htmlFiles.map(pagePath).sort();
const expectedPages = [
	'/',
	'/about/',
	'/copyright/',
	'/privacy/',
	'/recipes/',
	'/recipes/leiahs-cinnamon-sugar-soft-pretzels/',
	'/recipes/papa-steves-chile-verde/',
	'/recipes/sister-hrnciriks-cinnamon-coffee-cake/',
	'/recipes/the-one-true-cold-potato-salad/',
];
assert.deepEqual(paths, expectedPages);

for (const file of htmlFiles) {
	const html = fs.readFileSync(file, 'utf8');
	const pathname = pagePath(file);
	const foundCanonicals = canonicals(html);
	assert.deepEqual(foundCanonicals, [`${SITE}${pathname}`], pathname);

	const blocks = jsonLdBlocks(html);
	const types = blocks.map((block) => (block as { '@type'?: string })['@type']);
	assert.deepEqual(types.slice(0, 2), ['WebSite', 'Organization'], pathname);

	for (const type of ['WebSite', 'Organization'] as const) {
		const block = blocks.find((item) => (item as { '@type'?: string })['@type'] === type) as Record<
			string,
			unknown
		>;
		assert.deepEqual(Object.keys(block).sort(), ['@context', '@type', 'name', 'url']);
		assert.equal(block['@context'], 'https://schema.org');
		assert.equal(block.name, 'Meals That Made Us');
		assert.equal(block.url, `${SITE}/`);
	}

	const recipeBlocks = blocks.filter((block) => (block as { '@type'?: string })['@type'] === 'Recipe');
	if (pathname.startsWith('/recipes/') && pathname !== '/recipes/') {
		assert.equal(blocks.length, 3, pathname);
		assert.equal(recipeBlocks.length, 1, pathname);
	} else {
		assert.equal(blocks.length, 2, pathname);
		assert.equal(recipeBlocks.length, 0, pathname);
	}

	const serialized = JSON.stringify(blocks);
	for (const banned of ['streetAddress', 'telephone', 'email', '"@type":"Person"']) {
		if (banned === '"@type":"Person"') {
			assert.equal(serialized.includes(banned), recipeBlocks.length === 1, pathname);
			continue;
		}
		assert.equal(serialized.includes(banned), false, `${pathname} ${banned}`);
	}
}

for (const filename of fs.readdirSync(RECIPES).filter((name) => name.endsWith('.md'))) {
	const slug = filename.replace(/\.md$/, '');
	const file = path.join(DIST, 'recipes', slug, 'index.html');
	const html = fs.readFileSync(file, 'utf8');
	const raw = fs.readFileSync(path.join(RECIPES, filename), 'utf8');
	const expected = buildRecipeJsonLd({
		title: frontmatterValue(raw, 'title'),
		description: frontmatterValue(raw, 'description'),
		author: frontmatterValue(raw, 'author'),
		pubDate: dateValue(frontmatterValue(raw, 'pubDate')),
		updatedDate: dateValue(frontmatterValue(raw, 'updatedDate')),
		yield: frontmatterValue(raw, 'yield'),
		prepTime: frontmatterValue(raw, 'prepTime'),
		cookTime: frontmatterValue(raw, 'cookTime'),
		totalTime: frontmatterValue(raw, 'totalTime'),
		category: frontmatterValue(raw, 'category'),
		tags: tagsValue(frontmatterValue(raw, 'tags')),
		imageUrl: resolveLocalImageUrl(frontmatterValue(raw, 'heroImage'), SITE),
		markdown: recipeMarkdown({ body: raw }),
	});
	const actual = jsonLdBlocks(html).find((block) => (block as { '@type'?: string })['@type'] === 'Recipe');
	assert.deepEqual(actual, expected, slug);
	assert.equal((actual as { image?: unknown }).image, undefined, slug);
	assert.match((actual as { datePublished: string }).datePublished, /^\d{4}-\d{2}-\d{2}$/);
	const ingredients = (actual as { recipeIngredient: string[] }).recipeIngredient;
	const instructions = (actual as { recipeInstructions: unknown[] }).recipeInstructions;
	assert.ok(ingredients.length > 0, slug);
	assert.ok(instructions.length > 0, slug);
	for (const timeKey of ['prepTime', 'cookTime', 'totalTime'] as const) {
		const value = (actual as Record<string, string | undefined>)[timeKey];
		if (value !== undefined) assert.match(value, /^P(?:\d|T)/, `${slug} ${timeKey}`);
	}
}

const robots = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8');
assert.equal(robots.trim(), 'Sitemap: https://mealsthatmadeus.com/sitemap-index.xml');
assert.doesNotMatch(robots, /User-agent:/i);
assert.doesNotMatch(robots, /Disallow:/i);
assert.doesNotMatch(robots, /Allow:/i);

const sitemap = fs.readFileSync(path.join(DIST, 'sitemap-0.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
assert.deepEqual(
	locs,
	expectedPages.map((pathname) => `${SITE}${pathname}`),
);

console.log(`Validated ${htmlFiles.length} pages, ${fs.readdirSync(RECIPES).length} recipe JSON-LD blocks, robots.txt, and sitemap.`);
