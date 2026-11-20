/*  pageRequests.js -- 11/2/26 by CC

	The requests BonBon makes of the web, by the charter's rules: a page,
	a site's icon, its table of contents, and whether an address serves
	Markdown. This was the top half of main.js until 11/2/26, when the
	demo, the version of BonBon that runs in a web page in Chrome, needed
	the same code on its server (demo/api/api.js, api.bonbonweb.org): a
	page in Chrome can't fetch from other sites, so the server does it,
	with this. main.js and api.js both require it; a change here reaches
	both (Dave: "it shares code with bonbon, and should evolve together
	as much as possible").
	
	init sets what the two callers differ on: how many redirects to
	follow, the User-Agent, and how long the answers about a site (its
	icon, its table of contents, whether an address is Markdown) are
	kept. BonBon keeps them for the run; the server, which runs for weeks,
	for an hour.  */

const http = require ("http");
const opml = require ("opml"); //11/4/26 by CC -- Dave's package, for the table of contents' include nodes
const https = require ("https");
const zlib = require ("zlib"); //11/18/26 by CC -- for a page the server sends zipped
const markdownConverter = require ("./markdownConverter.js");
const frontMatter = require ("./frontMatter.js");

var options = {
	maxRedirects: 10,
	userAgent: "Markdown Browser",
	cacheMinutes: undefined //how long a site's icon, table of contents and isMarkdownUrl answers are kept; undefined means as long as the process runs
	};

function init (userOptions) {
	for (var x in userOptions) {
		options [x] = userOptions [x];
		}
	}

/*  The caches: one answer per site (or per address) for as long as
	cacheMinutes says. An answer can be undefined (the site has no icon),
	so the entry is an object, never the bare value.  */

function getCached (theCache, theKey) { //answers {flCached, value}; an entry older than cacheMinutes doesn't count
	const theEntry = theCache [theKey];
	if (theEntry === undefined) {
		return ({flCached: false});
		}
	if ((options.cacheMinutes !== undefined) && ((Date.now () - theEntry.when) > (options.cacheMinutes * 60 * 1000))) {
		delete theCache [theKey];
		return ({flCached: false});
		}
	return ({flCached: true, value: theEntry.value});
	}

function setCached (theCache, theKey, theValue) {
	theCache [theKey] = {when: Date.now (), value: theValue};
	}

/*  The request. Accept: text/markdown goes with every one (the charter),
	so a server can answer this browser with Markdown and others with HTML
	from the same URL. Redirects are followed, the way the web does.  */

/*  11/18/26 by CC -- ZIPPED PAGES. A server can send a page zipped, and
	says so in the Content-Encoding header. Some send it that way whether
	we asked or not: a file stored zipped on Amazon S3 (Adam Curry's Hello
	World, the first one we saw). The historic browsers unzip without
	being asked; so do we. If the bytes can't be unzipped they go on as
	they came.  */

function unzipBody (theBody, theContentEncoding, callback) { //calls back with the page's bytes, unzipped if the server said they were zipped
	const theEncoding = (theContentEncoding === undefined) ? "" : theContentEncoding.trim ().toLowerCase ();
	function unzipped (err, theUnzippedBody) {
		if (err) {
			callback (theBody);
			}
		else {
			callback (theUnzippedBody);
			}
		}
	switch (theEncoding) {
		case "gzip": case "x-gzip":
			zlib.gunzip (theBody, unzipped);
			break;
		case "deflate":
			zlib.inflate (theBody, function (err, theUnzippedBody) {
				if (err) { //some servers send deflate without its wrapper
					zlib.inflateRaw (theBody, unzipped);
					}
				else {
					unzipped (undefined, theUnzippedBody);
					}
				});
			break;
		case "br":
			zlib.brotliDecompress (theBody, unzipped);
			break;
		default:
			callback (theBody);
		}
	}

