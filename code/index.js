/*  index.js -- 10/9/26 by CC

	The shell. An address bar at the top, the page below. Type a URL and
	press Return, and the app goes and gets it. A click on a link in the
	page loads it the same way, so the window never leaves the shell.
	
	10/9/26 -- back, forward, reload and home, to the left of the address
	bar. History is the list of pages loaded in a tab; back and forward
	walk it, a new page loaded from the middle drops what was ahead, the
	way every browser does it.
	
	10/12/26 -- tabs. Each tab holds one page and its own history. The
	current tab is what's showing; the others keep their rendered page and
	scroll position until you come back. A new tab goes right after the
	current one. Cmd-click on a link opens it in a new tab behind this
	one. The tabs are saved as they change and come back on the next
	launch.  */

var inputAddress, divPage, divTabs, divTabBar, divChrome, spanAddressFavicon, buttonBack, buttonForward, buttonReload, buttonHome, buttonNewTab; //assigned at startup
var divFindBar, inputFind, spanFindCount, buttonFindPrevious, buttonFindNext, buttonFindClose, spanVersion; //assigned at startup
var buttonSearch, divSearchBar, inputSearch, buttonSearchClose; //10/29/26 by CC -- the site's search: the button in the address bar and the bar it opens; assigned at startup
var config = {}; //assigned at startup, from the app
var tabs = [], ixCurrentTab = -1; //the open tabs, and which one is showing
var timerSaveTabs; //assigned by saveTabs
var myBookmarksMenu, bookmarksOpmltext; //assigned by startBookmarks; the outline as text, kept current as it's saved
var divBookmarksBar; //assigned at startup
var divPageColumn, divPageHeader, buttonMore, divMoreMenu; //10/16/26 by CC -- assigned at startup
var divSidebar; //10/17/26 by CC -- assigned at startup
var tocOutlines = {}; //10/17/26 by CC -- origin -> the parsed table of contents, or undefined when the site has none
var flSidebar = true; //10/17/26 by CC -- the reader's choice, open or closed, remembered; assigned at startup
var urlHistory = []; //10/18/26 by CC -- every page visited, newest first, {url, title, when}, up to maxUrlHistory, for the typeahead; assigned at startup from the app, kept by addToUrlHistory
var divLinkStatus; //10/29/26 by CC -- the box in the lower left corner that shows a link's address while the mouse is over it; assigned at startup
var buttonSource; //11/3/26 by CC -- the M-down button in the address bar: the page's Markdown as text, or the page; assigned at startup
var buttonStylesheets, divStylesheetsPanel, linkStylesheet; //10/27/26 by CC -- the button in the address bar, the panel it opens, and the link in the head that carries the chosen stylesheet; assigned at startup
var theStylesheets = [], nameStylesheet; //10/27/26 by CC -- the stylesheets in the data folder, [{name, title, url}], and the name of the one the reader chose; assigned at startup and by the panel
const nameDefaultStylesheet = "basic"; //10/27/26 by CC -- what a new reader sees before they find the button (Dave: Reader; renamed Basic the same day so it sorts first in the panel)
var divTypeahead, ixTypeahead = -1; //10/18/26 by CC -- the list under the address bar, and which row is selected; assigned at startup and by showTypeahead
const maxTypeaheadRows = 8;
const nameBookmarksBarFolder = "Bookmarks bar"; //10/13/26 by CC -- the headline in the bookmarks outline whose sub-heads are the bar's items
const urlDocs = "https://github.com/scripting/bonBon/tree/main/docs", urlSupport = "https://github.com/scripting/bonBon/issues"; //11/14/26 by CC -- the Docs and Support bookmarks a new reader starts with, see getStartingBookmarks
var recentPages = []; //10/12/26 by CC -- the pages visited, newest first, for the History menu; assigned at startup from the app
var appPrefs = {}, flEnableBackgroundTasks = true; //10/12/26 by CC -- the bookmarks menu code expects these to exist, as they do in Dave's other apps

const titleNewTab = "New tab";
const prefixViewSource = "view-source:"; //10/16/26 by CC -- a view-source: address is a page in a tab like any other, so back, reload and restore work
const secsUpdateSocketRetry = 30; //10/26/26 by CC -- how long a tab waits before opening its update socket again after it drops
const dragTypeTab = "application/x-mdbrowser-tab"; //10/12/26 by CC -- what a tab being dragged carries, besides its URL: its place in the row

function fixUrl (theUrl) { //what a browser does with "scripting.com" -- try it as http
	theUrl = theUrl.trim ();
	if ((theUrl.indexOf ("http://") !== 0) && (theUrl.indexOf ("https://") !== 0) && (theUrl.indexOf (prefixViewSource) !== 0)) {
		theUrl = "http://" + theUrl;
		}
	return (theUrl);
	}

function newTab () {
	return ({
		url: undefined,
		title: titleNewTab,
		favicon: undefined, //10/12/26 by CC -- the site's icon as a data URL, when it has one
		source: undefined, //10/13/26 by CC -- the page's text as it came from the server, for View Source
		frontMatter: undefined, //10/16/26 by CC -- the page's YAML, for the header the browser draws
		toc: undefined, //10/17/26 by CC -- the site's table of contents outline, when it has one
		urlContentLocation: undefined, //11/10/26 by CC -- the file the server says it sent, when it said: a folder's address answered with its readme. How a folder's page is found in the table of contents
		tocNeighbors: undefined, //11/10/26 by CC -- {urlPrev, urlNext} from the table of contents, for a page whose front matter names no neighbors; see getTocNeighbors
updateSocket: undefined, //10/26/26 by CC -- the websocket to the site's watcher, open while the tab shows a page from a site that has one; see watchForUpdates
		kind: undefined, //10/27/26 by CC -- what the tab shows when it isn't a Markdown page: "html" or "xml" (the source as text, the full width of the window) or "image" (the picture, centered); 11/10/26: "text" (code or plain text, a listing like the source) or "file" (anything else, a page that offers the download); undefined for a page
		flShowSource: false, //11/3/26 by CC -- the Markdown button is on: the page's text shows instead of the page
		html: "",
		pageHistory: [],
		ixHistory: -1,
		scrollY: 0
		});
	}

function currentTab () {
	return (tabs [ixCurrentTab]);
	}

function saveTabs () { //a second after the last change, so a burst of changes writes once

	/*  What's saved is each tab's history and where it is in it; the pages
		themselves are fetched again on launch.  */
	
	if (timerSaveTabs !== undefined) {
		clearTimeout (timerSaveTabs);
		}
	timerSaveTabs = setTimeout (function () {
		timerSaveTabs = undefined;
		const theState = {ixCurrentTab, tabs: []};
		tabs.forEach (function (theTab) {
			theState.tabs.push ({pageHistory: theTab.pageHistory, ixHistory: theTab.ixHistory});
			});
		window.mdBrowser.saveTabs (theState);
		}, 1000);
	}

function updateNavButtons () {
	const theTab = currentTab ();
	buttonBack.classList.toggle ("disabled", theTab.ixHistory <= 0);
	buttonForward.classList.toggle ("disabled", theTab.ixHistory >= theTab.pageHistory.length - 1);
	buttonReload.classList.toggle ("disabled", theTab.ixHistory < 0);
	buttonSearch.classList.toggle ("disabled", getSearchUrl (theTab) === undefined); //10/29/26 by CC -- dim on a site with no search
	buttonSource.classList.toggle ("disabled", theTab.source === undefined); //11/3/26 by CC -- dim when there's no Markdown to show
	buttonSource.classList.toggle ("current", theTab.flShowSource);
	buttonSource.title = (theTab.flShowSource) ? "Show the page" : "Show the Markdown source";
	}

function toggleSourceCommand () { //11/3/26 by CC -- THE MARKDOWN BUTTON. Dave's idea, 11/3: "add another icon that when you click it you see the markdown source, click it again and you see the rendering... it's just a display switch." The prior art is the rss.chat editor's switch. The tab remembers, so you come back to where you were in the page
	const theTab = currentTab ();
	if (theTab.source === undefined) {
		return;
		}
	if (theTab.flShowSource) {
		theTab.flShowSource = false;
		theTab.scrollY = theTab.scrollYPage;
		}
	else {
		theTab.flShowSource = true;
		theTab.scrollYPage = window.scrollY;
		theTab.scrollY = 0;
		}
	showCurrentTab ();
	}

/*  10/29/26 by CC -- SEARCH THIS SITE. Dave's picture: the reader types a
	word, BonBon asks the site's search program for a page of results,
	newest first, and shows it like any page; back works, the address
	can be bookmarked. The site says where its search program is in
	its bonbon.json, urlSearch, beside urlUpdateSocket (11/13/26; it was
	toc.opml's head); only our sites,
	the ones with a watcher, have one. BonBon adds ?q= and the word.
	Two ways in, Dave's: type the word in the address bar, where
	anything that doesn't look like an address is a search; or the
	magnifying glass in the address bar, which opens a bar like Find's.  */

function getSiteToc (theTab) { //11/4/26 by CC -- the part of the domain's table of contents the page is in: {urlSearch, urlUpdateSocket, subs}, or undefined when the domain has no outline

	/*  A domain can hold more than one site (Dave, 11/4). The root's
		toc.opml describes the domain; a folder's own outline comes in
		through an include node, filled in by the app (expandTocIncludes
		in pageRequests.js) with the folder's search and socket on the
		node. 11/13/26: the search and socket come from each site's
		.well-known/bonbon.json; the app puts the root's on the head here
		and a folder's on its node, so this reads them where it always did. A page under that folder gets the node's children, search
		and socket; any other page gets the root's own.  */
	
	if ((theTab === undefined) || (theTab.toc === undefined)) {
		return (undefined);
		}
	const theHead = (theTab.toc.opml.head === undefined) ? {} : theTab.toc.opml.head;
	const theSubs = (theTab.toc.opml.body.subs === undefined) ? [] : theTab.toc.opml.body.subs;
	var theSite = {urlSearch: theHead.urlSearch, urlUpdateSocket: theHead.urlUpdateSocket, subs: theSubs};
	if (theTab.url !== undefined) {
		theSubs.forEach (function (theNode) {
			if ((theNode.type === "include") && (theNode.url !== undefined)) {
				const urlFolder = theNode.url.substr (0, theNode.url.lastIndexOf ("/.well-known/") + 1); //the folder the included outline describes
				if ((urlFolder.length > 0) && (theTab.url.indexOf (urlFolder) === 0)) {
					theSite = {urlSearch: theNode.urlSearch, urlUpdateSocket: theNode.urlUpdateSocket, subs: (theNode.subs === undefined) ? [] : theNode.subs};
					}
				}
			});
		}
	return (theSite);
	}
function getMirrorUrl (theTab, theUrl) { //11/5/26 by CC -- when a link points at a site this domain holds the Markdown version of, the address of that version here; undefined when it doesn't

	/*  Dave's wish, 11/5: a post in the mirror links to scripting.com
		stories, the HTML versions; "it would be really nice but weird if
		it could translate the url to the dave.writersweb.org url when
		the user clicks on it." The mirror says what it mirrors in its
		bonbon.json (11/13/26; it was toc.opml's head), urlMirrorOf (his name), the way it says where its
		search and socket are, so any Markdown mirror of an HTML site can
		do this. The rule: same path, .html to .md; the site's home page
		to the folder. The caller asks whether the page is there before
		going; if not, the link goes where it pointed.  */

	if ((theTab === undefined) || (theTab.toc === undefined) || (theTab.url === undefined) || (theUrl === undefined)) {
		return (undefined);
		}
	const theMirrors = []; //{urlMirrorOf, urlFolder}: the root's, then each included folder's
	const theHead = (theTab.toc.opml.head === undefined) ? {} : theTab.toc.opml.head;
	const theSubs = (theTab.toc.opml.body.subs === undefined) ? [] : theTab.toc.opml.body.subs;
	try {
		if (theHead.urlMirrorOf !== undefined) {
			theMirrors.push ({urlMirrorOf: theHead.urlMirrorOf, urlFolder: new URL (theTab.url).origin + "/"});
			}
		theSubs.forEach (function (theNode) {
			if ((theNode.type === "include") && (theNode.url !== undefined) && (theNode.urlMirrorOf !== undefined)) {
				const urlFolder = theNode.url.substr (0, theNode.url.lastIndexOf ("/.well-known/") + 1);
				if (urlFolder.length > 0) {
					theMirrors.push ({urlMirrorOf: theNode.urlMirrorOf, urlFolder});
					}
				}
			});
		const theLink = new URL (theUrl);
		var urlMirror;
		theMirrors.forEach (function (theMirror) {
			if (urlMirror !== undefined) {
				return;
				}
			const theOriginal = new URL (theMirror.urlMirrorOf);
			const hostLink = theLink.hostname.replace (/^www\./, ""), hostOriginal = theOriginal.hostname.replace (/^www\./, "");
			if ((hostLink === hostOriginal) && (theLink.pathname.indexOf (theOriginal.pathname) === 0)) {
				const thePath = theLink.pathname.substr (theOriginal.pathname.length); //what's after the site's root
				if ((thePath.length === 0) || (thePath === "index.html")) {
					urlMirror = theMirror.urlFolder;
					}
				else if (thePath.endsWith (".html")) {
					urlMirror = theMirror.urlFolder + thePath.substr (0, thePath.length - 5) + ".md";
					}
				else if (thePath.endsWith ("/")) {
					urlMirror = theMirror.urlFolder + thePath;
					}
				if (urlMirror !== undefined) {
					urlMirror += theLink.hash;
					}
				}
			});
		return (urlMirror);
		}
	catch (err) {
		return (undefined);
		}
	}
function followLink (theTab, theUrl, flNewTab) { //11/5/26 by CC -- a click on a link: when the link points at a site this domain mirrors and the Markdown version is there, that's the page; otherwise the link's own
	function go (urlToLoad) {
		if (flNewTab) {
			openUrlInNewTab (urlToLoad, true, true);
			}
		else {
			loadUrl (theTab, urlToLoad, false, false, true); //11/12/26 by CC -- flFromLink: an HTML page reached by a click goes to the reader's browser
			}
		}
	const urlMirror = getMirrorUrl (theTab, theUrl);
	if (urlMirror === undefined) {
		go (theUrl);
		}
	else {
		window.mdBrowser.isMarkdownUrl (urlMirror).then (function (flMarkdown) {
			go ((flMarkdown) ? urlMirror : theUrl);
			});
		}
	}
function getSearchUrl (theTab) { //where this tab's site takes a search, from its table of contents; undefined when it has none
	const theSite = getSiteToc (theTab); //11/4/26 by CC
	if (theSite === undefined) {
		return (undefined);
		}
	return (theSite.urlSearch);
	}
function looksLikeAddress (theText) { //every browser's rule for the address bar: a dot, a slash or a scheme means go there, anything else is a search
	theText = theText.trim ();
	return ((theText.indexOf (".") !== -1) || (theText.indexOf ("/") !== -1) || (theText.indexOf (":") !== -1));
	}
function searchSite (theTab, theQuery) { //the results page loads in the tab, like any page
	const urlSearch = getSearchUrl (theTab);
	theQuery = theQuery.trim ();
	if ((urlSearch === undefined) || (theQuery.length === 0)) {
		return (false);
		}
	loadUrl (theTab, urlSearch + "?q=" + encodeURIComponent (theQuery));
	return (true);
	}
function searchCommand () { //the magnifying glass: the bar, with the last search selected, ready to type over
	if (getSearchUrl (currentTab ()) === undefined) {
		return;
		}
	if (getSearchQuery (currentTab ()) !== undefined) { //10/30/26 by CC -- already on the results page: its own box is the search box (Dave: "don't need to draw the dropdown text box if we're already on a search page")
		const inputSearchForm = divPageHeader.querySelector (".inputSearchForm");
		if (inputSearchForm !== null) {
			inputSearchForm.focus ();
			inputSearchForm.select ();
			}
		return;
		}
	divSearchBar.classList.add ("showing");
	inputSearch.focus ();
	inputSearch.select ();
	}
function closeSearch () {
	divSearchBar.classList.remove ("showing");
	}
