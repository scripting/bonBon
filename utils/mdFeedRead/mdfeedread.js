const myVersion = "0.4.1", myProductName = "mdFeedRead";

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
	You give it the address of an RSS 2.0 feed, in the url parameter.
	It reads the feed, right then, and answers with one page of Markdown: the items in the feed, newest first.
	An item is on the page only if it has a source:markdown element.
	The page is modeled on daveverse.org: a heading for each day, the day's untitled posts and then its titled ones, a # at the end of a post linking to it.
	Nothing is saved. There's no database.
	Written by Claude, working with Dave Winer, 11/26/26.
	*/

const utils = require ("daveutils");
const davehttp = require ("davehttp");
const reallysimple = require ("reallysimple");

var config = {
	port: undefined, //PagePark gives us the port, in PORT
	flAllowAccessFromAnywhere: true,
	flLogToConsole: false,
	urlDefaultFeed: "http://scripting.com/rss.xml", //the feed we show when the address doesn't name one
	timeZone: "America/New_York" //the days are the author's days; we don't know the author's time zone yet, so it's Eastern for everyone (Dave, 11/27/26)
	};

function nowString () {
	return (new Date ().toLocaleTimeString ());
	}
function getYamlString (theString) { //a string for a line of front matter, in double quotes
	return (JSON.stringify (String (theString)));
	}
function getOneLine (theString) { //a title or a name on one line, so it can't break a heading
	return (utils.trimWhitespace (String (theString).replace (/\s+/g, " ")));
	}
function isWebAddress (theString) {
	return ((typeof theString === "string") && (utils.beginsWith (theString, "http://") || utils.beginsWith (theString, "https://")));
	}
