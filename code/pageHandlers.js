/*  pageHandlers.js -- 11/19/26 by CC

	PAGE HANDLERS. Dave's outline, 11/19: "lets add page handlers / each
	handler is in its own folder whose title is the extension it's
	catching files from / so if it were opml it would call the handler.js
	in the folder named opml / handler.js takes two params, / options,
	which is an object that provides all the info we have about the
	request / callback, standard javascript callback params (err, data) /
	data is an object that contains whatever info the handler wants to
	return / but there must be an htmltext value".

	WHERE THEY LIVE. In the data folder, beside the stylesheets:

		handlers/system/json/handler.js    ours
		handlers/user/json/handler.js      the user's

	The system folder is ours: it's replaced every time the app starts,
	so a new version's handlers arrive, and the howto says not to edit
	them (Frontier's rule for its builtins). The user folder is theirs
	and we never touch it. When both have a folder for an extension the
	user's wins (Dave: "if we can override their idea that's not very
	weblike"). To change one of ours, copy it from system to user.

	A handler's folder can also have a config.json; what's in it arrives
	as options.config.

	WHAT A HANDLER IS. handler.js defines a function named handler:

		function handler (options, callback) {
			callback (undefined, {htmltext: "<p>hello</p>"});
			}

	options has: pagetext, the page's text as the server sent it; url,
	the address that was asked for; urlActual, the address after any
	redirects; contentType, the type the server said; extension, the one
	that picked this handler; headers, the rest of what the server said;
	config; version, BonBon's.

	WHICH HANDLER GETS A PAGE. config.extensionsForTypes is a short table
	from the server's type to an extension. When the type is in it, that's
	the extension. When it isn't, the extension on the address is. When
	there's neither, or there's no folder for the extension, the page is
	shown the way it was before there were handlers. Markdown pages never
	get here: Markdown is built in (Dave: "not yet").

	THE CLOSED BOX. A handler is a program, and a user may install one a
	stranger wrote. So it can't touch the reader's files or the network
	(Dave: "of course we should use it"). It runs in a worker, in a
	window nobody sees, in Chrome's sandbox:

	1. The window is sandboxed and has no Node in it: no require, no fs,
	no process.

	2. The window's page has a content security policy that allows no
	connections at all, and a worker started from it lives under the same
	policy: fetch, XMLHttpRequest, WebSocket, EventSource, WebTransport
	and importScripts are all refused.

	3. The window has a session of its own, kept in memory, and every
	request that session makes is canceled. So if something got past 2 it
	stops here.

	4. It's a worker and not the page itself because a page has more ways
	out: it can navigate, make links that look up names, open peer
	connections. A worker has none of those. The price: a handler has no
	DOM, no document and no DOMParser.

	The page's text and the facts about the request go in as a message;
	the handler's answer comes back as a message. That's the only door.

	WHEN A HANDLER FAILS. It has an error in it, it calls back with an
	err, it never calls back (config.ctSecsHandlerTimeout, 5 seconds), or
	it doesn't send htmltext: the page is shown the way it was before
	there were handlers, and the answer carries handlerError, a message
	the shell puts in a dialog.

	The handler's HTML isn't trusted either. The shell cleans it before
	it draws it: no script, no styles, no forms. See getHandlerHtml in
	index.js.  */

const fs = require ("fs");
const pathTool = require ("path");
const {app, BrowserWindow, session} = require ("electron");

const nameHandlersFolder = "handlers"; //Dave, 11/19: "for now yes, but if i sleep on it i might come up with a better name"; this is the one place the name is
const nameSystemFolder = "system";
const nameUserFolder = "user";
const fnameHandler = "handler.js";
const fnameHandlerConfig = "config.json";
const namePartition = "pageHandlers"; //a session of its own, in memory; nothing it does is saved

const htmlHandlerWindow = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:\"></head><body></body></html>";

const urlHandlerWindow = "data:text/html;charset=utf-8," + encodeURIComponent (htmlHandlerWindow);

var config = {
	extensionsForTypes: {},
	ctSecsHandlerTimeout: 5
	};
