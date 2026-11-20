/*  main.js -- 10/9/26 by CC

	The Markdown browser's main process. One window, the shell page in it.
	The page asks for a URL through preload.js; this is where the request
	is made, where the charter's rules decide whether what came back is a
	page, and where the Markdown becomes HTML.  */

const {app, BrowserWindow, Menu, ipcMain, clipboard, shell} = require ("electron");
const fs = require ("fs");
const pathTool = require ("path");
const pageRequests = require ("./pageRequests.js"); //11/2/26 by CC -- the requests, the charter's rules about what counts as a page, favicons and the table of contents; they were in this file until the demo's server needed the same code
const pageHandlers = require ("./pageHandlers.js"); //11/19/26 by CC -- page handlers: a folder per file extension in the data folder, each with a handler.js that draws pages of that kind

var config = {
	windowWidth: 1000,
	windowHeight: 800,
	maxRedirects: 10,
	urlHomePage: "https://dave.writersweb.org/",
	maxHistoryMenuItems: 25, //10/12/26 by CC -- how many recently visited pages the History menu lists
	flBookmarksBar: true, //10/13/26 by CC -- the bookmarks bar under the address bar, Chrome's; the user can turn it off
	flLavenderLines: false, //11/7/26 by CC -- the dotted outlines on the chrome's parts and the page, the lining-up aid; off unless the user wants them (Dave, on a bug report: "especially visible on black backgrounds")
	urlHitCounterServer: "https://counters.scripting.com/hello", //11/19/26 by CC -- where the app says hello each time it starts
	urlForHitCounter: "https://github.com/scripting/bonBon", //11/19/26 by CC -- the address the app's hits are counted under, the repo's (Dave)
	extensionsForTypes: { //11/19/26 by CC -- PAGE HANDLERS: which handler gets a page whose address has no extension, from the type the server says it is; see pageHandlers.js
		"application/json": "json",
		"application/javascript": "js",
		"application/x-javascript": "js",
		"text/javascript": "js"
		},
	ctSecsHandlerTimeout: 5, //11/19/26 by CC -- how long a page handler has to answer before the page is shown without it
	flCalendar: false //10/17/26 by CC -- the calendar beside the text when the site has a table of contents. 10/18: off by default and gone from the UI (Dave: "reader-hostile"); the code stays for when we come back to it
	};
var mainWindow; //assigned by createWindow

function readConfig () { //10/16/26 by CC -- config.json lives in the data folder, the way Atlantis does it; the one in the app is the seed

	/*  The first run copies the app's config.json to the data folder.
		After that it's the person's file: new versions of the app never
		touch it. Open Data Folder in the File menu gets you there.  */
	
	const pathConfig = pathTool.join (app.getPath ("userData"), "config.json");
	if (!fs.existsSync (pathConfig)) {
		try {
			fs.mkdirSync (app.getPath ("userData"), {recursive: true});
			fs.copyFileSync (pathTool.join (__dirname, "config.json"), pathConfig);
			}
		catch (err) {
			console.log ("Can't copy config.json to the data folder because " + err.message);
			}
		}
	try {
		const jstruct = JSON.parse (fs.readFileSync (pathConfig).toString ());
		for (var x in jstruct) {
			config [x] = jstruct [x];
			}
		}
	catch (err) {
		console.log ("Can't read " + pathConfig + " because " + err.message);
		}
	}

/*  10/27/26 by CC -- STYLESHEETS. The look of the page is the reader's,
	not the writer's: five stylesheets ship with the app (Newsprint, Reader,
	Classic, Mono, Book, designed with Claude in the browser, 10/27), and the
	reader picks one with the button in the address bar. They live in a
	stylesheets folder in the data folder, with the fonts they use, so a
	skilled user can edit them, add one or take one away (Dave). The first
	run copies the app's set there; after that only a file that's missing
	is copied, so an edited stylesheet is never overwritten and a new one
	in a new version of the app still arrives.  */

const nameStylesheetsFolder = "stylesheets";