function getSearchQuery (theTab) { //10/30/26 by CC -- the word a search results page was asked for, from its address; undefined when the tab isn't on the site's results page
	const urlSearch = getSearchUrl (theTab);
	var theQuery;
	if ((urlSearch !== undefined) && (theTab.url !== undefined) && (theTab.url.indexOf (urlSearch + "?") === 0)) {
		try {
			theQuery = new URL (theTab.url).searchParams.get ("q");
			}
		catch (err) {
			}
		}
	if (theQuery === null) {
		theQuery = undefined;
		}
	return (theQuery);
	}
function fillSearchForm (theTab, theQuery, theFrontMatter) { //10/30/26 by CC -- the top of a results page, Daytona's: the box with your search in it, front and center, ready to edit; a Search button; the count of hits under them, small

	/*  Dave, 10/30/26: "the top of the page of daytona works way better
		than the one we have in bonbon... i spent a lot of time iterating
		over this -- and that was the answer." For a day (0.6.29) the
		results page opened the magnifying glass's bar instead, beside
		the page; "now search is front and center, so the box should be
		front and center too, and you display the search term in the
		box, so you don't need to tell them what they're searching for,
		it's right there, and ready to edit in case you made a typing
		error. and the number of hits is placed centrally, but small
		text." The page's title ("Search for ...") still names the tab;
		it isn't drawn. The count is the page's description.  */
	
	const divSearchForm = document.createElement ("div");
	divSearchForm.className = "divSearchForm";
	const inputSearchForm = document.createElement ("input");
	inputSearchForm.className = "inputSearchForm";
	inputSearchForm.type = "text";
	inputSearchForm.spellcheck = false;
	inputSearchForm.value = theQuery;
	const buttonSearchForm = document.createElement ("button");
	buttonSearchForm.className = "buttonSearchForm";
	buttonSearchForm.textContent = "Search";
	divSearchForm.appendChild (inputSearchForm);
	divSearchForm.appendChild (buttonSearchForm);
	divPageHeader.appendChild (divSearchForm);
	
	if (theFrontMatter.description !== undefined) {
		const divSearchHits = document.createElement ("div");
		divSearchHits.className = "divSearchHits";
		divSearchHits.textContent = theFrontMatter.description;
		divPageHeader.appendChild (divSearchHits);
		}
	
	function search () {
		searchSite (theTab, inputSearchForm.value);
		}
	buttonSearchForm.addEventListener ("click", search);
	inputSearchForm.addEventListener ("keydown", function (event) {
		if (event.key === "Enter") {
			search ();
			}
		});
	inputSearchForm.focus ();
	inputSearchForm.setSelectionRange (theQuery.length, theQuery.length); //the cursor at the end, Daytona's
	}

/*  10/12/26 by CC -- FAVICONS AND DRAG AND DROP, Chrome's way. Each tab
	shows its site's icon at the left of the title; a page whose site has
	no icon gets a globe, a new tab a blank page. The icon in the address
	bar is the current tab's. Tabs can be dragged to reorder them. A URL
	dropped on a tab loads there, dropped on the tab strip opens in a new
	tab, dropped on the page loads in the current tab; the icon in the
	address bar can be dragged, carrying the page's URL, so it can go to
	the tab strip or to another app.  */

function getFaviconElement (theTab) { //the site's icon, or a stand-in
	if (theTab.favicon === undefined) {
		const iStandIn = document.createElement ("i");
		iStandIn.className = (theTab.url === undefined) ? "far fa-file iTabFavicon" : "fas fa-globe iTabFavicon";
		return (iStandIn);
		}
	else {
		const imgTabFavicon = document.createElement ("img");
		imgTabFavicon.className = "imgTabFavicon";
		imgTabFavicon.src = theTab.favicon;
		return (imgTabFavicon);
		}
	}

function showAddressFavicon () { //the current tab's icon, at the left of the address
	const theTab = currentTab ();
	spanAddressFavicon.innerHTML = "";
	spanAddressFavicon.appendChild (getFaviconElement (theTab));
	spanAddressFavicon.draggable = (theTab.url !== undefined);
	}

function getTabFavicon (theTab) { //after a page loads: ask the app for the site's icon, then show it
	window.mdBrowser.getFavicon (theTab.url).then (function (theFavicon) {
		if (theFavicon === null) {
			theFavicon = undefined;
			}
		theTab.favicon = theFavicon;
		buildTabBar ();
		if (theTab === currentTab ()) {
			showAddressFavicon ();
			}
		});
	}

function setDragUrl (event, theUrl) { //what a drag carries: the URL, in the two forms other apps and browsers expect
	event.dataTransfer.setData ("text/uri-list", theUrl);
	event.dataTransfer.setData ("text/plain", theUrl);
	}

function getDroppedUrl (event) { //the URL in what was dropped, or undefined if there isn't one
	var theText = event.dataTransfer.getData ("text/uri-list");
	if (theText.length === 0) {
		theText = event.dataTransfer.getData ("text/plain");
		}
	var theUrl;
	theText.split ("\n").forEach (function (theLine) { //a uri-list can have several lines, and comments starting with #
		theLine = theLine.trim ();
		if ((theUrl === undefined) && (theLine.length > 0) && (theLine.charAt (0) !== "#")) {
			theUrl = theLine;
			}
		});
	if ((theUrl !== undefined) && (theUrl.indexOf ("http://") !== 0) && (theUrl.indexOf ("https://") !== 0)) {
		theUrl = undefined;
		}
	return (theUrl);
	}

function getDraggedTabIndex (event) { //the tab being dragged, or undefined when it's something else being dropped
	const theData = event.dataTransfer.getData (dragTypeTab);
	return ((theData.length === 0) ? undefined : Number (theData));
	}

function isTabDrag (event) { //during a drag you can only see the types, not the data
	var flTabDrag = false;
	Array.from (event.dataTransfer.types).forEach (function (theType) {
		if (theType === dragTypeTab) {
			flTabDrag = true;
			}
		});
	return (flTabDrag);
	}

function moveTab (ixFrom, ixTo) { //reorder: the tab at ixFrom goes to ixTo; the current tab stays current
	const theCurrentTab = currentTab ();
	const theTab = tabs.splice (ixFrom, 1) [0];
	tabs.splice (ixTo, 0, theTab);
	ixCurrentTab = tabs.indexOf (theCurrentTab);
	buildTabBar ();
	saveTabs ();
	}

function buildTabBar () {
	divTabs.innerHTML = "";
	tabs.forEach (function (theTab, ix) {
		const divTab = document.createElement ("div");
		divTab.className = "divTab";
		if (ix === ixCurrentTab) {
			divTab.classList.add ("current");
			}
		divTab.title = (theTab.url === undefined) ? titleNewTab : theTab.url;
		const spanTabTitle = document.createElement ("span");
		spanTabTitle.className = "spanTabTitle";
		spanTabTitle.textContent = theTab.title;
		const spanTabClose = document.createElement ("span");
		spanTabClose.className = "spanTabClose";
		spanTabClose.innerHTML = "<i class=\"fas fa-times\"></i>";
		spanTabClose.addEventListener ("click", function (event) {
			event.stopPropagation ();
			closeTab (ix);
			});
		divTab.appendChild (getFaviconElement (theTab));
		divTab.appendChild (spanTabTitle);
		divTab.appendChild (spanTabClose);
		divTab.addEventListener ("click", function () {
			switchToTab (ix);
			});
		divTab.draggable = true;
		divTab.addEventListener ("dragstart", function (event) {
			event.dataTransfer.setData (dragTypeTab, String (ix));
			if (theTab.url !== undefined) {
				setDragUrl (event, theTab.url);
				}
			});
		divTab.addEventListener ("dragover", function (event) {
			event.preventDefault ();
			divTab.classList.add ("dropTarget");
			});
		divTab.addEventListener ("dragleave", function (event) {
			divTab.classList.remove ("dropTarget");
			});
		divTab.addEventListener ("drop", function (event) {
			event.preventDefault ();
			event.stopPropagation ();
			divTab.classList.remove ("dropTarget");
			const ixFrom = getDraggedTabIndex (event);
			if (ixFrom === undefined) {
				const theUrl = getDroppedUrl (event);
				if (theUrl !== undefined) {
					loadUrl (theTab, theUrl);
					}
				}
			else {
				if (ixFrom !== ix) {
					moveTab (ixFrom, ix);
					}
				}
			});
		divTabs.appendChild (divTab);
		});
	}

function wireLinks (theContainer) { //a click loads the link in this tab; a cmd-click opens it in a new tab behind this one
	theContainer.querySelectorAll ("a").forEach (function (theLink) {
		theLink.addEventListener ("click", function (event) {
			if (theLink.classList.contains ("aPageDownload")) { //11/10/26 by CC -- the link on a download page: the click is the browser's, which saves the file
				return;
				}
			event.preventDefault ();
			const theTab = currentTab ();
			if (theLink.classList.contains ("disabled")) {
				}
			else if ((theLink.href.indexOf ("#") !== -1) && (theTab.url !== undefined) && (urlWithoutHash (theLink.href) === urlWithoutHash (theTab.url)) && !event.metaKey) { //10/19/26 by CC -- a link to a place in this page: scroll there and put the address in the bar, no fetch
				theTab.url = theLink.href;
				inputAddress.value = theTab.url;
				scrollToAnchor (theTab.url);
				saveTabs ();
				}
			else {
				followLink (theTab, theLink.href, event.metaKey); //11/5/26 by CC -- in this tab, or a cmd-click in a new one behind it; a mirrored site's page goes to the Markdown version here
				}
			});
		});
	}

function addHeadingLinks () { //10/19/26 by CC -- HEADING PERMALINKS, GitHub's way: every heading already has a name made from its text (the Markdown converter does that); a chain-link icon appears in the left margin when you hover over the heading, and clicking it puts the heading's address in the address bar

	/*  Dave's choice over scripting.com's purple pound signs, which need a
		name that survives edits; these break when the heading's words
		change, as GitHub's do, and that's accepted. His headings are
		timestamps, so they don't change.  */
	
	divPage.querySelectorAll ("h1, h2, h3, h4, h5, h6").forEach (function (theHeading) {
		if (theHeading.id.length > 0) {
			const aHeadingLink = document.createElement ("a");
			aHeadingLink.className = "aHeadingLink";
			aHeadingLink.href = "#" + theHeading.id;
			aHeadingLink.title = "Link to this heading";
			const iHeadingLink = document.createElement ("i");
			iHeadingLink.className = "fas fa-link";
			aHeadingLink.appendChild (iHeadingLink);
			theHeading.insertBefore (aHeadingLink, theHeading.firstChild);
			}
		});
	}
function urlWithoutHash (theUrl) {
	const ix = theUrl.indexOf ("#");
	return ((ix === -1) ? theUrl : theUrl.substr (0, ix));
	}
function scrollToAnchor (theUrl) { //the part after # names an element in the page; scroll to it
	if (theUrl !== undefined) {
		const ix = theUrl.indexOf ("#");
		if (ix !== -1) {
			const theName = decodeURIComponent (theUrl.substr (ix + 1));
			const theElement = (theName.length > 0) ? document.getElementById (theName) : null;
			if (theElement !== null) {
				theElement.scrollIntoView ({block: "start"});
				}
			}
		}
	}

function getSourceLanguage (theUrl) { //11/10/26 by CC -- highlight.js's name for the language of a code file, from its extension; undefined when it's plain text or a language the package doesn't have
	const theLanguages = {js: "javascript", json: "json", css: "css", yaml: "yaml", yml: "yaml", py: "python", sh: "bash", c: "c", h: "c", php: "php", rb: "ruby", go: "go", rs: "rust", java: "java", ts: "typescript", sql: "sql", ini: "ini", toml: "ini"};
	var theExtension = "";
	try {
		const thePath = new URL (theUrl).pathname.toLowerCase ();
		if (thePath.lastIndexOf (".") > thePath.lastIndexOf ("/")) {
			theExtension = thePath.substr (thePath.lastIndexOf (".") + 1);
			}
		}
	catch (err) {
		}
	const theLanguage = theLanguages [theExtension];
	if ((theLanguage === undefined) || (typeof hljs === "undefined") || (hljs.getLanguage (theLanguage) === undefined)) {
		return (undefined);
		}
	return (theLanguage);
	}

function getSourceHtml (theSource, theLanguage="xml") { //10/30/26 by CC -- an XML or HTML file shown as source: colored by highlight.js, the xml grammar (Dave: color coding, "use packages whenever possible"); plain when the package didn't load. 11/10/26: theLanguage, for a code file's listing; undefined means plain text, no color
	const preSource = document.createElement ("pre");
	preSource.className = "preSource";
	const codeSource = document.createElement ("code");
	codeSource.className = "codeSource hljs";
	if ((typeof hljs === "undefined") || (theLanguage === undefined)) {
		codeSource.textContent = theSource;
		}
	else {
		codeSource.innerHTML = hljs.highlight (theSource, {language: theLanguage, ignoreIllegals: true}).value;
		}
	preSource.appendChild (codeSource);
	return (preSource.outerHTML);
	}
function getHandlerHtml (htmltext) { //11/19/26 by CC -- PAGE HANDLERS: what a handler sent back, made safe to draw. Answers {html, flListing}, or undefined when the cleaner isn't loaded

	/*  A handler is someone's program, and its HTML is treated the way
		the charter treats a page's: no script (Dave: "we should treat the
		html as code that cannot include script code at least"). DOMPurify
		takes out script, event handlers and javascript: links. On top of
		that, no styles, since the look of the page is the reader's
		stylesheet's, and no forms, frames or embedded objects.
		
		One shape gets special treatment. When the whole answer is a single
		pre, it's a listing, and it's drawn the way BonBon draws a code
		file: the width of the window, colored. The language comes from
		the class on the code element inside, language-json say, Markdown's
		own convention. That's how the json and js handlers get the same
		look a code file had before there were handlers.  */
	
	if (typeof DOMPurify === "undefined") {
		return (undefined);
		}
	const cleanHtml = DOMPurify.sanitize (String (htmltext), {
		USE_PROFILES: {html: true}, //HTML only, no SVG or MathML
		FORBID_TAGS: ["style", "link", "meta", "base", "form", "input", "button", "textarea", "select", "option", "iframe", "frame", "frameset", "object", "embed", "audio", "video", "source", "dialog"],
		FORBID_ATTR: ["style", "srcset"],
		ALLOW_DATA_ATTR: false
		});
	const theDocument = new DOMParser ().parseFromString ("<!DOCTYPE html><body>" + cleanHtml, "text/html"); //a document of its own
	var flOnlyAPre = (theDocument.body.children.length === 1) && (theDocument.body.children [0].tagName === "PRE");
	if (flOnlyAPre) {
		theDocument.body.childNodes.forEach (function (theNode) {
			if ((theNode.nodeType === Node.TEXT_NODE) && (theNode.textContent.trim ().length > 0)) {
				flOnlyAPre = false;
				}
			});
		}
	if (flOnlyAPre) {
		const preListing = theDocument.body.children [0];
		var theLanguage = "plaintext";
		const codeListing = preListing.querySelector ("code");
		if (codeListing !== null) {
			codeListing.classList.forEach (function (theClass) {
				if (theClass.indexOf ("language-") === 0) {
					const theName = theClass.substr ("language-".length);
					if ((typeof hljs !== "undefined") && (hljs.getLanguage (theName) !== undefined)) {
						theLanguage = theName;
						}
					}
				});
			}
		return ({html: getSourceHtml (preListing.textContent, theLanguage), flListing: true});
		}
	return ({html: cleanHtml, flListing: false});
	}