var handlerWindow, whenHandlerWindowReady; //assigned by getHandlerWindow

function init (theOptions) { //extensionsForTypes and ctSecsHandlerTimeout, from the app's config
	for (var x in theOptions) {
		if (theOptions [x] !== undefined) {
			config [x] = theOptions [x];
			}
		}
	}

function getHandlersFolder () {
	return (pathTool.join (app.getPath ("userData"), nameHandlersFolder));
	}

function copyFolder (folderFrom, folderTo) { //every file, folders within folders
	fs.mkdirSync (folderTo, {recursive: true});
	fs.readdirSync (folderFrom, {withFileTypes: true}).forEach (function (theEntry) {
		const pathFrom = pathTool.join (folderFrom, theEntry.name), pathTo = pathTool.join (folderTo, theEntry.name);
		if (theEntry.isDirectory ()) {
			copyFolder (pathFrom, pathTo);
			}
		else {
			fs.copyFileSync (pathFrom, pathTo);
			}
		});
	}

function seedHandlers () { //the system folder is replaced with the app's; the user folder is made if it isn't there, and never touched after that
	try {
		const folderSystem = pathTool.join (getHandlersFolder (), nameSystemFolder);
		fs.rmSync (folderSystem, {recursive: true, force: true});
		copyFolder (pathTool.join (__dirname, nameHandlersFolder, nameSystemFolder), folderSystem);
		fs.mkdirSync (pathTool.join (getHandlersFolder (), nameUserFolder), {recursive: true});
		}
	catch (err) {
		console.log ("Can't copy the handlers to the data folder because " + err.message);
		}
	}

function getExtensionForPage (theUrl, theContentType) { //the server's type when it's in the table, the extension on the address when it isn't; undefined when there's neither
	var theType = "";
	if (theContentType !== undefined) {
		theType = theContentType.split (";") [0].trim ().toLowerCase ();
		}
	if (config.extensionsForTypes [theType] !== undefined) {
		return (String (config.extensionsForTypes [theType]).toLowerCase ());
		}
	try {
		const thePath = new URL (theUrl).pathname.toLowerCase ();
		if (thePath.lastIndexOf (".") > thePath.lastIndexOf ("/")) {
			const theExtension = thePath.substr (thePath.lastIndexOf (".") + 1);
			if (/^[a-z0-9_-]+$/.test (theExtension)) { //it names a folder, so nothing that could walk out of the handlers folder
				return (theExtension);
				}
			}
		}
	catch (err) {
		}
	return (undefined);
	}

function findHandler (theExtension) { //the user's if there is one, ours if not; answers {extension, folder, code, config} or undefined
	var theHandler;
	[nameUserFolder, nameSystemFolder].forEach (function (nameFolder) {
		if (theHandler === undefined) {
			const folder = pathTool.join (getHandlersFolder (), nameFolder, theExtension);
			try {
				const theCode = fs.readFileSync (pathTool.join (folder, fnameHandler)).toString ();
				theHandler = {extension: theExtension, folder, code: theCode, config: {}};
				}
			catch (err) { //no handler.js there
				}
			}
		});
	if (theHandler !== undefined) {
		var jsontext;
		try {
			jsontext = fs.readFileSync (pathTool.join (theHandler.folder, fnameHandlerConfig)).toString ();
			}
		catch (err) { //no config.json, which is fine
			}
		if (jsontext !== undefined) {
			try {
				theHandler.config = JSON.parse (jsontext);
				}
			catch (err) {
				theHandler.configError = "its config.json isn't valid JSON: " + err.message;
				}
			}
		}
	return (theHandler);
	}

