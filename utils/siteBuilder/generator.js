/*  generator.js -- 11/20/26 by CC

	The pages of a BonBon site, from a list of posts. This is a copy of
	opmltomarkdown.js 0.5.26 from the mdBrowser project, the code that
	builds Dave's Scripting News site and Brent Simmons' inessential
	site, brought over whole so the blogs this app builds have the same
	pages: a file per post, a day page for every day with posts, a month
	page for every month, the home page with the last maxDaysOnHomePage
	days, prev and next between posts, .well-known/toc.opml and rss.xml.

	What changed in the copy, the same three things bonbonSiteBuilder's
	copy of 0.5.22 changed, marked "11/6/26 by CC" as they are there:

	1. One process builds many sites here, so setConfig fills `config`
	for the site about to be built, from the defaults up. The app builds
	one site at a time, which is what makes this safe; theChanges and
	theDeletions are per build.

	2. No search. The search module keeps one SQLite database per
	process, so a site's search comes when it can keep one per site.

	3. The front matter of a post from a feed carries the item's guid
	and its enclosure, when it has them.

	The original's header follows.

	----

	opmltomarkdown.js -- 10/17/26 by CC

	The shared part: a month of Scripting News, from its outline, to the
	Markdown files BonBon reads. buildmonth.js runs it for one month,
	buildsite.js for the whole archive, and the watcher will run it for
	the current month as it changes. Nothing here reads config.json; the
	runner fills in `config` and calls in.
	
	10/26/26: the pages, modeled on oldSchoolBlog (Dave: "the first source
	of truth here is oldSchoolBlog"). A day page for every day with
	posts, a month page for every month, both with every post in full,
	and the home page, the last maxDaysOnHomePage days. The month page
	replaces links.md.  */

const fs = require ("fs");
const pathTool = require ("path");
const turndown = require ("turndown");
const dateFormat = require ("dateformat");
const utils = require ("daveutils");
const opml = require ("opml");
const rss = require ("daverss"); //10/30/26 by CC -- the site's feed, rss.xml; Dave: "use daverss to render the feed, so any upgrades we make can be made here too"
const marked = require ("marked"); //10/30/26 by CC -- a post that came as Markdown (Brent's) rendered to HTML for the feed's description //10/29/26 by CC -- the site's search index, filled after a build

const myVersion = "0.5.26", myProductName = "opmlToMarkdown";

const defaultConfig = { //11/6/26 by CC -- what setConfig starts from for every site
	outputFolder: "../forDave/site/", //the site's root: index.md, year/month/index.md, year/month/day.md, year/month/day/post.md, .well-known/toc.opml, .well-known/bonbon.json
	urlSite: "https://dave.writersweb.org/", //where the output folder will be on the web, for the absolute links in toc.opml
	author: "Dave Winer",
	urlFeed: "http://scripting.com/rss.xml", //the feed the posts came from, for the source field, RSS 2.0's item source (Dave, 10/21/26)
	feedTitle: "Scripting News", //its name, the other half of source
	urlBlogBase: "http://scripting.com/", //where the posts' original pages are, for the link field
	urlGlossaryOpml: undefined, //Dave's glossary is Dave's; the original's default is his glossary's address
	maxDaysOnHomePage: 25, //10/26/26: oldSchoolBlog's name and its default; whole days, newest first
	urlUpdateSocket: undefined, //10/26/26: where a reader can hear that a page changed, the way Drummer names its socket in an outline's head; the watcher sets it, nothing else has one. 11/13/26: it goes in .well-known/bonbon.json, with urlSearch and urlMirrorOf, not in toc.opml's head (Dave: "this is not good data design"); see writeSiteSettings
	urlSearch: undefined, //10/29/26: where a reader sends a search, named in bonbon.json beside urlUpdateSocket; the watcher answers it, so only a site with a watcher has one
	urlMirrorOf: undefined, //11/5/26: the HTML site these pages are the Markdown version of, named in bonbon.json, so a browser can take a link to a page there to the page here (Dave's name, 11/5: "right now urlMirrorOf is what it does")
	maxFeedItems: 50, //10/30/26: the newest posts in rss.xml at the site's root; scripting.com's feed carries 50
	feedDescription: undefined, //10/30/26: the feed's channel description, when the site has one
	fnameHomePage: "index.md", //11/12/26 by CC -- the home page's file; a site served from a GitHub repo wants readme.md, which is what a folder's address gets there (Kim Parker's blog, buildkimparker.js)
	homePageIntroMarkdown: undefined //11/12/26 by CC -- Markdown that goes on the home page between its title and the days, for a site with pages outside the calendar to link to
	};
var config = {}; //the site being built, filled by setConfig from defaultConfig up; 11/6/26 by CC, the original's defaults are defaultConfig's now
var glossary = {}; //assigned by readGlossary
var theChanges = []; //the paths written by the last build, relative to the output folder; assigned by writeFileIfChanged
var theDeletions = []; //10/26/26: the paths deleted by the last build, the old links pages; assigned by deleteFileIfPresent

const folderSavedOutlines = "data/months/"; //every month's outline, saved as JSON when it's read, so the watcher can rebuild the whole site without going back to GitHub