function getStylesheetsFolder () {
	return (pathTool.join (app.getPath ("userData"), nameStylesheetsFolder));
	}

function seedStylesheets () { //copy any file the data folder's stylesheets folder doesn't have yet from the app's
	function copyMissing (folderFrom, folderTo) {
		fs.mkdirSync (folderTo, {recursive: true});
		fs.readdirSync (folderFrom, {withFileTypes: true}).forEach (function (theEntry) {
			const pathFrom = pathTool.join (folderFrom, theEntry.name), pathTo = pathTool.join (folderTo, theEntry.name);
			if (theEntry.isDirectory ()) {
				copyMissing (pathFrom, pathTo);
				}
			else {
				if (!fs.existsSync (pathTo)) {
					fs.copyFileSync (pathFrom, pathTo);
					}
				}
			});
		}
	try {
		const pathReader = pathTool.join (getStylesheetsFolder (), "reader.css"), pathBasic = pathTool.join (getStylesheetsFolder (), "basic.css"); //10/27/26 by CC -- Reader became Basic the day it shipped; a data folder from 0.6.23 has it under the old name, and would otherwise end up with both
		if (fs.existsSync (pathReader) && !fs.existsSync (pathBasic)) {
			fs.renameSync (pathReader, pathBasic);
			}
		copyMissing (pathTool.join (__dirname, nameStylesheetsFolder), getStylesheetsFolder ());
		}
	catch (err) {
		console.log ("Can't copy the stylesheets to the data folder because " + err.message);
		}
	}

function getStylesheets () { //the .css files in the folder, sorted by name: [{name, title, url}]; the shell links the one the reader chose
	const theList = [];
	try {
		fs.readdirSync (getStylesheetsFolder ()).sort ().forEach (function (fname) {
			if (fname.toLowerCase ().endsWith (".css") && (fname.charAt (0) !== ".")) {
				const theName = fname.substr (0, fname.length - ".css".length);
				theList.push ({
					name: theName,
					title: theName.charAt (0).toUpperCase () + theName.substr (1), //newsprint.css is Newsprint in the panel
					url: require ("url").pathToFileURL (pathTool.join (getStylesheetsFolder (), fname)).href
					});
				}
			});
		}
	catch (err) {
		console.log ("Can't list the stylesheets because " + err.message);
		}
	return (theList);
	}

/*  11/2/26 by CC -- The request, the charter's rules about what counts as
	a page, the conversion of a page to HTML, favicons and the table of
	contents are in pageRequests.js now, so the demo's server
	(demo/api/api.js) runs the same code this app does.  */

/*  10/12/26 by CC -- TABS. The shell keeps the tabs; the app does two
	things for them. It owns the menu, so Cmd-T and Cmd-W reach the shell as
	commands instead of Cmd-W closing the window, Electron's default. And it
	keeps tabs.json in the app's data folder, so the tabs come back on the
	next launch the way trigger's windows do.  */

const fnameTabs = "tabs.json";
const fnameUserCss = "userCss.css"; //10/15/26 by CC -- the last stylesheet fetched from urlUserCss

function getTabsFilePath () {
	return (pathTool.join (app.getPath ("userData"), fnameTabs));
	}

function readTabs () { //answers the saved tabs, or undefined when there are none
	try {
		return (JSON.parse (fs.readFileSync (getTabsFilePath ()).toString ()));
		}
	catch (err) {
		return (undefined);
		}
	}

function writeTabs (theState) {
	try {
		fs.writeFileSync (getTabsFilePath (), JSON.stringify (theState, undefined, "\t"));
		}
	catch (err) {
		console.log ("Can't save the tabs because " + err.message);
		}
	}

function sendCommand (theCommand, theParam) { //a menu command, to the shell
	if (mainWindow !== undefined) {
		mainWindow.webContents.send ("mdBrowser.command", theCommand, theParam);
		}
	}

