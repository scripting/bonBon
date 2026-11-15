---
name: bonbon
description: How to help someone use BonBon, a browser for a web made of Markdown files, and how to help someone write pages and sites for it. Use when the person mentions BonBon, bonbonweb.org, a Markdown web, toc.opml or bonbon.json.
---

# BonBon, for an assistant helping someone with it

This is a note from one assistant to another. I'm Claude, and I worked with Dave Winer on BonBon as it was built. BonBon is new, its written docs are thin, and the people who try it will ask you things they can't look up yet. This is what I know, so you can answer them.

DRAFT of 11/13/26, written for BonBon 0.6.46.

## How to use this

1. Answer from what is written here. BonBon is too new for your training to know it, and it differs from other browsers in ways that make a plausible guess wrong.
2. When the answer isn't here, say you don't know. Don't make up a menu command, a setting or a front matter field.
3. When something looks like a bug, send the person to the issues section of the BonBon repo: https://github.com/scripting/bonBon/issues Help them write a good report: the BonBon version (it shows in the corner of the window), the address of the page, what they did, what they expected and what happened.
4. Keep answers short and in plain steps. Most people asking are trying to do one thing.

## What BonBon is

1. BonBon is a web browser whose native format is Markdown, not HTML. Markdown plays the part HTML plays in Chrome.
2. A site is a collection of Markdown files on a web server. A page is one file. Links between pages are ordinary Markdown links.
3. The reader controls how a page looks, by choosing a stylesheet. A page can't bring its own CSS, HTML or JavaScript. HTML inside a Markdown file is stripped. No code ever runs because someone looked at a page.
4. The format is open on purpose. Nothing a site does to work in BonBon is private to BonBon, and anyone can write another browser for the same pages. More browsers is the goal.
5. The charter, which is the spec for the idea: https://github.com/scripting/myMarkdownBlog/blob/main/docs/charter.md

## Getting it

1. The app runs on Macs with Apple silicon and on Linux with Intel-type chips. The download page: https://github.com/scripting/bonBon/tree/main/download
2. There is a version that runs in any web browser, nothing to install, for trying it out: https://demo.bonbonweb.org/
3. The Mac app isn't signed with Apple. The first time someone opens it, macOS refuses. The way around it: try to open the app once, then go to System Settings, Privacy & Security, scroll down to the message about BonBon and click Open Anyway. That's needed once.
4. The Linux zip holds one folder, BonBon. Unzip it anywhere. Open the folder and double-click the file named BonBon, or run `./BonBon` in a terminal from inside the folder. Nothing gets installed. To remove the app, delete the folder.
5. The Linux build is new and has been run by very few people. If it doesn't start, run `./BonBon` in a terminal; the reason is printed there. On recent versions of Ubuntu the reason may be a message about the sandbox, and `./BonBon --no-sandbox` gets past it. Either way, ask the person to report what the terminal said in the issues section, with the name and version of their Linux.

## Sites to visit

1. https://dave.writersweb.org/ is Dave's site. Under https://dave.writersweb.org/scripting/ is his blog, Scripting News, as Markdown, back to 2017.
2. https://brent.writersweb.org/ is Brent Simmons' blog, inessential, as Markdown.
3. https://demo.bloatware.org/ is a small made-up company site, served straight from a GitHub repo.
4. https://github.com/scripting/markdownWeb has example pages with screen shots.

## Finding your way around the window

The top of the window, from the top down: the tabs, the address bar, the bookmarks bar. The page is below.

1. Address bar. Type or paste an address and press Return. One click selects the whole address, a second click places the cursor.
2. Typing a single word in the address bar (no dot, slash or colon) searches the site you're on, if that site has a search.
3. Tabs work as in other browsers. Cmd-click a link to open it in a new tab. Drag a tab to reorder.
4. The arrows at the top right of a page go to the page before and the page after, when the page or its site says what those are. On a blog they step through posts, days and months.
5. The calendar beside the text, on a site that has one, is the site's table of contents by date. Click a day to go to it.
6. The magnifying glass in the address bar searches the site. It's only there to use on sites that have a search.
7. The A button in the address bar opens the stylesheets. There are five: Newsprint, Reader, Classic, Mono and Book. A click restyles the page on the spot. Reader is the one you start with.
8. The three dots at the right end of the address bar have Open Data Folder and View Source.
9. Hover over a link and its address shows in the bottom left corner.

The menus:

1. Bookmarks: Add Bookmark (Cmd-D), your bookmarks, Edit Bookmarks. Bookmarks are edited as an outline: a headline with headlines under it is a submenu, and a headline that's a single dash is a separator line.
2. The bookmarks bar holds the items under the headline named "Bookmarks bar" in that outline. Drop a link or the icon from the address bar on the bar to add it.
3. History: Home (Cmd-Shift-H), Back (Cmd-[), Forward (Cmd-]), then the pages you've been to, newest first.
4. View: Reload This Page (Cmd-R), View Source (Cmd-Option-U), Developer Tools (Cmd-Option-I).
5. Find in the page is Cmd-F. Return goes to the next match, Shift-Return to the one before, Escape closes it.
6. Right-click on the page: on a link, Open Link in New Tab and Copy Link Address; anywhere, View Page Source and Inspect.

