const myVersion = "0.4.0", myProductName = "mdVaultRead";

/*  The MIT License (MIT)
	Copyright (c) 2026 Dave Winer

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
	*/

/*  What this is
	An Obsidian vault is a folder of Markdown files. Many people keep theirs in a public repo on GitHub.
	You give this app the GitHub address of a vault, in the url parameter.
	With the address of the vault, or a folder in it, it answers with a page that lists the files, each a link.
	With the address of a file, it answers with the file's Markdown, with the [[links]] turned into real links.
	Those links come back through this app, so the next page gets the same treatment.
	Nothing is saved. There's no database. A vault's list of files is remembered for an hour, GitHub limits how often we can ask for it.
	It's the sibling of mdFeedRead, which does this for RSS feeds.
	Written by Claude, working with Dave Winer, 11/28/26.
	*/

const utils = require ("daveutils");
const davehttp = require ("davehttp");
const request = require ("request");
const pathTool = require ("path").posix; //the paths here are a repo's, always with forward slashes

var config = {
	port: undefined, //PagePark gives us the port, in PORT
	flAllowAccessFromAnywhere: true,
	flLogToConsole: false,
	urlDefaultVault: "https://github.com/obsidianmd/obsidian-help/tree/master/en", //the vault we show when the address doesn't name one
	cacheMinutes: 60, //how long we remember a vault's list of files
	userAgent: myProductName + "/" + myVersion,
	timeoutSecs: 20
	};

var theVaults = {}; //the lists of files we remember, one per repo and branch: {whenRead, thePaths, pathsByName, flTruncated}

function nowString () {
	return (new Date ().toLocaleTimeString ());
	}
function getYamlString (theString) { //a string for a line of front matter, in double quotes
	return (JSON.stringify (String (theString)));
	}
function getLinkText (theString) { //text that can sit between the brackets of a link
	return (String (theString).replace (/([\[\]])/g, "\\$1"));
	}
function getEncodedPath (thePath) { //a path for an address, each part encoded, the slashes kept
	var encodedPath = "";
	thePath.split ("/").forEach (function (thePart) {
		if (encodedPath.length > 0) {
			encodedPath += "/";
			}
		encodedPath += encodeURIComponent (thePart);
		});
	return (encodedPath);
	}
function getDecoded (theString) { //decodeURIComponent that can't throw
	try {
		return (decodeURIComponent (theString));
		}
	catch (err) {
		return (theString);
		}
	}
function isMarkdownPath (thePath) {
	const lowerPath = thePath.toLowerCase ();
	return (utils.endsWith (lowerPath, ".md") || utils.endsWith (lowerPath, ".markdown"));
	}
function getNameFromPath (thePath) { //"en/Getting started/Create a vault.md" gives "Create a vault", what Obsidian shows as the page's title
	return (pathTool.basename (thePath).replace (/\.(md|markdown)$/i, ""));
	}
function getHeadingId (theHeading) { //the id a heading gets when the Markdown is drawn, so a link can go to it
	return (utils.trimWhitespace (theHeading).toLowerCase ().replace (/[^a-z0-9 \-_]/g, "").replace (/ /g, "-"));
	}

function getPlaceFromUrl (theUrl) { //takes a GitHub address apart: {owner, repo, branch, path, kind}, kind is "folder" or "file"; undefined if it isn't one
	var urlParts;
	try {
		urlParts = new URL (theUrl);
		}
	catch (err) {
		return (undefined);
		}
	if ((urlParts.protocol !== "https:") && (urlParts.protocol !== "http:")) {
		return (undefined);
		}
	var theParts = [];
	urlParts.pathname.split ("/").forEach (function (thePart) {
		if (thePart.length > 0) {
			theParts.push (getDecoded (thePart));
			}
		});
	const theHost = urlParts.hostname.toLowerCase ();
	if ((theHost === "github.com") || (theHost === "www.github.com")) {
		if (theParts.length < 2) {
			return (undefined);
			}
		if (theParts.length === 2) { //github.com/owner/repo, the whole repo
			return ({owner: theParts [0], repo: theParts [1].replace (/\.git$/, ""), branch: "HEAD", path: "", kind: "folder"});
			}
		if ((theParts.length >= 4) && ((theParts [2] === "tree") || (theParts [2] === "blob") || (theParts [2] === "raw"))) {
			return ({owner: theParts [0], repo: theParts [1], branch: theParts [3], path: theParts.slice (4).join ("/"), kind: (theParts [2] === "tree") ? "folder" : "file"});
			}
		return (undefined);
		}
	if (theHost === "raw.githubusercontent.com") { //raw.githubusercontent.com/owner/repo/branch/path
		if (theParts.length < 4) {
			return (undefined);
			}
		return ({owner: theParts [0], repo: theParts [1], branch: theParts [2], path: theParts.slice (3).join ("/"), kind: "file"});
		}
	return (undefined);
	}
