/*  preload.js -- 10/9/26 by CC

	The one thing the shell page can ask the app to do: get a page. The
	page never fetches anything itself. The app does the request, applies
	the charter's rules about what counts as a page, converts the Markdown,
	and answers with HTML or with a 406.  */

const {contextBridge, ipcRenderer} = require ("electron");

contextBridge.exposeInMainWorld ("mdBrowser", {
	getConfig: function () { //the app's config.json, for the home page URL
		return (ipcRenderer.invoke ("mdBrowser.getConfig"));
		},
	getVersion: function () { //10/13/26 by CC -- the app's version, shown in the upper right corner of the window
		return (ipcRenderer.invoke ("mdBrowser.getVersion"));
		},
	getToc: function (theUrl) { //10/17/26 by CC -- the text of the site's /.well-known/toc.opml, or undefined; the app asks each site once per run
		return (ipcRenderer.invoke ("mdBrowser.getToc", theUrl));
		},
	isMarkdownUrl: function (theUrl) { //10/16/26 by CC -- true when the address serves a Markdown page; the app remembers the answer for the run
		return (ipcRenderer.invoke ("mdBrowser.isMarkdownUrl", theUrl));
		},
	getUrlStatus: function (theUrl) { //11/10/26 by CC -- {flAvailable, urlContentLocation}: whether there's something at the address, and the file the server says it sent; the app remembers the answer for the run
		return (ipcRenderer.invoke ("mdBrowser.getUrlStatus", theUrl));
		},
	toggleDevTools: function () { //10/19/26 by CC -- Developer tools in the three-dot menu
		return (ipcRenderer.invoke ("mdBrowser.toggleDevTools"));
		},
	openDataFolder: function () { //10/16/26 by CC -- the folder with config.json, tabs, bookmarks and history, in the Finder
		return (ipcRenderer.invoke ("mdBrowser.openDataFolder"));
		},
	openSourceWindow: function (theUrl, theSource) { //10/16/26 by CC -- View Source, in its own window
		return (ipcRenderer.invoke ("mdBrowser.openSourceWindow", theUrl, theSource));
		},
	getStylesheets: function () { //10/27/26 by CC -- the stylesheets in the data folder's stylesheets folder, [{name, title, url}], sorted by name
		return (ipcRenderer.invoke ("mdBrowser.getStylesheets"));
		},
	getUserCss: function () { //10/15/26 by CC -- the reader's stylesheet from urlUserCss, or "" when there is none
		return (ipcRenderer.invoke ("mdBrowser.getUserCss"));
		},
	getTabs: function () { //10/12/26 by CC -- the tabs saved at the end of the last run, or undefined
		return (ipcRenderer.invoke ("mdBrowser.getTabs"));
		},
	saveTabs: function (theState) { //10/12/26 by CC -- the shell's tabs, to come back next launch
		return (ipcRenderer.invoke ("mdBrowser.saveTabs", theState));
		},
	onCommand: function (callback) { //10/12/26 by CC -- menu commands: newTab, closeTab, addBookmark, editBookmarks, openUrl (with the url), goHome, goBack, goForward, find, findNext, findPrevious, reload, viewSource, openUrlInNewTab (with the url)
		ipcRenderer.on ("mdBrowser.command", function (event, theCommand, theParam) {
			callback (theCommand, theParam);
			});
		},
	getUrlHistory: function () { //10/18/26 by CC -- every page visited, newest first, for the typeahead; [] the first time
		return (ipcRenderer.invoke ("mdBrowser.getUrlHistory"));
		},
	saveUrlHistory: function (theList) { //10/18/26 by CC -- the shell's list, after a visit; the app keeps the newest maxUrlHistory
		return (ipcRenderer.invoke ("mdBrowser.saveUrlHistory", theList));
		},
	getHistory: function () { //10/12/26 by CC -- the recently visited pages, newest first
		return (ipcRenderer.invoke ("mdBrowser.getHistory"));
		},
	saveHistory: function (theList) { //10/12/26 by CC -- the list, after a page loads; the app saves it and rebuilds the History menu
		return (ipcRenderer.invoke ("mdBrowser.saveHistory", theList));
		},
	getBookmarks: function () { //10/12/26 by CC -- the bookmarks outline as opml text, or undefined the first time
		return (ipcRenderer.invoke ("mdBrowser.getBookmarks"));
		},
	saveBookmarks: function (opmltext, theOutline) { //10/12/26 by CC -- the edited outline, as text for the file and parsed for the menu
		return (ipcRenderer.invoke ("mdBrowser.saveBookmarks", opmltext, theOutline));
		},
	setBookmarksMenu: function (theOutline) { //10/12/26 by CC -- the app builds the Bookmarks menu from the outline
		return (ipcRenderer.invoke ("mdBrowser.setBookmarksMenu", theOutline));
		},
	showContextMenu: function (theParams) { //10/13/26 by CC -- {x, y, linkUrl}: the right-click menu, with Inspect; linkUrl when the click was on a link
		return (ipcRenderer.invoke ("mdBrowser.showContextMenu", theParams));
		},
	showAddressMenu: function () { //11/27/26 by CC -- the right-click menu in the address bar: Cut, Copy, Paste, Paste and Go, Select All
		return (ipcRenderer.invoke ("mdBrowser.showAddressMenu"));
		},
	getFavicon: function (theUrl) { //10/12/26 by CC -- the icon of the page's site as a data URL, or undefined when it has none
		return (ipcRenderer.invoke ("mdBrowser.getFavicon", theUrl));
		},
	getPage: function (theUrl, flAsItCame) { //answers {flOk, url, frontMatter, html, source} or {flOk: false, url, status, message}. 11/21/26: flAsItCame, for View Source: an HTML page comes back as the HTML, its Markdown copy isn't looked for
		return (ipcRenderer.invoke ("mdBrowser.getPage", theUrl, flAsItCame));
		},
	openInBrowser: function (theUrl) { //11/12/26 by CC -- the address opens in the reader's default browser; for a link to an HTML page
		return (ipcRenderer.invoke ("mdBrowser.openInBrowser", theUrl));
		}
	});