function getDayString (theDate) { //"Thursday, November 26, 2026", the day in the author's time zone, see config.timeZone; undefined if it isn't a date
	const when = new Date (theDate);
	if (isNaN (when.getTime ())) {
		return (undefined);
		}
	else {
		return (when.toLocaleDateString ("en-US", {timeZone: config.timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric"}));
		}
	}
function getItemUrl (item) { //where the # points: the post's link, or its guid when there's no link; undefined when neither is a web address
	if (isWebAddress (item.link)) {
		return (item.link);
		}
	if (isWebAddress (item.guid)) {
		return (item.guid);
		}
	if (isWebAddress (item.permalink)) {
		return (item.permalink);
		}
	return (undefined);
	}
function isTitledItem (item) {
	return ((item.title !== undefined) && (utils.trimWhitespace (String (item.title)).length > 0));
	}
function getItemTime (item) { //for sorting; an item with no date counts as the oldest
	const when = new Date (item.pubDate).getTime ();
	if (isNaN (when)) {
		return (0);
		}
	else {
		return (when);
		}
	}

function getTextWithPoundSign (theText, urlItem) { //the post's text with a # at the end of its last paragraph, linking to the post, as on daveverse.org
	const poundSign = "[#](" + urlItem + ")";
	const theLines = theText.split ("\n");
	const lastLine = theLines [theLines.length - 1];
	const flOwnParagraph = utils.beginsWith (lastLine, "```") || utils.beginsWith (lastLine, "~~~") || utils.beginsWith (lastLine, "\t") || utils.beginsWith (lastLine, "    ") || utils.beginsWith (lastLine, "|") || /^(-{3,}|\*{3,}|_{3,})\s*$/.test (lastLine); //the text ends in code, a table or a rule, where a link added to the last line wouldn't be a link
	if (flOwnParagraph) {
		return (theText + "\n\n" + poundSign);
		}
	else {
		return (theText + " " + poundSign);
		}
	}
function getMarkdownForItem (item) { //an untitled post is its text ending in a #; a titled one has its title above, a link to the post, with the # after the title
	const urlItem = getItemUrl (item);
	const theText = utils.trimWhitespace (item.markdowntext);
	if (isTitledItem (item)) {
		if (urlItem === undefined) {
			return ("### " + getOneLine (item.title) + "\n\n" + theText + "\n\n");
			}
		else {
			return ("### [" + getOneLine (item.title) + "](" + urlItem + ") [#](" + urlItem + ")\n\n" + theText + "\n\n");
			}
		}
	else {
		if (urlItem === undefined) {
			return (theText + "\n\n");
			}
		else {
			return (getTextWithPoundSign (theText, urlItem) + "\n\n");
			}
		}
	}
function getMarkdownForFeed (urlFeed, theFeed) { //the whole page
	const theTitle = ((theFeed.title !== undefined) && (utils.trimWhitespace (String (theFeed.title)).length > 0)) ? getOneLine (theFeed.title) : urlFeed;
	var theItems = [], ctLeftOut = 0;
	var theDays = []; //one per day that has a post, newest first: {dayString, untitledItems, titledItems}

	theFeed.items.forEach (function (item) { //the rule: an item is included only if it has source:markdown
		if ((typeof item.markdowntext === "string") && (utils.trimWhitespace (item.markdowntext).length > 0)) {
			theItems.push (item);
			}
		else {
			ctLeftOut++;
			}
		});
	theItems.sort (function (item1, item2) { //newest first; an item with no date goes last
		return (getItemTime (item2) - getItemTime (item1));
		});
	theItems.forEach (function (item) { //the items are newest first, so the days come out newest first, and a day's posts stay in that order
		var dayString = getDayString (item.pubDate), theDay;
		if (dayString === undefined) {
			dayString = "No date";
			}
		theDays.forEach (function (oneDay) {
			if (oneDay.dayString === dayString) {
				theDay = oneDay;
				}
			});
		if (theDay === undefined) {
			theDay = {dayString, untitledItems: [], titledItems: []};
			theDays.push (theDay);
			}
		if (isTitledItem (item)) {
			theDay.titledItems.push (item);
			}
		else {
			theDay.untitledItems.push (item);
			}
		});

	var theText = "---\n";
	theText += "title: " + getYamlString (theTitle) + "\n";
	if ((theFeed.description !== undefined) && (utils.trimWhitespace (String (theFeed.description)).length > 0)) {
		theText += "description: " + getYamlString (getOneLine (theFeed.description)) + "\n";
		}
	if (isWebAddress (theFeed.link)) {
		theText += "link: " + getYamlString (theFeed.link) + "\n";
		}
	theText += "generator: " + getYamlString (myProductName + " v" + myVersion) + "\n";
	theText += "---\n\n";

	theText += "# " + theTitle + "\n\n";
	if ((theFeed.description !== undefined) && (utils.trimWhitespace (String (theFeed.description)).length > 0)) {
		theText += getOneLine (theFeed.description) + "\n\n";
		}

	if (theItems.length === 0) {
		theText += "There's nothing to show from this feed because none of its " + theFeed.items.length + " items has a source:markdown element.\n\n";
		}
	else {
		theDays.forEach (function (theDay) { //Dave, 11/27/26: "the titled posts have to be shown at the end of the day, singular posts appear first"
			theText += "## " + theDay.dayString + "\n\n";
			theDay.untitledItems.forEach (function (item) {
				theText += getMarkdownForItem (item);
				});
			theDay.titledItems.forEach (function (item) {
				theText += getMarkdownForItem (item);
				});
			});
		}

	var theFeedLine = "[The feed](" + urlFeed + ")"; //at the bottom of the page since 0.4.1
	if (isWebAddress (theFeed.link)) {
		theFeedLine += " · [the site](" + theFeed.link + ")"; //middle dot
		}
	theFeedLine += " · " + theItems.length + " item" + ((theItems.length === 1) ? "" : "s"); //middle dot
	if (ctLeftOut > 0) {
		theFeedLine += " · " + ctLeftOut + " left out, no source:markdown"; //middle dot
		}
	theText += "---\n\n*" + theFeedLine + "*\n";

	return (theText);
	}
function getMarkdownForError (urlFeed, message) { //a page that says what went wrong, in plain words
	var theText = "---\n";
	theText += "title: " + getYamlString ("Can't show the feed") + "\n";
	theText += "generator: " + getYamlString (myProductName + " v" + myVersion) + "\n";
	theText += "---\n\n";
	theText += "# Can't show the feed\n\n";
	theText += message + "\n\n";
	if (isWebAddress (urlFeed)) {
		theText += "[The address we tried](" + urlFeed + ")\n";
		}
	return (theText);
	}

function readFeedToMarkdown (urlFeed, callback) { //always calls back with a page of Markdown, the feed's items or what went wrong
	if (isWebAddress (urlFeed)) {
		reallysimple.readFeed (urlFeed, function (err, theFeed) {
			if (err) {
				const message = "Can't read the feed at " + urlFeed + " because " + utils.trimWhitespace (String (err.message)).replace (/\.$/, "") + ".";
				console.log (nowString () + ": " + message);
				callback (getMarkdownForError (urlFeed, message));
				}
			else {
				callback (getMarkdownForFeed (urlFeed, theFeed));
				}
			});
		}
	else {
		const message = "Can't read the feed at " + getOneLine (urlFeed) + " because that isn't a web address. It has to start with http:// or https://.";
		callback (getMarkdownForError (urlFeed, message));
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
					if (params.url === undefined) { //no feed named, show the default one
						returnRedirect ("/?url=" + encodeURIComponent (config.urlDefaultFeed));
						}
					else {
						readFeedToMarkdown (params.url, returnMarkdown);
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
else { //for testing the page without a server
	module.exports = {readFeedToMarkdown, getMarkdownForFeed};
	}
