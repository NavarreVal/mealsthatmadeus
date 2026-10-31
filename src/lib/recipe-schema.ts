import fs from 'node:fs';
import path from 'node:path';

// Recipe JSON-LD built only from frontmatter and the recipe markdown.
// A field is omitted when the source has no value for it. Durations that are
// not an unambiguous quantity are omitted rather than guessed.

export interface RecipeSchemaInput {
	title?: string;
	description?: string;
	author?: string;
	pubDate?: Date;
	updatedDate?: Date;
	yield?: string;
	prepTime?: string;
	cookTime?: string;
	totalTime?: string;
	category?: string;
	tags?: string[];
	/** Absolute URL of a file that exists. Omitted from the schema when absent. */
	imageUrl?: string;
	markdown?: string;
}

const UNIT_TO_ISO: Record<string, 'H' | 'M' | 'S'> = {
	h: 'H',
	hr: 'H',
	hrs: 'H',
	hour: 'H',
	hours: 'H',
	m: 'M',
	min: 'M',
	mins: 'M',
	minute: 'M',
	minutes: 'M',
	s: 'S',
	sec: 'S',
	secs: 'S',
	second: 'S',
	seconds: 'S',
};

const ISO_DURATION =
	/^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

export function toIsoDuration(input: string | undefined | null): string | undefined {
	if (input == null) return undefined;
	const raw = input.trim();
	if (!raw) return undefined;
	if (/[–—]|\d\s*-\s*\d|\bto\b|\babout\b|\bapprox|\baround\b|\bfew\b/i.test(raw)) {
		return undefined;
	}
	if (/^P/i.test(raw)) return isIsoDuration(raw) ? raw : undefined;

	const tokens = raw
		.toLowerCase()
		.replace(/,/g, ' ')
		.split(/\s+/)
		.filter((token) => token && token !== 'and' && token !== '&');

	let hours = 0;
	let minutes = 0;
	let seconds = 0;
	let saw = false;

	for (let i = 0; i < tokens.length; i++) {
		const unitToken = tokens[i + 1];
		if (!unitToken) return undefined;
		const value = parseQuantity(tokens[i]);
		const unit = UNIT_TO_ISO[unitToken.replace(/\.$/, '')];
		if (value === undefined || !unit || value < 0) return undefined;
		if (unit === 'H') hours += value;
		if (unit === 'M') minutes += value;
		if (unit === 'S') seconds += value;
		saw = true;
		i++;
	}

	if (!saw) return undefined;
	return formatIsoDuration(hours, minutes, seconds);
}

function isIsoDuration(value: string): boolean {
	const match = ISO_DURATION.exec(value);
	if (!match) return false;
	const parts = match.slice(1).filter((part) => part !== undefined);
	if (parts.length === 0) return false;
	for (let i = 0; i < parts.length; i++) {
		if (parts[i].includes('.') && i !== parts.length - 1) return false;
	}
	return true;
}

function parseQuantity(token: string): number | undefined {
	if (/^\d+$/.test(token)) return Number(token);
	if (/^\d+\.\d+$/.test(token)) return Number(token);
	const fraction = /^(\d+)\/(\d+)$/.exec(token);
	if (fraction) {
		const denominator = Number(fraction[2]);
		if (denominator === 0) return undefined;
		return Number(fraction[1]) / denominator;
	}
	return undefined;
}

function formatIsoDuration(hours: number, minutes: number, seconds: number): string | undefined {
	const units: Array<[number, string]> = [
		[hours, 'H'],
		[minutes, 'M'],
		[seconds, 'S'],
	];
	if (units.some(([value]) => !Number.isFinite(value) || value < 0)) return undefined;
	const present = units.filter(([value]) => value !== 0);
	if (present.length === 0) return undefined;
	for (let i = 0; i < present.length - 1; i++) {
		if (!Number.isInteger(present[i][0])) return undefined;
	}
	const body = present.map(([value, unit]) => `${formatNumber(value)}${unit}`).join('');
	return `PT${body}`;
}

function formatNumber(value: number): string {
	if (Number.isInteger(value)) return String(value);
	return String(Math.round(value * 1000) / 1000);
}

interface HowToStep {
	'@type': 'HowToStep';
	position: number;
	text: string;
}

interface HowToSection {
	'@type': 'HowToSection';
	name?: string;
	itemListElement: HowToStep[];
}