function httpGet (theUrl, ctRedirects, callback, acceptHeader="text/markdown", flHeadersOnly=false, isBodyWanted=undefined) { //10/17/26 by CC -- acceptHeader: what we're asking for; text/x-opml for the table of contents, so a server that wraps OPML in HTML (PagePark) sends the outline instead. 11/9/26: flHeadersOnly, for isMarkdownUrl: the answer is in the headers, so the connection is dropped once they're in and the body comes back empty; a link to an archive isn't downloaded to learn it isn't a page. 11/10/26: isBodyWanted (theUrl, contentType), for getPage: asked once the headers are in, and when it says no the body isn't read, so a 13 megabyte archive isn't downloaded to draw the page that offers it. Every answer has contentLocation, the address the server says the file it sent lives at (a folder's address answered with its readme), and contentLength
	var parsedUrl;
	try {
		parsedUrl = new URL (theUrl);
		}
	catch (err) {
		callback ({message: "Can't get " + theUrl + " because it isn't a valid URL."});
		return;
		}
	const theModule = (parsedUrl.protocol === "https:") ? https : http;
	if ((parsedUrl.protocol !== "https:") && (parsedUrl.protocol !== "http:")) {
		callback ({message: "Can't get " + theUrl + " because only http and https are supported."});
		return;
		}
	const theOptions = {
		headers: {
			"Accept": acceptHeader,
			"User-Agent": options.userAgent
			}
		};
	const theRequest = theModule.get (theUrl, theOptions, function (theResponse) {
		const theStatus = theResponse.statusCode;
		if ((theStatus >= 300) && (theStatus < 400) && (theResponse.headers.location !== undefined)) {
			theResponse.resume ();
			if (ctRedirects >= options.maxRedirects) {
				callback ({message: "Can't get " + theUrl + " because there were too many redirects."});
				}
			else {
				const urlRedirect = new URL (theResponse.headers.location, theUrl).toString ();
				httpGet (urlRedirect, ctRedirects + 1, callback, acceptHeader, flHeadersOnly, isBodyWanted);
				}
			return;
			}
		var contentLocation; //11/10/26 by CC -- the standard header, made absolute
		if (theResponse.headers ["content-location"] !== undefined) {
			try {
				contentLocation = new URL (theResponse.headers ["content-location"], theUrl).toString ();
				}
			catch (err) {
				}
			}
		const contentLength = (theResponse.headers ["content-length"] === undefined) ? undefined : Number (theResponse.headers ["content-length"]);
		if (flHeadersOnly || ((isBodyWanted !== undefined) && (theStatus === 200) && !isBodyWanted (theUrl, theResponse.headers ["content-type"]))) { //11/9/26 by CC
			theResponse.destroy ();
			callback (undefined, {
				url: theUrl,
				status: theStatus,
				contentType: theResponse.headers ["content-type"],
				contentLocation,
				contentLength,
				body: Buffer.alloc (0)
				});
			return;
			}
		const theChunks = [];
		theResponse.on ("data", function (theChunk) {
			theChunks.push (theChunk);
			});
		theResponse.on ("end", function () {
			unzipBody (Buffer.concat (theChunks), theResponse.headers ["content-encoding"], function (theBody) { //11/18/26 by CC
				callback (undefined, {
					url: theUrl,
					status: theStatus,
					statusMessage: theResponse.statusMessage, //11/12/26 by CC -- the server's words for the status, "Not Found"; see getServerErrorMessage
					contentType: theResponse.headers ["content-type"],
					headers: theResponse.headers, //11/19/26 by CC -- everything the server said, for a page handler's options
					contentLocation,
					contentLength,
					body: theBody //10/12/26 by CC -- a Buffer, not a string: a favicon is binary; a page's text is body.toString ()
					});
				});
			});
		});
	theRequest.on ("error", function (err) {
		callback ({message: "Can't get " + theUrl + " because " + err.message + "."});
		});
	}

/*  Is it a page? The charter's rules, in order. text/markdown is a page.
	text/plain or a generic binary type with a path ending in .md or
	.markdown is a page. Anything else, HTML included, is not.  */

function isMarkdownPage (theUrl, theContentType) {
	var theType = "";
	if (theContentType !== undefined) {
		theType = theContentType.split (";") [0].trim ().toLowerCase ();
		}
	if (theType === "text/markdown") {
		return (true);
		}
	const flGenericType = (theType === "text/plain") || (theType === "application/octet-stream") || (theType === "");
	if (flGenericType) {
		var thePath = "";
		try {
			thePath = new URL (theUrl).pathname.toLowerCase ();
			}
		catch (err) {
			}
		if (thePath.endsWith (".md") || thePath.endsWith (".markdown")) {
			return (true);
			}
		}
	return (false);
	}

