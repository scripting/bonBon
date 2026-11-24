# bonbonSiteBuilder

*This readme and the code in this folder were written by Claude, working with Dave Winer.*

Makes a [BonBon](https://github.com/scripting/bonBon) blog, a site made of Markdown files, for every person on an [rss.chat](https://github.com/scripting/rss.chat) server, and keeps each blog current as the person posts.

You join chat.bonbon.blog as bull. Your blog is at bull.bonbon.blog, with nothing to set up. You post in chat.bonbon.blog, and a second or two later the post is on your blog.

It's optional. BonBon reads any Markdown site, however it was made. This is one way to make one.

### How the two fit together

The server and the builder don't know about each other. The server puts out a feed for each person, and one OPML file that lists the feeds. The builder reads the list to find out who's there, and reads each feed to get the posts. Point it at another server's list and it makes blogs for that community.

Nothing in it is specific to rss.chat. Any app that puts out feeds with the Markdown text of each post, and a list of the feeds, would work the same way.

### Running it

1. `npm install`
2. Edit `config.json`.
3. `node bonbonsitebuilder.js` and leave it running.

The first run reads the list, reads every feed, writes a post file for every item, and builds every blog. After that it reads the list and each feed every `ctMinutesBetwPolls`, and reads a feed the moment the feed's cloud server says it changed. A blog is rebuilt only when one of its posts is new or changed, and only the files that changed are written.

### config.json

```json
{
	"myDomain": "build.bonbon.blog",
	"opmlListUrl": "https://chat.bonbon.blog/data/subs.opml",
	"blogsDomain": "bonbon.blog",
	"blogsFolder": "../",
	"reservedNames": ["chat", "build", "www"],
	"ctMinutesBetwPolls": 1
	}
```

1. `myDomain`: this app's address on the web, where a feed's cloud server sends its notifications. Without one there's no rssCloud, only the poll.
2. `opmlListUrl`: the address of the server's list of everyone's feeds. On an rss.chat server it's `/data/subs.opml`. Each feed in the list gets a blog.
3. `blogsDomain`: what goes after the person's name in a blog's address. With `bonbon.blog`, bull's blog is `bull.bonbon.blog`. Every name at that domain has to point at the machine the blogs are served from.
4. `blogsFolder`: where the blogs' folders are made. Each folder is named for the blog's address, `bull.bonbon.blog`.
5. `reservedNames`: names that never become a blog, the ones the domain uses for something else.
6. `ctMinutesBetwPolls` (15): how often the list and every feed are read, whether or not the cloud server has called.
7. `timeZone` (`America/New_York`): a post's day, for the day and month pages, is the day in this zone. One zone for every blog.
8. `maxDaysOnHomePage` (25): the home page shows this many days, newest first.
9. `blogs`: blogs that aren't in the list, for a feed from somewhere else. One entry per blog, each with `urlFeed`, `urlSite` and `outputFolder`.
10. `port`: the http port, for a run by hand. On a PagePark server the `PORT` environment variable wins.

### A person's name and their blog's address

A name on an rss.chat server can have capital letters, an underscore or a period. A domain name can't have an underscore. So the name is made lowercase, and anything that isn't a letter, a number or a hyphen becomes a hyphen: Bull_Mancuso's blog is `bull-mancuso.bonbon.blog`.

Two names can come out the same, Bull_Mancuso and bull.mancuso. The first one in the list gets the address, and the log says the second couldn't have it.

### What goes on a blog

1. Every item in the feed that isn't a reply. An item with `source:inReplyTo` is left out.
2. A post with a title gets its title as a heading. A post without one is its text.
3. A linkblog post, an item whose link goes somewhere else, keeps that link in its front matter. When it has no title, the link's domain is added on a line of its own at the end of the text, linked to the story.
4. The Markdown comes from the feed's `source:markdown` element when it has one, and is converted from the HTML in `description` when it doesn't.
5. An edited post changes on the blog too, as long as it's still in the feed. A feed carries only its newest items.
6. A deleted post stays on the blog. A feed has no way to say a post was deleted.

The app keeps every item it has seen, in `data/`, so a blog grows as its feed rolls over.

### The pages

The same pages Dave's Scripting News site has as a BonBon site, made by the same code, `generator.js`:

1. A file per post, `2026/10/28/572.md`, with front matter: `title`, `author`, `pubDate`, `source`, `guid`, `link`, `urlPrev`, `urlNext`, `urlParent`.
2. A page per day, `2026/10/28.md`, every post of the day in full.
3. A page per month, `2026/10/index.md`.
4. The home page, `index.md`, the newest days.
5. `.well-known/toc.opml`, the table of contents BonBon shows as a calendar.
6. `rss.xml`, a feed of the blog's newest 50 posts.

### Serving the blogs

The blogs are folders of files. Any web server can serve them, as long as a `.md` file goes out as it is, as text.

On [PagePark](https://github.com/scripting/pagepark), put this app in a folder in the domains folder and leave `blogsFolder` as `../`. Each blog's folder is then a domain folder PagePark serves by its name. When the builder makes a blog's folder it puts a `config.json` in it that tells PagePark to send the Markdown files out as they are, and to give `index.md` for the address alone. Another web server ignores that file.

### The http interface

1. `/` or `/now`: what's running, each feed, when it was last read, how many posts.
2. `/blogs`: the same as JSON.
3. `/readfeed`: read every feed now; `/readfeed?url=<feed>` for one.
4. `/rebuild`: build every blog from its saved posts; `?url=<feed>` for one.
5. `/laststats?url=<feed>`: what the last build of that blog did.
6. `/feedupdated`: the rssCloud server's door.