function getHandlerWindow () { //the window nobody sees; made the first time a handler runs, kept after that. Answers a promise for it
	if ((handlerWindow !== undefined) && !handlerWindow.isDestroyed ()) {
		return (whenHandlerWindowReady);
		}
	const theSession = session.fromPartition (namePartition); //no "persist:" in the name, so it's in memory
	theSession.webRequest.onBeforeRequest (function (theDetails, callback) { //every request this session makes is canceled, but two that never leave the machine: the window's own page, which is a data: address, and the worker's script, a blob: made in the window
		const flStaysHere = (theDetails.url === urlHandlerWindow) || (theDetails.url.indexOf ("blob:") === 0);
		callback ({cancel: !flStaysHere});
		});
	theSession.setPermissionRequestHandler (function (theWebContents, thePermission, callback) {
		callback (false);
		});
	handlerWindow = new BrowserWindow ({
		show: false,
		webPreferences: {
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
			nodeIntegrationInWorker: false,
			webSecurity: true,
			partition: namePartition
			}
		});
	const theWindow = handlerWindow;
	theWindow.webContents.setWindowOpenHandler (function () {
		return ({action: "deny"});
		});
	theWindow.webContents.on ("will-navigate", function (event) {
		event.preventDefault ();
		});
	whenHandlerWindowReady = theWindow.loadURL (urlHandlerWindow).then (function () {
		return (theWindow);
		}, function (err) { //the window didn't load; the next handler gets a new one
			closeHandlerWindow ();
			throw err;
			});
	return (whenHandlerWindowReady);
	}
function closeHandlerWindow () { //when the app's window closes; a hidden window would keep the app from quitting
	if ((handlerWindow !== undefined) && !handlerWindow.isDestroyed ()) {
		handlerWindow.destroy ();
		}
	handlerWindow = undefined;
	}

function runInWorker (theCode, options, ctSecsTimeout) { //THIS FUNCTION RUNS IN THE HIDDEN WINDOW, not here; it's sent there as text. Answers a promise for {message} when the handler failed, {data} when it answered

	/*  The worker's script is the handler's own file with a few lines
		after it. Those lines wait for the message that carries options,
		call handler, and send back what it calls back with. If the file
		has an error in it, or has no function named handler, that comes
		back as the message.  */

	return (new Promise (function (resolve) {
		const theTail = "\n;self.onmessage = function (theEvent) {\n" +
			"\tfunction answer (theAnswer) {\n" +
			"\t\ttry {\n" +
			"\t\t\tself.postMessage (theAnswer);\n" +
			"\t\t\t}\n" +
			"\t\tcatch (err) {\n" +
			"\t\t\tself.postMessage ({message: \"what it sent back can't be passed along: \" + err.message});\n" +
			"\t\t\t}\n" +
			"\t\t}\n" +
			"\tif (typeof handler !== \"function\") {\n" +
			"\t\tanswer ({message: \"handler.js has no function named handler\"});\n" +
			"\t\treturn;\n" +
			"\t\t}\n" +
			"\ttry {\n" +
			"\t\thandler (theEvent.data, function (err, data) {\n" +
			"\t\t\tif (err) {\n" +
			"\t\t\t\tanswer ({message: \"it said: \" + ((err.message === undefined) ? String (err) : String (err.message))});\n" +
			"\t\t\t\t}\n" +
			"\t\t\telse {\n" +
			"\t\t\t\tanswer ({data});\n" +
			"\t\t\t\t}\n" +
			"\t\t\t});\n" +
			"\t\t}\n" +
			"\tcatch (err) {\n" +
			"\t\tanswer ({message: \"it stopped with an error: \" + err.message});\n" +
			"\t\t}\n" +
			"\t};\n";
		const urlWorker = URL.createObjectURL (new Blob ([theCode + theTail], {type: "text/javascript"}));
		var theWorker, theTimer, flDone = false;
		function done (theAnswer) {
			if (!flDone) {
				flDone = true;
				clearTimeout (theTimer);
				if (theWorker !== undefined) {
					theWorker.terminate ();
					}
				URL.revokeObjectURL (urlWorker);
				resolve (theAnswer);
				}
			}
		try {
			theWorker = new Worker (urlWorker);
			}
		catch (err) {
			done ({message: "it couldn't be started: " + err.message});
			return;
			}
		theWorker.onmessage = function (theEvent) {
			done (theEvent.data);
			};
		theWorker.onerror = function (theEvent) {
			theEvent.preventDefault ();
			done ({message: "handler.js has an error: " + theEvent.message + ((theEvent.lineno) ? " (line " + theEvent.lineno + ")" : "")});
			};
		theTimer = setTimeout (function () {
			done ({message: "it didn't answer in " + ctSecsTimeout + " seconds"});
			}, ctSecsTimeout * 1000);
		theWorker.postMessage (options);
		}));
	}