function notComment (item) { //from blogbase
	return (!utils.getBoolean (item.isComment));
	}
function yamlString (theString) { //double-quotes the value so a colon or a quote in a title can't break the YAML
	return ("\"" + String (theString).replace (/\\/g, "\\\\").replace (/"/g, "\\\"") + "\"");
	}
function convertImageUrl (url) { //from blogbase, the old image folder moved
	const searchfor = "http://scripting.com/images/", replacewith = "https://imgs.scripting.com/";
	if (utils.beginsWith (url, searchfor)) {
		url = replacewith + utils.stringDelete (url, 1, searchfor.length);
		}
	return (url);
	}
function getMarkdownFromHtml (htmltext) {
	const myTurndown = new turndown ();
	myTurndown.addRule ("preWithoutCode", { //10/29/26 by CC -- a <pre> with no <code> inside, the way inessential.com's posts from the 2000s wrote code samples; turndown only knows <pre><code>, and ran these together on one line
		filter: function (node) {
			return ((node.nodeName === "PRE") && ((node.firstChild === null) || (node.firstChild.nodeName !== "CODE")));
			},
		replacement: function (content, node) {
			return ("\n\n```\n" + node.textContent.replace (/^\n+|\n+$/g, "") + "\n```\n\n");
			}
		});
	const markdowntext = myTurndown.turndown (htmltext);
	return (markdowntext);
	}
function getPermalinkString (when, flTitled) { //untitled posts get the "a" prefix, titled posts have their own page and don't
	const timestring = dateFormat (new Date (when), "UTC:HHMMss");
	return ((flTitled) ? timestring : "a" + timestring);
	}
function glossaryProcess (theText) { //from oldschool.js: the glossary's names, as they appear in the text, replaced with their values
	return (utils.multipleReplaceAll (theText, glossary));
	}
function readGlossary (callback) { //from oldschool.js getBlogGlossary: each headline is a name, the line under it the replacement
	glossary = {};
	if (config.urlGlossaryOpml === undefined) {
		callback (undefined, glossary);
		}
	else {
		opml.readOutline (config.urlGlossaryOpml, function (err, theOutline) {
			if (err) {
				callback (err);
				}
			else {
				theOutline.opml.body.subs.forEach (function (item) {
					if ((item.text.length > 0) && (item.subs !== undefined) && (item.subs.length > 0)) {
						glossary [item.text] = item.subs [0].text;
						}
					});
				callback (undefined, glossary);
				}
			});
		}
	}
function withoutGeneratorLine (theText) { //10/19/26 by CC -- the generator line dropped for comparing: the front matter's, and the OPML head's in toc.opml
	return (theText.replace (/^generator: .*$/m, "").replace (/<generator>.*<\/generator>/, ""));
	}
function withoutBuildTime (xmltext) { //10/30/26 by CC -- for comparing feeds: the lines that say when the feed was built, which change every build whether or not a post did
	return (withoutGeneratorLine (xmltext).replace (/<lastBuildDate>.*<\/lastBuildDate>/, "").replace (/<source:localTime>.*<\/source:localTime>/, ""));
	}
function writeFileIfChanged (filepath, filetext, normalize=withoutGeneratorLine) { //answers true if the file was written; the watcher only wants to know what changed. 10/30/26: normalize drops what shouldn't count as a change before comparing

	/*  10/19/26: a file is rewritten only when its content changes; a new
		version of this app alone doesn't count, so an untouched file keeps
		the version that made it and its date on disk, the way oldschool's
		pages do. Dave: "when I see an old rebuild date that tells me it's
		stable."  */
	
	var existingText;
	try {
		existingText = fs.readFileSync (filepath).toString ();
		}
	catch (err) {
		}
	if ((existingText !== undefined) && (normalize (existingText) === normalize (filetext))) {
		return (false);
		}
	else {
		utils.sureFilePathSync (filepath);
		fs.writeFileSync (filepath, filetext);
		theChanges.push (filepath.substr (config.outputFolder.length));
		return (true);
		}
	}
function deleteFileIfPresent (filepath) { //10/26/26 by CC -- answers true if there was a file to delete
	if (fs.existsSync (filepath)) {
		fs.unlinkSync (filepath);
		theDeletions.push (filepath.substr (config.outputFolder.length));
		return (true);
		}
	else {
		return (false);
		}
	}
function relativeTo (fromPath, toPath) { //a link from one file in the site to another, both paths from the site's root
	return (pathTool.posix.relative (pathTool.posix.dirname (fromPath), toPath));
	}
function getMonthKey (theOutline) { //"2024-03" for a month's outline: the month most of its posts fall in; undefined when there are no posts

	/*  Not the month node's name or date: the restored July 2017 archive
		says "July 2024" with no date, and its newest post is after
		midnight on August 1 by local time. The posts themselves can't
		be wrong about which month they mostly belong to.  */
	
	var theCounts = {}, bestKey, bestCount = 0;
	getPostRecords (theOutline, true).forEach (function (postRec) {
		const key = postRec.year + "-" + postRec.month;
		theCounts [key] = (theCounts [key] || 0) + 1;
		if (theCounts [key] > bestCount) {
			bestCount = theCounts [key];
			bestKey = key;
			}
		});
	return (bestKey);
	}
