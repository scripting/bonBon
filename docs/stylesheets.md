# Stylesheets in BonBon

*This page was written by Claude, working with Dave Winer.*

Written 11/24/26, for BonBon 0.6.57.

In BonBon the reader decides how a page looks, not the writer. A page is Markdown, and it can't bring CSS of its own. The look comes from a stylesheet the reader picks, and a stylesheet is an ordinary CSS file. You can change one or write your own.

This page assumes you know the basics of CSS.

### Choosing one

1. Click the stylesheet button in the address bar. A panel opens with a name for each stylesheet.
2. Click a name. The page changes right there.
3. The choice holds for every tab, and it's remembered the next time you start BonBon.

Five come with the app: Basic, Book, Classic, Mono and Newsprint. Basic is the one you see first.

### Where they are

1. Choose Open Data Folder from the File menu.
2. Open the `stylesheets` folder inside it.
3. Each `.css` file in that folder is one stylesheet. The name in the panel is the file's name, with a capital letter and without `.css`. `newsprint.css` is Newsprint.
4. The `fonts` folder holds the fonts the five use, so they work when you're offline.

### Changing one

1. Open the file in a text editor and change it.
2. Save, then reload the page in BonBon. The change shows.

A new version of BonBon never overwrites a file in this folder, so your changes stay.

### Adding your own

1. Copy one of the five and give the copy a new name, `mine.css`.
2. Open the panel. Mine is there.
3. Change it until you like it.

Starting from a copy is easier than starting from nothing, because the five already handle everything a page can contain.

### Taking one away

A file you delete comes back the next time BonBon starts, if it's one of the five. To be rid of one, change its name so it doesn't end in `.css`.

### What you're styling

The page is always built the same way:

```html
<body>
	<div class="page">
		...the Markdown, as HTML...
	</div>
</body>
```

1. `body` is the whole area under the address bar. Set the background, the text color and the font here.
2. `.page` is the reading column. Set its width and center it here.
3. Inside it are the elements Markdown makes: `h1` through `h6`, `p`, `a`, `img`, `ul`, `ol`, `li`, `blockquote`, `code`, `pre`, `hr`, `table`, `th`, `td`, `strong`, `em`.
4. There are no classes to learn. A Markdown page has none, and HTML a writer puts in a page is removed.

That's the whole list. A stylesheet that styles those elements is complete.

### How the five are written

You don't have to follow these, but a copy of one of the five will have them.

1. The colors and fonts are variables at the top of the file: `--bg`, `--fg`, `--muted`, `--rule`, `--link`, `--link-visited`, `--accent`, `--font-body`, `--font-head`, `--font-code`. To change a stylesheet's colors, change them there.
2. The dark colors are a second set of the same variables, under `@media (prefers-color-scheme: dark)`. BonBon is dark when your system is.
3. On a blog's home page, `h2` is a day and `h3` is a post's title.
4. A picture at the start of a paragraph floats to the right, `p > img:first-child`. A picture alone in a paragraph stands by itself, `p > img:only-child`.

### A small one, to start from

```css
body {
	margin: 0;
	background: #fdfcf8;
	color: #222;
	font-family: Georgia, serif;
	font-size: 18px;
	line-height: 1.6;
	}
.page {
	max-width: 40rem;
	margin: 0 auto;
	padding: 2rem 16px 4rem;
	}
a {
	color: #0b63ce;
	}
img {
	max-width: 100%;
	}
pre {
	overflow-x: auto;
	}
```

Save it in the stylesheets folder as `plain.css`, and Plain is in the panel.

### Two things to know

1. BonBon is built on an older version of Chromium, 108. A few newer CSS features don't work in it, `color-mix()` and `text-wrap: balance` among them.
2. A stylesheet is for you. It changes how every page looks on your machine, and nothing about how a page looks to anyone else.