function getGitHubUrl (thePlace, thePath, kind) { //the address on GitHub of a file or folder in the same repo
	var theUrl = "https://github.com/" + encodeURIComponent (thePlace.owner) + "/" + encodeURIComponent (thePlace.repo);
	if ((thePath.length > 0) || (thePlace.branch !== "HEAD") || (kind === "file")) {
		theUrl += ((kind === "file") ? "/blob/" : "/tree/") + encodeURIComponent (thePlace.branch);
		if (thePath.length > 0) {
			theUrl += "/" + getEncodedPath (thePath);
			}
		}
	return (theUrl);
	}
function getRawUrl (thePlace, thePath) { //where GitHub gives us the file itself
	return ("https://raw.githubusercontent.com/" + encodeURIComponent (thePlace.owner) + "/" + encodeURIComponent (thePlace.repo) + "/" + encodeURIComponent (thePlace.branch) + "/" + getEncodedPath (thePath));
	}
function getOurUrl (thePlace, thePath, kind, theHeading) { //a link that comes back through us; it starts with a slash so it works wherever we're running
	var theUrl = "/?url=" + encodeURIComponent (getGitHubUrl (thePlace, thePath, kind));
	if ((theHeading !== undefined) && (theHeading.length > 0)) {
		theUrl += "#" + getHeadingId (theHeading);
		}
	return (theUrl);
	}

function httpRead (theUrl, callback) { //calls back with (err, theText)
	const theRequest = {
		url: theUrl,
		headers: {"User-Agent": config.userAgent},
		timeout: config.timeoutSecs * 1000
		};
	request (theRequest, function (err, response, body) {
		if (err) {
			callback (err);
			}
		else {
			if ((response.statusCode >= 200) && (response.statusCode <= 299)) {
				callback (undefined, body);
				}
			else {
				var message = "the answer was " + response.statusCode;
				if ((response.statusCode === 403) || (response.statusCode === 429)) {
					if (String (response.headers ["x-ratelimit-remaining"]) === "0") {
						message = "we've asked GitHub too many times this hour, try again in a while";
						}
					}
				if (response.statusCode === 404) {
					message = "GitHub says it isn't there";
					}
				callback ({message, statusCode: response.statusCode});
				}
			}
		});
	}

function getVault (thePlace, callback) { //the list of files in the repo, from GitHub or from what we remember; calls back with (err, theVault)
	const theKey = (thePlace.owner + "/" + thePlace.repo + "/" + thePlace.branch).toLowerCase ();
	const theVault = theVaults [theKey];
	if ((theVault !== undefined) && (utils.secondsSince (theVault.whenRead) < (config.cacheMinutes * 60))) {
		callback (undefined, theVault);
		}
	else {
		const urlTree = "https://api.github.com/repos/" + encodeURIComponent (thePlace.owner) + "/" + encodeURIComponent (thePlace.repo) + "/git/trees/" + encodeURIComponent (thePlace.branch) + "?recursive=1";
		httpRead (urlTree, function (err, theText) {
			if (err) {
				callback (err);
				}
			else {
				var jstruct;
				try {
					jstruct = JSON.parse (theText);
					}
				catch (err) {
					callback (err);
					return;
					}
				if (!Array.isArray (jstruct.tree)) {
					const message = "Can't list the files in " + thePlace.owner + "/" + thePlace.repo + " because GitHub's answer has no list of files in it.";
					callback ({message});
					}
				else {
					var newVault = {whenRead: new Date (), thePaths: [], pathsByName: {}, flTruncated: jstruct.truncated === true};
					jstruct.tree.forEach (function (theEntry) {
						if (theEntry.type === "blob") {
							const theName = pathTool.basename (theEntry.path).toLowerCase ();
							newVault.thePaths.push (theEntry.path);
							if (newVault.pathsByName [theName] === undefined) {
								newVault.pathsByName [theName] = [];
								}
							newVault.pathsByName [theName].push (theEntry.path);
							}
						});
					theVaults [theKey] = newVault;
					console.log (nowString () + ": read the list of files for " + theKey + ", " + newVault.thePaths.length + " files.");
					callback (undefined, newVault);
					}
				}
			});
		}
	}