function captionImages () { //10/16/26 by CC -- a paragraph that is only an image is a picture: centered, at its own size, with its alt text drawn under it as the caption

	/*  The second of the two image conventions (the first is
		floatLeadImages). The generator writes scripting.com's inline
		images this way, caption as alt, so the Markdown stays clean;
		the browser does the drawing. An image with no alt gets no
		caption line.
		
		10/30/26: a search results page puts a # link after every
		paragraph, the pictures' included, Daytona's way. That made a
		picture look like a paragraph that starts with an image and goes
		on with text, so it floated right as a margin image. Dave: the
		shape can include a # at the end. An image followed by nothing
		but a # link is a picture; the link moves out of the paragraph
		to the end of the caption, and the paragraph is the image alone
		again, the shape the stylesheets know. This runs before
		floatLeadImages for that reason.  */
	
	divPage.querySelectorAll ("p").forEach (function (theParagraph) {
		const theFirst = theParagraph.firstElementChild;
		if ((theFirst !== null) && (theFirst.tagName === "IMG")) {
			var aDirect; //the # link after the picture, when there is one
			if ((theParagraph.children.length === 2) && (theParagraph.children [1].tagName === "A") && (theParagraph.children [1].textContent.trim () === "#")) {
				aDirect = theParagraph.children [1];
				}
			const ctChildren = (aDirect === undefined) ? 1 : 2;
			const theText = (aDirect === undefined) ? theParagraph.textContent : theParagraph.textContent.replace ("#", "");
			if ((theText.trim ().length === 0) && (theParagraph.children.length === ctChildren)) {
				const theCaption = theFirst.getAttribute ("alt");
				const flCaption = (theCaption !== null) && (theCaption.trim ().length > 0);
				if (flCaption || (aDirect !== undefined)) {
					
					/*  11/12/26 by CC -- a captioned picture is drawn exactly as
						oldschool draws an inlineImage (Dave: "it should not be a
						<p>", the same elements, class names and styling, with
						oldschool's code as the source). There it's
						addInlineImageTo and getRenderedText in oldschool.js: a
						divInlineImage holding the picture, an imgInline in a
						center, then the text, then the # link in a spPermaLink.
						The styles are oldschool's too, in index.css. It was a
						pImageOnly paragraph followed by a divImageCaption. A
						picture with no caption is still a pImageOnly.  */
					
					const divInlineImage = document.createElement ("div");
					divInlineImage.className = "divInlineImage";
					const centerInlineImage = document.createElement ("center");
					theFirst.classList.add ("imgInline");
					centerInlineImage.appendChild (theFirst);
					divInlineImage.appendChild (centerInlineImage);
					if (flCaption) {
						divInlineImage.appendChild (document.createTextNode (theCaption));
						}
					if (aDirect !== undefined) {
						const spPermaLink = document.createElement ("span");
						spPermaLink.className = "spPermaLink";
						spPermaLink.appendChild (aDirect);
						divInlineImage.appendChild (spPermaLink);
						}
					theParagraph.parentNode.replaceChild (divInlineImage, theParagraph);
					}
				else {
					theParagraph.classList.add ("pImageOnly");
					}
				}
			}
		});
	}

function resolvePageUrls (theTab) { //10/14/26 by CC -- a relative link or image in the page is relative to the page's address, not the shell's

	/*  The shell is a file: URL, so the DOM resolves "31/181216.md" against
		the app folder. Every browser resolves against the page; so do we,
		before anything reads a link's href or an image's src.  */
	
	if (theTab.url !== undefined) {
		divPage.querySelectorAll ("a[href], img[src]").forEach (function (theElement) {
			const theAttribute = (theElement.tagName === "A") ? "href" : "src";
			try {
				theElement.setAttribute (theAttribute, new URL (theElement.getAttribute (theAttribute), theTab.url).href);
				}
			catch (err) { //not a URL we can make sense of; leave it as written
				}
			});
		}
	}

function floatLeadImages () { //10/13/26 by CC -- an image at the head of a paragraph floats right beside it

	/*  The rule scripting.com's publisher applies, applied here instead:
		a paragraph that starts with an image and goes on with text gets
		the image taken out of the line and floated at the right margin,
		with scripting.com's padding. A paragraph that is only an image is
		left alone; that's a picture, not a margin image. The alt text is
		the Markdown's.

		11/21/26 by CC -- PLAIN WORDS AFTER THE PICTURE. Joseph Fieber's
		home page: a picture, then a paragraph of words with no link or
		bold in it, and the picture stayed in the line (issue 11). The
		stylesheets tell a picture standing alone from a margin image
		with img:only-child, which counts elements, not words, so a
		picture with only words after it looked like one standing alone.
		Dave's paragraphs nearly always have a link, so it never showed.
		The cure is here and not in the stylesheets, because a reader's
		stylesheets are copies in the data folder that a new version
		never replaces: when the words after the picture have no element
		among them, an empty span goes at the end of the paragraph, and
		the picture isn't the only child any more. Every stylesheet, an
		edited one too, then does what it does for Dave's paragraphs.  */

	divPage.querySelectorAll ("p").forEach (function (theParagraph) {
		const theFirst = theParagraph.firstElementChild;
		if ((theFirst !== null) && (theFirst.tagName === "IMG") && (theFirst === theParagraph.firstChild)) {
			const theText = theParagraph.textContent.trim ();
			if (theText.length > 0) {
				theFirst.classList.add ("imgRightMargin");
				if (theParagraph.children.length === 1) { //11/21/26 by CC
					theParagraph.appendChild (document.createElement ("span"));
					}
				}
			}
		});
	}

function getMacroValue (theFrontMatter, theName) { //11/11/26 by CC -- the front matter's value for a macro's name, "title", or "source.title" for a value inside another; undefined when there isn't one
	var theValue = theFrontMatter;
	theName.split (".").forEach (function (thePart) {
		if ((theValue === undefined) || (theValue === null) || (typeof theValue !== "object")) {
			theValue = undefined;
			}
		else {
			theValue = theValue [thePart];
			}
		});
	if ((theValue === null) || (typeof theValue === "object")) {
		return (undefined);
		}
	return (theValue);
	}
function expandMacros (theHtml, theFrontMatter, urlPage) { //11/11/26 by CC -- the page's HTML with each {{page.xxx}} in its text replaced by that value from its front matter

	/*  Dave, 11/11: "All front matter values can be used in macros, to
		place the value in a page where you want it. We use the syntax of
		Jekyll, so {{page.title}} will insert the title text at the
		location where the macro appears." Spaces inside the braces are
		optional, as in Jekyll. The value goes in as text, never as HTML.
		Three things that aren't Jekyll's:
		
		1. pubDate is shown the way the byline showed it, "October 23,
		2026 at 11:19 AM", in the reader's own time and language, not as
		the text in the file (Dave: "it is only for dates and pubdate is
		the only one now").
		
		2. When the front matter has a link, the title is a link to it,
		the reference's rule: "where we display the title, it becomes a
		link to the value of this front matter bit."
		
		3. A macro in code, in backticks or a fenced block, is left
		alone, so a page can show one, and so is a macro for a value the
		front matter doesn't have, so the writer sees what's missing.  */
	
	if ((theFrontMatter === undefined) || (theHtml.indexOf ("{{") === -1)) {
		return (theHtml);
		}
	const theDocument = new DOMParser ().parseFromString (theHtml, "text/html"); //a document of its own, so its pictures aren't fetched here
	const theWalker = theDocument.createTreeWalker (theDocument.body, NodeFilter.SHOW_TEXT);
	const theTextNodes = [];
	while (theWalker.nextNode ()) {
		const theNode = theWalker.currentNode;
		if ((theNode.nodeValue.indexOf ("{{") !== -1) && (theNode.parentElement.closest ("code, pre") === null)) {
			theTextNodes.push (theNode);
			}
		}
	function getValueNode (theName, theValue) {
		if (theName === "pubDate") {
			const theDate = new Date (theValue);
			if (!isNaN (theDate.getTime ())) {
				return (theDocument.createTextNode (theDate.toLocaleDateString (undefined, {year: "numeric", month: "long", day: "numeric"}) + " at " + theDate.toLocaleTimeString (undefined, {hour: "numeric", minute: "2-digit"})));
				}
			}
		if ((theName === "title") && (typeof theFrontMatter.link === "string")) {
			const aPageTitleLink = theDocument.createElement ("a");
			aPageTitleLink.className = "aPageTitleLink";
			try {
				aPageTitleLink.setAttribute ("href", new URL (theFrontMatter.link, urlPage).href);
				}
			catch (err) {
				aPageTitleLink.setAttribute ("href", theFrontMatter.link);
				}
			aPageTitleLink.textContent = String (theValue);
			return (aPageTitleLink);
			}
		return (theDocument.createTextNode (String (theValue)));
		}
	theTextNodes.forEach (function (theNode) {
		const theText = theNode.nodeValue, thePattern = /\{\{\s*page\.([A-Za-z0-9_.]+)\s*\}\}/g;
		const theFragment = theDocument.createDocumentFragment ();
		var ixLast = 0, flChanged = false, theMatch = thePattern.exec (theText);
		while (theMatch !== null) {
			const theValue = getMacroValue (theFrontMatter, theMatch [1]);
			if (theValue !== undefined) {
				theFragment.appendChild (theDocument.createTextNode (theText.substring (ixLast, theMatch.index)));
				theFragment.appendChild (getValueNode (theMatch [1], theValue));
				ixLast = theMatch.index + theMatch [0].length;
				flChanged = true;
				}
			theMatch = thePattern.exec (theText);
			}
		if (flChanged) {
			theFragment.appendChild (theDocument.createTextNode (theText.substring (ixLast)));
			theNode.parentNode.replaceChild (theFragment, theNode);
			}
		});
	return (theDocument.body.innerHTML);
	}
function fillPageHeader (theTab) { //10/16/26 by CC -- what the browser draws above the page: the arrows, or the search box. 11/11/26: it was the title, byline and description too, from the front matter; the writer places those now, with macros

	/*  The header has its own area above the text, so a rule the reader
		writes for the text (.divPage a, say) doesn't reach the arrows.
		Only what the front matter has: a page with none gets an empty
		header, which the CSS hides, so the scripting.com pages that
		still carry their date line and heading in the body look as they
		did. Everything has a class, so the user's CSS can arrange it.
		The arrows' addresses are relative to the page, resolved here
		the way resolvePageUrls does the page's.
		
		10/29/26: for a few hours these were Drummer's arrow pad, four
		arrows in a fixed box, up to the parent and down to the first
		child as well (0.6.25). Dave: "way overloaded by trying to think
		through what all the arrows mean... let's go back to left and
		right, adjacent to the title as before, and only next and prev."
		The generator still writes urlParent and urlFirstChild, room for
		other products; BonBon ignores them. Later the same day: the
		arrows are part of the title's line, after its text, centered on
		it, so title and arrows center together ("if you think of the
		arrows as a continuation of the title, that should be counted in
		the width"); on a page with no title they follow the dateline.
		And a post with a link in its front matter, inessential.com's
		link posts, has its title drawn as a link to it.  */
	
	divPageHeader.innerHTML = "";
	const theFrontMatter = (theTab.frontMatter === undefined) ? {} : theTab.frontMatter;
	
	const theSearchQuery = getSearchQuery (theTab); //10/30/26 by CC -- a search results page gets the search box instead of a title
	if (theSearchQuery !== undefined) {
		fillSearchForm (theTab, theSearchQuery, theFrontMatter);
		return;
		}
	
	var theNeighbors = {urlPrev: theFrontMatter.urlPrev, urlNext: theFrontMatter.urlNext}; //11/10/26 by CC -- a page that names no neighbors gets them from the site's table of contents, when it's in it; see getTocNeighbors
	if ((theNeighbors.urlPrev === undefined) && (theNeighbors.urlNext === undefined) && (theTab.tocNeighbors !== undefined)) {
		theNeighbors = theTab.tocNeighbors;
		}
	
	var divPageArrows; //10/29/26: built first, placed after the title or the dateline is built
	if ((theNeighbors.urlPrev !== undefined) || (theNeighbors.urlNext !== undefined)) {
		divPageArrows = document.createElement ("span");
		divPageArrows.className = "divPageArrows";
		function addArrow (theUrl, className, iconName, tip) {
			const aArrow = document.createElement ("a");
			aArrow.className = className;
			aArrow.title = tip;
			if (theUrl === undefined) {
				aArrow.classList.add ("disabled");
				}
			else {
				try {
					aArrow.href = new URL (theUrl, theTab.url).href;
					}
				catch (err) {
					aArrow.href = theUrl;
					}
				}
			const iArrow = document.createElement ("i");
			iArrow.className = "fas " + iconName;
			aArrow.appendChild (iArrow);
			divPageArrows.appendChild (aArrow);
			}
		addArrow (theNeighbors.urlPrev, "aPagePrev", "fa-arrow-left", "Previous");
		addArrow (theNeighbors.urlNext, "aPageNext", "fa-arrow-right", "Next");
		}
	
	/*  11/11/26 by CC -- MACROS. Until today the title, the byline and
		the description were drawn here, from the front matter. Dave,
		writing the reference: he couldn't use title or pubDate in his
		own pages, because each did two things, named the page, which he
		wanted, and put a headline at the top of it, which he didn't;
		"the usual way this is done is with a macro... and you get to
		place it where you want." So the writer places them now, in the
		text, {{page.title}}, see expandMacros, and nothing is drawn here
		but the arrows, which had sat on the headline's line: "upper
		right corner of page for now. let's see what issues that raises
		if any." The CSS floats them there; the page's first lines run
		beside them.  */
	
	if (divPageArrows !== undefined) {
		divPageHeader.appendChild (divPageArrows);
		}
	
	wireLinks (divPageHeader); //the arrows load in this tab, cmd-click in a new one, like links in the text
	}

function stopWatching (theTab) { //10/26/26 by CC -- the tab is leaving the page, or closing: its socket goes with it
	if (theTab.updateSocket !== undefined) {
		const theSocket = theTab.updateSocket;
		theTab.updateSocket = undefined; //first, so the close handler knows not to reconnect
		try {
			theSocket.close ();
			}
		catch (err) {
			}
		}
	}
function watchForUpdates (theTab) { //10/26/26 by CC -- LIVE RELOAD, Drummer's way: when the page the tab shows is rebuilt, the tab reloads it

	/*  The site says where its watcher's socket is in its
		bonbon.json (11/13/26; it was the head of toc.opml), urlUpdateSocket, the way a Drummer outline names its
		socket. The tab opens a socket there and sends "watch " and the
		page's address; when the watcher writes that file it sends
		"update", a return, and the address, and the tab fetches the page
		again. One socket per tab, one watch per socket, as in Drummer.
		Dave, 10/26: the message carries the name, not the file; "if the
		page isn't being displayed you don't need the whole file
		contents." The socket closes when the tab leaves the page or
		closes. If it drops, the tab opens it again after a while, as
		long as it's still showing the page; "we always do that."  */
	
	stopWatching (theTab);
	const theSite = getSiteToc (theTab); //11/4/26 by CC -- the socket of the folder the page is in
	if ((theSite === undefined) || (theSite.urlUpdateSocket === undefined)) {
		return;
		}
	if (theTab.url.indexOf (prefixViewSource) === 0) {
		return;
		}
	const urlSocket = theSite.urlUpdateSocket, urlWatched = urlWithoutHash (theTab.url);
	var theSocket;
	try {
		theSocket = new WebSocket (urlSocket);
		}
	catch (err) {
		console.log ("Can't watch " + urlWatched + " for updates because the socket at " + urlSocket + " couldn't be opened: " + err.message);
		return;
		}
	theTab.updateSocket = theSocket;
	theSocket.onopen = function () {
		theSocket.send ("watch " + urlWatched);
		};
	theSocket.onmessage = function (event) {
		const updatekey = "update\r";
		if ((typeof event.data === "string") && (event.data.indexOf (updatekey) === 0)) {
			const urlUpdated = event.data.substr (updatekey.length);
			if ((theTab.updateSocket === theSocket) && (urlUpdated === urlWithoutHash (theTab.url))) {
				console.log ("The page at " + urlUpdated + " changed; reloading it.");
				if (theTab === currentTab ()) {
					theTab.scrollY = window.scrollY; //where the reader is now; a tab in the background already has its place saved
					}
				loadUrl (theTab, theTab.url, true, true);
				}
			}
		};
	theSocket.onclose = function () {
		if (theTab.updateSocket === theSocket) { //it dropped; we didn't close it
			theTab.updateSocket = undefined;
			setTimeout (function () {
				if ((tabs.indexOf (theTab) !== -1) && (theTab.updateSocket === undefined) && (urlWithoutHash (theTab.url) === urlWatched)) {
					watchForUpdates (theTab);
					}
				}, secsUpdateSocketRetry * 1000);
			}
		};
	theSocket.onerror = function () {
		};
	}
