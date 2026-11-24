/*  bonbonsitebuilder.js -- 11/22/26 by CC

	Makes a BonBon blog, a site made of Markdown files, for every
	person on an rss.chat server, and keeps each blog current as the
	person posts. Dave, 11/22: you join chat.bonbon.blog as bull, your
	blog is at bull.bonbon.blog, with nothing to set up.

	The two programs don't know about each other. The server puts out
	a feed for each person and one OPML file that lists the feeds;
	this reads them. Point opmlListUrl at another server's list and it
	makes blogs for that community. Any app that puts out feeds with
	the Markdown text of each post, and a list of the feeds, would do.

	Where the code came from: bonbonSiteBuilder of 11/6/26 (in archive/),
	then rssToBonBon of 11/20/26, which made one blog from one feed
	named in config.json. This is that code, with the blogs coming
	from the server's list.

	How it works:

	1. The list is read, opmlListUrl. Each feed in it gets a blog. The
	blog's name is the person's name, lowercase, with anything that
	can't be in a domain name turned into a hyphen: Bull_Mancuso is
	bull-mancuso. Its address is that name in front of blogsDomain,
	its folder has the same name, under blogsFolder. The list is read
	again on every poll, so a new person gets a blog within a minute.

	2. A blog's feed is read. Every item that's a post becomes a file
	in the posts folder, data/<blog>/posts/year/month/day/<name>.markdown,
	in the format Brent Simmons' watcher uses on the mdBrowser project:
	@title, @link, @guid, @pubDate lines, a blank line, then the
	Markdown of the post, from source:markdown when the feed has it,
	from the description otherwise. An item with source:inReplyTo is a
	reply and is left out (Dave, 11/20). The posts folder is where the
	blog accumulates: a feed carries only its newest items, the folder
	keeps every one we've seen.

	3. The blog is built from the posts folder by generator.js, the
	page-building code of Dave's Scripting News site: a file per post,
	day pages, month pages, the home page, prev and next arrows,
	.well-known/toc.opml and rss.xml. Only files that changed are
	written.

	4. The app hears about a change to a feed through rssCloud, the
	way FeedLand does: the feed names its cloud server in its <cloud>
	element, we ask that server to notify us, it pings this app's
	public address when the feed updates, and we read the feed again.
	The request is renewed every 23 hours. A poll backs it up.

	Run from this folder:

		node bonbonsitebuilder.js

	The settings are in config.json. On a PagePark server the domain
	folder's package.json names this file as main, PagePark launches it
	and hands it the port in PORT.  */

const fs = require ("fs");
const pathTool = require ("path");
const utils = require ("daveutils");
const davehttp = require ("davehttp");
const dateFormat = require ("dateformat");
const reallysimple = require ("reallysimple");
const request = require ("request");
const qs = require ("querystring");
const opml = require ("opml");
const generator = require ("./generator.js");

const myVersion = "0.2.0", myProductName = "bonbonSiteBuilder";

var config = {
	port: 1447, //for a run by hand; on a PagePark server PORT wins
	flPostEnabled: true, //the rssCloud ping is a POST
	flAllowAccessFromAnywhere: true,
	flLogToConsole: false,
	myDomain: undefined, //this app's public address, where the rssCloud server sends its pings; without one, no rssCloud, the poll alone
	rssCloudPort: 80, //the port the rssCloud server pings
	feedUpdatedCallback: "/feedupdated", //the path it pings, FeedLand's name
	ctSecsBetwRenews: 23 * 60 * 60, //a feed's rssCloud request is good for a day; FeedLand renews at 23 hours
	ctSecsRetryRenew: 60 * 60, //when a request fails, try again this much later
	minSecsBetwRenewChecks: 60, //how often we look for a blog whose request is due
	ctMinutesBetwPolls: 15, //the feeds are read on this timer whether or not rssCloud pinged
	timeZone: "America/New_York", //a post's day, for the day and month pages, is the day in this zone
	dataFolder: "data/", //the posts folders, one per blog, under here
	maxDaysOnHomePage: 25, //whole days, newest first, the generator's default
	opmlListUrl: undefined, //the server's list of everyone's feeds, rss.chat's name for it; each feed in the list gets a blog
	blogsDomain: undefined, //what goes after the person's name in a blog's address: bonbon.blog makes bull.bonbon.blog
	blogsFolder: "../", //where the blogs' folders are made, each named for the blog's address; on a PagePark server, the domains folder
	reservedNames: [], //names that never become a blog, the ones the domain uses for something else
	blogs: [] //blogs that aren't in the list, one per blog: {urlFeed, urlSite, outputFolder}, the feed, the blog's address on the web, and its folder on disk
	};
