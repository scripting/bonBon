/*  The json handler -- 11/19/26 by CC

	Draws a .json file as an indented listing. A file that arrives as
	one long line is laid out so it can be read.
	
	This folder is BonBon's: it's replaced every time the app starts.
	To change this handler, copy the json folder from handlers/system
	to handlers/user and edit the copy. The one in user wins.
	
	options.config.ctSpaces, in the config.json beside this file, is how
	far each level is indented.  */

function encodeHtml (theText) {
	return (theText.replace (/&/g, "&amp;").replace (/</g, "&lt;").replace (/>/g, "&gt;"));
	}

function handler (options, callback) {
	var theObject;
	try {
		theObject = JSON.parse (options.pagetext);
		}
	catch (err) {
		const message = "the file isn't valid JSON: " + err.message;
		callback ({message});
		return;
		}
	var ctSpaces = 4;
	if (typeof options.config.ctSpaces === "number") {
		ctSpaces = options.config.ctSpaces;
		}
	const jsontext = JSON.stringify (theObject, undefined, ctSpaces);
	callback (undefined, {
		htmltext: "<pre><code class=\"language-json\">" + encodeHtml (jsontext) + "</code></pre>"
		});
	}