function getToc (theUrl) { //10/17/26 by CC -- a promise for the site's table of contents, parsed, or undefined; the app fetches once per site, the shell parses once per site

	/*  The outline is at /.well-known/toc.opml, Dave's choice: years,
		months, days, no titles, each day linking to the top post of that
		day. The app does the request, the shell parses, the way the
		bookmarks outline is handled. A site without one answers
		undefined and gets no sidebar.  */
	
	var theOrigin;
	try {
		theOrigin = new URL (theUrl).origin;
		}
	catch (err) {
		return (Promise.resolve (undefined));
		}
	if (theOrigin in tocOutlines) {
		return (Promise.resolve (tocOutlines [theOrigin]));
		}
	return (window.mdBrowser.getToc (theUrl).then (function (opmltext) {
		var theOutline;
		if (opmltext !== undefined) {
			try {
				theOutline = opml.parse (opmltext);
				}
			catch (err) {
				console.log ("Can't use the table of contents at " + theOrigin + "/.well-known/toc.opml because it didn't parse: " + err.message);
				}
			}
		tocOutlines [theOrigin] = theOutline;
		return (theOutline);
		}));
	}

function getTocNeighbors (theTab) { //11/10/26 by CC -- a promise for {urlPrev, urlNext}, the pages before and after this one in the site's table of contents; undefined when the page isn't in it

	/*  ARROWS FROM THE TABLE OF CONTENTS. Dave, 11/10, with the first
		GitHub repo served as a site (repo1.bonbonweb.org, the cnames
		app): the toc is the tour of the site, the way a support team
		would be walked through a product, and the arrows on each page
		step through it. A page that names its own neighbors in its
		front matter, urlPrev and urlNext, keeps those, so the blogs'
		pages step by day and month as before; only a page that names
		none is looked up here.
		
		The outline is walked top to bottom, every line that has an
		address, a line's children after it, the way an outliner
		flattens. Next from the last line is the first, prev from the
		first is the last, so the tour is a loop. A line with nothing
		at its address, a folder with no readme, is skipped: the app is
		asked about a neighbor before it becomes an arrow, one request,
		remembered. Every other line is a stop, whatever is there, a
		page, a picture, a listing, a download ("we should try to make
		it work for any content type").
		
		A folder's address and its readme are one page. The server says
		so with the standard Content-Location header when it answers a
		folder's address with a file (cnames does; nothing here knows
		the word readme), and the page is found in the outline under
		either address. The same answer comes back about a neighbor, so
		a folder's line followed by its readme's line doesn't show the
		page twice.  */
	
	const theSite = getSiteToc (theTab);
	if ((theSite === undefined) || (theTab.url === undefined)) {
		return (Promise.resolve (undefined));
		}
	const theStops = []; //the addresses of the lines, in the outline's order
	function addStops (theSubs) {
		theSubs.forEach (function (theNode) {
			if ((theNode.url !== undefined) && (theNode.type !== "include")) {
				try {
					theStops.push (urlWithoutHash (new URL (theNode.url, theTab.url).href));
					}
				catch (err) {
					}
				}
			if (theNode.subs !== undefined) {
				addStops (theNode.subs);
				}
			});
		}
	addStops (theSite.subs);
	
	const urlPage = urlWithoutHash (theTab.url);
	const urlPageFile = (theTab.urlContentLocation === undefined) ? urlPage : urlWithoutHash (theTab.urlContentLocation); //the file the page is, when the server said
	var ixFirst, ixLast; //the first and last lines that are this page
	theStops.forEach (function (urlStop, ix) {
		if ((urlStop === urlPage) || (urlStop === urlPageFile)) {
			if (ixFirst === undefined) {
				ixFirst = ix;
				}
			ixLast = ix;
			}
		});
	if (ixFirst === undefined) {
		return (Promise.resolve (undefined));
		}
	
	function findNeighbor (ixStart, direction) { //the first line in that direction with something at its address that isn't this page; a promise for its address, undefined when there's none
		return (new Promise (function (resolve) {
			function tryStop (ctSteps) {
				if (ctSteps >= theStops.length) { //all the way around
					resolve (undefined);
					return;
					}
				const urlStop = theStops [(((ixStart + (direction * ctSteps)) % theStops.length) + theStops.length) % theStops.length];
				if ((urlStop === urlPage) || (urlStop === urlPageFile)) {
					tryStop (ctSteps + 1);
					return;
					}
				window.mdBrowser.getUrlStatus (urlStop).then (function (theStatus) {
					const urlStopFile = ((theStatus === undefined) || (theStatus.urlContentLocation === undefined)) ? urlStop : urlWithoutHash (theStatus.urlContentLocation);
					if ((theStatus !== undefined) && theStatus.flAvailable && (urlStopFile !== urlPageFile)) {
						resolve (urlStop);
						}
					else {
						tryStop (ctSteps + 1);
						}
					});
				}
			tryStop (1);
			}));
		}
	return (Promise.all ([findNeighbor (ixFirst, -1), findNeighbor (ixLast, 1)]).then (function (theUrls) {
		return ({urlPrev: theUrls [0], urlNext: theUrls [1]});
		}));
	}

/*  11/21/26 by CC -- A PDF IN THE TAB. The PDF's bytes come from the app
	as a data URL, the way a picture's do. They go in a blob, and the tab
	shows the blob in a frame, where Chromium's own PDF viewer draws it,
	the one Chrome uses. The frame fills the window below the chrome.
	The blob is let go when the tab moves on to another page or closes.  */

function getPdfBlobUrl (pdfData) { //the data URL's bytes as a blob; answers the blob's address
	const theChars = atob (pdfData.substr (pdfData.indexOf (",") + 1));
	const theBytes = new Uint8Array (theChars.length);
	for (var i = 0; i < theChars.length; i++) {
		theBytes [i] = theChars.charCodeAt (i);
		}
	return (URL.createObjectURL (new Blob ([theBytes], {type: "application/pdf"})));
	}
function getPdfHtml (urlPdfBlob) {
	const divPdfView = document.createElement ("div");
	divPdfView.className = "divPdfView";
	const iframePdf = document.createElement ("iframe");
	iframePdf.className = "iframePdf";
	iframePdf.src = urlPdfBlob;
	divPdfView.appendChild (iframePdf);
	return (divPdfView.outerHTML);
	}
function releasePdf (theTab) { //the tab is done with the PDF it was showing, if it was showing one
	if (theTab.urlPdfBlob !== undefined) {
		URL.revokeObjectURL (theTab.urlPdfBlob);
		theTab.urlPdfBlob = undefined;
		}
	}

function getDownloadHtml (theResult) { //11/10/26 by CC -- the page for a file that isn't a page, a picture or text, an archive say: its name, its size when the server said, and a link that downloads it (Dave, 11/10: every content type is something the reader can land on)
	var theName = theResult.url;
	try {
		const thePath = decodeURIComponent (new URL (theResult.url).pathname);
		if (thePath.lastIndexOf ("/") < (thePath.length - 1)) {
			theName = thePath.substr (thePath.lastIndexOf ("/") + 1);
			}
		}
	catch (err) {
		}
	function getSizeString (ctBytes) {
		if (ctBytes >= (1024 * 1024)) {
			return ((ctBytes / (1024 * 1024)).toFixed (1) + " MB");
			}
		if (ctBytes >= 1024) {
			return (Math.round (ctBytes / 1024) + " KB");
			}
		return (ctBytes + " bytes");
		}
	const divPageDownload = document.createElement ("div");
	divPageDownload.className = "divPageDownload";
	const iPageDownload = document.createElement ("i");
	iPageDownload.className = "fas fa-file-download";
	divPageDownload.appendChild (iPageDownload);
	const pName = document.createElement ("p");
	pName.textContent = theName;
	divPageDownload.appendChild (pName);
	const pLink = document.createElement ("p");
	const aPageDownload = document.createElement ("a");
	aPageDownload.className = "aPageDownload";
	aPageDownload.href = theResult.url;
	aPageDownload.setAttribute ("download", theName);
	aPageDownload.textContent = "Download";
	pLink.appendChild (aPageDownload);
	if ((theResult.size !== undefined) && !isNaN (theResult.size)) {
		pLink.appendChild (document.createTextNode (", " + getSizeString (theResult.size)));
		}
	divPageDownload.appendChild (pLink);
	return (divPageDownload.outerHTML);
	}

function showSidebar (theTab) { //10/17/26 by CC -- the site's table of contents as a calendar: one month, days with posts marked faintly, the day you're on highlighted, arrows to the months before and after

	/*  Dave's second thought on the sidebar, 10/17: the outline used too
		much space for too little; what it is is a calendar, there to give
		context and accelerate navigation. The data is still toc.opml:
		years, months, days, each day with the address of its top post.
		Days are looked up by year/month/day from the outline, so a month
		with no posts still draws, empty, and the arrows stop at the
		outline's edges.  */
	
	const flOff = config.flCalendar !== true; //10/18/26: off unless config.json says flCalendar true; the menu command is gone (Dave), the code stays
	if ((theTab.toc === undefined) || (!flSidebar) || flOff) {
		document.body.classList.remove ("sidebarShowing");
		divSidebar.innerHTML = "";
		return;
		}
	
	var theDays = {}, theMonths = []; //"2024/03/05" -> the day's url; the months in the outline, as "2024/03", sorted
	const theYears = getSiteToc (theTab).subs; //11/4/26 by CC -- the calendar of the folder the page is in
	theYears.forEach (function (yearNode) {
		const yearName = (yearNode.name === undefined) ? yearNode.text : yearNode.name;
		(yearNode.subs || []).forEach (function (monthNode) {
			const monthKey = yearName + "/" + monthNode.name;
			theMonths.push (monthKey);
			(monthNode.subs || []).forEach (function (dayNode) {
				if (dayNode.url !== undefined) {
					theDays [monthKey + "/" + dayNode.name] = dayNode.url;
					}
				});
			});
		});
	theMonths.sort ();
	
	function pathOf (theUrl) {
		try {
			return (new URL (theUrl).pathname);
			}
		catch (err) {
			return ("");
			}
		}
	function folderOf (theUrl) { //the day folder a post's address is in: the path minus the file name; the path only, so a local copy of the site matches too
		const thePath = pathOf (theUrl);
		return (thePath.substr (0, thePath.lastIndexOf ("/") + 1));
		}
	
	var currentDayKey; //the day the page is on, "2024/03/05", if it's in the outline
	const currentFolder = (theTab.url === undefined) ? "" : folderOf (theTab.url);
	if (currentFolder.length > 0) {
		for (var dayKey in theDays) {
			if (folderOf (theDays [dayKey]) === currentFolder) {
				currentDayKey = dayKey;
				break;
				}
			}
		}
	var monthKey = (currentDayKey !== undefined) ? currentDayKey.substr (0, 7) : theMonths [theMonths.length - 1]; //the page's month, or the newest
	if (monthKey === undefined) {
		return; //an empty outline
		}
	
	function drawMonth () {
		divSidebar.innerHTML = "";
		const theYear = Number (monthKey.substr (0, 4)), theMonth = Number (monthKey.substr (5, 2)) - 1; //JavaScript's months start at 0
		const ixMonth = theMonths.indexOf (monthKey);
		
		const divCalendar = document.createElement ("div");
		divCalendar.className = "divCalendar";
		
		const divCalendarHeader = document.createElement ("div");
		divCalendarHeader.className = "divCalendarHeader";
		const spanCalendarMonth = document.createElement ("span");
		spanCalendarMonth.className = "spanCalendarMonth";
		spanCalendarMonth.textContent = new Date (theYear, theMonth, 1).toLocaleDateString ("en-US", {month: "long", year: "numeric"});
		divCalendarHeader.appendChild (spanCalendarMonth);
		const spanCalendarArrows = document.createElement ("span");
		spanCalendarArrows.className = "spanCalendarArrows";
		function addArrow (className, iconName, ixNext) {
			const iArrow = document.createElement ("i");
			iArrow.className = "fas " + iconName + " " + className;
			if ((ixNext < 0) || (ixNext >= theMonths.length)) {
				iArrow.classList.add ("disabled");
				}
			else {
				iArrow.addEventListener ("click", function () {
					monthKey = theMonths [ixNext];
					drawMonth ();
					});
				}
			spanCalendarArrows.appendChild (iArrow);
			}
		addArrow ("iCalendarPrev", "fa-chevron-left", ixMonth - 1);
		addArrow ("iCalendarNext", "fa-chevron-right", ixMonth + 1);
		divCalendarHeader.appendChild (spanCalendarArrows);
		divCalendar.appendChild (divCalendarHeader);
		
		const divCalendarGrid = document.createElement ("div");
		divCalendarGrid.className = "divCalendarGrid";
		["M", "T", "W", "T", "F", "S", "S"].forEach (function (theLetter) { //the week starts on Monday, as in the calendar Dave showed
			const divCalendarWeekday = document.createElement ("div");
			divCalendarWeekday.className = "divCalendarWeekday";
			divCalendarWeekday.textContent = theLetter;
			divCalendarGrid.appendChild (divCalendarWeekday);
			});
		const firstWeekday = (new Date (theYear, theMonth, 1).getDay () + 6) % 7; //0 = Monday
		const ctDays = new Date (theYear, theMonth + 1, 0).getDate ();
		for (var i = 0; i < firstWeekday; i++) {
			const divCalendarBlank = document.createElement ("div");
			divCalendarBlank.className = "divCalendarDay blank";
			divCalendarGrid.appendChild (divCalendarBlank);
			}
		for (var theDay = 1; theDay <= ctDays; theDay++) {
			const dayKey = monthKey + "/" + ((theDay < 10) ? "0" : "") + theDay;
			const divCalendarDay = document.createElement ("div");
			divCalendarDay.className = "divCalendarDay";
			if (theDays [dayKey] !== undefined) { //a day with posts: a faint mark, and a link to its top post
				const aCalendarDay = document.createElement ("a");
				aCalendarDay.className = "aCalendarDay";
				aCalendarDay.href = theDays [dayKey];
				aCalendarDay.textContent = theDay;
				if (dayKey === currentDayKey) {
					aCalendarDay.classList.add ("current");
					}
				divCalendarDay.appendChild (aCalendarDay);
				}
			else {
				divCalendarDay.textContent = theDay;
				divCalendarDay.classList.add ("empty");
				}
			divCalendarGrid.appendChild (divCalendarDay);
			}
		divCalendar.appendChild (divCalendarGrid);
		divSidebar.appendChild (divCalendar);
		wireLinks (divSidebar); //a day loads in this tab, cmd-click in a new one
		}
	drawMonth ();
	document.body.classList.add ("sidebarShowing");
	}

function showLinkStatus (theLink) { //10/29/26 by CC -- the address of the link the mouse is over, in the lower left corner, every browser since MSIE (Dave); the box goes when the mouse leaves the link
	if ((theLink === null) || (theLink.getAttribute ("href") === null) || theLink.classList.contains ("disabled")) {
		divLinkStatus.classList.remove ("showing");
		}
	else {
		divLinkStatus.textContent = theLink.href;
		divLinkStatus.classList.add ("showing");
		}
	}

function balancePageArrows () { //11/12/26 by CC -- a centered first line, the page's title, centers on the column, not on what the arrows leave of it
	
	/*  Dave, 11/12, on a month page of the bloatware site in Book: "notice
		that the title is not centered. probably because the arrows are
		taking up space on its line." They do: they float at the right, so
		the title centered in what was left, half their width to the left
		of the date line under it. When the stylesheet centers the page's
		first line, an empty box as wide as the arrows floats at the left,
		and the line is centered between the two. A stylesheet that starts
		the page at the left margin gets no box. Run when the page is drawn
		and when the stylesheet changes, since that's who decides.  */
	
	const spanBefore = divPageHeader.querySelector (".spanPageArrowsBalance");
	if (spanBefore !== null) {
		spanBefore.remove ();
		}
	const divPageArrows = divPageHeader.querySelector (":scope > .divPageArrows");
	var theFirst = divPage.firstElementChild;
	if ((theFirst !== null) && theFirst.classList.contains ("imgRightMargin")) {
		theFirst = theFirst.nextElementSibling;
		}
	const flListingOrPicture = document.body.classList.contains ("sourceShowing") || document.body.classList.contains ("imageShowing") || document.body.classList.contains ("pdfShowing");
	if ((divPageArrows !== null) && (theFirst !== null) && !flListingOrPicture) {
		if (window.getComputedStyle (theFirst).textAlign.indexOf ("center") !== -1) {
			const theStyle = window.getComputedStyle (divPageArrows);
			const spanPageArrowsBalance = document.createElement ("span");
			spanPageArrowsBalance.className = "spanPageArrowsBalance";
			spanPageArrowsBalance.style.width = (divPageArrows.offsetWidth + parseFloat (theStyle.marginLeft)) + "px";
			spanPageArrowsBalance.style.height = (divPageArrows.offsetHeight + parseFloat (theStyle.marginTop) + parseFloat (theStyle.marginBottom)) + "px";
			divPageHeader.insertBefore (spanPageArrowsBalance, divPageArrows);
			}
		}
	}

