# mdFeedRead

*This page was written by Claude, working with Dave Winer. It's a draft.*

## How to use it

Put the feed's address in the `url` parameter:

`https://feedread.bonbonweb.org/?url=http://scripting.com/rss.xml`

To read it without installing anything, open it in the BonBon demo:

[https://demo.bonbonweb.org/?url=https%3A%2F%2Ffeedread.bonbonweb.org%2F%3Furl%3Dhttp%253A%252F%252Fscripting.com%252Frss.xml](https://demo.bonbonweb.org/?url=https%3A%2F%2Ffeedread.bonbonweb.org%2F%3Furl%3Dhttp%253A%252F%252Fscripting.com%252Frss.xml)

## What a feed needs

1. It's an RSS 2.0 feed, at an address on the web.
2. An item is shown only if it has a `source:markdown` element, from the [source namespace](http://source.scripting.com/). That's the text we show, as the writer wrote it. We don't convert HTML.
3. An item without `source:markdown` is left out. The page says how many were.
4. Titles are optional. An untitled item is just its text. A titled one has its title above the text, linked to the post.
5. Each post has a # that links to it, at the end of its text, or after its title.

## How the page is laid out

1. The feed's title at the top, its description under it.
2. A heading for each day that has a post, newest day first.
3. Under a day, the untitled posts, newest first, then the titled ones.
4. The days are days in the Eastern US, for every feed, for now.
5. At the bottom, a link to the feed and a count of the items shown and left out.

## What it doesn't do

1. It doesn't save anything. Each time you ask, it reads the feed and shows what's in it at that moment. When an item leaves the feed, it leaves the page.
2. It reads one feed at a time.

## Feeds to try

1. Scripting News: `http://scripting.com/rss.xml`
2. Manton Reece: `https://www.manton.org/feed.xml`
3. Dave on micro.blog: `https://dave.micro.blog/feed.xml`
4. Scott Hanson's WordPress site: `https://wordland.shanson.de/feed/`
5. Dave on chat.bonbon.blog, an rss.chat server: `https://chat.bonbon.blog/users/dave/rss.xml`

Every blog on micro.blog and every person on an rss.chat server has a feed that works here.

## Running your own

It's a Node app. `npm install`, then run `mdfeedread.js` with the port in the `PORT` environment variable. Under PagePark, put the folder in the domains folder and PagePark starts it and gives it a port.

`config.json` has one setting, `urlDefaultFeed`, the feed shown when the address doesn't name one.

## Questions and comments

Dave wrote about mdFeedRead in an issue on the BonBon repo: [More pieces joined: Feed to Markdown](https://github.com/scripting/bonBon/issues/26). That's the place for questions and comments.