function findFile (theVault, linkPath, pagePath) { //Obsidian's rule: a link names a file anywhere in the vault, by its name or by the end of its path; with more than one match we take the one nearest the page the link is on
	var bestPath, bestScore = -1;
	const folderOfPage = pathTool.dirname (pagePath) + "/";
	function tryName (theName) {
		const lowerName = theName.toLowerCase ().replace (/^\/+/, "");
		const thePaths = theVault.pathsByName [pathTool.basename (lowerName)];
		if (thePaths !== undefined) {
			thePaths.forEach (function (thePath) {
				const lowerPath = thePath.toLowerCase ();
				if ((lowerPath === lowerName) || utils.endsWith (lowerPath, "/" + lowerName)) {
					var ctSame = 0; //how much of its path it shares with the page's folder
					while ((ctSame < folderOfPage.length) && (ctSame < thePath.length) && (folderOfPage [ctSame] === thePath [ctSame])) {
						ctSame++;
						}
					const theScore = (ctSame * 1000) - thePath.length; //nearest first, then the shortest path
					if ((bestPath === undefined) || (theScore > bestScore)) {
						bestPath = thePath;
						bestScore = theScore;
						}
					}
				});
			}
		}
	tryName (linkPath); //as written, [[picture.png]] or a name that has its extension
	if (bestPath === undefined) {
		tryName (linkPath + ".md");
		}
	return (bestPath);
	}