function showCurrentTab () { //put the current tab's page in the window
	const theTab = currentTab ();
	const flShowSource = theTab.flShowSource && (theTab.source !== undefined); //11/3/26 by CC -- the Markdown button
	document.body.classList.toggle ("sourceShowing", flShowSource || (theTab.kind === "html") || (theTab.kind === "xml") || (theTab.kind === "text") || (theTab.flListing === true)); //10/27/26 by CC -- the source view runs the width of the window, from the upper left (Dave); the image view centers the picture
	document.body.classList.toggle ("imageShowing", theTab.kind === "image");
	document.body.classList.toggle ("pdfShowing", theTab.kind === "pdf"); //11/21/26 by CC
	if (flShowSource) {
		const preSource = document.createElement ("pre");
		preSource.className = "preSource";
		preSource.textContent = theTab.source;
		divPage.innerHTML = preSource.outerHTML;
		}
	else {
		divPage.innerHTML = theTab.html;
		}
	fillPageHeader (theTab); //10/16/26 by CC
	showSidebar (theTab); //10/17/26 by CC
	addHeadingLinks (); //10/19/26 by CC
	resolvePageUrls (theTab);
	captionImages (); //10/16/26 by CC. 10/30/26: before floatLeadImages, so a picture with a # link after it isn't taken for a margin image
	floatLeadImages ();
	balancePageArrows (); //11/12/26 by CC
	wireLinks (divPage);
	inputAddress.value = (theTab.url === undefined) ? "" : theTab.url;
	showAddressFavicon ();
	document.title = theTab.title;
	window.scrollTo (0, theTab.scrollY);
	scrollToAnchor (theTab.url); //10/19/26 by CC -- an address with #name lands on that heading
	updateNavButtons ();
	buildTabBar ();
	if (theTab.url === undefined) {
		inputAddress.focus ();
		}
	if (divFindBar.classList.contains ("showing")) { //10/12/26 by CC -- a new page under an open find bar: search it
		findMatches = []; //the marks went with the old page
		ixFindMatch = -1;
		findInPage (false, true);
		}
	}

function switchToTab (ix) {
	if (ixCurrentTab >= 0) {
		currentTab ().scrollY = window.scrollY;
		}
	ixCurrentTab = ix;
	showCurrentTab ();
	saveTabs ();
	}

function insertTab (theTab, flBackground) { //right after the current one
	const ix = ixCurrentTab + 1;
	tabs.splice (ix, 0, theTab);
	if (flBackground) {
		buildTabBar ();
		saveTabs ();
		}
	else {
		switchToTab (ix);
		}
	return (theTab);
	}

function openNewTab () {
	insertTab (newTab (), false);
	}

function openUrlInNewTab (theUrl, flBackground, flFromLink) {
	const theTab = insertTab (newTab (), flBackground);
	loadUrl (theTab, theUrl, false, false, flFromLink);
	}

function closeTab (ix) {
	if ((tabs.length === 1) && !navigator.platform.startsWith ("Mac") && (window.mdBrowser.flDemo !== true)) { //11/21/26 by CC -- THE LAST TAB OFF THE MAC (issue 4, John Evdemon's suggestion and his code, tested by him on Windows 11): on Windows and Linux closing the last tab closes the app, as Chrome, Edge and Firefox do there (Dave: "make it close the app"). tabs.json isn't touched, so the page comes back on the next launch. On the Mac a new empty tab takes its place, as before. Not in the demo, which is a page in someone's browser
		window.close ();
		return;
		}
	stopWatching (tabs [ix]); //10/26/26 by CC
	releasePdf (tabs [ix]); //11/21/26 by CC
	tabs.splice (ix, 1);
	if (tabs.length === 0) {
		tabs.push (newTab ());
		}
	if (ix < ixCurrentTab) {
		ixCurrentTab--;
		}
	else {
		if (ix === ixCurrentTab) {
			ixCurrentTab = Math.min (ix, tabs.length - 1);
			}
		}
	showCurrentTab ();
	saveTabs ();
	}

function addToUrlHistory (theTab) { //10/18/26 by CC -- the page goes to the top of the typeahead's list; one entry per address, the newest title wins
	var theList = [];
	urlHistory.forEach (function (item) {
		if (item.url !== theTab.url) {
			theList.push (item);
			}
		});
	theList.unshift ({url: theTab.url, title: theTab.title, when: new Date ().toISOString ()});
	urlHistory = theList;
	window.mdBrowser.saveUrlHistory (urlHistory);
	}
function hideTypeahead () {
	divTypeahead.classList.remove ("showing");
	divTypeahead.innerHTML = "";
	ixTypeahead = -1;
	}
function showTypeahead () { //10/18/26 by CC -- TYPEAHEAD, Chrome's way: as you type in the address bar, the pages you've visited whose address or title contains what you typed, newest first; arrows move, Return loads, Escape dismisses, a click loads

	/*  The list is urlHistory, the last 10,000 pages visited, kept in
		urlHistory.json in the data folder. Dave's choice, 10/18: a big
		local JSON file, not a database; match titles as well as
		addresses, so "hairball" finds "The web of hairballs".  */
	
	const theText = inputAddress.value.trim ().toLowerCase ();
	hideTypeahead ();
	if (theText.length === 0) {
		return;
		}
	var theMatches = [];
	urlHistory.forEach (function (item) {
		if (theMatches.length < maxTypeaheadRows) {
			const flMatch = (item.url.toLowerCase ().indexOf (theText) !== -1) || ((item.title !== undefined) && (item.title.toLowerCase ().indexOf (theText) !== -1));
			if (flMatch) {
				theMatches.push (item);
				}
			}
		});
	if (theMatches.length === 0) {
		return;
		}
	theMatches.forEach (function (item, ix) {
		const divTypeaheadRow = document.createElement ("div");
		divTypeaheadRow.className = "divTypeaheadRow";
		divTypeaheadRow.dataset.url = item.url;
		const spanTypeaheadTitle = document.createElement ("span");
		spanTypeaheadTitle.className = "spanTypeaheadTitle";
		spanTypeaheadTitle.textContent = ((item.title === undefined) || (item.title === item.url)) ? "" : item.title;
		const spanTypeaheadUrl = document.createElement ("span");
		spanTypeaheadUrl.className = "spanTypeaheadUrl";
		spanTypeaheadUrl.textContent = item.url;
		if (spanTypeaheadTitle.textContent.length > 0) {
			divTypeaheadRow.appendChild (spanTypeaheadTitle);
			}
		divTypeaheadRow.appendChild (spanTypeaheadUrl);
		divTypeaheadRow.addEventListener ("mousedown", function (event) { //mousedown, not click: the field would lose focus on click and the list would be gone
			event.preventDefault ();
			hideTypeahead ();
			loadUrl (currentTab (), item.url);
			});
		divTypeahead.appendChild (divTypeaheadRow);
		});
	divTypeahead.classList.add ("showing");
	}
function selectTypeaheadRow (ix) { //-1 is the field itself, with what you typed
	const theRows = divTypeahead.querySelectorAll (".divTypeaheadRow");
	if (theRows.length === 0) {
		return;
		}
	if (ix < -1) {
		ix = theRows.length - 1;
		}
	if (ix >= theRows.length) {
		ix = -1;
		}
	theRows.forEach (function (theRow, i) {
		theRow.classList.toggle ("selected", i === ix);
		});
	ixTypeahead = ix;
	}
function getTypeaheadSelection () { //the selected row's address, or undefined when none is selected
	const theRow = divTypeahead.querySelector (".divTypeaheadRow.selected");
	return ((theRow === null) ? undefined : theRow.dataset.url);
	}

function addToHistory (theTab) { //10/12/26 by CC -- a page just loaded in the tab; it goes to the top of the History menu

	/*  One entry per page: a page visited again moves to the top. The list
		is kept as long as the menu is, maxHistoryMenuItems in config.json.  */
	
	const theList = [];
	recentPages.forEach (function (thePage) {
		if (thePage.url !== theTab.url) {
			theList.push (thePage);
			}
		});
	theList.unshift ({url: theTab.url, title: theTab.title, when: new Date ().toISOString ()});
	if (config.maxHistoryMenuItems !== undefined) {
		theList.length = Math.min (theList.length, config.maxHistoryMenuItems);
		}
	recentPages = theList;
	window.mdBrowser.saveHistory (recentPages);
	}

function getRightMarginImageHtml (theUrl) { //10/12/26 by CC
	const img = document.createElement ("img");
	img.className = "imgRightMargin";
	img.src = theUrl;
	return (img.outerHTML);
	}

function urlAsksForMarkdown (theUrl) { //11/7/26 by CC -- ?format=markdown on a link: the writer wants the reader to see the page's Markdown text, not the page, the Markdown button on from the start (Dave: "some syntax where i can say i want you to view-source this"). PagePark's ?format=opml is the prior art; a file server ignores the query on a .md file, and PagePark's Markdown branch never looks at it (checked, 0.8.31)
	try {
		const theFormat = new URL (theUrl).searchParams.get ("format");
		return ((theFormat !== null) && (theFormat.toLowerCase () === "markdown"));
		}
	catch (err) {
		return (false);
		}
	}

function loadUrl (theTab, theUrl, flFromHistory, flKeepPlace, flFromLink) { //11/12/26: flFromLink, the reader clicked a link to get here, see below; flFromHistory: back, forward and reload don't add to the list; flKeepPlace: a reload from the update socket comes back at the same scroll position (Dave, 10/26)

	/*  The result lands in the tab it was asked for, which may not be the
		current one by the time it arrives. Only the current tab's page goes
		in the window.  */
	
	theUrl = fixUrl (theUrl);
	const urlBefore = theTab.url, htmlBefore = theTab.html, flShowSourceBefore = theTab.flShowSource; //11/12/26 by CC -- what the tab goes back to when the page doesn't come
	stopWatching (theTab); //10/26/26 by CC -- the new page gets its own socket when it has loaded
	theTab.url = theUrl;
	if (urlAsksForMarkdown (theUrl)) { //11/7/26 by CC -- the link says ?format=markdown: it opens as text, however it was reached, a restored tab at startup included; the button still switches to the page
		theTab.flShowSource = true;
		}
	else if (!flFromHistory) { //11/3/26 by CC -- a new page shows as a page; reload and back stay in the view you were in
		theTab.flShowSource = false;
		}
	theTab.html = ""; //10/16/26 by CC -- a tab switched to while it loads is blank. 10/30/26: the page in the window stays until the new one is ready; the clear comes right before it (Dave: "the shortest possible clear followed by an immediate refresh")
	if (theTab === currentTab ()) {
		inputAddress.value = theUrl;
		}
	const flViewSource = theUrl.indexOf (prefixViewSource) === 0; //10/16/26 by CC -- fetch the page behind the prefix, show its text
	const urlToGet = (flViewSource) ? theUrl.substr (prefixViewSource.length) : theUrl;
	window.mdBrowser.getPage (urlToGet, flViewSource).then (function (theResult) { //11/21/26: flViewSource, so View Source of an HTML page shows the HTML, not its Markdown copy
		
		/*  11/12/26 by CC -- two ways the tab stays on the page it had.
			
			The page didn't come. Every failure had been one broken-link
			icon with one tool-tip, whatever went wrong, and the reason
			went to the console. Dave: "what we are doing now is
			inexcusable." Now it's what his apps do everywhere,
			alertDialog (err.message), FeedLand's way: the dialog comes
			up over what you were looking at, and after OK you're still
			looking at it. The address you asked for stays in the address
			bar. The dialog is for the tab in front, what the reader is
			looking at and just asked for; a tab in the background, or a
			reload asked for by the site's update socket, fails quietly,
			the reason in the console. And one dialog at a time: several
			up at once fight over the keyboard and the app stops
			answering (found at startup, with eight tabs whose server was
			gone). A tab that had no page, a new one or one from the last
			run, keeps the address, so Reload tries it again. The message
			goes through encodeXml, since alertDialog takes HTML and some
			of these words are the server's.
			
			The page is HTML and the reader clicked a link to get to it.
			Dave: "it should open it in the user's chosen default
			browser." An HTML address typed into the address bar still
			shows the page's source ("let it stay, i actually LIKE
			looking at the html text in bonbon").
			
			11/21/26 by CC -- a third: the app opened it somewhere else. A
			PDF, when the reader's config.json says PDFs go to the
			system's viewer. Handled like the link that opened in the
			historic browser, except that the app has already opened it,
			and it doesn't matter whether the address was clicked or
			typed.  */
		
		const flOpenedOutside = theResult.flOk && (theResult.kind === "openedOutside");
		const flToBrowser = flOpenedOutside || (theResult.flOk && flFromLink && !flViewSource && (theResult.kind === "html"));
		if (flToBrowser || !theResult.flOk) {
			if ((urlBefore === undefined) && !flToBrowser) {
				theTab.title = theTab.url;
				}
			else {
				theTab.url = urlBefore;
				theTab.html = htmlBefore;
				theTab.flShowSource = flShowSourceBefore;
				}
			if ((urlBefore !== undefined) && (theTab.source !== undefined) && (theTab.kind === undefined)) {
				watchForUpdates (theTab);
				}
			if (flToBrowser) {
				if (!flOpenedOutside) {
					window.mdBrowser.openInBrowser (theResult.url);
					}
				if (urlBefore === undefined) { //a tab opened for this link, a cmd-click: nothing is going in it
					closeTab (tabs.indexOf (theTab));
					}
				else if (theTab === currentTab ()) {
					inputAddress.value = urlBefore;
					}
				}
			else {
				console.log ("%c" + theResult.status + ": " + theResult.message, "color: red");
				if ((theTab === currentTab ()) && !flKeepPlace && ($(".divAlertDialog:visible").length === 0)) {
					alertDialog (encodeXml (theResult.message));
					}
				buildTabBar ();
				}
			saveTabs ();
			return;
			}
		
		releasePdf (theTab); //11/21/26 by CC -- the tab is moving on
		theTab.url = (flViewSource) ? prefixViewSource + theResult.url : theResult.url;
		if (!flFromHistory) {
			theTab.pageHistory.length = theTab.ixHistory + 1; //drop anything ahead of where we are
			theTab.pageHistory.push (theTab.url);
			theTab.ixHistory = theTab.pageHistory.length - 1;
			}
		theTab.urlContentLocation = (theResult.flOk) ? theResult.urlContentLocation : undefined; //11/10/26 by CC
		theTab.tocNeighbors = undefined;
		var theHandlerPage; //11/19/26 by CC -- PAGE HANDLERS: a page its handler drew arrives as kind "handler" with htmltext; see pageHandlers.js and getHandlerHtml
		if (theResult.flOk && (theResult.kind === "handler")) {
			theHandlerPage = getHandlerHtml (theResult.htmltext);
			if (theHandlerPage === undefined) { //the cleaner didn't load, so the handler's HTML can't be trusted: the page as a listing, as before handlers
				theResult.kind = "text";
				theResult.handlerError = "Can't use the " + theResult.extension + " handler because the code that cleans its HTML didn't load.";
				}
			}
		theTab.flListing = (theHandlerPage !== undefined) && theHandlerPage.flListing;
		if (theResult.flOk && (theResult.handlerError !== undefined)) { //a handler tried and failed: the page is shown as it was before handlers, and the reason goes in a dialog, the one an http error gets (Dave)
			console.log ("%c" + theResult.handlerError, "color: red");
			if ((theTab === currentTab ()) && !flKeepPlace && ($(".divAlertDialog:visible").length === 0)) {
				alertDialog (encodeXml (theResult.handlerError));
				}
			}
		const theKind = (theResult.flOk) ? theResult.kind : undefined; //10/27/26 by CC -- "html" or "xml": the source, as text, the mirror of Chrome showing a Markdown file as text (Dave); "image": the picture; the address is the file's own
		theTab.kind = theKind;
		if (theResult.flOk && flViewSource) {
			const preSource = document.createElement ("pre");
			preSource.className = "preSource";
			preSource.textContent = theResult.source;
			theTab.html = preSource.outerHTML;
			theTab.source = undefined;
			theTab.frontMatter = undefined;
			theTab.title = theTab.url;
			theTab.favicon = undefined;
			}
		else if (theKind !== undefined) {
			if (theKind === "image") {
				const divImageView = document.createElement ("div");
				divImageView.className = "divImageView";
				const imgView = document.createElement ("img");
				imgView.className = "imgView";
				imgView.src = theResult.imageData;
				divImageView.appendChild (imgView);
				theTab.html = divImageView.outerHTML;
				theTab.source = undefined;
				}
			else if (theKind === "pdf") { //11/21/26 by CC -- a PDF, in the tab
				theTab.urlPdfBlob = getPdfBlobUrl (theResult.pdfData);
				theTab.html = getPdfHtml (theTab.urlPdfBlob);
				theTab.source = undefined;
				}
			else if (theKind === "file") { //11/10/26 by CC -- not a page, a picture or text: the page that offers the download
				theTab.html = getDownloadHtml (theResult);
				theTab.source = undefined;
				}
			else if (theKind === "handler") { //11/19/26 by CC -- what the page's handler made of it, cleaned
				theTab.html = theHandlerPage.html;
				theTab.source = theResult.source;
				}
			else if (theKind === "text") { //11/10/26 by CC -- code or plain text, a listing; colored when highlight.js knows the language
				theTab.html = getSourceHtml (theResult.source, getSourceLanguage (theResult.url));
				theTab.source = theResult.source;
				}
			else {
				theTab.html = getSourceHtml (theResult.source); //10/30/26 by CC -- colored
				theTab.source = theResult.source;
				}
			theTab.frontMatter = undefined;
			theTab.title = (theResult.title === undefined) ? theResult.url : theResult.title;
			if (!flFromHistory) {
				addToHistory (theTab);
				}
			addToUrlHistory (theTab);
			getTabFavicon (theTab);
			}
		else if (theResult.flOk) {
			theTab.html = expandMacros (theResult.html, theResult.frontMatter, theResult.url); //11/11/26 by CC
			theTab.source = theResult.source;
			theTab.frontMatter = theResult.frontMatter;
			if (theResult.frontMatter.rightMarginImage !== undefined) { //10/12/26 by CC -- the image goes at the top right with the text wrapping around it, the way scripting.com does it; it's in the front matter so other Markdown processors render clean text
				theTab.html = getRightMarginImageHtml (theResult.frontMatter.rightMarginImage) + theTab.html;
				}
			if (theResult.frontMatter.title !== undefined) { //10/12/26 by CC -- the YAML front matter's title names the tab; without one, the address does
				theTab.title = theResult.frontMatter.title;
				}
			else {
				theTab.title = theResult.url;
				}
			if (!flFromHistory) { //10/12/26 by CC -- back, forward and reload revisit; only a new load goes in the History menu
				addToHistory (theTab);
				}
			addToUrlHistory (theTab); //10/18/26 by CC -- every visit, for the typeahead
			getTabFavicon (theTab); //10/12/26 by CC
			}
		
		/*  10/16/26 by CC -- the page goes in the window all at once, when
			everything it needs has arrived: its images, so nothing shifts
			as they load, and the answer about the author's site, so the
			name is drawn right the first time. Dave: "I really want
			everything to look solid."  */
		
		const theWaits = [];
		if (theResult.flOk && !flViewSource && (theKind === undefined)) {
			theWaits.push (preloadImages (theTab.html, theTab.url));
			}
		if (theResult.flOk && !flViewSource) { //11/10/26 by CC -- every kind of page, not only Markdown: a picture or a download can be a line in the table of contents, and gets its arrows from it
			theWaits.push (getToc (theTab.url).then (function (theOutline) { //10/17/26 by CC
				theTab.toc = theOutline;
				const flOwnNeighbors = (theTab.frontMatter !== undefined) && ((theTab.frontMatter.urlPrev !== undefined) || (theTab.frontMatter.urlNext !== undefined));
				if (flOwnNeighbors) {
					return (undefined);
					}
				return (getTocNeighbors (theTab).then (function (theNeighbors) {
					theTab.tocNeighbors = theNeighbors;
					}));
				}));
			}
		Promise.all (theWaits).then (function () {
			if (!flKeepPlace) {
				theTab.scrollY = 0;
				}
			if (theTab === currentTab ()) {
				
				/*  11/18/26 by CC -- NO CLEAR. Since 10/30 the page was
					emptied for one frame before the new one was drawn, "the
					sense of something happening" (Dave, 10/30). Dave, 11/18:
					"the attempt to orchestrate a flash that's satisfying
					didn't work -- take it out." The old page stays until
					the new one replaces it, in one step. The column still
					goes blank when the new page needs a font that isn't in
					yet (11/5, the jerkiness in the demo), and only then:
					the layout below is what starts a font loading, so
					afterward we can tell.  */
				
				showCurrentTab ();
				document.body.offsetHeight; //lays the page out now
				if (document.fonts.status === "loading") {
					showWhenFontsReady (function () {
						});
					}
				}
			else {
				buildTabBar ();
				}
			saveTabs ();
			if (theResult.flOk && !flViewSource && (theKind === undefined)) {
				watchForUpdates (theTab); //10/26/26 by CC
				}
			});
		});
	}