/*  10/12/26 by CC -- BOOKMARKS. Dave's bookmarks menu, the one in all his
	apps: the bookmarks are an outline, bookmarks.opml in the app's data
	folder, and editing them means editing the outline. The shell owns the
	outline and the editing (see startBookmarks in index.js); the app keeps
	the file and builds the Bookmarks menu in the menu bar from the outline
	the shell sends. A headline with sub-heads is a submenu, a headline that
	is a single dash is a separator, anything else with a url is a bookmark.  */

const fnameBookmarks = "bookmarks.opml";
const maxMenuItemChars = 60;
var bookmarksOutline; //assigned by the shell, through setBookmarksMenu

function readBookmarks () { //answers the opml text, or undefined when there is no file yet
	try {
		return (fs.readFileSync (pathTool.join (app.getPath ("userData"), fnameBookmarks)).toString ());
		}
	catch (err) {
		return (undefined);
		}
	}

function writeBookmarks (opmltext) {
	try {
		fs.writeFileSync (pathTool.join (app.getPath ("userData"), fnameBookmarks), opmltext);
		}
	catch (err) {
		console.log ("Can't save the bookmarks because " + err.message);
		}
	}

function getMenuItemLabel (theText) { //a headline can be any length, a menu item can't
	theText = theText.trim ();
	if (theText.length > maxMenuItemChars) {
		theText = theText.substr (0, maxMenuItemChars - 3) + "...";
		}
	return (theText);
	}

function getBookmarksMenuItems (theSubs) { //the menu items for one level of the outline
	const theItems = [];
	if (theSubs !== undefined) {
		theSubs.forEach (function (theNode) {
			const theText = (theNode.text === undefined) ? "" : theNode.text;
			if (theNode.subs !== undefined) {
				theItems.push ({label: getMenuItemLabel (theText), submenu: getBookmarksMenuItems (theNode.subs)});
				}
			else {
				if (theText.trim () === "-") {
					theItems.push ({type: "separator"});
					}
				else {
					if (theNode.url !== undefined) {
						theItems.push ({label: getMenuItemLabel (theText), click: function () {sendCommand ("openBookmark", theNode.url);}});
						}
					}
				}
			});
		}
	return (theItems);
	}

/*  10/12/26 by CC -- HISTORY. The pages visited, newest first, in the
	History menu, Chrome's layout: Home, Back and Forward at the top, then
	the recently visited pages. The shell keeps the list as pages load (see
	addToHistory in index.js); it's saved in history.json in the app's data
	folder and comes back on the next launch. How many the menu shows is
	maxHistoryMenuItems in config.json.  */

const fnameHistory = "history.json";
const fnameUrlHistory = "urlHistory.json", maxUrlHistory = 10000; //10/18/26 by CC -- every page visited, newest first, for the typeahead; a big local JSON file, Dave's choice
var recentPages = []; //assigned at startup from the file, then by the shell through saveHistory

function readHistory () { //answers the saved list, or an empty one
	try {
		const theList = JSON.parse (fs.readFileSync (pathTool.join (app.getPath ("userData"), fnameHistory)).toString ());
		if (Array.isArray (theList)) {
			return (theList);
			}
		}
	catch (err) {
		}
	return ([]);
	}

function writeHistory (theList) {
	try {
		fs.writeFileSync (pathTool.join (app.getPath ("userData"), fnameHistory), JSON.stringify (theList, undefined, "\t"));
		}
	catch (err) {
		console.log ("Can't save the history because " + err.message);
		}
	}

function getHistoryMenuItems () {
	const theItems = [];
	recentPages.forEach (function (thePage, ix) {
		if (ix < config.maxHistoryMenuItems) {
			const theText = ((thePage.title === undefined) || (thePage.title.length === 0)) ? thePage.url : thePage.title;
			theItems.push ({label: getMenuItemLabel (theText), click: function () {sendCommand ("openUrl", thePage.url);}});
			}
		});
	return (theItems);
	}