What happens with things that aren't Markdown:

1. A click on a link to an HTML page opens it in your historic browser, meaning Chrome, Safari or whichever browser you use for the HTML web. BonBon stays where it was.
2. An HTML address you type yourself shows the page's source, as text.
3. XML, OPML, JSON and source code (JavaScript, CSS, Python and many others) are shown as text, in color.
4. A picture is shown by itself, centered.
5. Anything else gets a page with its name, its size and a Download link.

When a page doesn't come, a dialog says why, in the server's words when it gave any. The tab stays on the page it had and the address you asked for stays in the address bar, so you can fix it and try again.

Some sites update the page in front of you when the author changes it. Nothing to turn on; it happens on sites that offer it.

## Making it yours

1. Open Data Folder, in the three dots menu, shows where BonBon keeps its files.
2. The stylesheets are plain CSS files in the stylesheets folder there. Edit one, add one or rename one, and it shows up under the A button. BonBon never overwrites a stylesheet you've changed.
3. config.json in the data folder has a setting, urlUserCss, the address of a stylesheet of your own. Its rules win over everything in the window, not only the page.

## Writing a page for BonBon

A page is a Markdown file. The server must send it as `text/markdown; charset=utf-8`.

Front matter is optional. It goes at the top between two lines of three dashes. BonBon looks for eight fields:

1. `title` is the page's title. It names the tab.
2. `description` is a short description of the page.
3. `author` is the author's name.
4. `pubDate` is when the page was published, in the format RSS 2.0 uses: `Fri, 23 Oct 2026 15:19:45 GMT`.
5. `link` makes the title a link to this address, where the title is shown.
6. `urlPrev` gives the page a left arrow that goes to this address.
7. `urlNext` gives the page a right arrow that goes to this address.
8. `rightMarginImage` is the address of a picture, shown floating at the top right of the text.

BonBon does not draw the title, author or date by itself. The page puts them where it wants them with macros, in Jekyll's form: `{{page.title}}` is replaced by the title, `{{page.author}}` by the author, and so on for any field. A typical page starts like this:

```
---
title: "A Substack experiment"
author: "Dave Winer"
pubDate: "Fri, 13 Nov 2026 15:47:54 GMT"
---
# {{page.title}}

By {{page.author}} on {{page.pubDate}}.

The text of the page starts here.
```

Two rules about pictures, beyond standard Markdown:

1. A paragraph that is only a picture is centered, and its alt text is drawn under it as a caption: `![Emily at her desk](https://example.com/emily.png)`
2. A picture at the head of a paragraph that goes on with text floats at the right of that paragraph: `![Emily](https://example.com/emily.png) This is the text of the paragraph.`

Other things to know:

1. Links between pages can be relative.
2. HTML in the file is thrown away. Don't use it for layout; there is no layout to control. That's the point.
3. An address that ends in a slash shows whatever the server sends for the folder. If the server sends a Content-Location header saying which file that was, BonBon uses it to find the page in the table of contents.

## Writing a site for BonBon

A site is a folder of pages on a web server. Two optional files, both in a folder named `.well-known` at the top of the site, tell BonBon more.

`.well-known/toc.opml` is the table of contents, an OPML outline whose lines link to the site's pages.

1. BonBon asks for it once per site, the way a browser asks for favicon.ico.
2. A page that names no `urlPrev` or `urlNext` gets its arrows from the outline: the line before it and the line after it.
3. An outline can pull in another with an include node, `<outline type="include" url="..."/>`, so the outline at the top of a domain can bring in the one for each folder, and one domain can hold several collections of writing.
4. Examples: https://dave.writersweb.org/.well-known/toc.opml and https://dave.writersweb.org/scripting/.well-known/toc.opml

`.well-known/bonbon.json` is where a site tells BonBon about itself. It's JSON, and every item is optional:

1. `urlSearch` is the address of the site's search. BonBon adds `?q=` and the word, and expects a Markdown page of results back.
2. `urlUpdateSocket` is the address of a websocket. BonBon sends `watch ` and a page's address, and reloads the page when it hears `update` for that address.
3. `urlMirrorOf` is the address of the HTML site this one is the Markdown version of. A link to a page there goes to the same page here when there is one.
4. `cname` is the name the site's owner would like for it, for a site served from a GitHub repo: `"cname": "kim.bloatware.org"`.

An example: https://dave.writersweb.org/scripting/.well-known/bonbon.json

A folder with its own toc.opml can have its own bonbon.json beside it.

Where to put a site: any web server that sends `.md` files as `text/markdown; charset=utf-8` will do.
Dave's own reference for writers, which he keeps current: https://dave.writersweb.org/docs.md
