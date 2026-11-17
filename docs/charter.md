# Charter

When we began work on mdBrowser, which eventually became BonBon, I had a conversation with Claude over a few days to establish a charter for the project because while it is a web browser, it's quite different from the browsers that grew out of the invention of the web by Tim Berners-Lee. 

A few big differences: We display Markdown files not HTML files. There is no place for styling in the Markdown files we show users, but the users can apply style sheets, and we supply five example style sheets with the product. Same with JavaScript, the content has no ability to run script code on the client, but we will add features that let the reader add functionality to the browser via programming. 

As we went along, Claude added to the document. 

So while this was a collaborative effort, the remaining text on this page was written by Claude. One of our principles is that text you read here is human-written unless otherwise stated. 

Dave Winer, November 2026

### What it is

A browser for a web made of Markdown files. It is a pure reading environment: the writer's words, with nothing between them and the reader.

### What a page is

A page is a Markdown file, fetched by URL.

Any HTML in the file is stripped before rendering.

No CSS. A page can't style itself. The browser decides how it looks.

No JavaScript. A page is just a document to be read, not an app.

Both HTTP and HTTPS are supported

### User in control

The content has no power over CSS and JavaScript, but the user has full access to change the appearance, and even automate and add new features.

### How a page is identified

The browser sends Accept: text/markdown, text/x-opml with every request for a page, so a server can return Markdown to this browser and HTML to others from the same URL.

If the server says the content type is text/markdown, it's a page.

If the server says text/plain or a generic binary type, and the path ends in .md or .markdown, it's a page.

If the server returns HTML or XML, the browser shows the source, as text. A link to an HTML page, clicked in a page, opens in the reader's historic browser.

If the server returns a picture, the browser shows the picture.

Anything else is a file, offered for download.

If the page can't be had, a dialog says why, in the server's words when it gave any.

### Images

Images are allowed and are included in the page.

Formats: PNG, JPEG, GIF, WebP. No SVG.

The format is determined by the image file's actual content, not its extension.

### The shell

Markdown inside the shell, around the edges there is an address bar, history and bookmarks menus, and icons in the browser chrome. Icons come from Font Awesome.

Tabs. Each tab holds one page. Clicking a link opens it in the same tab; Cmd-click opens it in a new tab.

### Front matter

A page can begin with a block of YAML between two lines of three dashes. It holds facts about the page: title, author, pubDate, description, and whatever else the writer wants there.

It isn't part of the text. It comes off before the Markdown is rendered.

In the text, {{page.title}} is replaced with the title from the front matter, and the same for any other value.

### Stylesheets

The reader chooses how pages look, from the stylesheets that come with the browser.

The reader can add stylesheets of their own.

### Table of contents

A site can have a table of contents, an OPML outline at /.well-known/toc.opml.

When a site has one, the browser shows arrows on each page that go to the page before it and the page after it.

### What a site says about itself

A site can have a file of settings at /.well-known/bonbon.json.

One of them says where the browser can listen for changes. When a page changes on the server, it's updated in the window.

### Replaceable parts

The Markdown interpreter

* The shell talks to it through a small defined interface, so a different one can be dropped in.

* We use standard open source packages for converting Markdown to HTML, and there will be an API that allows other software to handle the conversion.

Our runtime engine

* We build on Electron with a pinned Chromium, used only for display.

* We don't update it on Google's schedule, and it can be swapped out later.

### Source of truth

The source of truth is the web. When a question comes up about how the browser should behave, the answer is what the web does.