function buildMenu () {
	const historyMenu = [
		{label: "Home", accelerator: "CmdOrCtrl+Shift+H", click: function () {sendCommand ("goHome");}},
		{label: "Back", accelerator: "CmdOrCtrl+[", click: function () {sendCommand ("goBack");}},
		{label: "Forward", accelerator: "CmdOrCtrl+]", click: function () {sendCommand ("goForward");}}
		];
	const historyItems = getHistoryMenuItems ();
	if (historyItems.length > 0) {
		historyMenu.push ({type: "separator"});
		historyItems.forEach (function (theItem) {
			historyMenu.push (theItem);
			});
		}
	const bookmarksMenu = [ //10/13/26 by CC -- the bookmarks go between the two commands, the way Dave's menu lays it out
		{label: "Add Bookmark...", accelerator: "CmdOrCtrl+D", click: function () {sendCommand ("addBookmark");}}
		];
	if ((bookmarksOutline !== undefined) && (bookmarksOutline.opml !== undefined)) {
		const theItems = getBookmarksMenuItems (bookmarksOutline.opml.body.subs);
		if (theItems.length > 0) {
			bookmarksMenu.push ({type: "separator"});
			theItems.forEach (function (theItem) {
				bookmarksMenu.push (theItem);
				});
			}
		}
	bookmarksMenu.push ({type: "separator"});
	bookmarksMenu.push ({label: "Edit Bookmarks...", click: function () {sendCommand ("editBookmarks");}});
	const theTemplate = [
		{
			label: app.name,
			submenu: [
				{role: "about"},
				{type: "separator"},
				{role: "quit"}
				]
			},
		{
			label: "File",
			submenu: [
				{label: "New Tab", accelerator: "CmdOrCtrl+T", click: function () {sendCommand ("newTab");}},
				{label: "Close Tab", accelerator: "CmdOrCtrl+W", click: function () {sendCommand ("closeTab");}},
				{type: "separator"},
				{label: "Open Data Folder", click: function () {shell.openPath (app.getPath ("userData"));}} //10/16/26 by CC -- where config.json, tabs, bookmarks and history live
				]
			},
		{
			label: "Edit",
			submenu: [
				{role: "undo"},
				{role: "redo"},
				{type: "separator"},
				{role: "cut"},
				{role: "copy"},
				{role: "paste"},
				{role: "pasteAndMatchStyle"},
				{role: "delete"},
				{role: "selectAll"},
				{type: "separator"},
				{label: "Find...", accelerator: "CmdOrCtrl+F", click: function () {sendCommand ("find");}}, //10/12/26 by CC -- FIND IN PAGE, Chrome's keystrokes
				{label: "Find Next", accelerator: "CmdOrCtrl+G", click: function () {sendCommand ("findNext");}},
				{label: "Find Previous", accelerator: "CmdOrCtrl+Shift+G", click: function () {sendCommand ("findPrevious");}}
				]
			},
		{
			label: "View", //10/13/26 by CC -- VIEW SOURCE AND INSPECT, Chrome's keystrokes
			submenu: [
				{label: "Reload This Page", accelerator: "CmdOrCtrl+R", click: function () {sendCommand ("reload");}},
				{type: "separator"},
				{label: "View Source", accelerator: "CmdOrCtrl+Alt+U", click: function () {sendCommand ("viewSource");}},
				{label: "Developer Tools", accelerator: "CmdOrCtrl+Alt+I", click: function () {if (mainWindow !== undefined) {mainWindow.webContents.toggleDevTools ();}}}
				]
			},
		{
			label: "History",
			submenu: historyMenu
			},
		{
			label: "Bookmarks",
			submenu: bookmarksMenu
			},
		{role: "windowMenu"}
		];
	Menu.setApplicationMenu (Menu.buildFromTemplate (theTemplate));
	}

