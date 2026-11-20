/*  markdownConverter.js -- 10/9/26 by CC

	The Markdown interpreter, behind the small interface the charter asks
	for: one function, Markdown text in, HTML out. The shell knows nothing
	about marked, so a different converter can be dropped in here.
	
	Any HTML in the file is stripped before rendering (the charter). marked
	hands raw HTML, block or inline, to the renderer's html method, so
	answering nothing there removes exactly the HTML and leaves autolinks
	like <http://example.com> and ordinary less-thans alone.  */

const marked = require ("marked");

function convertMarkdownToHtml (theMarkdown) {
	const theRenderer = new marked.Renderer ();
	theRenderer.html = function (theHtml) {
		return ("");
		};
	return (marked (theMarkdown, {renderer: theRenderer}));
	}

exports.convertMarkdownToHtml = convertMarkdownToHtml;