function runHandler (theHandler, options, callback) { //callback (err, data); err.message is the reason, the part after "because"
	const ctSecsTimeout = Number (config.ctSecsHandlerTimeout);
	var flCalledBack = false, theBackstop;
	function finish (err, data) {
		if (!flCalledBack) {
			flCalledBack = true;
			clearTimeout (theBackstop);
			callback (err, data);
			}
		}
	theBackstop = setTimeout (function () { //the window has its own timer; this one is for a window that stopped answering altogether
		closeHandlerWindow ();
		finish ({message: "it didn't answer in " + ctSecsTimeout + " seconds"});
		}, (ctSecsTimeout + 2) * 1000);
	getHandlerWindow ().then (function (theWindow) {
		const theScript = "(" + runInWorker.toString () + ") (" + JSON.stringify (theHandler.code) + ", " + JSON.stringify (options) + ", " + JSON.stringify (ctSecsTimeout) + ")";
		return (theWindow.webContents.executeJavaScript (theScript));
		}).then (function (theAnswer) {
			if ((theAnswer === undefined) || (theAnswer === null)) {
				finish ({message: "it didn't send anything back"});
				}
			else if (theAnswer.message !== undefined) {
				finish ({message: theAnswer.message});
				}
			else if ((theAnswer.data === undefined) || (theAnswer.data === null) || (typeof theAnswer.data.htmltext !== "string")) {
				finish ({message: "it didn't send back htmltext"});
				}
			else {
				finish (undefined, theAnswer.data);
				}
			}).catch (function (err) {
				finish ({message: "it couldn't be run: " + err.message});
				});
	}

function handlePage (urlAsked, theResult, callback) { //theResult is pageRequests.getPage's answer; callback (theResult), changed to kind "handler" when a handler drew the page, with handlerError when one tried and failed, as it was when there's no handler for it
	if ((theResult === undefined) || (theResult.flOk !== true) || (theResult.kind === undefined) || (typeof theResult.source !== "string")) { //an error, a Markdown page, a picture or a download: not for handlers
		callback (theResult);
		return;
		}
	const theExtension = getExtensionForPage (theResult.url, theResult.contentType);
	if (theExtension === undefined) {
		callback (theResult);
		return;
		}
	const theHandler = findHandler (theExtension);
	if (theHandler === undefined) {
		callback (theResult);
		return;
		}
	function failed (theReason) {
		theResult.handlerError = "Can't use the " + theExtension + " handler because " + theReason + ".";
		console.log (theResult.handlerError);
		callback (theResult);
		}
	if (theHandler.configError !== undefined) {
		failed (theHandler.configError);
		return;
		}
	const options = {
		pagetext: theResult.source,
		url: urlAsked,
		urlActual: theResult.url,
		contentType: theResult.contentType,
		extension: theExtension,
		headers: (theResult.headers === undefined) ? {} : theResult.headers,
		config: theHandler.config,
		version: app.getVersion ()
		};
	runHandler (theHandler, options, function (err, data) {
		if (err) {
			failed (err.message);
			}
		else {
			callback ({
				flOk: true,
				kind: "handler",
				url: theResult.url,
				urlContentLocation: theResult.urlContentLocation,
				title: (typeof data.title === "string") ? data.title : undefined,
				htmltext: data.htmltext,
				source: theResult.source,
				extension: theExtension
				});
			}
		});
	}

exports.init = init;
exports.seedHandlers = seedHandlers;
exports.handlePage = handlePage;
exports.closeHandlerWindow = closeHandlerWindow;
exports.getHandlersFolder = getHandlersFolder;