function createWindow () {
	const theOptions = {
		width: config.windowWidth,
		height: config.windowHeight,
		titleBarStyle: "hiddenInset", //10/12/26 by CC -- TABS IN THE TITLE BAR, Chrome's layout: the shell draws the tab strip where the title bar was, the address bar below it; the traffic lights stay, inset at the left of the strip
		trafficLightPosition: {x: 14, y: 13},
		webPreferences: {
			preload: pathTool.join (__dirname, "preload.js")
			}
		};
	if (process.platform === "linux") { //11/14/26 by CC -- THE ICON ON LINUX. On the Mac the icon is part of the app's package; on Linux the window has to be told, or the taskbar shows a generic one (Dave: "add it")
		theOptions.icon = pathTool.join (__dirname, "bonbon.png");
		}
	mainWindow = new BrowserWindow (theOptions);
	mainWindow.loadFile ("index.html");
	mainWindow.on ("closed", function () {
		mainWindow = undefined;
		pageHandlers.closeHandlerWindow (); //11/19/26 by CC -- the window the handlers run in is hidden, and would keep the app from quitting
		});
	}

ipcMain.handle ("mdBrowser.getConfig", function (event) {
	return (config);
	});

ipcMain.handle ("mdBrowser.getVersion", function (event) { //10/13/26 by CC -- for the corner of the window
	return (app.getVersion ());
	});

ipcMain.handle ("mdBrowser.getUrlHistory", function (event) { //10/18/26 by CC
	try {
		return (JSON.parse (fs.readFileSync (pathTool.join (app.getPath ("userData"), fnameUrlHistory)).toString ()));
		}
	catch (err) {
		return ([]);
		}
	});

ipcMain.handle ("mdBrowser.saveUrlHistory", function (event, theList) { //10/18/26 by CC
	if (Array.isArray (theList)) {
		fs.writeFileSync (pathTool.join (app.getPath ("userData"), fnameUrlHistory), JSON.stringify (theList.slice (0, maxUrlHistory), undefined, "\t"));
		}
	});

ipcMain.handle ("mdBrowser.toggleDevTools", function (event) { //10/19/26 by CC
	if (mainWindow !== undefined) {
		mainWindow.webContents.toggleDevTools ();
		}
	});

ipcMain.handle ("mdBrowser.openDataFolder", function (event) { //10/16/26 by CC
	shell.openPath (app.getPath ("userData"));
	});

ipcMain.handle ("mdBrowser.openSourceWindow", function (event, theUrl, theSource) { //10/16/26 by CC -- View Source in its own window: the text as it came, nothing else
	function encodeHtml (theString) {
		return (theString.replace (/&/g, "&amp;").replace (/</g, "&lt;").replace (/>/g, "&gt;"));
		}
	const htmltext = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + encodeHtml ("view-source:" + theUrl) + "</title><style>body {margin: 0; padding: 20px 24px; font-family: Menlo, Monaco, monospace; font-size: 13px; line-height: 1.5; color: #222;} pre {margin: 0; white-space: pre-wrap; word-break: break-word;}</style></head><body><pre>" + encodeHtml (theSource) + "</pre></body></html>";
	const sourceWindow = new BrowserWindow ({
		width: 800,
		height: 700,
		title: "view-source:" + theUrl,
		webPreferences: {contextIsolation: true, nodeIntegration: false}
		});
	sourceWindow.loadURL ("data:text/html;charset=utf-8," + encodeURIComponent (htmltext));
	});

ipcMain.handle ("mdBrowser.getToc", function (event, theUrl) { //10/17/26 by CC -- the site's table of contents, an OPML outline at a well-known address (Dave, 10/17); the shell parses it. 11/2/26: the request and its once-per-run cache are in pageRequests.js
	return (new Promise (function (resolve) {
		pageRequests.getToc (theUrl, resolve);
		}));
	});

ipcMain.handle ("mdBrowser.isMarkdownUrl", function (event, theUrl) { //10/16/26 by CC -- does this address serve a Markdown page? For the author's link, which is only a link when it points at one (Dave, 10/16). 11/2/26: in pageRequests.js
	return (new Promise (function (resolve) {
		pageRequests.isMarkdownUrl (theUrl, resolve);
		}));
	});

ipcMain.handle ("mdBrowser.getUrlStatus", function (event, theUrl) { //11/10/26 by CC -- is there something at this address, and which file does the server say it sent; for the arrows that come from a site's table of contents, see getTocNeighbors in index.js
	return (new Promise (function (resolve) {
		pageRequests.getUrlStatus (theUrl, resolve);
		}));
	});