function preloadImages (htmltext, baseUrl) { //10/16/26 by CC -- a promise that settles when every image in the page's HTML has loaded, or failed, or the time is up
	const maxWait = 5000; //a slow image shouldn't hold the page forever
	const template = document.createElement ("template");
	template.innerHTML = htmltext;
	const theLoads = [];
	template.content.querySelectorAll ("img[src]").forEach (function (theImage) {
		var theUrl = theImage.getAttribute ("src");
		try {
			theUrl = new URL (theUrl, baseUrl).href;
			}
		catch (err) {
			}
		theLoads.push (new Promise (function (resolve) {
			const loader = new Image ();
			loader.onload = resolve;
			loader.onerror = resolve;
			loader.src = theUrl;
			}));
		});
	return (Promise.race ([Promise.all (theLoads), new Promise (function (resolve) {setTimeout (resolve, maxWait);})]));
	}

function goBack () {
	const theTab = currentTab ();
	if (theTab.ixHistory > 0) {
		theTab.ixHistory--;
		loadUrl (theTab, theTab.pageHistory [theTab.ixHistory], true);
		}
	}

function goForward () {
	const theTab = currentTab ();
	if (theTab.ixHistory < theTab.pageHistory.length - 1) {
		theTab.ixHistory++;
		loadUrl (theTab, theTab.pageHistory [theTab.ixHistory], true);
		}
	}

/*  10/27/26 by CC -- STYLESHEETS. The reader owns the look of the page
	(Dave: "the writer has no say in colors, or arrangements"). The app ships
	five stylesheets in the data folder's stylesheets folder, Newsprint,
	Reader, Classic, Mono and Book, designed with Claude in the browser on
	10/27, and a skilled user can edit them or add their own. The button in
	the address bar opens a panel with one pill per stylesheet; clicking a
	pill restyles the page right there. The choice is remembered for every
	tab and the next launch, the way the sidebar's state is. The stylesheet
	is a link in the head, after the app's own CSS and before the user's
	(urlUserCss), so it wins over the app and the user's rules win over it.
	The stylesheets expect the page to be a .page column with the title in
	an h1 and the rendered Markdown after it; see the readme in the folder.  */

function getStylesheet (theName) { //the stylesheet with this name, or undefined
	var theStylesheet;
	theStylesheets.forEach (function (item) {
		if ((theStylesheet === undefined) && (item.name === theName)) {
			theStylesheet = item;
			}
		});
	return (theStylesheet);
	}

function applyStylesheet (flFresh) { //link the chosen stylesheet; flFresh: read the file again, so an edit shows on reload
	var theStylesheet = getStylesheet (nameStylesheet);
	if (theStylesheet === undefined) { //the chosen one is gone, or there's no choice yet: the default, or the first. 11/5/26: config.json can name the default (nameDefaultStylesheet; the demo's is Book, Dave's ask)
		theStylesheet = getStylesheet ((config.nameDefaultStylesheet === undefined) ? nameDefaultStylesheet : config.nameDefaultStylesheet);
		if ((theStylesheet === undefined) && (theStylesheets.length > 0)) {
			theStylesheet = theStylesheets [0];
			}
		}
	if (theStylesheet === undefined) {
		linkStylesheet.removeAttribute ("href");
		}
	else {
		nameStylesheet = theStylesheet.name;
		linkStylesheet.href = (flFresh) ? theStylesheet.url + "?" + Date.now () : theStylesheet.url;
		}
	try {
		localStorage.setItem ("nameStylesheet", nameStylesheet);
		}
	catch (err) {
		}
	}

function showWhenFontsReady (drawPage) { //11/5/26 by CC -- the page column blank while drawPage draws the page, back when its fonts are in; the frame after the draw is what starts the fonts loading

	/*  Dave, 11/5, in the demo: "remember the jerkiness to transitions? it
		happens when you click an arrow in one of the scripting posts,
		using the Book styles." In the demo every page is a fresh load,
		so the page was drawn before Book's font had arrived and again
		when it had, the switch's trouble over again. The same wait as the
		switch, at every load. If the fonts never settle, the page shows
		on its own after a while rather than staying blank.  */
	
	var flShown = false;
	function showPage () {
		if (!flShown) {
			flShown = true;
			document.body.classList.remove ("stylesheetSwitching");
			}
		}
	document.body.classList.add ("stylesheetSwitching");
	drawPage ();
	requestAnimationFrame (function () {
		document.fonts.ready.then (showPage);
		});
	setTimeout (showPage, 3000);
	}
function switchStylesheet (theName) { //11/3/26 by CC -- a pill clicked: blank the page, the new stylesheet, the page again, nothing more (Dave's four steps)

	/*  Dave, 11/3, on the demo: "the switches using the styles dialog on
		some of the switches are very noisy... it all flies by so fast i
		can't see what's going on but this has to be crisp." Basic to Book
		was the worst: "it looks like it displays a whole other rendering
		on the way to getting it right." That was the page drawn in the
		new stylesheet with the browser's stand-in font, then drawn again
		when Book's own font (EB Garamond, font-display: swap) arrived. So
		the page column goes blank first, and comes back when the
		stylesheet has loaded, the page has been laid out in it (the
		frame after; that's what starts the fonts loading) and the fonts
		are in. If the stylesheet never answers, the page comes back on
		its own after a while rather than staying blank.  */
	
	if (theName === nameStylesheet) {
		return;
		}
	var flShown = false;
	function showPage () {
		if (!flShown) {
			flShown = true;
			document.body.classList.remove ("stylesheetSwitching");
			$(divPageColumn).stop (true).animate ({opacity: 1}, msStylesheetFade);
			}
		}

	/*  11/12/26 by CC -- Dave, in the app: "why does it take so long to
		switch stylesheets? i would think it would be instantaneous." Every
		switch took three seconds there. The app's stylesheets are files on
		the reader's disk, and for those the link's load event never comes,
		so the page waited for the timer below. Now we also watch for the
		link's stylesheet to change, which is what the event would have
		told us; whichever comes first.
		
		Later the same day, with the wait gone: "the switch betw
		stylesheets is too fast now. maybe use jquery like fade out and in
		to give it a little breath too." So the page fades out, the
		stylesheet changes while it's out, and it fades back in.  */

	const msStylesheetFade = 200;
	var flLoaded = false, theWatcher;
	const theOldSheet = linkStylesheet.sheet;
	function stylesheetLoaded () {
		if (!flLoaded) {
			flLoaded = true;
			clearInterval (theWatcher);
			balancePageArrows (); //11/12/26 by CC -- the new stylesheet may center the title where the old one didn't
			requestAnimationFrame (function () {
				document.fonts.ready.then (showPage);
				});
			}
		}
	nameStylesheet = theName; //now, so the panel shows the choice at once
	$(divPageColumn).stop (true).animate ({opacity: 0}, msStylesheetFade, function () {
		document.body.classList.add ("stylesheetSwitching");
		linkStylesheet.addEventListener ("load", stylesheetLoaded, {once: true});
		linkStylesheet.addEventListener ("error", showPage, {once: true});
		setTimeout (function () {
			clearInterval (theWatcher);
			showPage ();
			}, 3000);
		applyStylesheet (false);
		theWatcher = setInterval (function () {
			const theSheet = linkStylesheet.sheet;
			if ((theSheet !== null) && (theSheet !== theOldSheet)) { //null is the browser's, while the new one loads
				stylesheetLoaded ();
				}
			}, 20);
		});
	}

function loadStylesheets (flFresh) { //ask the app for the list, then apply the choice; a promise
	return (window.mdBrowser.getStylesheets ().then (function (theList) {
		theStylesheets = (Array.isArray (theList)) ? theList : [];
		applyStylesheet (flFresh);
		}));
	}

/*  11/18/26 by CC -- RELOAD WITHOUT THE JUMP. Dave, 11/17: "when i reload
	this page (probably all pages) there's an unsightly flash." And 11/18:
	"i like a brief clear, i don't like the text showing up in a very far
	away place and be redrawn." Reload reads the stylesheet again, so an
	edit to it shows. It did that by pointing the link in the head at the
	file again, and while the file was on its way the page had no
	stylesheet at all: the text went to the left edge of the window, then
	back to its column when the file arrived. Now the fresh copy is read
	in a link of its own, beside the one in use, and takes its place when
	it has loaded. The page is never without a stylesheet. If the fresh
	copy doesn't arrive, the one in use stays.  */

function reloadStylesheet () { //for reload: the chosen stylesheet read again, with nothing changing on the page until it's in; a promise
	return (window.mdBrowser.getStylesheets ().then (function (theList) {
		theStylesheets = (Array.isArray (theList)) ? theList : [];
		const theStylesheet = getStylesheet (nameStylesheet);
		if ((theStylesheet === undefined) || (linkStylesheet.sheet === null)) { //the chosen one is gone, or there's none in use to keep: the plain way
			applyStylesheet (true);
			}
		else {
			const nameAtStart = nameStylesheet, linkInUse = linkStylesheet;
			const linkFresh = document.createElement ("link");
			var flSettled = false, theWatcher, theTimeout;
			function settle (flLoaded) {
				if (!flSettled) {
					flSettled = true;
					clearInterval (theWatcher);
					clearTimeout (theTimeout);
					if (flLoaded && (nameStylesheet === nameAtStart) && (linkStylesheet === linkInUse)) { //the reader didn't choose another one while we waited
						linkFresh.className = linkInUse.className;
						linkInUse.remove ();
						linkStylesheet = linkFresh;
						balancePageArrows ();
						}
					else {
						linkFresh.remove ();
						}
					}
				}
			linkFresh.rel = "stylesheet";
			linkFresh.addEventListener ("load", function () {
				settle (true);
				}, {once: true});
			linkFresh.addEventListener ("error", function () {
				settle (false);
				}, {once: true});
			linkFresh.href = theStylesheet.url + "?" + Date.now ();
			linkInUse.after (linkFresh);
			theWatcher = setInterval (function () { //a file on the reader's disk doesn't send the load event; see switchStylesheet
				if (linkFresh.sheet !== null) {
					settle (true);
					}
				}, 20);
			theTimeout = setTimeout (function () {
				settle (false);
				}, 3000);
			}
		}));
	}

function hideStylesheetsPanel () {
	divStylesheetsPanel.classList.remove ("showing");
	}

