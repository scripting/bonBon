# Page handlers in BonBon

*This page was written by Claude, working with Dave Winer.*

Written 11/24/26, for BonBon 0.6.57.

BonBon shows Markdown. A page handler teaches it to show another kind of file. A handler is a small JavaScript function: it gets the text of the file, and it gives back HTML for BonBon to draw.

Two come with the app, for `.json` and `.js` files. You can change them or write your own.

This page assumes you know the basics of JavaScript.

### Where they are

1. Choose Open Data Folder from the File menu.
2. Open the `handlers` folder inside it. It has two folders, `system` and `user`.
3. `system` is BonBon's. It's replaced every time the app starts, so don't change anything there.
4. `user` is yours. BonBon never touches it.
5. Inside each, a handler is a folder named for the extension it handles, with a file named `handler.js` in it. The handler for `.json` files is `handlers/system/json/handler.js`.

### Writing one

This one shows a `.csv` file as a table.

1. In `handlers/user`, make a folder named `csv`.
2. In it, make a file named `handler.js` with this in it:

```javascript
function handler (options, callback) {
	function encodeHtml (theText) {
		return (theText.replace (/&/g, "&amp;").replace (/</g, "&lt;").replace (/>/g, "&gt;"));
		}
	var htmltext = "<table>";
	options.pagetext.split ("\n").forEach (function (theLine, ixLine) {
		if (theLine.trim ().length > 0) {
			const theTag = (ixLine === 0) ? "th" : "td";
			htmltext += "<tr>";
			theLine.split (",").forEach (function (theCell) {
				htmltext += "<" + theTag + ">" + encodeHtml (theCell.trim ()) + "</" + theTag + ">";
				});
			htmltext += "</tr>";
			}
		});
	htmltext += "</table>";
	callback (undefined, {htmltext});
	}
```

3. Open a `.csv` file in BonBon. It's a table.

There's nothing to install and nothing to restart. BonBon reads `handler.js` each time it shows a page, so to try a change, save the file and reload the page.

It's a small example. It doesn't handle a comma inside quotes.

### The function

The file defines a function named `handler`. It takes two parameters.

`options` is everything BonBon knows about the page:

1. `pagetext`: the text of the file, as the server sent it.
2. `url`: the address that was asked for.
3. `urlActual`: the address after any redirects.
4. `contentType`: the type the server said the file is.
5. `extension`: the extension that picked this handler.
6. `headers`: the rest of what the server said.
7. `config`: what's in the handler's own `config.json`, if it has one.
8. `version`: BonBon's version.

`callback` is a standard JavaScript callback, `callback (err, data)`:

9. When it worked, `callback (undefined, data)`. `data` is an object, and it must have `htmltext`, the HTML to draw. It can have `title`, the name for the tab.
10. When it didn't, `callback ({message: "the file isn't valid JSON"})`.

### Which handler gets a page

1. Usually it's the extension at the end of the address. `https://example.com/scores.csv` goes to the handler in the `csv` folder.
2. Some servers send a file with no extension on its address. For those there's a table in BonBon's `config.json`, in the data folder, named `extensionsForTypes`. It says which extension goes with a type: `"application/json": "json"`. When the server's type is in the table, the table wins.
3. When `user` and `system` both have a folder for an extension, yours is the one that's used.
4. When there's no folder for the extension, BonBon shows the page the way it always has.
5. Markdown never goes to a handler. It's built in.
6. A handler gets pages that are text. A picture, a PDF or a file BonBon offers as a download doesn't go to one.

### Changing one of ours

1. Copy the folder from `system` to `user`. For the JSON handler, copy `handlers/system/json` to `handlers/user/json`.
2. Change the copy.

Yours is used from then on, and a new version of BonBon won't replace it.

### Settings for a handler

A handler's folder can have a `config.json` beside `handler.js`. Whatever is in it arrives as `options.config`. The JSON handler has one, with one setting, `ctSpaces`, how far each level is indented.

### What a handler can't do

A handler is a program, and you may install one a stranger wrote. So it runs in a closed box.

1. It can't read or write files.
2. It can't reach the network. `fetch` and everything like it is refused.
3. It has no `document` and no `DOMParser`. It builds its HTML as a string.
4. It has 5 seconds to call back.

The text of the page goes in, the HTML comes out, and that's the only door.

### What happens to the HTML

The HTML a handler sends back is treated the way a page is. The look belongs to the reader.

1. Scripts are removed, and so are styles: no `script`, no `style`, no `style` attributes.
2. Forms, frames, audio and video are removed.
3. What's left is drawn with the reader's stylesheet, the same as a Markdown page. Headings, paragraphs, lists, tables, links and pictures all work.
4. One special case. When the whole answer is a single `pre`, it's drawn as a code listing, the width of the window. A class on the `code` inside it says what language to color it as: `<pre><code class="language-json">`. That's how the two handlers that come with the app work.

### When a handler fails

When a handler has an error in it, calls back with an error, or doesn't answer in time, BonBon shows the page the way it would without the handler, and a dialog says what went wrong.

### One thing to know

Handlers are in the app. The demo at demo.bonbonweb.org doesn't run them.