ipcMain.handle ("mdBrowser.getUserCss", function (event) { //10/15/26 by CC -- the reader's own stylesheet, urlUserCss in config.json, applied after everything else

	/*  Fetched fresh on every launch and reload, so the reader can iterate
		on it. Cached in the data folder, so when the URL is unreachable
		the app looks the way it did last time rather than unstyled. An
		empty or missing URL means no user CSS, and clears the cache.  */
	
	const cachePath = pathTool.join (app.getPath ("userData"), fnameUserCss);
	function getCachedCss () {
		try {
			return (fs.readFileSync (cachePath).toString ());
			}
		catch (err) {
			return ("");
			}
		}
	return (new Promise (function (resolve) {
		if ((config.urlUserCss === undefined) || (config.urlUserCss.length === 0)) {
			try {
				fs.unlinkSync (cachePath);
				}
			catch (err) {
				}
			resolve ("");
			}
		else {
			pageRequests.httpGet (config.urlUserCss, 0, function (err, theResponse) {
				if (err || (theResponse.status !== 200)) {
					console.log ("getUserCss: can't get " + config.urlUserCss + ", using the cached copy. " + ((err) ? err.message : "Status " + theResponse.status + "."));
					resolve (getCachedCss ());
					}
				else {
					const csstext = theResponse.body.toString ();
					fs.writeFileSync (cachePath, csstext);
					resolve (csstext);
					}
				});
			}
		}));
	});

ipcMain.handle ("mdBrowser.getStylesheets", function (event) { //10/27/26 by CC
	return (getStylesheets ());
	});

ipcMain.handle ("mdBrowser.getTabs", function (event) {
	return (readTabs ());
	});

ipcMain.handle ("mdBrowser.saveTabs", function (event, theState) {
	writeTabs (theState);
	});

ipcMain.handle ("mdBrowser.getBookmarks", function (event) {
	return (readBookmarks ());
	});

ipcMain.handle ("mdBrowser.saveBookmarks", function (event, opmltext, theOutline) {
	writeBookmarks (opmltext);
	bookmarksOutline = theOutline;
	buildMenu ();
	});

ipcMain.handle ("mdBrowser.setBookmarksMenu", function (event, theOutline) {
	bookmarksOutline = theOutline;
	buildMenu ();
	});

ipcMain.handle ("mdBrowser.getHistory", function (event) {
	return (recentPages);
	});

ipcMain.handle ("mdBrowser.saveHistory", function (event, theList) {
	recentPages = theList;
	writeHistory (theList);
	buildMenu ();
	});

/*  10/13/26 by CC -- the right-click menu, Chrome's: on a link, open it in
	a new tab or copy its address; anywhere, View Page Source and Inspect,
	which opens the developer tools on the element under the pointer.  */

ipcMain.handle ("mdBrowser.showContextMenu", function (event, theParams) {
	const theTemplate = [];
	if (theParams.linkUrl !== undefined) {
		theTemplate.push ({label: "Open Link in New Tab", click: function () {sendCommand ("openUrlInNewTab", theParams.linkUrl);}});
		theTemplate.push ({label: "Copy Link Address", click: function () {clipboard.writeText (theParams.linkUrl);}});
		theTemplate.push ({type: "separator"});
		}
	theTemplate.push ({label: "View Page Source", click: function () {sendCommand ("viewSource");}});
	theTemplate.push ({label: "Inspect", click: function () {if (mainWindow !== undefined) {mainWindow.webContents.inspectElement (theParams.x, theParams.y);}}});
	Menu.buildFromTemplate (theTemplate).popup ({window: mainWindow});
	});

ipcMain.handle ("mdBrowser.getFavicon", function (event, theUrl) {
	return (new Promise (function (resolve) {
		pageRequests.getFavicon (theUrl, resolve);
		}));
	});