var theBlogs = []; //one record per blog, from the server's list and from config.blogs
var namesNotTaken = {}; //the names in the list we've already said we can't make a blog for, so the log says it once
var buildQueue = []; //the blogs waiting to be built, in order; one build at a time
var flBuilding = false;

const headerKeys = ["title", "link", "guid", "pubDate", "enclosure", "enclosureType", "enclosureLength"]; //the @lines at the top of a post file; anything else is the body

function nowString () {
	return (new Date ().toLocaleTimeString ());
	}
function getDayParts (when) { //the year, month and day of a date in the site's time zone, as "2026", "11", "06"
	const theFormat = new Intl.DateTimeFormat ("en-US", {timeZone: config.timeZone, year: "numeric", month: "2-digit", day: "2-digit"});
	var theParts = {};
	theFormat.formatToParts (when).forEach (function (part) {
		theParts [part.type] = part.value;
		});
	return ({year: theParts.year, month: theParts.month, day: theParts.day});
	}
function getBlogName (urlSite) { //the name of a blog's folder under the data folder: the host name in its address, "readme.bloatware.org"; undefined when the address can't be read
	try {
		return (new URL (urlSite).hostname);
		}
	catch (err) {
		return (undefined);
		}
	}

//the posts folder: from the feed in, to post records out
	function getPostNameForItem (item) { //the file name for an item, without the extension: the id from an rss.chat guid, https://demo.rss.chat/?id=800 is 800; else the last part of the guid's path; else the time
		const thePermalink = (item.guid !== undefined) ? item.guid : item.permalink;
		if (typeof thePermalink === "string") {
			const idMatch = thePermalink.match (/[?&]id=(\d+)$/);
			if (idMatch !== null) {
				return (idMatch [1]);
				}
			const pathMatch = thePermalink.match (/\/([^\/?#]+?)(?:\.[a-z]+)?\/?(?:[?#].*)?$/i);
			if ((pathMatch !== null) && (pathMatch [1].length > 0)) {
				return (pathMatch [1].replace (/[^A-Za-z0-9_\-]/g, "-"));
				}
			}
		return ("a" + dateFormat (new Date (item.pubDate), "UTC:HHMMss"));
		}
	function getPostFileForItem (blogRec, item) { //where the item's post file goes: year/month/day/name.markdown under the site's posts folder; undefined for an item we don't take
		if (item.pubDate === undefined) {
			return (undefined);
			}
		const when = new Date (item.pubDate);
		if (isNaN (when.getTime ())) {
			return (undefined);
			}
		if (item.inReplyTo !== undefined) { //a reply to anything; the blog has the posts that start something (Dave, 11/20)
			return (undefined);
			}
		const dayParts = getDayParts (when);
		return (pathTool.join (blogRec.postsFolder, dayParts.year, dayParts.month, dayParts.day, getPostNameForItem (item) + ".markdown"));
		}
	function getDomainForLink (theLink) { //the domain name of a link, for the line under an untitled link post: "nypost.com"
		try {
			return (new URL (theLink).hostname.replace (/^www\./, ""));
			}
		catch (err) {
			return (theLink);
			}
		}
	function getPostTextForItem (item) { //a post file: the @lines, a blank line, the Markdown
		const thePermalink = (item.guid !== undefined) ? item.guid : item.permalink;
		const flTitled = (item.title !== undefined) && (item.title.length > 0);
		const flLinkPost = (item.link !== undefined) && (item.link !== thePermalink); //a link post: the feed's link is where the title points, the guid is the post
		var theText = "";
		if (flTitled) {
			theText += "@title " + item.title + "\n";
			}
		if (flLinkPost) {
			theText += "@link " + item.link + "\n";
			}
		if (thePermalink !== undefined) {
			theText += "@guid " + thePermalink + "\n";
			}
		theText += "@pubDate " + dateFormat (new Date (item.pubDate), "yyyy-mm-dd HH:MM:ss o") + "\n";
		if ((item.enclosure !== undefined) && (item.enclosure.url !== undefined)) {
			theText += "@enclosure " + item.enclosure.url + "\n";
			if (item.enclosure.type !== undefined) {
				theText += "@enclosureType " + item.enclosure.type + "\n";
				}
			if (item.enclosure.length !== undefined) {
				theText += "@enclosureLength " + item.enclosure.length + "\n";
				}
			}
		theText += "\n";
		var markdowntext = item.markdowntext;
		if (markdowntext === undefined) { //a feed without source:markdown: the description, converted
			markdowntext = generator.getMarkdownFromHtml ((item.description === undefined) ? "" : item.description);
			}
		markdowntext = utils.trimWhitespace (markdowntext);
		if (flLinkPost && !flTitled) { //an untitled link post: the domain it points to on a line of its own, linked, the way Dave does it in FeedLand (11/6: "take the domain name, and have it link to the place the linkblog points to")
			markdowntext += "\n\n[" + getDomainForLink (item.link) + "](" + item.link + ")";
			}
		theText += markdowntext + "\n";
		return (theText);
		}
	function parsePost (theText) { //the @lines at the top, then the body: {header, body}; from buildinessential.js
		const theLines = theText.split ("\n");
		var header = {}, ix = 0;
		while (ix < theLines.length) {
			const theLine = theLines [ix];
			var flHeaderLine = false;
			if (theLine.charAt (0) === "@") {
				const ixSpace = theLine.indexOf (" ");
				const key = (ixSpace === -1) ? theLine.substr (1) : theLine.substr (1, ixSpace - 1);
				if (headerKeys.indexOf (key) !== -1) {
					header [key] = (ixSpace === -1) ? "" : utils.trimWhitespace (theLine.substr (ixSpace + 1));
					flHeaderLine = true;
					}
				}
			if (!flHeaderLine) {
				break;
				}
			ix++;
			}
		return ({header, body: theLines.slice (ix).join ("\n")});
		}
	function samePost (oldText, newText) { //true if the file on disk says what the feed says
		const oldPost = parsePost (oldText), newPost = parsePost (newText);
		return ((oldPost.header.title === newPost.header.title) && (oldPost.header.link === newPost.header.link) && (oldPost.header.enclosure === newPost.header.enclosure) && (utils.trimWhitespace (oldPost.body) === utils.trimWhitespace (newPost.body)));
		}
	function getPostFiles (blogRec) { //every post file in the site's posts folder, as {fname, year, month, day, name}
		const theFiles = [];
		function walk (folder) {
			var theEntries;
			try {
				theEntries = fs.readdirSync (folder, {withFileTypes: true});
				}
			catch (err) {
				return;
				}
			theEntries.sort (function (a, b) {return (a.name < b.name) ? -1 : 1;}).forEach (function (theEntry) {
				const thePath = pathTool.join (folder, theEntry.name);
				if (theEntry.isDirectory ()) {
					walk (thePath);
					}
				else {
					const theParts = pathTool.relative (blogRec.postsFolder, thePath).split (pathTool.sep); //year, month, day, file
					const ext = pathTool.extname (theEntry.name).toLowerCase ();
					if ((theParts.length === 4) && (ext === ".markdown")) {
						theFiles.push ({fname: thePath, year: theParts [0], month: theParts [1], day: theParts [2], name: theEntry.name.substr (0, theEntry.name.length - ext.length)});
						}
					}
				});
			}
		walk (blogRec.postsFolder);
		return (theFiles);
		}
	function getPostRecordsFromFiles (blogRec) { //one record per post, newest first, in the shape the generator's buildSiteFromPosts expects
		var thePosts = [];
		getPostFiles (blogRec).forEach (function (theFile) {
			const thePost = parsePost (fs.readFileSync (theFile.fname).toString ());
			const when = new Date (thePost.header.pubDate);
			if (isNaN (when.getTime ())) {
				console.log (nowString () + ": Skipping " + theFile.fname + " because its pubDate is \"" + thePost.header.pubDate + "\".");
				return;
				}
			const flTitled = (thePost.header.title !== undefined) && (thePost.header.title.length > 0);
			var enclosure;
			if ((thePost.header.enclosure !== undefined) && (thePost.header.enclosure.length > 0)) {
				enclosure = {url: thePost.header.enclosure, type: thePost.header.enclosureType, length: thePost.header.enclosureLength};
				}
			thePosts.push ({
				node: undefined,
				when,
				flTitled,
				title: (flTitled) ? thePost.header.title : undefined,
				year: theFile.year,
				month: theFile.month,
				day: theFile.day,
				relpath: theFile.year + "/" + theFile.month + "/" + theFile.day + "/" + theFile.name + ".md",
				link: ((thePost.header.link !== undefined) && (thePost.header.link.length > 0)) ? thePost.header.link : undefined,
				guid: ((thePost.header.guid !== undefined) && (thePost.header.guid.length > 0)) ? thePost.header.guid : undefined,
				enclosure,
				bodyMarkdown: utils.trimWhitespace (thePost.body)
				});
			});
		thePosts.sort (function (a, b) { //newest first; the files came in path order, so two posts at the same second keep it
			return (b.when.getTime () - a.when.getTime ());
			});
		return (thePosts);
		}

//the blogs: from the server's list, and from config.json
	function addBlog (urlFeed, urlSite, outputFolder) { //a new record in theBlogs; answers it
		const folder = getBlogName (urlSite);
		const blogRec = {
			urlFeed,
			urlSite: utils.endsWith (urlSite, "/") ? urlSite : urlSite + "/",
			outputFolder: utils.endsWith (outputFolder, "/") ? outputFolder : outputFolder + "/",
			folder, //the blog's name under the data folder
			postsFolder: config.dataFolder + folder + "/posts/",
			whenLastFeedRead: undefined,
			whenLastCloudRenew: undefined,
			ctCloudRenews: undefined,
			lastStats: undefined
			};
		theBlogs.push (blogRec);
		return (blogRec);
		}
	function getBlogForSite (urlSite) { //the blog's record for an address on the web; undefined if no blog is there
		var theBlog;
		theBlogs.forEach (function (blogRec) {
			if (blogRec.urlSite === urlSite) {
				theBlog = blogRec;
				}
			});
		return (theBlog);
		}
	function getDomainNameForPerson (screenname) { //the part of a blog's address that's the person: lowercase, and anything that can't be in a domain name is a hyphen; Bull_Mancuso is bull-mancuso (Dave, 11/22)
		return (String (screenname).toLowerCase ().replace (/[^a-z0-9\-]/g, "-").replace (/^-+/, "").replace (/-+$/, ""));
		}
	function sureBlogFolder (blogRec) { //a new blog's folder, with the config.json that tells PagePark to send the Markdown files out as they are and to give index.md for the address alone, the same file brent.writersweb.org has; another web server ignores it
		const fnameConfig = blogRec.outputFolder + "config.json";
		if (!fs.existsSync (fnameConfig)) {
			const pageParkConfig = {
				flProcessMarkdownFiles: false,
				flProcessOpmlFiles: false,
				redirects: {
					"/": blogRec.urlSite + "index.md"
					}
				};
			utils.sureFilePathSync (fnameConfig);
			fs.writeFileSync (fnameConfig, utils.jsonStringify (pageParkConfig));
			}
		}
	function cantMakeBlog (screenname, reason) { //said once per name, not on every poll
		if (namesNotTaken [screenname] === undefined) {
			namesNotTaken [screenname] = reason;
			console.log (nowString () + ": Can't make a blog for " + screenname + " because " + reason);
			}
		}
	function addBlogsFromList (theOutline) { //every feed in the list that doesn't have a blog yet gets one; answers how many were added
		var ctAdded = 0;
		function visit (theNode) {
			if ((typeof theNode.xmlUrl === "string") && (theNode.xmlUrl.length > 0) && (getBlogForFeed (theNode.xmlUrl) === undefined)) {
				const screenname = (theNode.text === undefined) ? "" : theNode.text;
				const theName = getDomainNameForPerson (screenname);
				const urlSite = "https://" + theName + "." + config.blogsDomain + "/";
				if (theName.length === 0) {
					cantMakeBlog (theNode.xmlUrl, "its entry in the list has no name.");
					}
				else if (config.reservedNames.indexOf (theName) !== -1) {
					cantMakeBlog (screenname, "the name " + theName + " is one of the reservedNames in config.json.");
					}
				else if (getBlogForSite (urlSite) !== undefined) {
					cantMakeBlog (screenname, urlSite + " is already the blog for " + getBlogForSite (urlSite).urlFeed + ".");
					}
				else {
					const blogRec = addBlog (theNode.xmlUrl, urlSite, config.blogsFolder + theName + "." + config.blogsDomain + "/");
					sureBlogFolder (blogRec);
					ctAdded++;
					console.log (nowString () + ": New blog for " + screenname + ": " + urlSite + ", from " + theNode.xmlUrl);
					}
				}
			if (theNode.subs !== undefined) {
				theNode.subs.forEach (visit);
				}
			}
		if ((theOutline.opml !== undefined) && (theOutline.opml.body !== undefined) && (theOutline.opml.body.subs !== undefined)) {
			theOutline.opml.body.subs.forEach (visit);
			}
		return (ctAdded);
		}
	function readBlogList (callback) { //read the server's list and add a blog for each new feed; with no list in config.json there's nothing to do
		if ((config.opmlListUrl === undefined) || (config.blogsDomain === undefined)) {
			callback (undefined, 0);
			return;
			}
		request ({url: config.opmlListUrl, headers: {"User-Agent": myProductName + "/" + myVersion}}, function (err, response, body) {
			if (err) {
				console.log (nowString () + ": Can't read the list " + config.opmlListUrl + " because " + err.message + ".");
				callback (err);
				}
			else if (response.statusCode !== 200) {
				const message = "Can't read the list " + config.opmlListUrl + " because the server answered " + response.statusCode + ".";
				console.log (nowString () + ": " + message);
				callback ({message});
				}
			else {
				opml.parse (body.toString (), function (err, theOutline) {
					if (err) {
						console.log (nowString () + ": Can't read the list " + config.opmlListUrl + " because " + err.message + ".");
						callback (err);
						}
					else {
						callback (undefined, addBlogsFromList (theOutline));
						}
					});
				}
			});
		}
	function readListAndFeeds (flBuildAnyway=false) { //the list first, so a new person's feed is read on the same pass; a list that can't be read doesn't stop the feeds we know
		readBlogList (function (err, ctAdded) {
			readAllFeeds (flBuildAnyway);
			});
		}

//building
	function buildBlog (blogRec, callback) { //the whole blog from its posts folder
		generator.setConfig ({
			outputFolder: blogRec.outputFolder,
			urlSite: blogRec.urlSite,
			author: blogRec.author,
			urlFeed: blogRec.urlFeed,
			feedTitle: blogRec.feedTitle,
			feedDescription: blogRec.feedDescription,
			urlBlogBase: blogRec.urlBlogBase,
			maxDaysOnHomePage: config.maxDaysOnHomePage
			});
		const thePosts = getPostRecordsFromFiles (blogRec);
		generator.buildSiteFromPosts (thePosts, function (err, stats) {
			if (!err) {
				const maxNamesToLog = 20;
				console.log (nowString () + ": " + blogRec.folder + ": " + stats.ctPosts + " posts, " + stats.theChanges.length + " files written" + ((stats.theChanges.length > 0) ? ": " + stats.theChanges.slice (0, maxNamesToLog).join (", ") + ((stats.theChanges.length > maxNamesToLog) ? ", ..." : "") : "."));
				}
			callback (err, stats);
			});
		}
	function buildNext () { //one build at a time, in the order they were asked for; the generator has one config, so two builds can't overlap
		if (flBuilding || (buildQueue.length === 0)) {
			return;
			}
		const blogRec = buildQueue.shift ();
		flBuilding = true;
		buildBlog (blogRec, function (err, stats) {
			flBuilding = false;
			if (err) {
				console.log (nowString () + ": Can't build the blog for " + blogRec.urlFeed + " because " + err.message + ".");
				}
			else {
				blogRec.lastStats = stats;
				blogRec.lastStats.when = new Date ();
				}
			buildNext ();
			});
		}
	function rebuildBlog (blogRec) { //ask for a build; a blog already waiting isn't added twice
		if (buildQueue.indexOf (blogRec) === -1) {
			buildQueue.push (blogRec);
			}
		buildNext ();
		}

//reading the feeds
	function readFeed (blogRec, callback) { //every item in the feed: a post file for each new or changed one; answers the number written
		reallysimple.readFeed (blogRec.urlFeed, function (err, theFeed) {
			if (err) {
				console.log (nowString () + ": Can't read the feed " + blogRec.urlFeed + " because " + err.message + ".");
				callback (err);
				return;
				}
			blogRec.whenLastFeedRead = new Date ();
			blogRec.feedTitle = theFeed.title;
			blogRec.feedDescription = theFeed.description;
			blogRec.author = theFeed.title; //the feed's name is the writer's name on an rss.chat feed; the front matter's author
			blogRec.urlBlogBase = theFeed.link;
			blogRec.cloud = theFeed.cloud;
			var ctWritten = 0, theWritten = [];
			theFeed.items.forEach (function (item) {
				const fname = getPostFileForItem (blogRec, item);
				if (fname === undefined) {
					return;
					}
				const newText = getPostTextForItem (item);
				var flWrite = true;
				if (fs.existsSync (fname)) {
					flWrite = !samePost (fs.readFileSync (fname).toString (), newText);
					}
				if (flWrite) {
					utils.sureFilePathSync (fname);
					fs.writeFileSync (fname, newText);
					ctWritten++;
					theWritten.push (pathTool.relative (blogRec.postsFolder, fname));
					}
				});
			if (ctWritten > 0) {
				console.log (nowString () + ": " + blogRec.folder + ": " + ctWritten + " post file" + ((ctWritten === 1) ? "" : "s") + " from the feed: " + theWritten.join (", "));
				}
			callback (undefined, ctWritten);
			});
		}
	function readFeedAndBuild (blogRec, flBuildAnyway=false) { //read the feed; build if anything's new, or if asked to anyway, as at startup
		readFeed (blogRec, function (err, ctWritten) {
			if (!err && ((ctWritten > 0) || flBuildAnyway)) {
				rebuildBlog (blogRec);
				}
			});
		}
	function readAllFeeds (flBuildAnyway=false) { //one after another
		var ix = 0;
		function readNext () {
			if (ix >= theBlogs.length) {
				return;
				}
			const blogRec = theBlogs [ix++];
			readFeed (blogRec, function (err, ctWritten) {
				if (!err && ((ctWritten > 0) || flBuildAnyway || (blogRec.lastStats === undefined))) { //a blog that's never been built is built even with nothing new, so a person with no posts yet has a home page
					rebuildBlog (blogRec);
					}
				readNext ();
				});
			}
		readNext ();
		}
	function getBlogForFeed (urlFeed) { //the blog's record for a feed address, as the rssCloud ping names it; undefined if it isn't one of ours
		var theBlog;
		theBlogs.forEach (function (blogRec) {
			if (blogRec.urlFeed === urlFeed) {
				theBlog = blogRec;
				}
			});
		return (theBlog);
		}

//rssCloud, FeedLand's way: ask the feed's cloud server to notify us, renew before the day is up
	function rssCloudRenew (blogRec, callback) {
		const cloud = blogRec.cloud;
		if ((cloud === undefined) || (cloud.domain === undefined) || (cloud.path === undefined)) {
			callback ({message: "Can't ask for notification for " + blogRec.urlFeed + " because the feed has no cloud element."});
			return;
			}
		const urlServer = "http://" + cloud.domain + ((cloud.port === undefined) ? "" : ":" + cloud.port) + cloud.path;
		const theRequest = {
			url: urlServer,
			method: "POST",
			followAllRedirects: true,
			maxRedirects: 5,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
				},
			body: qs.stringify ({
				domain: config.myDomain,
				port: config.rssCloudPort,
				path: config.feedUpdatedCallback,
				url1: blogRec.urlFeed,
				protocol: "http-post"
				})
			};
		request (theRequest, function (err, response, body) {
			if (err) {
				callback (err);
				}
			else if (response.statusCode !== 200) {
				callback ({message: "The cloud server at " + urlServer + " answered " + response.statusCode + "."});
				}
			else {
				callback (undefined, body);
				}
			});
		}
	function renewNextBlogIfReady () { //every minute: the blog whose request is oldest, if it's due
		if (config.myDomain === undefined) {
			return;
			}
		var theBlog;
		theBlogs.forEach (function (blogRec) {
			if (blogRec.cloud !== undefined) {
				if ((theBlog === undefined) || (blogRec.whenLastCloudRenew === undefined) || ((theBlog.whenLastCloudRenew !== undefined) && (blogRec.whenLastCloudRenew < theBlog.whenLastCloudRenew))) {
					theBlog = blogRec;
					}
				}
			});
		if ((theBlog !== undefined) && ((theBlog.whenLastCloudRenew === undefined) || (utils.secondsSince (theBlog.whenLastCloudRenew) > config.ctSecsBetwRenews))) {
			theBlog.whenLastCloudRenew = new Date ();
			rssCloudRenew (theBlog, function (err, body) {
				if (err) {
					console.log (nowString () + ": Can't renew the rssCloud request for " + theBlog.urlFeed + " because " + err.message);
					theBlog.whenLastCloudRenew = new Date (Date.now () - ((config.ctSecsBetwRenews - config.ctSecsRetryRenew) * 1000)); //due again in ctSecsRetryRenew
					}
				else {
					theBlog.ctCloudRenews = (theBlog.ctCloudRenews === undefined) ? 1 : theBlog.ctCloudRenews + 1;
					console.log (nowString () + ": rssCloud request renewed for " + theBlog.urlFeed + ": " + utils.trimWhitespace (body));
					}
				});
			}
		}

//http
	function getBlogStatus (blogRec) { //what /blogs says about a blog
		return ({
			urlFeed: blogRec.urlFeed,
			folder: blogRec.folder,
			urlSite: blogRec.urlSite,
			feedTitle: blogRec.feedTitle,
			whenLastFeedRead: blogRec.whenLastFeedRead,
			whenLastCloudRenew: blogRec.whenLastCloudRenew,
			ctCloudRenews: blogRec.ctCloudRenews,
			ctPosts: (blogRec.lastStats === undefined) ? undefined : blogRec.lastStats.ctPosts,
			whenLastBuild: (blogRec.lastStats === undefined) ? undefined : blogRec.lastStats.when
			});
		}
	function handleHttpRequest (theRequest) {
		const params = theRequest.params;
		function returnData (jstruct) {
			theRequest.httpReturn (200, "application/json", utils.jsonStringify (jstruct));
			}
		function returnError (message) {
			theRequest.httpReturn (500, "text/plain", message);
			}
		function withBlog (callback) { //the blog named by ?url=, the feed's address; every blog when there's no url
			if (params.url === undefined) {
				theBlogs.forEach (callback);
				}
			else {
				const blogRec = getBlogForFeed (params.url);
				if (blogRec === undefined) {
					returnError ("Can't find a blog for " + params.url + " because it isn't one of the feeds we're watching.");
					return (false);
					}
				callback (blogRec);
				}
			return (true);
			}
		switch (theRequest.lowermethod) {
			case "post":
				switch (theRequest.lowerpath) {
					case config.feedUpdatedCallback: //the rssCloud server says a feed changed: url= names it
						const jstruct = qs.parse (theRequest.postBody);
						const blogRec = getBlogForFeed (jstruct.url);
						if (blogRec === undefined) {
							console.log (nowString () + ": rssCloud pinged for " + jstruct.url + ", not one of our feeds.");
							theRequest.httpReturn (200, "text/plain", "Not one of our feeds, but thanks.");
							}
						else {
							console.log (nowString () + ": rssCloud says " + jstruct.url + " changed.");
							readFeedAndBuild (blogRec);
							theRequest.httpReturn (200, "text/plain", "Thanks for the update.");
							}
						return (true);
					}
				break;
			case "get":
				switch (theRequest.lowerpath) {
					case "/": case "/now":
						var theText = myProductName + " v" + myVersion + ", " + new Date ().toString () + "\n";
						theBlogs.forEach (function (blogRec) {
							theText += "\n" + blogRec.urlFeed + " -> " + ((blogRec.urlSite === undefined) ? "(not read yet)" : blogRec.urlSite) + ((blogRec.whenLastFeedRead === undefined) ? "" : ", feed last read " + blogRec.whenLastFeedRead.toString ()) + ((blogRec.lastStats === undefined) ? "" : ", " + blogRec.lastStats.ctPosts + " posts");
							});
						theRequest.httpReturn (200, "text/plain", theText);
						return (true);
					case config.feedUpdatedCallback: //the rssCloud server checking that we're here: it sends a challenge and wants it back
						theRequest.httpReturn (200, "text/plain", (params.challenge === undefined) ? "" : params.challenge);
						return (true);
					case "/blogs": //every blog and where it stands
						var theList = [];
						theBlogs.forEach (function (blogRec) {
							theList.push (getBlogStatus (blogRec));
							});
						returnData (theList);
						return (true);
					case "/readfeed": //read a feed now (?url=), or all of them, build if anything's new
						if (withBlog (function (blogRec) {readFeedAndBuild (blogRec);})) {
							returnData ({message: "Reading the feed" + ((params.url === undefined) ? "s" : "") + ".", when: new Date ()});
							}
						return (true);
					case "/rebuild": //build a blog (?url=), or all of them, from the posts folder, no trip to the feed
						if (withBlog (rebuildBlog)) {
							returnData ({message: "Rebuilding.", when: new Date ()});
							}
						return (true);
					case "/laststats": //what the last build of a blog (?url=) did
						if (params.url === undefined) {
							returnError ("Can't return the stats because the url parameter is missing.");
							}
						else {
							withBlog (function (blogRec) {
								returnData ((blogRec.lastStats === undefined) ? {} : blogRec.lastStats);
								});
							}
						return (true);
					}
				break;
			}
		return (false); //not consumed
		}

function startup () {
	utils.readConfig ("config.json", config, function () {
		if (process.env.PORT !== undefined) { //PagePark's port wins over the file's
			config.port = process.env.PORT;
			}
		console.log ("\n" + myProductName + " v" + myVersion + ", config == " + utils.jsonStringify (config) + "\n");
		theBlogs = [];
		config.blogs.forEach (function (blogConfig) {
			var whatsMissing;
			["urlFeed", "urlSite", "outputFolder"].forEach (function (name) {
				if ((whatsMissing === undefined) && ((typeof blogConfig [name] !== "string") || (blogConfig [name].length === 0))) {
					whatsMissing = name;
					}
				});
			if (whatsMissing !== undefined) {
				console.log ("Can't watch a blog in config.json because its entry has no " + whatsMissing + ": " + utils.jsonStringify (blogConfig));
				}
			else if (getBlogName (blogConfig.urlSite) === undefined) {
				console.log ("Can't watch a blog in config.json because its urlSite isn't a web address: " + utils.jsonStringify (blogConfig));
				}
			else {
				addBlog (blogConfig.urlFeed, blogConfig.urlSite, blogConfig.outputFolder);
				}
			});
		davehttp.start (config, handleHttpRequest);
		readListAndFeeds (true); //every blog at startup, built whether or not the feed has anything new, so the pages are as the code now writes them
		setInterval (readListAndFeeds, config.ctMinutesBetwPolls * 60 * 1000);
		setInterval (renewNextBlogIfReady, config.minSecsBetwRenewChecks * 1000);
		});
	}
startup ();