function saveOutline (theOutline) { //keep a month's outline, so the next build doesn't have to fetch it
	const key = getMonthKey (theOutline);
	if (key !== undefined) {
		const filepath = folderSavedOutlines + key + ".json";
		utils.sureFilePathSync (filepath);
		fs.writeFileSync (filepath, utils.jsonStringify (theOutline));
		}
	return (key);
	}
function readSavedOutlines () { //every month we've saved, as outlines
	var theOutlines = new Array ();
	var theNames = [];
	try {
		theNames = fs.readdirSync (folderSavedOutlines);
		}
	catch (err) {
		}
	theNames.forEach (function (fname) {
		if (utils.endsWith (fname, ".json")) {
			try {
				theOutlines.push (JSON.parse (fs.readFileSync (folderSavedOutlines + fname).toString ()));
				}
			catch (err) {
				console.log ("Can't read the saved outline " + fname + " because " + err.message + ". Skipping it.");
				}
			}
		});
	return (theOutlines);
	}

function getParagraphHtml (theNode) { //one node of a post, as HTML, following the rules of scripting.com's page
	var htmltext = "";
	const theText = glossaryProcess (theNode.text);
	if (theNode.inlineImage !== undefined) { //a picture with the text as its caption, the caption travels as the image's alt
		const alttext = utils.stripMarkup (theText);
		htmltext += "<p><img src=\"" + convertImageUrl (theNode.inlineImage) + "\" alt=\"" + alttext + "\"></p>";
		}
	else {
		htmltext += "<p>";
		if (theNode.image !== undefined) { //an image at the head of the paragraph, the browser floats it at the right margin
			htmltext += "<img src=\"" + convertImageUrl (theNode.image) + "\">";
			}
		htmltext += theText + "</p>";
		}
	if (theNode.subs !== undefined) {
		if (utils.getBoolean (theNode.flNumberedSubs) || utils.getBoolean (theNode.flBulletedSubs)) { //the subs are a list
			const tagname = (utils.getBoolean (theNode.flNumberedSubs)) ? "ol" : "ul";
			htmltext += "<" + tagname + ">";
			theNode.subs.forEach (function (sub) {
				if (notComment (sub)) {
					htmltext += "<li>" + getParagraphHtml (sub) + "</li>";
					}
				});
			htmltext += "</" + tagname + ">";
			}
		else {
			theNode.subs.forEach (function (sub) {
				if (notComment (sub)) {
					htmltext += getParagraphHtml (sub);
					}
				});
			}
		}
	return (htmltext);
	}
function getFrontMatter (postRec) { //everything we know about the post, as a YAML block; the writer's side of the page

	/*  10/27/26: a post can come from a file instead of an outline node
		(inessential.com's archive, see buildinessential.js): then
		postRec.node is undefined and the record itself carries the title,
		the time and the body as Markdown. The front matter is the same
		set of fields, minus the ones only an outline node has.  */
	
	const theNode = postRec.node;
	var frontMatter = {};
	if (postRec.flTitled) {
		frontMatter.title = postRec.title;
		}
	if (postRec.link !== undefined) { //10/29/26 by CC -- a link post, inessential.com's kind: the title links here, not to the post itself (Dave: "why wouldn't you link to the same place?"); RSS's name for it
		frontMatter.link = postRec.link;
		}
	frontMatter.author = config.author;
	frontMatter.pubDate = postRec.when.toUTCString (); //10/19/26, Dave's decision: RSS 2.0's format, "Sun, 24 Mar 2024 16:30:00 GMT", human and machine readable
	frontMatter.source = {url: config.urlFeed, title: config.feedTitle}; //10/21/26, Dave's decision: RSS 2.0's item source, the feed the post came from and its name
	frontMatter.generator = myProductName + " v" + myVersion;
	frontMatter.urlPrev = postRec.urlPrev; //older, relative to this file
	frontMatter.urlNext = postRec.urlNext; //newer
	frontMatter.urlParent = postRec.urlParent; //10/29/26: the day's page, for the arrow pad's up arrow
	if (postRec.guid !== undefined) { //11/6/26 by CC -- a post from a feed: the item's guid, its address where it was posted
		frontMatter.guid = postRec.guid;
		}
	if (postRec.enclosure !== undefined) { //11/6/26 by CC -- the item's enclosure, the fields an outline post's front matter has
		frontMatter.enclosure = postRec.enclosure.url;
		frontMatter.enclosureType = postRec.enclosure.type;
		frontMatter.enclosureLength = postRec.enclosure.length;
		}
	if (theNode === undefined) {
		return (getYamlBlock (frontMatter));
		}
	["image", "inlineImage", "metaImage"].forEach (function (name) {
		if (theNode [name] !== undefined) {
			frontMatter [name] = convertImageUrl (theNode [name]);
			}
		});
	["urltoot", "urlvideo", "enclosure", "enclosureType", "enclosureLength"].forEach (function (name) {
		frontMatter [name] = theNode [name];
		});
	if (theNode.description !== undefined) {
		frontMatter.description = utils.stripMarkup (theNode.description);
		}
	return (getYamlBlock (frontMatter));
	}
