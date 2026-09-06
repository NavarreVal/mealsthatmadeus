# Meals That Made Us

Family recipes and the stories that come with them — a site for Alyssa and Navarre Valdivieso.

Live site: [mealsthatmadeus.com](https://mealsthatmadeus.com)

Built with [Astro](https://astro.build) and deployed on Cloudflare Pages.

## Project structure

```text
src/
├── assets/              # Hero image and other site media
├── components/          # Header, footer, SEO head, shared bits
├── content/recipes/     # Recipe markdown (content collections)
├── layouts/BaseLayout.astro
├── pages/               # Home, About, recipe list + detail, RSS
└── styles/global.css    # Shared cookbook styles
```

Recipes live in `src/content/recipes/` as Markdown. Frontmatter is type-checked by the `recipes` collection in `src/content.config.ts`. See [Astro content collections](https://docs.astro.build/en/guides/content-collections/).

## Commands

| Command                | Action                                      |
| :--------------------- | :------------------------------------------ |
| `npm install`          | Install dependencies                        |
| `npm run dev`          | Start the local dev server at `localhost:4321` |
| `npm run build`        | Build the production site to `./dist/`      |
| `npm run preview`      | Preview the production build locally        |
| `npm run astro ...`    | Run Astro CLI commands (`astro check`, etc.) |

## Adding a recipe

Create a new `.md` file in `src/content/recipes/`. Keep the story, ingredients, and instructions in Alyssa’s voice. Typical frontmatter:

```md
---
title: "Recipe name"
description: "A short summary for the list page and SEO."
pubDate: 2026-09-06
author: "Alyssa Valdivieso"
yield: "6 servings"
category: "Main Dish"
tags: ["Family"]
---
```

Optional fields: `updatedDate`, `prepTime`, `cookTime`, `totalTime`, `heroImage`, `featured`.
