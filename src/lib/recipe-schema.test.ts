import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildRecipeJsonLd, jsonLdScript, toIsoDuration } from './recipe-schema.ts';

const RECIPES_DIR = path.join(process.cwd(), 'src/content/recipes');
const ISO_DURATION = /^PT(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?$/;

interface Frontmatter {
	title: string;
	description: string;
	pubDate: string;
	author: string;
	yield: string;
	category: string;
	tags: string[];
}

function loadRecipe(filename: string): { frontmatter: Frontmatter; markdown: string } {
	const raw = fs.readFileSync(path.join(RECIPES_DIR, filename), 'utf8');
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
	assert.ok(match, `${filename} has frontmatter`);
	const block = match[1];
	const field = (key: string) => {
		const line = block.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
		assert.ok(line, `${filename} has ${key}`);
		return line[1].trim().replace(/^"(.*)"$/, '$1');
	};
	const tagsLine = field('tags');
	return {
		frontmatter: {
			title: field('title'),
			description: field('description'),
			pubDate: field('pubDate'),
			author: field('author'),
			yield: field('yield'),
			category: field('category'),
			tags: [...tagsLine.matchAll(/"([^"]*)"/g)].map((item) => item[1]),
		},
		markdown: match[2],
	};
}

function section(markdown: string, heading: string): string[] {
	const lines = markdown.split('\n');
	const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
	assert.notEqual(start, -1, `missing ## ${heading}`);
	const collected: string[] = [];
	for (let i = start + 1; i < lines.length; i++) {
		if (/^##\s+/.test(lines[i])) break;
		collected.push(lines[i]);
	}
	return collected;
}

function expectedIngredients(markdown: string): string[] {
	const ingredients: string[] = [];
	let group = '';
	for (const line of section(markdown, 'Ingredients')) {
		const trimmed = line.trim();
		const groupMatch = /^\*\*(.+)\*\*$/.exec(trimmed);
		if (groupMatch) {
			group = groupMatch[1].trim();
			continue;
		}
		const bullet = /^-\s+(.+)$/.exec(trimmed);
		if (!bullet) continue;
		ingredients.push(group ? `${group}: ${bullet[1]}` : bullet[1]);
	}
	return ingredients;
}

function expectedInstructionTexts(markdown: string): string[] {
	return section(markdown, 'Instructions')
		.map((line) => /^\d+\.\s+(.+)$/.exec(line.trim()))
		.filter((match): match is RegExpExecArray => match !== null)
		.map((match) => match[1]);
}

function flattenSteps(instructions: unknown): Array<{ text: string; position: number }> {
	assert.ok(Array.isArray(instructions));
	const steps: Array<{ text: string; position: number }> = [];
	for (const block of instructions) {
		assert.equal(typeof block, 'object');
		assert.ok(block);
		const record = block as Record<string, unknown>;
		if (record['@type'] === 'HowToStep') {
			steps.push({ text: String(record.text), position: Number(record.position) });
			continue;
		}
		assert.equal(record['@type'], 'HowToSection');
		assert.equal(typeof record.name, 'string');
		assert.ok(String(record.name).length > 0);
		assert.ok(Array.isArray(record.itemListElement));
		assert.ok(record.itemListElement.length > 0);
		for (const step of record.itemListElement) {
			const item = step as Record<string, unknown>;
			assert.equal(item['@type'], 'HowToStep');
			steps.push({ text: String(item.text), position: Number(item.position) });
		}
	}
	return steps;
}

function assertSchemaRecipe(schema: Record<string, unknown>, frontmatter: Frontmatter, markdown: string) {
	assert.equal(schema['@context'], 'https://schema.org');
	assert.equal(schema['@type'], 'Recipe');
	assert.equal(schema.name, frontmatter.title);
	assert.equal(schema.description, frontmatter.description);
	assert.deepEqual(schema.author, { '@type': 'Person', name: frontmatter.author });
	assert.equal(schema.datePublished, frontmatter.pubDate);
	assert.equal(schema.dateModified, undefined);
	assert.equal(schema.recipeYield, frontmatter.yield);
	assert.equal(schema.recipeCategory, frontmatter.category);
	assert.equal(schema.keywords, frontmatter.tags.join(', '));
	assert.equal(schema.prepTime, undefined);
	assert.equal(schema.cookTime, undefined);
	assert.equal(schema.totalTime, undefined);
	assert.equal(schema.image, undefined);
	assert.equal(schema.recipeCuisine, undefined);

	assert.deepEqual(schema.recipeIngredient, expectedIngredients(markdown));
	const steps = flattenSteps(schema.recipeInstructions);
	assert.deepEqual(
		steps.map((step) => step.text),
		expectedInstructionTexts(markdown),
	);
	for (const step of steps) {
		assert.ok(step.text.length > 0);
		assert.ok(Number.isInteger(step.position) && step.position >= 1);
	}

	for (const key of ['email', 'telephone', 'address', 'streetAddress', 'logo', 'sameAs']) {
		assert.equal(Object.hasOwn(schema, key), false, key);
	}

	const roundTrip = JSON.parse(jsonLdScript(schema)) as Record<string, unknown>;
	assert.deepEqual(roundTrip, schema);
}

const FILES = [
	'papa-steves-chile-verde.md',
	'the-one-true-cold-potato-salad.md',
	'sister-hrnciriks-cinnamon-coffee-cake.md',
	'leiahs-cinnamon-sugar-soft-pretzels.md',
];

for (const filename of FILES) {
	test(`recipe JSON-LD matches ${filename} and omits fields with no data`, () => {
		const { frontmatter, markdown } = loadRecipe(filename);
		const schema = buildRecipeJsonLd({
			title: frontmatter.title,
			description: frontmatter.description,
			author: frontmatter.author,
			pubDate: new Date(`${frontmatter.pubDate}T00:00:00.000Z`),
			yield: frontmatter.yield,
			category: frontmatter.category,
			tags: frontmatter.tags,
			markdown,
		});
		assertSchemaRecipe(schema, frontmatter, markdown);
	});
}

test('grouped instructions keep the markdown section name', () => {
	const { frontmatter, markdown } = loadRecipe('sister-hrnciriks-cinnamon-coffee-cake.md');
	const schema = buildRecipeJsonLd({
		title: frontmatter.title,
		description: frontmatter.description,
		author: frontmatter.author,
		pubDate: new Date(`${frontmatter.pubDate}T00:00:00.000Z`),
		markdown,
	});
	const instructions = schema.recipeInstructions as Array<Record<string, unknown>>;
	assert.equal(instructions.filter((block) => block['@type'] === 'HowToStep').length, 5);
	const sectionBlock = instructions.find((block) => block['@type'] === 'HowToSection');
	assert.ok(sectionBlock);
	assert.equal(sectionBlock.name, 'Streusel & Baking');
	const steps = sectionBlock.itemListElement as Array<Record<string, unknown>>;
	assert.equal(steps[0].position, 1);
	assert.equal(steps[0].text, 'Thoroughly combine the brown sugar, flour, and cinnamon.');
	assert.equal((schema.recipeIngredient as string[])[0], 'Cake: ¼ cup shortening');
});

test('durations use ISO 8601 and ambiguous text is omitted', () => {
	assert.equal(toIsoDuration('30 minutes'), 'PT30M');
	assert.equal(toIsoDuration('1 hour'), 'PT1H');
	assert.equal(toIsoDuration('1 hour 30 minutes'), 'PT1H30M');
	assert.equal(toIsoDuration('1 hour and 15 minutes'), 'PT1H15M');
	assert.equal(toIsoDuration('45 min'), 'PT45M');
	assert.equal(toIsoDuration('2 hours'), 'PT2H');
	assert.equal(toIsoDuration('90 seconds'), 'PT90S');
	assert.equal(toIsoDuration('1.5 hours'), 'PT1.5H');
	assert.equal(toIsoDuration('1/2 hour'), 'PT0.5H');
	assert.equal(toIsoDuration('PT45M'), 'PT45M');
	assert.equal(toIsoDuration('  PT1H30M '), 'PT1H30M');
	assert.equal(toIsoDuration('25–30 minutes'), undefined);
	assert.equal(toIsoDuration('25-30 minutes'), undefined);
	assert.equal(toIsoDuration('about 30 minutes'), undefined);
	assert.equal(toIsoDuration('a few minutes'), undefined);
	assert.equal(toIsoDuration(''), undefined);
	assert.equal(toIsoDuration(undefined), undefined);
	assert.equal(toIsoDuration('PT'), undefined);
	assert.equal(toIsoDuration('1.5 hours 10 minutes'), undefined);

	const schema = buildRecipeJsonLd({
		title: 'Timed',
		description: 'Has times',
		author: 'Alyssa Valdivieso',
		pubDate: new Date('2021-10-25T00:00:00.000Z'),
		updatedDate: new Date('2021-11-01T00:00:00.000Z'),
		prepTime: '20 minutes',
		cookTime: '1 hour',
		totalTime: '25–30 minutes',
		markdown: '',
	});
	assert.equal(schema.prepTime, 'PT20M');
	assert.equal(schema.cookTime, 'PT1H');
	assert.equal(schema.totalTime, undefined);
	assert.equal(schema.dateModified, '2021-11-01');
	assert.equal(schema.recipeIngredient, undefined);
	assert.equal(schema.recipeInstructions, undefined);
	assert.match(String(schema.prepTime), ISO_DURATION);
	assert.match(String(schema.cookTime), ISO_DURATION);
});

test('a missing image file is omitted', async () => {
	const { resolveLocalImageUrl } = await import('./recipe-schema.ts');
	assert.equal(resolveLocalImageUrl(undefined, 'https://mealsthatmadeus.com'), undefined);
	assert.equal(
		resolveLocalImageUrl('no-such-recipe-photo.jpg', 'https://mealsthatmadeus.com'),
		undefined,
	);
	assert.equal(
		resolveLocalImageUrl('https://example.com/photo.jpg', 'https://mealsthatmadeus.com'),
		undefined,
	);
});
