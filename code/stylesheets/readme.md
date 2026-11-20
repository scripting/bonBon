# BonBon stylesheets

The look of a page in BonBon is the reader's, not the writer's. This folder holds the stylesheets the reader can choose from, with the button in the address bar. Edit one, add your own, or delete one you don't want; the app reads the folder each time the panel opens. A file that's missing is copied back from the app's own set at the next launch, so a deleted one comes back. Rename it instead, or empty it.

The five that come with the app were designed with Claude in the browser on October 27, 2026, and Dave accepted them as they came: Newsprint, Basic (the default, called Reader for its first day), Classic, Mono and Book. The `fonts` folder holds the web fonts they use, so they work offline.

## The page they style

```html
<div class="page">
	<h1>The page's title</h1>        <!-- from the front matter -->
	...rendered Markdown...        <!-- h2, h3, p, a, img, ul, ol, blockquote, code, pre, hr, table -->
</div>
```

The rendered Markdown is in `.divPage`, the title included: since 11/11/26 BonBon draws no title, dateline or description of its own, the writer places them in the text with macros (`{{page.title}}`), so the title is whatever heading the page gives it. The only thing above the page is the arrows, `.divPageArrows`, floated in its upper right corner.

## Conventions the five share

1. Tokens at the top: `--bg`, `--fg`, `--muted`, `--rule`, `--link`, `--link-visited`, `--accent`, `--font-body`, `--font-head`, `--font-code`, and `--tint-code`, `--tint-pre` for shaded backgrounds. Every color comes from a token.
2. Light values on `:root`; dark values under `@media (prefers-color-scheme: dark)` and again under `:root[data-theme="dark"]`.
3. `.page` is the reading column: a fixed measure, centered.
4. `h2` is a day heading, `h3` a titled post. Both clear floats.
5. `p > img:first-child` floats right; `p > img:only-child` is a standalone picture.
6. The `#` permalink at the end of an item is `a[title="Direct link to this item."]`, small and muted.
7. Tabs for indentation.

Chromium 108 is what BonBon runs on, so `color-mix()` and `text-wrap: balance` don't work here.