function getPageKind (theUrl, theContentType) { //10/27/26 by CC -- what a non-Markdown answer is, when it's something we show: "html", "xml", "image", "text", or undefined

	/*  Dave, 10/27: a link to an HTML page shows the page's source, the
		mirror of what Chrome does with a link to a Markdown file. Not the
		final answer, on the way to one. Later the same day: XML formats
		too, RSS, OPML, any XML, "no bullshit, show the xml"; and pictures
		we can easily show, gif, png, jpeg, the way Chrome shows an image
		file. The extensions count, and for an address without one the
		server's content type decides; the GET that fetched the page
		answers that, so no HEAD request is needed. Not every type yet;
		"let's just get started."
		
		11/10/26: "text", code and plain text, JavaScript, CSS, JSON, a
		file with no extension that the server calls text: a listing, the
		way a gist is shown (Dave: "we should try to make it work for any
		content type"). What's left after that, an archive say, getPage
		answers as a "file", a page that offers the download.  */
	
	var theType = "";
	if (theContentType !== undefined) {
		theType = theContentType.split (";") [0].trim ().toLowerCase ();
		}
	var thePath = "";
	try {
		thePath = new URL (theUrl).pathname.toLowerCase ();
		}
	catch (err) {
		}
	function hasExtension (theExtensions) {
		var flHas = false;
		theExtensions.forEach (function (theExtension) {
			if (thePath.endsWith (theExtension)) {
				flHas = true;
				}
			});
		return (flHas);
		}
	if ((theType === "text/html") || (theType === "application/xhtml+xml") || hasExtension ([".html", ".htm"])) {
		return ("html");
		}
	if ((theType === "text/xml") || (theType === "application/xml") || theType.endsWith ("+xml") || (theType === "text/x-opml") || (theType === "application/x-opml") || hasExtension ([".xml", ".rss", ".opml", ".atom", ".rdf"])) {
		return ("xml");
		}
	if ((theType === "image/gif") || (theType === "image/png") || (theType === "image/jpeg") || (theType === "image/webp") || hasExtension ([".gif", ".png", ".jpg", ".jpeg", ".webp"])) {
		return ("image");
		}
	if ((theType.indexOf ("text/") === 0) || (theType === "application/json") || (theType === "application/javascript") || (theType === "application/x-javascript") || (theType === "application/yaml") || hasExtension ([".txt", ".js", ".css", ".json", ".yaml", ".yml", ".py", ".sh", ".c", ".h", ".php", ".rb", ".go", ".rs", ".java", ".ts", ".sql", ".csv", ".ini", ".toml"])) { //11/10/26 by CC
		return ("text");
		}
	return (undefined);
	}

function getImageTypeForKind (theUrl, theContentType) { //the type for an image's data URL: the server's, or from the extension when the server didn't say image
	var theType = (theContentType === undefined) ? "" : theContentType.split (";") [0].trim ().toLowerCase ();
	if (theType.indexOf ("image/") !== 0) {
		var thePath = "";
		try {
			thePath = new URL (theUrl).pathname.toLowerCase ();
			}
		catch (err) {
			}
		theType = (thePath.endsWith (".gif")) ? "image/gif" : (thePath.endsWith (".png")) ? "image/png" : (thePath.endsWith (".webp")) ? "image/webp" : "image/jpeg";
		}
	return (theType);
	}