function getYamlBlock (frontMatter) { //10/26/26 by CC -- the object as a YAML block between the --- lines; split out of getFrontMatter so the pages can use it
	var yamltext = "";
	for (var name in frontMatter) {
		const val = frontMatter [name];
		if (val !== undefined) {
			if (typeof val === "object") { //a mapping, like source: its parts on indented lines
				yamltext += name + ":\n";
				for (var subname in val) {
					if (val [subname] !== undefined) {
						yamltext += "  " + subname + ": " + yamlString (val [subname]) + "\n";
						}
					}
				}
			else {
				yamltext += name + ": " + ((typeof val === "number") ? val : yamlString (val)) + "\n";
				}
			}
		}
	return ("---\n" + yamltext + "---\n");
	}
function getPostBodyHtml (postRec, urlPermalink) { //the post's text as HTML: for a titled post the sub-paragraphs, for an untitled one the paragraph

	/*  10/26/26: on a day, month or home page an untitled post carries a
		# after its text, linking to its own file, the way oldSchoolBlog's
		pages do. It goes inside the paragraph, except when the paragraph
		is a picture alone, where it gets a paragraph of its own so the
		browser still sees a picture alone and doesn't float it.  */
	
	const theNode = postRec.node;
	var bodyhtml = "";
	if (postRec.flTitled) {
		theNode.subs.forEach (function (sub) {
			if (notComment (sub)) {
				bodyhtml += getParagraphHtml (sub);
				}
			});
		}
	else {
		bodyhtml = getParagraphHtml (theNode);
		if (urlPermalink !== undefined) {
			const permalinkHtml = "<a href=\"" + urlPermalink + "\" title=\"Direct link to this item.\">#</a>";
			if (theNode.inlineImage !== undefined) {
				bodyhtml += "<p>" + permalinkHtml + "</p>";
				}
			else {
				bodyhtml = bodyhtml.replace (/<\/p>$/, " " + permalinkHtml + "</p>");
				}
			}
		}
	return (bodyhtml);
	}
function getPostBody (postRec) { //the post's text as Markdown, for its own file
	if (postRec.bodyMarkdown !== undefined) { //10/27/26: a post from a file is already Markdown
		return (postRec.bodyMarkdown);
		}
	return (getMarkdownFromHtml (getPostBodyHtml (postRec)));
	}
function getPostOnPageMarkdown (postRec, pagePath) { //10/26/26 by CC -- the post as it appears on a day, month or home page: a titled post's title is a heading linking to its file, then the body; an untitled post is its paragraph with the # link
	const urlPost = relativeTo (pagePath, postRec.relpath);
	var mdtext = "";
	if (postRec.flTitled) {
		mdtext += "### " + getMarkdownFromHtml ("<a href=\"" + urlPost + "\">" + postRec.title + "</a>") + "\n\n";
		mdtext += getPostBody (postRec);
		}
	else if (postRec.bodyMarkdown !== undefined) { //10/27/26: a post from a file, untitled: the # follows its last paragraph
		mdtext += utils.trimWhitespace (postRec.bodyMarkdown) + " [#](" + urlPost + " \"Direct link to this item.\")";
		}
	else {
		mdtext += getMarkdownFromHtml (getPostBodyHtml (postRec, urlPost));
		}
	return (mdtext);
	}
function getPostMarkdown (postRec) { //the whole file for one post
	var mdtext = "";
	function add (theString) {
		mdtext += "\n" + theString + "\n";
		}
	mdtext += getFrontMatter (postRec); //the title and date are in here
	if (postRec.flTitled) { //11/11/26 by CC -- the title and the byline are in the text now, as macros, where the browser drew them from the front matter until today (Dave: "regenerate the scripting mirror so it uses the macros too"); the values stay in the front matter, said once
		add ("# {{page.title}}");
		}
	add ("By {{page.author}} on {{page.pubDate}}.");
	add (getPostBody (postRec));
	return (mdtext);
	}
function getPostRecords (theOutline, flQuiet=false) { //one record per post in a month's outline, in the outline's order: newest day first, within a day the order of the page
	var thePosts = new Array ();
	const theMonth = theOutline.opml.body.subs [0];
	theMonth.subs.forEach (function (theDay) {
		if (notComment (theDay) && (theDay.subs !== undefined)) {
			theDay.subs.forEach (function (theNode) {
				if (notComment (theNode)) {
					const when = new Date (theNode.created);
					if (isNaN (when.getTime ())) { //a node with no usable date can't be named; the archive has a few
						if (!flQuiet) {
							console.log ("Skipping a post under \"" + theDay.text + "\" because its created attribute is \"" + theNode.created + "\": " + utils.maxStringLength (utils.stripMarkup (theNode.text), 60));
							}
						return;
						}
					const flTitled = theNode.subs !== undefined;
					const fname = getPermalinkString (when, flTitled);
					const datepath = dateFormat (when, "yyyy/mm/dd");
					thePosts.push ({
						node: theNode,
						when,
						flTitled,
						title: (flTitled) ? utils.trimWhitespace (theNode.text) : undefined,
						year: dateFormat (when, "yyyy"),
						month: dateFormat (when, "mm"),
						day: dateFormat (when, "dd"),
						relpath: datepath + "/" + fname + ".md" //from the site's root. 10/30/26: the post's old scripting.com address was here as link, unused until the link field for Brent's link posts (10/29) picked it up and every title on the site became a link to scripting.com; gone
						});
					}
				});
			}
		});
	return (thePosts);
	}
