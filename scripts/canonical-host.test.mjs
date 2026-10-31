import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRedirectTarget, onRequest } from '../functions/_middleware.js';

test('301s www and the production pages.dev host, preserving path and query', async () => {
	const cases = [
		['https://www.mealsthatmadeus.com/about/', 'https://mealsthatmadeus.com/about/'],
		['https://www.mealsthatmadeus.com/recipes/foo/?x=1', 'https://mealsthatmadeus.com/recipes/foo/?x=1'],
		['http://www.mealsthatmadeus.com/about', 'https://mealsthatmadeus.com/about'],
		['https://WWW.mealsthatmadeus.com/', 'https://mealsthatmadeus.com/'],
		['https://mealsthatmadeus.pages.dev/', 'https://mealsthatmadeus.com/'],
		[
			'https://mealsthatmadeus.pages.dev/recipes/papa-steves-chile-verde/?utm=1',
			'https://mealsthatmadeus.com/recipes/papa-steves-chile-verde/?utm=1',
		],
	];

	for (const [input, expected] of cases) {
		assert.equal(canonicalRedirectTarget(input), expected);
		const response = await onRequest({
			request: new Request(input),
			next: async () => new Response('should-not-serve', { status: 200 }),
		});
		assert.equal(response.status, 301);
		assert.equal(response.headers.get('location'), expected);
	}
});

test('does not redirect the apex or preview subdomains', async () => {
	const stay = [
		'https://mealsthatmadeus.com/about/',
		'https://mealsthatmadeus.com/',
		'https://cursor-first-seo-batch.mealsthatmadeus.pages.dev/about/',
		'https://main.mealsthatmadeus.pages.dev/',
		'https://abc123def.mealsthatmadeus.pages.dev/recipes/',
		'http://preview.mealsthatmadeus.pages.dev/privacy/?x=1',
	];

	for (const input of stay) {
		assert.equal(canonicalRedirectTarget(input), null);
		const response = await onRequest({
			request: new Request(input),
			next: async () => new Response('page', { status: 200 }),
		});
		assert.equal(response.status, 200);
		assert.equal(await response.text(), 'page');
	}
});

test('a protocol-relative path cannot change the redirect host', () => {
	const target = canonicalRedirectTarget('https://www.mealsthatmadeus.com//evil.example/phish');
	assert.equal(target, 'https://mealsthatmadeus.com//evil.example/phish');
	assert.equal(new URL(target).hostname, 'mealsthatmadeus.com');
});