ipcMain.handle ("mdBrowser.getPage", function (event, theUrl) {
	return (new Promise (function (resolve) {
		pageRequests.getPage (theUrl, function (theResult) {
			pageHandlers.handlePage (theUrl, theResult, resolve); //11/19/26 by CC -- a page that isn't Markdown goes to its handler, if there's one for its extension
			});
		}));
	});

ipcMain.handle ("mdBrowser.openInBrowser", function (event, theUrl) { //11/12/26 by CC -- a link to an HTML page opens in the reader's default browser (Dave); web addresses only
	if ((typeof theUrl === "string") && ((theUrl.indexOf ("http://") === 0) || (theUrl.indexOf ("https://") === 0))) {
		shell.openExternal (theUrl);
		}
	});

function moveDataFromOldName () { //10/13/26 by CC -- the app was Markdown Browser, then BonBon Browser, on 10/13/26; its data folder was named for it

	/*  Electron names the data folder after the app. Each time the name
		changed the folder moved, and the tabs, bookmarks and history would
		have been left behind. The first time the new folder is empty, the
		three files come over from the newest old folder that has them.  */
	
	const newFolder = app.getPath ("userData");
	if (!fs.existsSync (pathTool.join (newFolder, fnameTabs))) {
		var flCopied = false;
		["BonBon Browser", "Markdown Browser"].forEach (function (oldName) {
			const oldFolder = pathTool.join (pathTool.dirname (newFolder), oldName);
			if (!flCopied && fs.existsSync (pathTool.join (oldFolder, fnameTabs))) {
				[fnameTabs, fnameBookmarks, fnameHistory].forEach (function (fname) {
					try {
						fs.copyFileSync (pathTool.join (oldFolder, fname), pathTool.join (newFolder, fname));
						}
					catch (err) {
						}
					});
				flCopied = true;
				}
			});
		}
	}

/*  10/18/26 by CC -- BON:// LINKS. A link like bon://dave.writersweb.org/index.md,
	clicked in Chrome or anywhere else, opens that page in BonBon, in a new
	tab, the way Chrome opens a link another app hands it (Dave). The app
	registers itself with the Mac for the scheme; the packaged app also
	declares it in its Info.plist (electron-packager's --protocol). The
	bon:// becomes http://, and the site redirects to https if it wants
	to. A link that arrives before the window exists waits for it.  */

var urlsWaitingToOpen = []; //bon:// links that arrived before the shell was ready

function openBonUrl (theUrl) {
	const pageUrl = "http://" + theUrl.substr ("bon://".length);
	if ((mainWindow === undefined) || mainWindow.webContents.isLoading ()) {
		urlsWaitingToOpen.push (pageUrl);
		}
	else {
		mainWindow.webContents.send ("mdBrowser.command", "openUrlInNewTab", pageUrl);
		mainWindow.show ();
		mainWindow.focus ();
		}
	}
app.setAsDefaultProtocolClient ("bon");
app.on ("open-url", function (event, theUrl) {
	event.preventDefault ();
	openBonUrl (theUrl);
	});

app.whenReady ().then (function () {
	readConfig ();
	pageRequests.init ({maxRedirects: config.maxRedirects, userAgent: "Markdown Browser/" + app.getVersion ()}); //11/2/26 by CC -- what the requests need from the app; the demo's server sets its own
	moveDataFromOldName ();
	seedStylesheets (); //10/27/26 by CC
	pageHandlers.init ({extensionsForTypes: config.extensionsForTypes, ctSecsHandlerTimeout: config.ctSecsHandlerTimeout}); //11/19/26 by CC
	pageHandlers.seedHandlers ();
	recentPages = readHistory ();
	buildMenu ();
	createWindow ();
	mainWindow.webContents.on ("did-finish-load", function () { //a bon:// link that arrived early
		urlsWaitingToOpen.forEach (function (pageUrl) {
			openBonUrl ("bon://" + pageUrl.substr ("http://".length));
			});
		urlsWaitingToOpen = [];
		});
	});

app.on ("window-all-closed", function () {
	app.quit ();
	});