function forEachPieceOutsideCode (theText, processPiece) { //runs processPiece on the text that isn't in a code block or a code span, and puts it all back together
	var theLines = theText.split ("\n"), flInCodeBlock = false, theFence;
	theLines.forEach (function (theLine, ixLine) {
		const trimmedLine = utils.trimWhitespace (theLine);
		const flFenceLine = utils.beginsWith (trimmedLine, "```") || utils.beginsWith (trimmedLine, "~~~");
		if (flInCodeBlock) {
			if (flFenceLine && utils.beginsWith (trimmedLine, theFence)) {
				flInCodeBlock = false;
				}
			}
		else {
			if (flFenceLine) {
				flInCodeBlock = true;
				theFence = trimmedLine.substr (0, 3);
				}
			else {
				var thePieces = theLine.split (/(`[^`]*`)/), newLine = ""; //the odd-numbered pieces are code spans
				thePieces.forEach (function (thePiece, ixPiece) {
					if ((ixPiece % 2) === 0) {
						newLine += processPiece (thePiece);
						}
					else {
						newLine += thePiece;
						}
					});
				theLines [ixLine] = newLine;
				}
			}
		});
	return (theLines.join ("\n"));
	}
function fixRelativeLinks (theText, thePlace, theVault) { //a page is served from our address, not its place in the repo, so its relative links and pictures have to be made whole
	const folderOfPage = pathTool.dirname (thePlace.path);
	return (theText.replace (/(!?)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, function (theMatch, theBang, theLinkText, theHref, theTitle) {
		if (/^([a-z][a-z0-9+.\-]*:|\/|#)/i.test (theHref)) { //already whole: has a scheme, starts at the root, or points within the page
			return (theMatch);
			}
		var theHeading, hrefPath = theHref;
		const ixPound = theHref.indexOf ("#");
		if (ixPound !== -1) {
			theHeading = getDecoded (theHref.substr (ixPound + 1));
			hrefPath = theHref.substr (0, ixPound);
			}
		var thePath = pathTool.normalize (pathTool.join (folderOfPage, getDecoded (hrefPath)));
		if (utils.beginsWith (thePath, "../")) { //it points outside the repo
			return (theMatch);
			}
		if (theVault.pathsByName [pathTool.basename (thePath).toLowerCase ()] === undefined) { //not where it says; look for it the way a [[link]] is looked for
			const foundPath = findFile (theVault, getDecoded (hrefPath), thePlace.path);
			if (foundPath !== undefined) {
				thePath = foundPath;
				}
			}
		var newHref;
		if ((theBang === "!") || !isMarkdownPath (thePath)) {
			newHref = getRawUrl (thePlace, thePath);
			}
		else {
			newHref = getOurUrl (thePlace, thePath, "file", theHeading);
			}
		return (theBang + "[" + theLinkText + "](" + newHref + theTitle + ")");
		}));
	}
function fixWikiLinks (theText, thePlace, theVault) { //[[Name]], [[Name|other words]], [[Name#Heading]], [[folder/Name]]
	return (theText.replace (/(!?)\[\[([^\[\]]+)\]\]/g, function (theMatch, theBang, theInside) {
		if (theBang === "!") { //a page or picture placed inside this one; not done yet, left as it is
			return (theMatch);
			}
		const ixBar = theInside.search (/\\?\|/); //in a table the bar is written \|
		var theTarget = theInside, theWords;
		if (ixBar !== -1) {
			theTarget = theInside.substr (0, ixBar);
			theWords = theInside.substr (ixBar).replace (/^\\?\|/, "");
			}
		var theName = theTarget, theHeading;
		const ixPound = theTarget.indexOf ("#");
		if (ixPound !== -1) {
			theName = theTarget.substr (0, ixPound);
			theHeading = theTarget.substr (ixPound + 1);
			if (utils.beginsWith (theHeading, "^")) { //a link to a block, which we can't point at; go to the page
				theHeading = undefined;
				}
			}
		theName = utils.trimWhitespace (theName);
		if (theWords === undefined) {
			theWords = utils.trimWhitespace (theTarget).replace (/#\^?/g, " > ").replace (/^ > /, "");
			}
		theWords = getLinkText (utils.trimWhitespace (theWords));
		if (theName.length === 0) { //[[#Heading]], a heading on this page
			if (theHeading === undefined) {
				return (theWords);
				}
			else {
				return ("[" + theWords + "](#" + getHeadingId (theHeading) + ")");
				}
			}
		const thePath = findFile (theVault, theName, thePlace.path);
		if (thePath === undefined) { //Obsidian lets you link to a page that hasn't been written; we show the words
			return (theWords);
			}
		else {
			if (isMarkdownPath (thePath)) {
				return ("[" + theWords + "](" + getOurUrl (thePlace, thePath, "file", theHeading) + ")");
				}
			else {
				return ("[" + theWords + "](" + getRawUrl (thePlace, thePath) + ")");
				}
			}
		}));
	}

function getTrailLine (thePlace, flFile) { //the line at the bottom of every page: the way back up, folder by folder, and the same thing on GitHub
	var theLine = "[" + getLinkText (thePlace.repo) + "](" + getOurUrl (thePlace, "", "folder") + ")";
	var pathSoFar = "";
	const theParts = (thePlace.path.length === 0) ? [] : thePlace.path.split ("/");
	theParts.forEach (function (thePart, ixPart) {
		const flLast = ixPart === (theParts.length - 1);
		pathSoFar += ((pathSoFar.length > 0) ? "/" : "") + thePart;
		if (flLast) {
			theLine += " / " + getLinkText (flFile ? getNameFromPath (thePart) : thePart);
			}
		else {
			theLine += " / [" + getLinkText (thePart) + "](" + getOurUrl (thePlace, pathSoFar, "folder") + ")";
			}
		});
	theLine += " · [on GitHub](" + getGitHubUrl (thePlace, thePlace.path, flFile ? "file" : "folder") + ")"; //middle dot
	return ("---\n\n*" + theLine + "*\n");
	}
function getMarkdownForFile (thePlace, theVault, theFileText) { //a page of the vault, its links made real
	const theName = getNameFromPath (thePlace.path);
	var theFrontMatter = "", theBody = theFileText.replace (/\r\n/g, "\n");
	const theMatch = /^---\n([\s\S]*?)\n---[ \t]*(\n|$)/.exec (theBody);
	if (theMatch !== null) {
		theFrontMatter = theMatch [1];
		theBody = theBody.substr (theMatch [0].length);
		}
	if (!/^title\s*:/m.test (theFrontMatter)) { //in Obsidian the file's name is the page's title
		theFrontMatter = "title: " + getYamlString (theName) + ((theFrontMatter.length > 0) ? "\n" : "") + theFrontMatter;
		}
	theFrontMatter += "\ngenerator: " + getYamlString (myProductName + " v" + myVersion);

	theBody = forEachPieceOutsideCode (theBody, function (thePiece) {
		return (fixWikiLinks (fixRelativeLinks (thePiece, thePlace, theVault), thePlace, theVault));
		});

	var theText = "---\n" + theFrontMatter + "\n---\n\n";
	if (!/^\s*# /.test (theBody)) { //Obsidian draws the file's name above the page; the file itself usually has no headline
		theText += "# " + theName + "\n\n";
		}
	theText += utils.trimWhitespace (theBody) + "\n\n";
	theText += getTrailLine (thePlace, true);
	return (theText);
	}
function getMarkdownForFolder (thePlace, theVault) { //the home page: the Markdown files in the folder and the folders under it, each a link
	const thePrefix = (thePlace.path.length === 0) ? "" : thePlace.path + "/";
	const theTitle = (thePlace.path.length === 0) ? thePlace.repo : thePlace.repo + " / " + thePlace.path.split ("/").join (" / "); //"obsidian-help / en"
	var theFolders = [], foldersByName = {}, ctFiles = 0;
	theVault.thePaths.forEach (function (thePath) {
		if (utils.beginsWith (thePath, thePrefix) && isMarkdownPath (thePath)) {
			const pathInFolder = thePath.substr (thePrefix.length);
			var flHidden = false;
			pathInFolder.split ("/").forEach (function (thePart) {
				if (utils.beginsWith (thePart, ".")) { //.obsidian, .github and the like
					flHidden = true;
					}
				});
			if (!flHidden) {
				var folderName = pathTool.dirname (pathInFolder);
				if (folderName === ".") {
					folderName = "";
					}
				if (foldersByName [folderName] === undefined) {
					foldersByName [folderName] = {folderName, thePaths: []};
					theFolders.push (foldersByName [folderName]);
					}
				foldersByName [folderName].thePaths.push (thePath);
				ctFiles++;
				}
			}
		});
	theFolders.sort (function (folder1, folder2) { //the files at the top level first, then the folders by name
		return (folder1.folderName.toLowerCase ().localeCompare (folder2.folderName.toLowerCase ()));
		});

	var theText = "---\n";
	theText += "title: " + getYamlString (theTitle) + "\n";
	theText += "generator: " + getYamlString (myProductName + " v" + myVersion) + "\n";
	theText += "---\n\n";
	theText += "# " + theTitle + "\n\n";
	if (ctFiles === 0) {
		theText += "There's nothing to show because there are no Markdown files in this folder.\n\n";
		}
	else {
		theText += ctFiles + " page" + ((ctFiles === 1) ? "" : "s") + ".\n\n";
		theFolders.forEach (function (theFolder) {
			if (theFolder.folderName.length > 0) {
				theText += "## [" + getLinkText (theFolder.folderName) + "](" + getOurUrl (thePlace, thePrefix + theFolder.folderName, "folder") + ")\n\n";
				}
			theFolder.thePaths.sort (function (path1, path2) {
				return (path1.toLowerCase ().localeCompare (path2.toLowerCase ()));
				});
			theFolder.thePaths.forEach (function (thePath) {
				theText += "- [" + getLinkText (getNameFromPath (thePath)) + "](" + getOurUrl (thePlace, thePath, "file") + ")\n";
				});
			theText += "\n";
			});
		}
	if (theVault.flTruncated) {
		theText += "This repo has more files than GitHub will list at once, so some may be missing here.\n\n";
		}
	theText += getTrailLine (thePlace, false);
	return (theText);
	}
function getMarkdownForError (urlVault, message) { //a page that says what went wrong, in plain words
	var theText = "---\n";
	theText += "title: " + getYamlString ("Can't show the page") + "\n";
	theText += "generator: " + getYamlString (myProductName + " v" + myVersion) + "\n";
	theText += "---\n\n";
	theText += "# Can't show the page\n\n";
	theText += message + "\n\n";
	if ((typeof urlVault === "string") && (utils.beginsWith (urlVault, "http://") || utils.beginsWith (urlVault, "https://"))) {
		theText += "[The address we tried](" + urlVault + ")\n";
		}
	return (theText);
	}

function readVaultToMarkdown (urlVault, callback) { //calls back with (theText, urlRedirect): a page of Markdown, a folder's list or a file or what went wrong; or the place to go for a file that isn't Markdown
	const thePlace = getPlaceFromUrl (urlVault);
	if (thePlace === undefined) {
		const message = "Can't read the vault at " + String (urlVault).replace (/\s+/g, " ") + " because that isn't the address of a repo, a folder or a file on GitHub. It has to look like https://github.com/owner/repo.";
		callback (getMarkdownForError (urlVault, message));
		}
	else {
		if ((thePlace.kind === "file") && !isMarkdownPath (thePlace.path)) { //a picture, a PDF; send them to the file itself
			callback (undefined, getRawUrl (thePlace, thePlace.path));
			}
		else {
			getVault (thePlace, function (err, theVault) {
				if (err) {
					const message = "Can't list the files in " + thePlace.owner + "/" + thePlace.repo + " because " + utils.trimWhitespace (String (err.message)).replace (/\.$/, "") + ".";
					console.log (nowString () + ": " + message);
					callback (getMarkdownForError (urlVault, message));
					}
				else {
					if (thePlace.kind === "folder") {
						callback (getMarkdownForFolder (thePlace, theVault));
						}
					else {
						httpRead (getRawUrl (thePlace, thePlace.path), function (err, theFileText) {
							if (err) {
								const message = "Can't read " + thePlace.path + " in " + thePlace.owner + "/" + thePlace.repo + " because " + utils.trimWhitespace (String (err.message)).replace (/\.$/, "") + ".";
								console.log (nowString () + ": " + message);
								callback (getMarkdownForError (urlVault, message));
								}
							else {
								callback (getMarkdownForFile (thePlace, theVault, String (theFileText)));
								}
							});
						}
					}
				});
			}
		}
	}

function handleHttpRequest (theRequest) {
	const params = theRequest.params;
	function returnMarkdown (theText) {
		theRequest.httpReturn (200, "text/markdown; charset=utf-8", theText);
		}
	function returnRedirect (url) {
		theRequest.httpReturn (302, "text/plain", "302 REDIRECT", {location: url});
		}
	switch (theRequest.lowermethod) {
		case "get":
			switch (theRequest.lowerpath) {
				case "/":
					if (params.url === undefined) { //no vault named, show the default one
						returnRedirect ("/?url=" + encodeURIComponent (config.urlDefaultVault));
						}
					else {
						readVaultToMarkdown (params.url, function (theText, urlRedirect) {
							if (urlRedirect === undefined) {
								returnMarkdown (theText);
								}
							else {
								returnRedirect (urlRedirect);
								}
							});
						}
					return (true);
				case "/now":
					theRequest.httpReturn (200, "text/plain", myProductName + " v" + myVersion + ", " + new Date ().toString ());
					return (true);
				}
			break;
		}
	theRequest.httpReturn (404, "text/plain", "Can't find " + theRequest.path + " because " + myProductName + " has one page, at /, and it needs a url parameter."); //everything gets an answer; a browser asks for a table of contents and a favicon and waits for them
	return (true);
	}

function startup () {
	utils.readConfig ("config.json", config, function () {
		if (process.env.PORT !== undefined) { //PagePark's port wins over the file's
			config.port = process.env.PORT;
			}
		console.log ("\n" + myProductName + " v" + myVersion + ", config == " + utils.jsonStringify (config) + "\n");
		if (config.port === undefined) {
			console.log ("Can't start " + myProductName + " because there is no port. PagePark sets it in PORT.");
			}
		else {
			davehttp.start (config, handleHttpRequest);
			}
		});
	}

if (require.main === module) {
	startup ();
	}
else { //for testing the pages without a server
	module.exports = {readVaultToMarkdown, getPlaceFromUrl, getMarkdownForFile, findFile};
	}