function setNeighbors (thePosts) { //thePosts is every post, newest first; each one gets its neighbors, relative to its own file. 10/26/26: the day and month records too, anything with a relpath
	thePosts.forEach (function (postRec, ix) {
		postRec.urlPrev = undefined;
		postRec.urlNext = undefined;
		if (ix > 0) {
			postRec.urlNext = relativeTo (postRec.relpath, thePosts [ix - 1].relpath); //newer, the one above
			}
		if (ix < thePosts.length - 1) {
			postRec.urlPrev = relativeTo (postRec.relpath, thePosts [ix + 1].relpath); //older
			}
		});
	}
function isMonthToWrite (postRec, monthsToWrite) { //monthsToWrite: undefined means every month, else an object whose keys are "2026-10"
	return ((monthsToWrite === undefined) || (monthsToWrite [postRec.year + "-" + postRec.month] === true));
	}
function writePosts (thePosts, monthsToWrite) { //answers the number of files written

	/*  10/18/26: the watcher writes only the current month (Dave: "in this
		context you don't have to rebuild anything other than what's in
		the current month"), plus the one older post whose "next" link
		points into it. Everything else is as it was. Converting all
		16,000 posts took forty seconds on marin; this takes under one.  */
	
	var ctWritten = 0, theWritten = {}, flLastOneWasWritten = false;
	thePosts.forEach (function (postRec) {
		const flWrite = isMonthToWrite (postRec, monthsToWrite) || flLastOneWasWritten; //the older neighbor of a written post: its urlNext may have changed
		flLastOneWasWritten = isMonthToWrite (postRec, monthsToWrite);
		if (!flWrite) {
			return;
			}
		if (theWritten [postRec.relpath]) { //the archive has a few posts twice, same time, sometimes different text; the first one, higher on the page, wins, so the file doesn't flip between the two on every build
			return;
			}
		theWritten [postRec.relpath] = true;
		if (writeFileIfChanged (config.outputFolder + postRec.relpath, getPostMarkdown (postRec))) {
			ctWritten++;
			}
		});
	return (ctWritten);
	}
function getDayRecords (thePosts) { //10/26/26 by CC -- one record per day with posts, newest first, each with its posts in the page's order, and one per month, newest first, each with its days

	/*  The order is the order of thePosts: the months newest first, and
		within a month the outline's order, which is the author's. For a
		site with no outline (inessential.com, when we get to it) the
		order within a day is daveverse.org's: untitled posts first,
		newest first, then the titled ones. Dave, 10/26: "outline order
		when there's an OPML, the daveverse order when there isn't."  */
	
	var theDays = [], theMonths = [], dayIndex = {}, monthIndex = {}, theSeen = {};
	thePosts.forEach (function (postRec) {
		if (theSeen [postRec.relpath]) { //the same duplicates writePosts skips
			return;
			}
		theSeen [postRec.relpath] = true;
		const monthKey = postRec.year + "/" + postRec.month, dayKey = monthKey + "/" + postRec.day;
		var monthRec = monthIndex [monthKey];
		if (monthRec === undefined) {
			monthRec = {
				key: monthKey,
				when: postRec.when,
				title: dateFormat (postRec.when, "mmmm yyyy"),
				relpath: monthKey + "/index.md",
				theDays: []
				};
			monthIndex [monthKey] = monthRec;
			theMonths.push (monthRec);
			}
		var dayRec = dayIndex [dayKey];
		if (dayRec === undefined) {
			dayRec = {
				key: dayKey,
				monthKey,
				when: postRec.when,
				title: dateFormat (postRec.when, "dddd, mmmm d, yyyy"),
				relpath: dayKey + ".md",
				thePosts: []
				};
			dayIndex [dayKey] = dayRec;
			theDays.push (dayRec);
			monthRec.theDays.push (dayRec);
			}
		dayRec.thePosts.push (postRec);
		});
	setNeighbors (theDays); //prev and next day, crossing month edges
	setNeighbors (theMonths); //prev and next month
	setFamily (theMonths);
	return ({theDays, theMonths});
	}
