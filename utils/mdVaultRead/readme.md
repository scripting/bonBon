# mdVaultRead

*This page was written by Claude, working with Dave Winer.*

An Obsidian vault is a folder of Markdown files, and many people keep theirs in a public repo on GitHub. You can read the files there, but the links between pages, `[[Page name]]`, only work in Obsidian. mdVaultRead is a small web app that reads a vault on GitHub and hands back each page with those links working, so the vault can be read on the web, page to page.

What it hands back is Markdown, not HTML. To see it as a page you need something that draws Markdown. [BonBon](https://github.com/scripting/bonBon) is a browser for pages written in Markdown, and that's what this was made for.

## Try it

These open in BonBon's demo, which runs in your web browser, nothing to install. You'll see a page from the vault. Click a link and you're on another page of the vault.

1. [Obsidian's own help](https://demo.bonbonweb.org/?url=https%3A%2F%2Fvaultread.bonbonweb.org%2F%3Furl%3Dhttps%253A%252F%252Fgithub.com%252Fobsidianmd%252Fobsidian-help%252Fblob%252Fmaster%252Fen%252FHome.md)
2. [Steph Ango's vault template, the list of its pages](https://demo.bonbonweb.org/?url=https%3A%2F%2Fvaultread.bonbonweb.org%2F%3Furl%3Dhttps%253A%252F%252Fgithub.com%252Fkepano%252Fkepano-obsidian)
3. [The Obsidian Hub, the community's vault](https://demo.bonbonweb.org/?url=https%3A%2F%2Fvaultread.bonbonweb.org%2F%3Furl%3Dhttps%253A%252F%252Fgithub.com%252Fcommunity-archive%252Fobsidian-hub%252Fblob%252Fmain%252F00%252520-%252520Start%252520here.md)

## Use it on your vault

It works on any vault in a public repo on GitHub. The vault doesn't need anything done to it. Private repos can't be read.

The address is `https://vaultread.bonbonweb.org/?url=` followed by the vault's address on GitHub:

`https://vaultread.bonbonweb.org/?url=https://github.com/owner/repo`

Open it in BonBon, or paste it into the box at [demo.bonbonweb.org](https://demo.bonbonweb.org/).

The GitHub address can be any of these. They're what's in your browser's address bar when you're looking at the repo on GitHub.

1. A repo, `https://github.com/owner/repo`. You get a list of the vault's pages, by folder, each a link.
2. A folder in a repo, `https://github.com/owner/repo/tree/main/folder`. The same list, for that folder. Use this when the vault isn't at the top of the repo.
3. A page, `https://github.com/owner/repo/blob/main/folder/Page.md`. You get the page.

## What it does to a page

1. `[[Page name]]` becomes a link to that page.
2. `[[Page name|other words]]` becomes a link that says other words.
3. `[[Page name#Heading]]` becomes a link to that heading on the page.
4. A link to a page that hasn't been written shows as its words, not a link.
5. Ordinary Markdown links and pictures that point to other files in the repo are given their full addresses, so they still work.
6. The file's name goes at the top as the headline when the page doesn't have one, as Obsidian shows it.
7. The last line of each page has links to the folders above it and to the vault's list of pages, and a link to the page on GitHub.

## What it doesn't do

1. `![[Page name]]`, a page or picture placed inside another, is left as it is.
2. Callouts, `> [!note]`, are left as they are. They show as quoted text.
3. It doesn't save anything. Each time you ask, it reads the page from GitHub. It remembers a vault's list of files for an hour, because GitHub limits how often a server can ask for it.

## Running your own

vaultread.bonbonweb.org is Dave Winer's server. The code is in this folder, open source, so you can run your own.

It's a Node app. `npm install`, then run `mdvaultread.js` with the port in the `PORT` environment variable. Under [PagePark](https://github.com/scripting/pagePark), Dave's web server, put the folder in the domains folder and PagePark starts it and gives it a port.

`config.json` has two settings: `urlDefaultVault`, the vault shown when the address doesn't name one, and `cacheMinutes`, how long a vault's list of files is remembered.

[mdFeedRead](https://github.com/scripting/bonBon/tree/main/utils/mdFeedRead) is the same idea for RSS feeds: it turns a feed into a page of Markdown.

## Questions and comments

Dave wrote about mdVaultRead in an issue on the BonBon repo: [Pieces joined: Obsidian vaults and BonBon](https://github.com/scripting/bonBon/issues/28). That's the place for questions and comments.