function positionStylesheetsPanel () { //11/6/26 by CC -- the panel opens centered under the A (Dave: "the popup menu should align with the A icon, ie be centered under it"); where that would put it past an edge, it moves over just enough to be all in view, no closer to the edge than the stylesheet's right says, so in BonBon, where the A is near the right edge, it's where it always was
	divStylesheetsPanel.style.left = ""; //back to the stylesheet's placement, to measure it
	divStylesheetsPanel.style.right = "";
	
	const rectParent = divStylesheetsPanel.offsetParent.getBoundingClientRect ();
	const rectPanel = divStylesheetsPanel.getBoundingClientRect ();
	const rectButton = buttonStylesheets.getBoundingClientRect ();
	const marginFromEdge = rectParent.right - rectPanel.right; //the stylesheet's right
	const leftMax = rectParent.width - marginFromEdge - rectPanel.width;
	
	var left = (rectButton.left + (rectButton.width / 2)) - rectParent.left - (rectPanel.width / 2);
	if (left > leftMax) {
		left = leftMax;
		}
	if (left < marginFromEdge) {
		left = marginFromEdge;
		}
	divStylesheetsPanel.style.left = Math.round (left) + "px";
	divStylesheetsPanel.style.right = "auto";
	}

function positionMoreMenu () { //11/14/26 by CC -- the three-dots menu opens under the three dots. It was pinned to the right edge of the window, which is where the dots were until the address box was narrowed and the icons moved in beside it; the menu's right edge stays as far past the dots as it was then
	const marginPastButton = 12;
	const rectParent = divMoreMenu.offsetParent.getBoundingClientRect ();
	const rectButton = buttonMore.getBoundingClientRect ();
	var right = rectParent.right - (rectButton.right + marginPastButton);
	if (right < marginPastButton) {
		right = marginPastButton;
		}
	divMoreMenu.style.right = Math.round (right) + "px";
	}

function showStylesheetsPanel () { //the list is read again each time, so a stylesheet added to the folder shows up
	loadStylesheets (false).then (function () {
		divStylesheetsPanel.innerHTML = "";
		theStylesheets.forEach (function (item) {
			const buttonStylesheet = document.createElement ("button");
			buttonStylesheet.className = "buttonStylesheet";
			buttonStylesheet.type = "button";
			buttonStylesheet.textContent = item.title;
			buttonStylesheet.classList.toggle ("current", item.name === nameStylesheet);
			buttonStylesheet.addEventListener ("click", function (event) { //the panel closes: Dave, 10/27, "the next thing i want to do after clicking one is to sit back and look at what it got me," and the A is right under the mouse to open it again
				event.stopPropagation ();
				switchStylesheet (item.name);
				hideStylesheetsPanel ();
				});
			divStylesheetsPanel.appendChild (buttonStylesheet);
			});
		divStylesheetsPanel.classList.add ("showing");
		positionStylesheetsPanel (); //11/6/26 by CC
		});
	}

function applyUserCss () { //10/15/26 by CC -- the reader's stylesheet, urlUserCss in config.json, last in the head so its rules win over everything in the window
	window.mdBrowser.getUserCss ().then (function (csstext) {
		var styleUserCss = document.querySelector (".styleUserCss");
		if (styleUserCss === null) {
			styleUserCss = document.createElement ("style");
			styleUserCss.className = "styleUserCss";
			}
		styleUserCss.textContent = csstext;
		document.head.appendChild (styleUserCss); //appending moves it to the end if it's already there, so it stays last
		});
	}

function reload () {
	const theTab = currentTab ();
	if (theTab.ixHistory >= 0) {
		loadUrl (theTab, theTab.pageHistory [theTab.ixHistory], true);
		}
	reloadStylesheet (); //10/27/26 by CC -- the stylesheet is read again too, so an edit in the data folder shows. 11/18/26: with the page never left without one
	applyUserCss (); //the stylesheet is refetched with the page, so the reader can iterate on it
	}

function goHome () {
	if (config.urlHomePage !== undefined) {
		loadUrl (currentTab (), config.urlHomePage);
		}
	}

/*  10/12/26 by CC -- BOOKMARKS. Dave's bookmarks menu, the one in all his
	apps, from the bookmarksmenu includes. The bookmarks are an outline; Add
	bookmark... and Edit bookmarks... open it in a dialog, in the Concord
	outliner, where you can rearrange them, make folders, and delete. The
	menu you see is the app's, in the menu bar, built from the outline this
	code sends it; the menu the bookmarks code builds for itself goes in a
	list that's never shown.  */

function getStartingBookmarks () { //11/14/26 by CC -- the outline a new reader starts with, as opml text

	/*  Dave, 11/14: a fresh install had no bookmarks at all, "we have to
		fix that." His spec: Docs and Support at the top, outside the bar
		("i want them to have a place to fall back to"), then the headline
		Bookmarks bar with one bookmark under it, Home, which points to
		the same page as the default home page. The headline being there
		also shows a new reader how the bar works.  */

	const nowstring = new Date ().toUTCString ();
	function getBookmark (theText, theUrl) {
		return ({text: theText, url: theUrl, type: "bookmark", icon: "bookmark", created: nowstring});
		}
	const theFolder = {text: nameBookmarksBarFolder, created: nowstring, subs: []};
	if (config.urlHomePage !== undefined) {
		theFolder.subs.push (getBookmark ("Home", config.urlHomePage));
		}
	const theOutline = {
		opml: {
			head: {
				title: "Bookmarks",
				dateCreated: nowstring,
				dateModified: nowstring
				},
			body: {
				subs: [
					getBookmark ("Docs", urlDocs),
					getBookmark ("Support", urlSupport),
					theFolder
					]
				}
			}
		};
	return (opml.stringify (theOutline));
	}

function startBookmarks (opmltext) {
	var flStarting = false;
	if (opmltext === null) {
		opmltext = undefined;
		}
	if (opmltext === undefined) { //11/14/26 by CC -- the first run, there's no bookmarks file yet
		opmltext = getStartingBookmarks ();
		flStarting = true;
		}
	const options = {
		opmltext,
		idList: "idBookmarksList",
		whereToAppend: $("body"),
		getBookmarkTitle: function () {
			return (currentTab ().title);
			},
		getBookmarkAtts: function () {
			return ({url: currentTab ().url});
			},
		handleMenuChoice: function (item) {
			loadUrl (currentTab (), item.url, false, false, true); //11/14/26 by CC -- flFromLink: a bookmark is a link, so one that points to an HTML page opens in the reader's historic browser, like Docs and Support
			},
		saveBookmarks: function (opmltext) { //from the dialog's Save button, and from start () the first time
			bookmarksOpmltext = opmltext;
			const theOutline = opml.parse (opmltext);
			window.mdBrowser.saveBookmarks (opmltext, theOutline);
			buildBookmarksBar (theOutline);
			}
		};
	myBookmarksMenu = new bookMarksMenu (options);
	myBookmarksMenu.start ();
	bookmarksOpmltext = opmltext;
	const theOutline = opml.parse (opmltext);
	if (flStarting) { //11/14/26 by CC -- the starting outline goes into the reader's file, which also builds the app's menu
		window.mdBrowser.saveBookmarks (opmltext, theOutline);
		}
	else {
		window.mdBrowser.setBookmarksMenu (theOutline);
		}
	buildBookmarksBar (theOutline);
	}

/*  10/13/26 by CC -- THE BOOKMARKS BAR, Chrome's, under the address bar.
	Its items are the sub-heads of a headline called "Bookmarks bar" in the
	bookmarks outline, so they show in the Bookmarks menu as a submenu too
	and are edited with Edit Bookmarks... like the rest. Drop the icon from
	the address bar, or any link, on the bar and it's added, named for the
	page's title; shorten the name in the outline. Whether the bar shows
	is flBookmarksBar in config.json.  */

function getBookmarksBarFolder (theOutline, flCreate) { //the headline whose sub-heads are the bar's items, made if it's missing and flCreate
	var theFolder;
	if (theOutline.opml.body.subs === undefined) {
		theOutline.opml.body.subs = [];
		}
	theOutline.opml.body.subs.forEach (function (theNode) {
		if ((theFolder === undefined) && (theNode.text !== undefined) && (theNode.text.trim ().toLowerCase () === nameBookmarksBarFolder.toLowerCase ())) {
			theFolder = theNode;
			}
		});
	if ((theFolder === undefined) && flCreate) {
		theFolder = {text: nameBookmarksBarFolder, created: new Date ().toUTCString (), subs: []};
		theOutline.opml.body.subs.push (theFolder);
		}
	return (theFolder);
	}

function buildBookmarksBar (theOutline) {
	divBookmarksBar.innerHTML = "";
	divBookmarksBar.classList.toggle ("hidden", !config.flBookmarksBar);
	const theFolder = getBookmarksBarFolder (theOutline, false);
	if ((theFolder !== undefined) && (theFolder.subs !== undefined)) {
		theFolder.subs.forEach (function (theNode) {
			if (theNode.url !== undefined) {
				const aBookmarksBarItem = document.createElement ("a");
				aBookmarksBarItem.className = "aBookmarksBarItem";
				aBookmarksBarItem.title = theNode.url;
				aBookmarksBarItem.appendChild (getFaviconElement ({url: theNode.url, favicon: undefined}));
				const spanBookmarksBarItemTitle = document.createElement ("span");
				spanBookmarksBarItemTitle.className = "spanBookmarksBarItemTitle";
				spanBookmarksBarItemTitle.textContent = (theNode.text === undefined) ? theNode.url : theNode.text.trim ();
				aBookmarksBarItem.appendChild (spanBookmarksBarItemTitle);
				aBookmarksBarItem.addEventListener ("click", function (event) {
					event.preventDefault ();
					if (event.metaKey) {
						openUrlInNewTab (theNode.url, true, true); //11/14/26 by CC -- flFromLink, here and below: a bookmark is a link
						}
					else {
						loadUrl (currentTab (), theNode.url, false, false, true);
						}
					});
				window.mdBrowser.getFavicon (theNode.url).then (function (theFavicon) {
					if ((theFavicon !== undefined) && (theFavicon !== null)) {
						aBookmarksBarItem.replaceChild (getFaviconElement ({url: theNode.url, favicon: theFavicon}), aBookmarksBarItem.firstChild);
						}
					});
				divBookmarksBar.appendChild (aBookmarksBarItem);
				}
			});
		}
	setPageTop ();
	}

function saveBookmarksOutline (theOutline) { //the outline changed here, not in the dialog: save it, and tell the menu code, the app and the bar
	bookmarksOpmltext = opml.stringify (theOutline);
	myBookmarksMenu.updateMenuOutline (theOutline);
	window.mdBrowser.saveBookmarks (bookmarksOpmltext, theOutline);
	buildBookmarksBar (theOutline);
	}

function getTitleForUrl (theUrl) { //the title of a page that's open in a tab, or the URL itself
	var theTitle = theUrl;
	tabs.forEach (function (theTab) {
		if ((theTab.url === theUrl) && (theTab.title !== undefined)) {
			theTitle = theTab.title;
			}
		});
	return (theTitle);
	}

function addToBookmarksBar (theUrl) {
	const theOutline = opml.parse (bookmarksOpmltext);
	if (theOutline.opml.body.subs !== undefined) { //the outline the bookmarks code starts with has one empty headline; it goes
		if ((theOutline.opml.body.subs.length === 1) && (theOutline.opml.body.subs [0].subs === undefined) && ((theOutline.opml.body.subs [0].text === undefined) || (theOutline.opml.body.subs [0].text.trim ().length === 0))) {
			theOutline.opml.body.subs = [];
			}
		}
	const theFolder = getBookmarksBarFolder (theOutline, true);
	if (theFolder.subs === undefined) {
		theFolder.subs = [];
		}
	theFolder.subs.push ({text: getTitleForUrl (theUrl), url: theUrl, type: "bookmark", icon: "bookmark", created: new Date ().toUTCString ()});
	saveBookmarksOutline (theOutline);
	}

function addBookmarkCommand () {
	const theTab = currentTab ();
	if (theTab.url === undefined) {
		alertDialog ("Can't add a bookmark because this tab has no page in it.");
		}
	else {
		confirmDialog ("Add \"" + theTab.title + "\" to the Bookmarks menu?", function () {
			myBookmarksMenu.addAndEdit (theTab.title, {url: theTab.url});
			});
		}
	}

function editBookmarksCommand () {
	myBookmarksMenu.editBookmarks ();
	}

function viewSourceCommand () { //10/13/26 by CC -- VIEW SOURCE: the page's text as it came from the server, front matter included

	/*  10/16/26: in its own window now (Dave), opened by the app. The
		view-source: tabs of 0.6.1 still load if one is restored, loadUrl
		knows the prefix, but nothing makes them any more.  */
	
	const theTab = currentTab ();
	if (theTab.source !== undefined) {
		window.mdBrowser.openSourceWindow (theTab.url, theTab.source);
		}
	}

function restoreTabs (theState) { //the tabs from the last run; each one fetches its page again
	tabs = [];
	theState.tabs.forEach (function (savedTab) {
		const theTab = newTab ();
		theTab.pageHistory = savedTab.pageHistory;
		theTab.ixHistory = savedTab.ixHistory;
		tabs.push (theTab);
		});
	if (tabs.length === 0) {
		tabs.push (newTab ());
		}
	ixCurrentTab = Math.min (Math.max (theState.ixCurrentTab, 0), tabs.length - 1);
	showCurrentTab ();
	tabs.forEach (function (theTab) {
		if (theTab.ixHistory >= 0) {
			loadUrl (theTab, theTab.pageHistory [theTab.ixHistory], true);
			}
		});
	}

function setPageTop () { //10/12/26 by CC -- the page starts below the chrome, whatever height the chrome turns out to be

	/*  10/17/26: the height goes in a CSS variable, --chromeHeight, and
		the stylesheet uses it. Nothing is written onto the elements
		themselves, so the user's CSS can override the padding and the
		find bar's position (Dave: "you shouldn't do that, because I
		can't override it").  */
	
	document.documentElement.style.setProperty ("--chromeHeight", divChrome.offsetHeight + "px");
	}

/*  10/12/26 by CC -- FIND IN PAGE, Cmd-F. The bar drops down at the top
	right. Typing searches as you type; Return finds the next match, Shift-
	Return the one before, Escape closes. The count shows as 2/7, the way
	Chrome shows it. The search is over the page only, not the chrome: each
	match in the page's text is wrapped in a mark, yellow, the current one
	orange, and the marks come out when the search changes or the bar
	closes. Case doesn't matter, as in Chrome.  */

var findMatches = [], ixFindMatch = -1; //the marks in the page, and which is current; assigned by markFindMatches and showFindMatch

function showFindCount () {
	if (findMatches.length === 0) {
		spanFindCount.textContent = (inputFind.value.length === 0) ? "" : "0/0";
		}
	else {
		spanFindCount.textContent = (ixFindMatch + 1) + "/" + findMatches.length;
		}
	}

function clearFindMatches () { //take the marks out, leaving the text as it was
	divPage.querySelectorAll ("mark.markFind").forEach (function (theMark) {
		const theParent = theMark.parentNode;
		theParent.replaceChild (document.createTextNode (theMark.textContent), theMark);
		theParent.normalize ();
		});
	findMatches = [];
	ixFindMatch = -1;
	}

function markFindMatches (theText) { //wrap every match in the page in a mark
	clearFindMatches ();
	const lookfor = theText.toLowerCase ();
	const theTextNodes = [];
	const theWalker = document.createTreeWalker (divPage, NodeFilter.SHOW_TEXT);
	while (theWalker.nextNode ()) {
		theTextNodes.push (theWalker.currentNode);
		}
	theTextNodes.forEach (function (theNode) {
		const theNodeText = theNode.nodeValue;
		const theNodeTextLower = theNodeText.toLowerCase ();
		var ix = theNodeTextLower.indexOf (lookfor);
		if (ix !== -1) {
			const theFragment = document.createDocumentFragment ();
			var ixStart = 0;
			while (ix !== -1) {
				theFragment.appendChild (document.createTextNode (theNodeText.substring (ixStart, ix)));
				const theMark = document.createElement ("mark");
				theMark.className = "markFind";
				theMark.textContent = theNodeText.substr (ix, lookfor.length);
				theFragment.appendChild (theMark);
				findMatches.push (theMark);
				ixStart = ix + lookfor.length;
				ix = theNodeTextLower.indexOf (lookfor, ixStart);
				}
			theFragment.appendChild (document.createTextNode (theNodeText.substring (ixStart)));
			theNode.parentNode.replaceChild (theFragment, theNode);
			}
		});
	}