function setFamily (theMonths) { //10/29/26 by CC -- the arrow pad's up and down: each page's parent and first child, relative to its own file

	/*  The site is an outline: home, months, days, posts. A post's parent
		is its day, a day's is its month, a month's is the home page
		(Dave, 10/29: up from a day goes to the month). The first child
		is the newest day of the month, or the first post on the day's
		page, titled or not (Dave: "titles don't give class to a post").
		The home page's first child, the newest month, is set where the
		home page is written.  */
	
	theMonths.forEach (function (monthRec) {
		monthRec.urlParent = relativeTo (monthRec.relpath, config.fnameHomePage);
		monthRec.urlFirstChild = relativeTo (monthRec.relpath, monthRec.theDays [0].relpath);
		monthRec.theDays.forEach (function (dayRec) {
			dayRec.urlParent = relativeTo (dayRec.relpath, monthRec.relpath);
			dayRec.urlFirstChild = relativeTo (dayRec.relpath, dayRec.thePosts [0].relpath);
			dayRec.thePosts.forEach (function (postRec) {
				postRec.urlParent = relativeTo (postRec.relpath, dayRec.relpath);
				});
			});
		});
	}
function getPageFrontMatter (pageRec) { //10/26/26 by CC -- a day, month or home page's front matter: the title, the generator, the neighbors; the browser draws the title and the arrows
	const yamltext = getYamlBlock ({
		title: pageRec.title,
		generator: myProductName + " v" + myVersion,
		urlPrev: pageRec.urlPrev,
		urlNext: pageRec.urlNext,
		urlParent: pageRec.urlParent, //10/29/26: the arrow pad's up and down (Dave's names)
		urlFirstChild: pageRec.urlFirstChild
		});
	return (yamltext + "\n# {{page.title}}\n"); //11/11/26 by CC -- the title in the text, as a macro; the browser drew it from the front matter until today
	}
function getDayOnPageMarkdown (dayRec, pagePath) { //10/26/26 by CC -- a day as it appears on a month page or the home page: its heading, linking to the day's page, then its posts
	var mdtext = "## " + getMarkdownFromHtml ("<a href=\"" + relativeTo (pagePath, dayRec.relpath) + "\">" + dayRec.title + "</a>") + "\n\n";
	dayRec.thePosts.forEach (function (postRec) {
		mdtext += getPostOnPageMarkdown (postRec, pagePath) + "\n\n";
		});
	return (mdtext);
	}
function getDayPageMarkdown (dayRec) { //the day's own file, year/month/day.md: the posts; the title is the date, in the front matter
	var mdtext = getPageFrontMatter (dayRec) + "\n";
	dayRec.thePosts.forEach (function (postRec) {
		mdtext += getPostOnPageMarkdown (postRec, dayRec.relpath) + "\n\n";
		});
	return (mdtext);
	}
function getMonthPageMarkdown (monthRec) { //the month's file, year/month/index.md: every day of the month, newest first, every post in full
	var mdtext = getPageFrontMatter (monthRec) + "\n";
	monthRec.theDays.forEach (function (dayRec) {
		mdtext += getDayOnPageMarkdown (dayRec, monthRec.relpath);
		});
	return (mdtext);
	}
function getHomePageMarkdown (thePages) { //index.md at the site's root: the last maxDaysOnHomePage days with posts, newest first, the way oldSchoolBlog's home page is. 10/29/26: its first child is the newest month
	const pageRec = {title: config.feedTitle, relpath: config.fnameHomePage};
	if (thePages.theMonths.length > 0) {
		pageRec.urlFirstChild = thePages.theMonths [0].relpath;
		}
	var mdtext = getPageFrontMatter (pageRec) + "\n";
	if (config.homePageIntroMarkdown !== undefined) { //11/12/26 by CC
		mdtext += config.homePageIntroMarkdown + "\n\n";
		}
	thePages.theDays.slice (0, config.maxDaysOnHomePage).forEach (function (dayRec) {
		mdtext += getDayOnPageMarkdown (dayRec, pageRec.relpath);
		});
	return (mdtext);
	}
function isMonthKeyToWrite (monthKey, monthsToWrite) { //monthKey is "2026/10" here, the pages' form
	return ((monthsToWrite === undefined) || (monthsToWrite [monthKey.replace ("/", "-")] === true));
	}
function writePages (theRecords, monthsToWrite, getMarkdown) { //10/26/26 by CC -- the day pages or the month pages, newest first; answers the number written

	/*  Like writePosts: only the months the runner asked for, plus the
		one older page after a written one, whose "next" link may have
		changed. The watcher asks for the current month; when the month
		turns, last month's page gets a next arrow this way.  */
	
	var ctWritten = 0, flLastOneWasWritten = false;
	theRecords.forEach (function (theRecord) {
		const monthKey = (theRecord.monthKey === undefined) ? theRecord.key : theRecord.monthKey;
		const flWrite = isMonthKeyToWrite (monthKey, monthsToWrite) || flLastOneWasWritten;
		flLastOneWasWritten = isMonthKeyToWrite (monthKey, monthsToWrite);
		if (flWrite) {
			if (writeFileIfChanged (config.outputFolder + theRecord.relpath, getMarkdown (theRecord))) {
				ctWritten++;
				}
			}
		});
	return (ctWritten);
	}
function writeHomePage (thePages) {
	return (writeFileIfChanged (config.outputFolder + config.fnameHomePage, getHomePageMarkdown (thePages)));
	}
