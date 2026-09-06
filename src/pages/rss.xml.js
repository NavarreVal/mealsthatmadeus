import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context) {
	const recipes = (await getCollection('recipes')).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: recipes.map((recipe) => ({
			title: recipe.data.title,
			description: recipe.data.description,
			pubDate: recipe.data.pubDate,
			link: `/recipes/${recipe.id}/`,
		})),
	});
}