function showFindMatch (ix) { //make this match the current one, and scroll it into view
	if (ixFindMatch >= 0) {
		findMatches [ixFindMatch].classList.remove ("current");
		}
	ixFindMatch = ix;
	findMatches [ix].classList.add ("current");
	findMatches [ix].scrollIntoView ({block: "center"});
	showFindCount ();
	}

function findInPage (flFindNext, flForward) { //flFindNext: move to the next match (or the one before); otherwise it's a new search

	/*  A new search marks the matches and goes to the first one. Next
		and previous wrap around at the ends, the way Chrome's do.  */
	
	const theText = inputFind.value;
	if (theText.length === 0) {
		clearFindMatches ();
		}
	else {
		if (!flFindNext || (findMatches.length === 0)) {
			markFindMatches (theText);
			if (findMatches.length > 0) {
				showFindMatch (0);
				}
			}
		else {
			const ct = findMatches.length;
			showFindMatch ((flForward) ? (ixFindMatch + 1) % ct : (ixFindMatch - 1 + ct) % ct);
			}
		}
	showFindCount ();
	}

function findCommand () { //Cmd-F: show the bar, with whatever was searched for last selected, ready to type over
	divFindBar.classList.add ("showing");
	inputFind.focus ();
	inputFind.select ();
	findInPage (false, true);
	}

function findNextCommand () {
	if (divFindBar.classList.contains ("showing")) {
		findInPage (true, true);
		}
	else {
		findCommand ();
		}
	}

function findPreviousCommand () {
	if (divFindBar.classList.contains ("showing")) {
		findInPage (true, false);
		}
	else {
		findCommand ();
		}
	}

function closeFind () {
	divFindBar.classList.remove ("showing");
	clearFindMatches ();
	}

function startup () {
	inputAddress = document.querySelector (".inputAddress");
	divPage = document.querySelector (".divPage");
	divPageColumn = document.querySelector (".divPageColumn"); //10/16/26 by CC
	divPageHeader = document.querySelector (".divPageHeader");
	buttonMore = document.querySelector (".buttonMore");
	divMoreMenu = document.querySelector (".divMoreMenu");
	divLinkStatus = document.querySelector (".divLinkStatus"); //10/29/26 by CC
	document.addEventListener ("mouseover", function (event) { //any link, in the page or the chrome, the way Chrome does the bookmarks bar too
		showLinkStatus ((event.target.closest === undefined) ? null : event.target.closest ("a"));
		});
	buttonStylesheets = document.querySelector (".buttonStylesheets"); //10/27/26 by CC
	buttonSource = document.querySelector (".buttonSource"); //11/3/26 by CC
	buttonSource.addEventListener ("click", toggleSourceCommand);
	divStylesheetsPanel = document.querySelector (".divStylesheetsPanel");
	linkStylesheet = document.createElement ("link"); //after index.css, before the user's CSS, which applyUserCss keeps last
	linkStylesheet.rel = "stylesheet";
	linkStylesheet.className = "linkStylesheet";
	document.head.appendChild (linkStylesheet);
	try {
		nameStylesheet = localStorage.getItem ("nameStylesheet");
		if (nameStylesheet === null) {
			nameStylesheet = undefined;
			}
		}
	catch (err) {
		}
	divSidebar = document.querySelector (".divSidebar"); //10/17/26 by CC
	divTypeahead = document.querySelector (".divTypeahead"); //10/18/26 by CC
	try {
		flSidebar = localStorage.getItem ("flSidebar") !== "false";
		}
	catch (err) {
		}
	divTabs = document.querySelector (".divTabs");
	divTabBar = document.querySelector (".divTabBar");
	divBookmarksBar = document.querySelector (".divBookmarksBar");
	spanVersion = document.querySelector (".spanVersion");
	window.mdBrowser.getVersion ().then (function (theVersion) { //10/13/26 by CC
		spanVersion.textContent = theVersion;
		});
	divChrome = document.querySelector (".divChrome");
	spanAddressFavicon = document.querySelector (".spanAddressFavicon");
	buttonBack = document.querySelector (".buttonBack");
	buttonForward = document.querySelector (".buttonForward");
	buttonReload = document.querySelector (".buttonReload");
	buttonHome = document.querySelector (".buttonHome");
	buttonNewTab = document.querySelector (".buttonNewTab");
	divFindBar = document.querySelector (".divFindBar");
	inputFind = document.querySelector (".inputFind");
	spanFindCount = document.querySelector (".spanFindCount");
	buttonFindPrevious = document.querySelector (".buttonFindPrevious");
	buttonFindNext = document.querySelector (".buttonFindNext");
	buttonFindClose = document.querySelector (".buttonFindClose");
	buttonFindPrevious.addEventListener ("click", findPreviousCommand);
	buttonFindNext.addEventListener ("click", findNextCommand);
	buttonFindClose.addEventListener ("click", closeFind);
	inputFind.addEventListener ("input", function () {
		findInPage (false, true);
		});
	inputFind.addEventListener ("keydown", function (event) {
		switch (event.key) {
			case "Enter":
				findInPage (true, !event.shiftKey);
				break;
			case "Escape":
				closeFind ();
				break;
			}
		});
	buttonSearch = document.querySelector (".buttonSearch"); //10/29/26 by CC -- search this site
	divSearchBar = document.querySelector (".divSearchBar");
	inputSearch = document.querySelector (".inputSearch");
	buttonSearchClose = document.querySelector (".buttonSearchClose");
	buttonSearch.addEventListener ("click", function () {
		if (divSearchBar.classList.contains ("showing")) {
			closeSearch ();
			}
		else {
			searchCommand ();
			}
		});
	buttonSearchClose.addEventListener ("click", closeSearch);
	inputSearch.addEventListener ("keydown", function (event) {
		switch (event.key) {
			case "Enter":
				if (searchSite (currentTab (), inputSearch.value)) {
					closeSearch ();
					}
				break;
			case "Escape":
				closeSearch ();
				break;
			}
		});
	buttonBack.addEventListener ("click", goBack);
	buttonForward.addEventListener ("click", goForward);
	buttonReload.addEventListener ("click", reload);
	buttonHome.addEventListener ("click", goHome);
	buttonMore.addEventListener ("click", function (event) { //10/16/26 by CC -- the three-dots menu
		divMoreMenu.classList.toggle ("showing");
		positionMoreMenu ();
		hideStylesheetsPanel ();
		event.stopPropagation ();
		});
	buttonStylesheets.addEventListener ("click", function (event) { //10/27/26 by CC -- the stylesheets panel
		if (divStylesheetsPanel.classList.contains ("showing")) {
			hideStylesheetsPanel ();
			}
		else {
			divMoreMenu.classList.remove ("showing");
			showStylesheetsPanel ();
			}
		event.stopPropagation ();
		});
	divStylesheetsPanel.addEventListener ("click", function (event) { //a click in the panel's margins doesn't close it
		event.stopPropagation ();
		});
	document.addEventListener ("keydown", function (event) { //Escape closes the panel
		if ((event.key === "Escape") && divStylesheetsPanel.classList.contains ("showing")) {
			hideStylesheetsPanel ();
			}
		});
	divMoreMenu.querySelectorAll (".divMoreMenuItem").forEach (function (divMoreMenuItem) {
		divMoreMenuItem.addEventListener ("click", function () {
			divMoreMenu.classList.remove ("showing");
			switch (divMoreMenuItem.dataset.command) {
				case "openDataFolder":
					window.mdBrowser.openDataFolder ();
					break;
				case "viewSource":
					viewSourceCommand ();
					break;
				case "find": //10/19/26 by CC -- the rest of Dave's outline for the menu
					findCommand ();
					break;
				case "addBookmark":
					addBookmarkCommand ();
					break;
				case "editBookmarks":
					editBookmarksCommand ();
					break;
				case "devTools":
					window.mdBrowser.toggleDevTools ();
					break;
				case "toggleSidebar": //10/17/26 by CC
					flSidebar = !flSidebar;
					try {
						localStorage.setItem ("flSidebar", flSidebar);
						}
					catch (err) {
						}
					showSidebar (currentTab ());
					break;
				}
			});
		});
	document.addEventListener ("click", function () { //a click anywhere else closes it, and the stylesheets panel
		divMoreMenu.classList.remove ("showing");
		hideStylesheetsPanel ();
		});
	buttonNewTab.addEventListener ("click", openNewTab);
	setPageTop ();
	spanAddressFavicon.addEventListener ("dragstart", function (event) { //10/12/26 by CC -- drag the icon, carrying the page's URL
		const theTab = currentTab ();
		if (theTab.url === undefined) {
			event.preventDefault ();
			}
		else {
			setDragUrl (event, theTab.url);
			}
		});
	divTabBar.addEventListener ("dragover", function (event) { //10/12/26 by CC -- the strip itself, not a tab: a tab dropped here goes to the end, a URL opens in a new tab
		event.preventDefault ();
		divTabBar.classList.add ("dropTarget");
		});
	divTabBar.addEventListener ("dragleave", function (event) {
		divTabBar.classList.remove ("dropTarget");
		});
	divTabBar.addEventListener ("drop", function (event) {
		event.preventDefault ();
		divTabBar.classList.remove ("dropTarget");
		const ixFrom = getDraggedTabIndex (event);
		if (ixFrom === undefined) {
			const theUrl = getDroppedUrl (event);
			if (theUrl !== undefined) {
				openUrlInNewTab (theUrl, false);
				}
			}
		else {
			moveTab (ixFrom, tabs.length - 1);
			}
		});
	divBookmarksBar.addEventListener ("dragover", function (event) { //10/13/26 by CC -- a URL dropped on the bar becomes an item in it
		if (!isTabDrag (event)) {
			event.preventDefault ();
			divBookmarksBar.classList.add ("dropTarget");
			}
		});
	divBookmarksBar.addEventListener ("dragleave", function (event) {
		divBookmarksBar.classList.remove ("dropTarget");
		});
	divBookmarksBar.addEventListener ("drop", function (event) {
		event.preventDefault ();
		divBookmarksBar.classList.remove ("dropTarget");
		const theUrl = getDroppedUrl (event);
		if ((theUrl !== undefined) && (getDraggedTabIndex (event) === undefined)) {
			addToBookmarksBar (theUrl);
			}
		});
	divPageColumn.addEventListener ("contextmenu", function (event) { //10/13/26 by CC -- the right-click menu, with Inspect; the app shows it. 10/17/26: on the column, so the header gets it too
		event.preventDefault ();
		const theLink = event.target.closest ("a");
		window.mdBrowser.showContextMenu ({x: event.x, y: event.y, linkUrl: (theLink === null) ? undefined : theLink.href});
		});
	divPage.addEventListener ("dragover", function (event) { //10/12/26 by CC -- a URL dropped on the page loads in this tab
		if (!isTabDrag (event)) {
			event.preventDefault ();
			}
		});
	divPage.addEventListener ("drop", function (event) {
		event.preventDefault ();
		const theUrl = getDroppedUrl (event);
		if ((theUrl !== undefined) && (getDraggedTabIndex (event) === undefined)) {
			loadUrl (currentTab (), theUrl);
			}
		});
	inputAddress.addEventListener ("keydown", function (event) {
		switch (event.key) {
			case "Enter":
				const theSelection = getTypeaheadSelection (); //10/18/26 by CC -- a row chosen with the arrows loads; otherwise what was typed
				hideTypeahead ();
				if (theSelection !== undefined) {
					loadUrl (currentTab (), theSelection);
					}
				else if (inputAddress.value.trim ().length > 0) {
					if (looksLikeAddress (inputAddress.value) || !searchSite (currentTab (), inputAddress.value)) { //10/29/26 by CC -- a word is a search of this site; on a site with no search it's tried as an address, as before
						loadUrl (currentTab (), inputAddress.value);
						}
					}
				break;
			case "ArrowDown": //10/18/26 by CC
				if (divTypeahead.classList.contains ("showing")) {
					selectTypeaheadRow (ixTypeahead + 1);
					event.preventDefault ();
					}
				break;
			case "ArrowUp":
				if (divTypeahead.classList.contains ("showing")) {
					selectTypeaheadRow (ixTypeahead - 1);
					event.preventDefault ();
					}
				break;
			case "Escape":
				hideTypeahead ();
				break;
			}
		});
	inputAddress.addEventListener ("input", showTypeahead); //10/18/26 by CC
	inputAddress.addEventListener ("blur", function () {
		setTimeout (hideTypeahead, 150); //after a mousedown on a row has had its turn
		});
	var flSelectAddressOnMouseUp = false; //10/30/26 by CC -- a click in the bar selects the whole address, so you can type over it: Chrome, Firefox, Safari (Dave). The click that gives the bar focus would then drop the selection for a cursor on its mouseup; that one mouseup is stopped. A second click places the cursor as usual.
	inputAddress.addEventListener ("mousedown", function () {
		flSelectAddressOnMouseUp = false;
		});
	inputAddress.addEventListener ("focus", function () {
		flSelectAddressOnMouseUp = true;
		inputAddress.select ();
		});
	inputAddress.addEventListener ("mouseup", function (event) {
		if (flSelectAddressOnMouseUp) {
			flSelectAddressOnMouseUp = false;
			event.preventDefault ();
			}
		});
	window.mdBrowser.onCommand (function (theCommand, theParam) {
		switch (theCommand) {
			case "newTab":
				openNewTab ();
				break;
			case "closeTab":
				closeTab (ixCurrentTab);
				break;
			case "addBookmark":
				addBookmarkCommand ();
				break;
			case "editBookmarks":
				editBookmarksCommand ();
				break;
			case "openUrl": //a page from the History menu opens in this tab, the way Chrome does it
				loadUrl (currentTab (), theParam);
				break;
			case "openBookmark": //11/14/26 by CC -- a bookmark from the app's menu; it's a link, so an HTML page goes to the reader's historic browser
				loadUrl (currentTab (), theParam, false, false, true);
				break;
			case "goHome":
				goHome ();
				break;
			case "goBack":
				goBack ();
				break;
			case "goForward":
				goForward ();
				break;
			case "find":
				findCommand ();
				break;
			case "findNext":
				findNextCommand ();
				break;
			case "findPrevious":
				findPreviousCommand ();
				break;
			case "reload":
				reload ();
				break;
			case "viewSource":
				viewSourceCommand ();
				break;
			case "openUrlInNewTab": //from the right-click menu on a link
				openUrlInNewTab (theParam, true);
				break;
			}
		});
	window.mdBrowser.getConfig ().then (function (theConfig) {
		config = theConfig;
		if (config.urlForHitCounter !== undefined) { //11/19/26 by CC -- THE HIT COUNTER. One hit each time the app starts, as Dave's other apps do it; hitCounter is in basic/code.js, which index.html loads. The app has no address of its own, so it's counted as the repo's (Dave: "how about the url of the repo"). The demo counts itself, in bonbondemo.js, and its config doesn't have this value, so it isn't counted twice
			hitCounter (undefined, config.urlHitCounterServer, config.urlForHitCounter, "");
			}
		document.body.classList.toggle ("lavenderLines", config.flLavenderLines === true); //11/7/26 by CC -- the dotted outlines on the chrome's parts and the page, off unless config.json says flLavenderLines true (a bug report to Dave: "especially visible on black backgrounds")
		return (loadStylesheets (false)); //10/27/26 by CC -- the chosen stylesheet, before the user's CSS goes in after it
		}).then (function () {
		applyUserCss ();
		return (window.mdBrowser.getUrlHistory ());
		}).then (function (theList) { //10/18/26 by CC
			urlHistory = (Array.isArray (theList)) ? theList : [];
		return (window.mdBrowser.getHistory ());
		}).then (function (theList) {
			recentPages = theList;
			return (window.mdBrowser.getTabs ());
		}).then (function (theState) {
			if ((theState !== undefined) && (theState !== null) && (Array.isArray (theState.tabs))) {
				restoreTabs (theState);
				}
			else {
				tabs = [newTab ()];
				ixCurrentTab = 0;
				showCurrentTab ();
				goHome (); //11/16/26 by CC -- no tabs saved from a last run, so this is a fresh install: the first tab opens the home page, where it used to sit empty ("New tab", nothing in the address box). Found by starting the packaged 0.6.49 on a new data folder; Dave: "very important"
				}
			return (window.mdBrowser.getBookmarks ());
			}).then (function (opmltext) {
				startBookmarks (opmltext);
				});
	}

startup ();
