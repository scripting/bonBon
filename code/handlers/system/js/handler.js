/*  The js handler -- 11/19/26 by CC

	Draws a .js file as a listing, colored as JavaScript. A handler's
	answer that is one pre is drawn as a listing, the width of the
	window; the class on the code element says what language to color
	it as.
	
	This folder is BonBon's: it's replaced every time the app starts.
	To change this handler, copy the js folder from handlers/system to
	handlers/user and edit the copy. The one in user wins.  */

function encodeHtml (theText) {
	return (theText.replace (/&/g, "&amp;").replace (/</g, "&lt;").replace (/>/g, "&gt;"));
	}

function handler (options, callback) {
	callback (undefined, {
		htmltext: "<pre><code class=\"language-javascript\">" + encodeHtml (options.pagetext) + "</code></pre>"
		});
	}