function sectionLines(markdown: string, heading: string): string[] | undefined {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
	if (start === -1) return undefined;
	const collected: string[] = [];
	for (let i = start + 1; i < lines.length; i++) {
		if (/^##\s+/.test(lines[i])) break;
		collected.push(lines[i]);
	}
	return collected;
}

function parseIngredients(markdown: string): string[] | undefined {
	const lines = sectionLines(markdown, 'Ingredients');
	if (!lines) return undefined;
	const ingredients: string[] = [];
	let group = '';
	for (const line of lines) {
		const trimmed = line.trim();
		const groupMatch = /^\*\*(.+)\*\*$/.exec(trimmed);
		if (groupMatch) {
			group = groupMatch[1].trim();
			continue;
		}
		const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
		if (!bullet) continue;
		const text = bullet[1].trim();
		if (!text) continue;
		ingredients.push(group ? `${group}: ${text}` : text);
	}
	return ingredients.length > 0 ? ingredients : undefined;
}

function parseInstructions(markdown: string): Array<HowToStep | HowToSection> | undefined {
	const lines = sectionLines(markdown, 'Instructions');
	if (!lines) return undefined;

	const blocks: Array<HowToStep | HowToSection> = [];
	let section: HowToSection | undefined;
	let loosePosition = 1;

	const pushStep = (text: string) => {
		if (section) {
			section.itemListElement.push({
				'@type': 'HowToStep',
				position: section.itemListElement.length + 1,
				text,
			});
			return;
		}
		blocks.push({ '@type': 'HowToStep', position: loosePosition, text });
		loosePosition += 1;
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const groupMatch = /^\*\*(.+)\*\*$/.exec(trimmed);
		if (groupMatch) {
			const name = groupMatch[1].trim();
			if (!name) continue;
			section = { '@type': 'HowToSection', name, itemListElement: [] };
			blocks.push(section);
			continue;
		}
		const stepMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
		if (!stepMatch) continue;
		const text = stepMatch[1].trim();
		if (!text) continue;
		pushStep(text);
	}

	const instructions = blocks.filter((block) => {
		if (block['@type'] === 'HowToSection') return block.itemListElement.length > 0;
		return true;
	});
	return instructions.length > 0 ? instructions : undefined;
}

function formatDate(date: Date | undefined): string | undefined {
	if (!date || Number.isNaN(date.valueOf())) return undefined;
	return date.toISOString().slice(0, 10);
}

function clean(value: string | undefined): string | undefined {
	if (value == null) return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

export function buildRecipeJsonLd(input: RecipeSchemaInput): Record<string, unknown> {
	const schema: Record<string, unknown> = {
		'@context': 'https://schema.org',
		'@type': 'Recipe',
	};

	const name = clean(input.title);
	const description = clean(input.description);
	const author = clean(input.author);
	const datePublished = formatDate(input.pubDate);
	const dateModified = formatDate(input.updatedDate);
	const recipeYield = clean(input.yield);
	const prepTime = toIsoDuration(input.prepTime);
	const cookTime = toIsoDuration(input.cookTime);
	const totalTime = toIsoDuration(input.totalTime);
	const recipeCategory = clean(input.category);
	const keywords = (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
	const image = clean(input.imageUrl);
	const markdown = input.markdown ?? '';
	const recipeIngredient = parseIngredients(markdown);
	const recipeInstructions = parseInstructions(markdown);

	if (name) schema.name = name;
	if (description) schema.description = description;
	if (image) schema.image = image;
	if (author) schema.author = { '@type': 'Person', name: author };
	if (datePublished) schema.datePublished = datePublished;
	if (dateModified) schema.dateModified = dateModified;
	if (recipeYield) schema.recipeYield = recipeYield;
	if (prepTime) schema.prepTime = prepTime;
	if (cookTime) schema.cookTime = cookTime;
	if (totalTime) schema.totalTime = totalTime;
	if (recipeCategory) schema.recipeCategory = recipeCategory;
	if (keywords.length > 0) schema.keywords = keywords.join(', ');
	if (recipeIngredient) schema.recipeIngredient = recipeIngredient;
	if (recipeInstructions) schema.recipeInstructions = recipeInstructions;

	return schema;
}

export function jsonLdScript(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Raw markdown body, without frontmatter. `body` wins when the loader provides it. */
export function recipeMarkdown(entry: { body?: string | null; filePath?: string | null }): string {
	if (typeof entry.body === 'string' && entry.body.trim()) return stripFrontmatter(entry.body);
	if (entry.filePath) return stripFrontmatter(fs.readFileSync(entry.filePath, 'utf8'));
	return '';
}

function stripFrontmatter(raw: string): string {
	return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/**
 * Absolute image URL only when `heroImage` points at a file on disk.
 * Remote URLs and missing files are omitted. The site hero is never used as a stand-in.
 */
export function resolveLocalImageUrl(
	heroImage: string | undefined,
	site: string | URL | undefined,
	root = process.cwd(),
): string | undefined {
	if (!heroImage || !site) return undefined;
	const relative = heroImage.replace(/^\//, '');
	if (!relative || relative.split(/[\\/]/).includes('..')) return undefined;
	const found = ['public', 'src'].some((dir) => {
		try {
			return fs.statSync(path.join(root, dir, relative)).isFile();
		} catch {
			return false;
		}
	});
	if (!found) return undefined;
	return new URL(`/${relative}`, site).href;
}