function deleteLinksPages (theMonths) { //10/26/26 by CC -- the month page replaces links.md (Dave), so the old ones go; answers the number deleted
	var ctDeleted = 0;
	theMonths.forEach (function (monthRec) {
		if (deleteFileIfPresent (config.outputFolder + monthRec.key + "/links.md")) {
			ctDeleted++;
			}
		});
	return (ctDeleted);
	}
function getTocOutline (thePosts) { //years, months, days, no titles; a day links to the top post of that day (Dave, 10/17); the browser finds it at /.well-known/toc.opml
	const theOutline = {
		opml: {
			head: {
				title: "Table of contents",
				dateModified: ((thePosts.length > 0) ? thePosts [0].when : new Date ()).toUTCString (), //the newest post's time, not now, so the file only changes when the contents do
				generator: myProductName + " v" + myVersion
				},
			body: {
				subs: []
				}
			}
		};
	var theYears = {}, theMonths = {}, theDays = {};
	thePosts.forEach (function (postRec) { //newest first, which is the order we want
		var yearNode = theYears [postRec.year];
		if (yearNode === undefined) {
			yearNode = {text: postRec.year, type: "calendarYear", name: postRec.year, subs: []};
			theYears [postRec.year] = yearNode;
			theOutline.opml.body.subs.push (yearNode);
			}
		const monthKey = postRec.year + "/" + postRec.month;
		var monthNode = theMonths [monthKey];
		if (monthNode === undefined) {
			monthNode = {text: dateFormat (postRec.when, "mmmm yyyy"), type: "calendarMonth", name: postRec.month, url: config.urlSite + monthKey + "/index.md", subs: []}; //10/19/26: no url on a month, CC had added one without Dave deciding it; 10/26/26: the month page, in the plan Dave signed off
			theMonths [monthKey] = monthNode;
			yearNode.subs.push (monthNode);
			}
		const dayKey = monthKey + "/" + postRec.day;
		var dayNode = theDays [dayKey];
		if (dayNode === undefined) {
			dayNode = {text: dateFormat (postRec.when, "mmmm d"), type: "calendarDay", name: postRec.day, url: config.urlSite + postRec.relpath}; //the first post we see for the day is the top one on its page
			theDays [dayKey] = dayNode;
			monthNode.subs.push (dayNode);
			}
		});
	return (theOutline);
	}
function writeToc (thePosts) {
	return (writeFileIfChanged (config.outputFolder + ".well-known/toc.opml", opml.stringify (getTocOutline (thePosts))));
	}
function getSiteSettings () { //11/13/26 by CC -- what the site tells a browser about itself, apart from its table of contents

	/*  Dave, 11/13: the head of toc.opml had become where a site tells
		BonBon about itself, the update socket, the search, the site it
		mirrors, and none of that is table of contents, "this is not good
		data design." It's a file of its own now, bonbon.json, beside
		toc.opml in .well-known (his name for it; config.json could
		conflict with other software). The names are the ones the head
		had. A clean cut: the head no longer carries them and the browser
		no longer looks there. Only the ones the runner set are written.
		A person can add items of their own to the file on a site they
		write by hand, like the cname they'd like for a free subdomain.  */
	
	const theSettings = {};
	["urlUpdateSocket", "urlSearch", "urlMirrorOf"].forEach (function (name) {
		if (config [name] !== undefined) {
			theSettings [name] = config [name];
			}
		});
	return (theSettings);
	}
function writeSiteSettings () { //11/13/26 by CC -- answers true when the file was written; a site with nothing to say has no file
	const theSettings = getSiteSettings ();
	if (Object.keys (theSettings).length === 0) {
		return (false);
		}
	else {
		return (writeFileIfChanged (config.outputFolder + ".well-known/bonbon.json", utils.jsonStringify (theSettings)));
		}
	}
function getPostHtml (postRec) { //10/30/26 by CC -- the post's text as HTML for the feed's description: an outline post the way its page had it, a post that came as Markdown through marked
	if (postRec.bodyMarkdown !== undefined) {
		return (marked (postRec.bodyMarkdown));
		}
	return (getPostBodyHtml (postRec));
	}
function getFeedXml (thePosts) { //10/30/26 by CC -- rss.xml at the site's root: the newest maxFeedItems posts

	/*  Talked through with Dave 10/30/26: a blog without a feed can't be
		followed, and the feed is how a reader, or another watcher, finds
		the Markdown version of a post. Each item has the HTML description
		every feed reader expects and the post's Markdown beside it in
		source:markdown, the shape of Brent's feed, which watchbrent.js
		already reads. The link and the guid are the post's own page on
		this site; a link post (Brent's) links where its title does. The
		feed is at the root like every blog's, not in .well-known (Dave:
		"want to be a hero, should we put the rss feed in the wellknown
		folder?" CC: no, people paste it into readers; a pointer to it
		belongs in the site's head data, part of the .well-known talk).
		Rendered by daverss, so what it learns, this gets.  */
	
	const headElements = {
		title: config.feedTitle,
		link: config.urlSite,
		description: config.feedDescription,
		generator: myProductName + " v" + myVersion,
		urlSelf: config.urlSite + "rss.xml",
		maxFeedItems: config.maxFeedItems //daverss stops at this many; without it, none
		};
	var feedItems = [];
	thePosts.slice (0, config.maxFeedItems).forEach (function (postRec) {
		const urlPost = config.urlSite + postRec.relpath;
		var feedItem = {
			title: postRec.title,
			text: getPostHtml (postRec),
			when: postRec.when,
			link: (postRec.link === undefined) ? urlPost : postRec.link, //a link post links where its title does
			guid: {flPermalink: true, value: urlPost},
			markdowntext: getPostBody (postRec)
			};
		if ((postRec.node !== undefined) && (postRec.node.enclosure !== undefined)) {
			feedItem.enclosure = {url: postRec.node.enclosure, type: postRec.node.enclosureType, length: postRec.node.enclosureLength};
			}
		feedItems.push (feedItem);
		});
	return (rss.buildRssFeed (headElements, feedItems));
	}
