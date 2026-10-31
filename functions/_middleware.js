// Host redirects for Cloudflare Pages.
//
// A Pages `_redirects` file matches the path only. Domain-level rules such as
// `https://www.example.com/*` are ignored, so this middleware is the in-repo
// way to 301 the alias hosts. It runs in front of static files (see
// `public/_routes.json`).
//
// Only these exact hosts redirect:
//   www.mealsthatmadeus.com
//   mealsthatmadeus.pages.dev
// Branch preview deploys are other hostnames (`<branch>.mealsthatmadeus.pages.dev`
// and `<deployment>.mealsthatmadeus.pages.dev`) and are passed through.
// `https://mealsthatmadeus.com` is the canonical origin and is not redirected.

export const CANONICAL_ORIGIN = 'https://mealsthatmadeus.com';

const ALIAS_HOSTS = new Set([
	'www.mealsthatmadeus.com',
	'mealsthatmadeus.pages.dev',
]);

/**
 * @param {string} requestUrl
 * @returns {string | null} Absolute https URL on the canonical host, or null to serve the request as-is.
 */
export function canonicalRedirectTarget(requestUrl) {
	const url = new URL(requestUrl);
	if (!ALIAS_HOSTS.has(url.hostname)) return null;

	// Assign path and query onto a fixed origin. Concatenating pathname into
	// `new URL(pathname, origin)` is an open redirect when pathname is `//host`.
	const target = new URL(CANONICAL_ORIGIN);
	target.pathname = url.pathname;
	target.search = url.search;
	return target.href;
}

export async function onRequest(context) {
	const target = canonicalRedirectTarget(context.request.url);
	if (target) return Response.redirect(target, 301);
	return context.next();
}