function getHtmlTitle (htmltext) { //the text of the <title> element, or undefined
	const theMatch = htmltext.match (/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (theMatch === null) {
		return (undefined);
		}
	const theTitle = theMatch [1].replace (/\s+/g, " ").trim ();
	return ((theTitle.length === 0) ? undefined : theTitle);
	}

function getServerErrorMessage (theResponse) { //11/12/26 by CC -- what to tell the reader when the server answered with something other than the page

	/*  Dave, 11/12: every failure had been one broken-link icon, whatever
		went wrong, "inexcusable". The shell now does what his apps do
		everywhere, alertDialog (err.message), so the message has to be
		worth reading. "in my servers they often give a legible error msg
		that would explain it well to a user": when the server sent a
		short piece of plain text, that's the message, as it came, nothing
		wrapped around it. Otherwise the server's words for the status,
		in quotes ("404 is a number. use the error string in quotes").  */

	const maxLegibleLength = 300;
	var theType = "";
	if (theResponse.contentType !== undefined) {
		theType = theResponse.contentType.split (";") [0].trim ().toLowerCase ();
		}
	if (theType === "text/plain") {
		const theText = theResponse.body.toString ().trim ();
		if ((theText.length > 0) && (theText.length <= maxLegibleLength)) {
			return (theText);
			}
		}
	var theWords = theResponse.statusMessage;
	if ((theWords === undefined) || (theWords.length === 0)) {
		theWords = http.STATUS_CODES [theResponse.status];
		}
	if (theWords === undefined) {
		return ("Can't get the page because the server returned status " + theResponse.status + ".");
		}
	return ("Can't get the page because the server said \"" + theWords + ".\"");
	}

function getPage (theUrl, callback) { //answers {flOk, url, frontMatter, html, source}, or {flOk, kind, url, title, source or imageData}, or for kind "file" {flOk, kind, url, title, contentType, size}, or {flOk: false, url, status, message}. 11/10/26: every flOk answer has urlContentLocation when the server named the file it sent, so the shell can find a folder's address in the site's table of contents by its readme's
	
	/*  11/17/26 by CC -- NOT ACCEPTABLE. We ask every server for Markdown.
		Most that have only HTML send it anyway, and a clicked link to it
		opens in the reader's historic browser. GitHub doesn't: it answers
		406, Not Acceptable, and sends nothing, so the link to the repo's
		Issues page got a dialog (Dave: "otherwise i can't tell them where
		to go if they have comments or need support"). When a server says
		that, we ask once more, for whatever it has, and what comes back is
		handled like any other answer.  */
	
	const acceptForPage = "text/markdown, text/x-opml", acceptForAnything = "*/*";
	function isBodyWantedForPage (urlAnswered, theContentType) { //11/10/26 by CC -- the body is read only for what we draw
		return (isMarkdownPage (urlAnswered, theContentType) || (getPageKind (urlAnswered, theContentType) !== undefined));
		}
	function askForPage (urlToGet, acceptHeader) {
		httpGet (urlToGet, 0, function (err, theResponse) {
			if ((!err) && (theResponse.status === 406) && (acceptHeader === acceptForPage)) {
				askForPage (theResponse.url, acceptForAnything);
				}
			else {
				gotResponse (err, theResponse);
				}
			}, acceptHeader, false, isBodyWantedForPage);
		}
	function gotResponse (err, theResponse) { //10/27/26 by CC -- the Accept, acceptForPage: text/markdown as the charter says, and text/x-opml too, since PagePark wraps an .opml file in an HTML page unless it's asked for the outline (the toc request learned this on 10/17); a Markdown page still comes back as before
		if (err) {
			callback ({flOk: false, url: theUrl, status: 0, message: err.message});
			}
		else {
			if (theResponse.status !== 200) {
				callback ({flOk: false, url: theResponse.url, status: theResponse.status, message: getServerErrorMessage (theResponse)}); //11/12/26 by CC
				}
			else {
				if (isMarkdownPage (theResponse.url, theResponse.contentType)) {
					const thePage = frontMatter.splitFrontMatter (theResponse.body.toString ()); //10/12/26 by CC -- the YAML block comes off the top first
					callback ({flOk: true, url: theResponse.url, urlContentLocation: theResponse.contentLocation, frontMatter: thePage.frontMatter, html: markdownConverter.convertMarkdownToHtml (thePage.markdown), source: theResponse.body.toString ()}); //10/13/26 by CC -- source: the file as it came, for View Source
					}
				else {
					const theKind = getPageKind (theResponse.url, theResponse.contentType); //10/27/26 by CC -- html and xml: the source, shown as text; image: the picture, as a data URL, the way favicons travel
					if (theKind === "html") {
						const htmltext = theResponse.body.toString ();
						callback ({flOk: true, kind: theKind, url: theResponse.url, urlContentLocation: theResponse.contentLocation, title: getHtmlTitle (htmltext), source: htmltext, contentType: theResponse.contentType, headers: theResponse.headers}); //11/19/26 by CC -- contentType and headers, here and in the next answer, for page handlers; see pageHandlers.js in the app
						}
					else if ((theKind === "xml") || (theKind === "text")) {
						callback ({flOk: true, kind: theKind, url: theResponse.url, urlContentLocation: theResponse.contentLocation, title: undefined, source: theResponse.body.toString (), contentType: theResponse.contentType, headers: theResponse.headers});
						}
					else if (theKind === "image") {
						callback ({flOk: true, kind: theKind, url: theResponse.url, urlContentLocation: theResponse.contentLocation, title: undefined, imageData: "data:" + getImageTypeForKind (theResponse.url, theResponse.contentType) + ";base64," + theResponse.body.toString ("base64")});
						}
					else { //11/10/26 by CC -- anything else is a file to download; it was the charter's 406 page. The body wasn't read, see isBodyWanted
						callback ({flOk: true, kind: "file", url: theResponse.url, urlContentLocation: theResponse.contentLocation, title: undefined, contentType: theResponse.contentType, size: theResponse.contentLength});
						}
					}
				}
			}
		}
	
	askForPage (theUrl, acceptForPage);
}

/*  10/12/26 by CC -- FAVICONS. A site's icon comes from /favicon.ico at
	the root of the site, the way Chrome gets it when a page doesn't say
	otherwise, and a Markdown page can't. The shell asks for the icon for
	a page's URL and gets it as a data URL it can put in an img, or
	undefined when the site has none. One request per site per run; the
	answer, including no answer, is remembered.  */

var faviconCache = {}; //origin -> data URL, or undefined when the site has no icon

function getImageType (theBuffer) { //what kind of image the bytes say this is, or undefined when they say it isn't one

	/*  Servers don't always say what a favicon is: scripting.com's comes
		back as text/plain. Chrome looks at the bytes; so do we.  */
	
	if (theBuffer.length >= 8) {
		if ((theBuffer [0] === 0) && (theBuffer [1] === 0) && (theBuffer [2] === 1) && (theBuffer [3] === 0)) {
			return ("image/x-icon");
			}
		if ((theBuffer [0] === 0x89) && (theBuffer.toString ("latin1", 1, 4) === "PNG")) {
			return ("image/png");
			}
		if (theBuffer.toString ("latin1", 0, 4) === "GIF8") {
			return ("image/gif");
			}
		if ((theBuffer [0] === 0xFF) && (theBuffer [1] === 0xD8)) {
			return ("image/jpeg");
			}
		if (theBuffer.toString ("latin1", 0, 256).toLowerCase ().indexOf ("<svg") !== -1) {
			return ("image/svg+xml");
			}
		}
	return (undefined);
	}

function getFavicon (theUrl, callback) { //callback (theFavicon): a data URL, or undefined
	var theOrigin;
	try {
		theOrigin = new URL (theUrl).origin;
		}
	catch (err) {
		callback (undefined);
		return;
		}
	const theCached = getCached (faviconCache, theOrigin);
	if (theCached.flCached) {
		callback (theCached.value);
		return;
		}
	httpGet (theOrigin + "/favicon.ico", 0, function (err, theResponse) {
		var theFavicon;
		if (!err && (theResponse.status === 200)) {
			var theType = (theResponse.contentType === undefined) ? "" : theResponse.contentType.split (";") [0].trim ().toLowerCase ();
			if (theType.indexOf ("image/") !== 0) { //the server didn't say it's an image, or said something else; the bytes decide
				theType = getImageType (theResponse.body);
				}
			if (theType !== undefined) {
				theFavicon = "data:" + theType + ";base64," + theResponse.body.toString ("base64");
				}
			}
		setCached (faviconCache, theOrigin, theFavicon);
		callback (theFavicon);
		});
	}

var tocCache = {}; //10/17/26 by CC -- origin -> the text of /.well-known/toc.opml, or undefined when the site has none; one request per site per run, like favicons

const siteSettingNames = ["urlSearch", "urlUpdateSocket", "urlMirrorOf"]; //11/13/26 by CC -- what a site's bonbon.json can tell us

function getSiteSettings (urlFolder, callback) { //11/13/26 by CC -- the folder's /.well-known/bonbon.json as an object, empty when there's no file or it doesn't parse; callback (theSettings)

	/*  Dave, 11/13: the head of toc.opml had become where a site tells
		BonBon about itself, and that isn't table of contents, "this is
		not good data design." The site says those things in a file of
		its own now, bonbon.json, beside toc.opml in .well-known. A clean
		cut, his call: the head isn't read for them any more.  */
	
	httpGet (urlFolder + ".well-known/bonbon.json", 0, function (err, theResponse) {
		var theSettings = {};
		if ((!err) && (theResponse.status === 200)) {
			try {
				const jstruct = JSON.parse (theResponse.body.toString ());
				if ((typeof jstruct === "object") && (jstruct !== null) && !Array.isArray (jstruct)) {
					theSettings = jstruct;
					}
				}
			catch (err) {
				console.log ("Can't use " + urlFolder + ".well-known/bonbon.json because it didn't parse: " + err.message);
				}
			}
		callback (theSettings);
		}, "application/json");
	}
function copySiteSettings (theSettings, theTarget) { //11/13/26 by CC -- the settings go on the outline's head, or on an include node; anything the outline said for itself under those names is dropped
	siteSettingNames.forEach (function (name) {
		delete theTarget [name];
		if (typeof theSettings [name] === "string") {
			theTarget [name] = theSettings [name];
			}
		});
	}
function expandTocIncludes (opmltext, theOrigin, callback) { //11/4/26 by CC -- the outline with its include nodes filled in, and, 11/13/26, each site's settings from its bonbon.json; callback (opmltext)

	/*  A domain can hold more than one site (Dave, 11/4: "why can't one
		of your domains host two collections of writing... all websites
		do that"). The root's toc.opml describes the domain, and each
		folder's own toc.opml comes in through an include node, the
		outliner's way: <outline type="include" url="..."/>. Here the
		included outline's children go under the include node, and the
		folder's urlSearch, urlUpdateSocket and urlMirrorOf go on the node, so
		the shell can find the search and the socket for the folder the
		page is in (getSiteToc in index.js). 11/13/26: those three come
		from the folder's own .well-known/bonbon.json, and the domain's
		from the root's, which go on the outline's head. Modeled on expandIncludes in
		the opml package, but the request is ours, with the Accept header
		PagePark needs for an .opml file. An include that can't be read
		stays an empty node. If the text isn't an outline it goes back as
		it came.  */
	
	var theOutline;
	try {
		opml.parse (opmltext, function (err, parsed) {
			if (!err) {
				theOutline = parsed;
				}
			});
		}
	catch (err) {
		}
	if (theOutline === undefined) {
		callback (opmltext);
		return;
		}
	const includeNodes = [];
	function findIncludes (theNode) {
		if (theNode.subs !== undefined) {
			theNode.subs.forEach (function (theSub) {
				if ((theSub.type === "include") && (theSub.url !== undefined)) {
					includeNodes.push (theSub);
					}
				else {
					findIncludes (theSub);
					}
				});
			}
		}
	findIncludes (theOutline.opml.body);
	var ctRemaining = includeNodes.length + 1; //11/13/26 by CC -- the includes, and the root's settings
	function oneDone () {
		ctRemaining--;
		if (ctRemaining === 0) {
			callback (opml.stringify (theOutline));
			}
		}
	if (theOutline.opml.head === undefined) {
		theOutline.opml.head = {};
		}
	getSiteSettings (theOrigin + "/", function (theSettings) { //11/13/26 by CC
		copySiteSettings (theSettings, theOutline.opml.head);
		oneDone ();
		});
	includeNodes.forEach (function (theNode) {
		httpGet (theNode.url, 0, function (err, theResponse) {
			if (err || (theResponse.status !== 200)) {
				console.log ("Can't include " + theNode.url + " in the table of contents because " + ((err) ? err.message : "the server answered " + theResponse.status + "."));
				oneDone ();
				return;
				}
			try {
				opml.parse (theResponse.body.toString (), function (err, theIncluded) {
					if (err) {
						console.log ("Can't include " + theNode.url + " in the table of contents because it didn't parse: " + err.message);
						}
					else {
						theNode.subs = (theIncluded.opml.body.subs === undefined) ? [] : theIncluded.opml.body.subs;
						}
					const ixWellKnown = theNode.url.lastIndexOf ("/.well-known/");
					if (err || (ixWellKnown === -1)) {
						oneDone ();
						}
					else {
						getSiteSettings (theNode.url.substr (0, ixWellKnown + 1), function (theSettings) { //11/13/26 by CC -- the folder the included outline describes; urlMirrorOf is for getMirrorUrl in index.js
							copySiteSettings (theSettings, theNode);
							oneDone ();
							});
						}
					});
				}
			catch (err) {
				console.log ("Can't include " + theNode.url + " in the table of contents because it didn't parse: " + err.message);
				oneDone ();
				}
			}, "text/x-opml");
		});
	}

function getToc (theUrl, callback) { //10/17/26 by CC -- the site's table of contents, an OPML outline at a well-known address (Dave, 10/17); callback (opmltext), undefined when the site has none; the shell parses it
	var theOrigin;
	try {
		theOrigin = new URL (theUrl).origin;
		}
	catch (err) {
		callback (undefined);
		return;
		}
	const theCached = getCached (tocCache, theOrigin);
	if (theCached.flCached) {
		callback (theCached.value);
		return;
		}
	httpGet (theOrigin + "/.well-known/toc.opml", 0, function (err, theResponse) {
		const opmltext = ((!err) && (theResponse.status === 200)) ? theResponse.body.toString () : undefined;
		if (opmltext === undefined) {
			setCached (tocCache, theOrigin, undefined);
			callback (undefined);
			}
		else {
			expandTocIncludes (opmltext, theOrigin, function (expandedText) { //11/4/26 by CC
				setCached (tocCache, theOrigin, expandedText);
				callback (expandedText);
				});
			}
		}, "text/x-opml");
	}

var markdownUrlAnswers = {}; //10/16/26 by CC -- url -> true or false, the answers to isMarkdownUrl, so a site is asked once per run

function isMarkdownUrl (theUrl, callback) { //10/16/26 by CC -- does this address serve a Markdown page? For the author's link, which is only a link when it points at one (Dave, 10/16); callback (flMarkdown)
	const theCached = getCached (markdownUrlAnswers, theUrl);
	if (theCached.flCached) {
		callback (theCached.value);
		return;
		}
	httpGet (theUrl, 0, function (err, theResponse) {
		const flMarkdown = (!err) && (theResponse.status === 200) && isMarkdownPage (theResponse.url, theResponse.contentType);
		setCached (markdownUrlAnswers, theUrl, flMarkdown);
		callback (flMarkdown);
		}, "text/markdown", true); //11/9/26 by CC -- headers only: the demo asks about every link on a page as it's drawn
	}

var urlStatusAnswers = {}; //11/10/26 by CC -- url -> {flAvailable, urlContentLocation}, the answers to getUrlStatus

function getUrlStatus (theUrl, callback) { //11/10/26 by CC -- is there something at this address, and which file does the server say it sent? For the arrows that come from a site's table of contents: a line for a folder with no readme is skipped, and a folder's line and its readme's line are known to be one page; callback ({flAvailable, urlContentLocation})
	const theCached = getCached (urlStatusAnswers, theUrl);
	if (theCached.flCached) {
		callback (theCached.value);
		return;
		}
	httpGet (theUrl, 0, function (err, theResponse) {
		const theStatus = {
			flAvailable: (!err) && (theResponse.status === 200),
			urlContentLocation: (err) ? undefined : theResponse.contentLocation
			};
		setCached (urlStatusAnswers, theUrl, theStatus);
		callback (theStatus);
		}, "text/markdown, text/x-opml", true); //headers only
	}

exports.init = init;
exports.httpGet = httpGet;
exports.isMarkdownPage = isMarkdownPage;
exports.getPageKind = getPageKind;
exports.getPage = getPage;
exports.getFavicon = getFavicon;
exports.getToc = getToc;
exports.isMarkdownUrl = isMarkdownUrl;
exports.getUrlStatus = getUrlStatus;