function writeFeed (thePosts) { //10/30/26 by CC -- answers true when the feed changed, not counting the build time
	return (writeFileIfChanged (config.outputFolder + "rss.xml", getFeedXml (thePosts), withoutBuildTime));
	}

function buildSite (theOutlines, callback, monthsToWrite) { //theOutlines: every month's outline, any order; writes everything and answers the counts. monthsToWrite: undefined for everything, or {"2026-10": true} to write only those months' posts and links pages; the neighbors and the table of contents still see every post

	/*  All the posts first, so the neighbors can cross month edges and
		the table of contents can see every day. Then the files: only
		the ones that changed get written, so a rebuild of a month in
		the watcher is cheap and the rest of the site is untouched.  */
	
	var theMonths = new Array (), thePosts = new Array ();
	theOutlines.forEach (function (theOutline) {
		const theRecords = getPostRecords (theOutline);
		if (theRecords.length > 0) {
			theMonths.push ({when: theRecords [0].when, theRecords}); //the first post is the newest day's top post, good enough to order the months by
			}
		});
	theMonths.sort (function (a, b) { //newest month first; within a month the outline's order stands, it's the page's order, which the author sets
		return (b.when.getTime () - a.when.getTime ());
		});
	theMonths.forEach (function (theMonth) {
		thePosts = thePosts.concat (theMonth.theRecords);
		});
	buildSiteFromPosts (thePosts, callback, monthsToWrite);
	}
function buildSiteFromPosts (thePosts, callback, monthsToWrite) { //10/27/26 by CC -- the second half of buildSite, from the post records on, newest first; for a site whose posts don't come from outlines (inessential.com)
	theChanges = [];
	theDeletions = [];
	setNeighbors (thePosts);
	const thePages = getDayRecords (thePosts); //10/26/26: the day, month and home pages. 10/29/26: before the posts are written, since it gives each post its parent
	const ctPostsWritten = writePosts (thePosts, monthsToWrite);
	const ctDaysWritten = writePages (thePages.theDays, monthsToWrite, getDayPageMarkdown);
	const ctMonthsWritten = writePages (thePages.theMonths, monthsToWrite, getMonthPageMarkdown);
	const flHomeWritten = writeHomePage (thePages); //10/19/26 the home page was Dave's, written by hand; 10/26/26 it's the build's, Dave's decision
	const ctLinksDeleted = deleteLinksPages (thePages.theMonths);
	const flTocWritten = writeToc (thePosts);
	const flSettingsWritten = writeSiteSettings (); //11/13/26 by CC
	const flFeedWritten = writeFeed (thePosts); //10/30/26 by CC
	const stats = {ctPosts: thePosts.length, ctPostsWritten, ctDays: thePages.theDays.length, ctDaysWritten, ctMonths: thePages.theMonths.length, ctMonthsWritten, flHomeWritten, ctLinksDeleted, flTocWritten, flSettingsWritten, flFeedWritten, theChanges, theDeletions};
	callback (undefined, stats); //11/6/26 by CC -- the original fills the search index here when flSearchIndex is set; no search in this copy, see the header
	}
function setConfig (siteConfig) { //11/6/26 by CC -- the site about to be built: every key starts at its default, then the site's values go over it. Builds run one at a time, so the one config object serves them all
	for (var name in config) {
		delete config [name];
		}
	for (var name in defaultConfig) {
		config [name] = defaultConfig [name];
		}
	for (var name in siteConfig) {
		config [name] = siteConfig [name];
		}
	}

exports.config = config;
exports.setConfig = setConfig; //11/6/26
exports.myVersion = myVersion;
exports.myProductName = myProductName;
exports.readGlossary = readGlossary;
exports.getPostRecords = getPostRecords;
exports.saveOutline = saveOutline;
exports.getMonthKey = getMonthKey;
exports.readSavedOutlines = readSavedOutlines;
exports.buildSite = buildSite;
exports.buildSiteFromPosts = buildSiteFromPosts; //10/27/26
exports.getMarkdownFromHtml = getMarkdownFromHtml;
exports.getYamlBlock = getYamlBlock; //11/12/26 by CC -- for a runner that writes pages of its own (buildkimparker.js)
