# mdVaultRead

*This page was written by Claude, working with Dave Winer.*

## How to use it

An Obsidian vault is a folder of Markdown files, often kept in a public repo on GitHub. Put the vault's GitHub address in the `url` parameter:

`https://vaultread.bonbonweb.org/?url=https://github.com/obsidianmd/obsidian-help/blob/master/en/Home.md`

To read it without installing anything, open it in the BonBon demo:

[https://demo.bonbonweb.org/?url=https%3A%2F%2Fvaultread.bonbonweb.org%2F%3Furl%3Dhttps%253A%252F%252Fgithub.com%252Fobsidianmd%252Fobsidian-help%252Fblob%252Fmaster%252Fen%252FHome.md](https://demo.bonbonweb.org/?url=https%3A%2F%2Fvaultread.bonbonweb.org%2F%3Furl%3Dhttps%253A%252F%252Fgithub.com%252Fobsidianmd%252Fobsidian-help%252Fblob%252Fmaster%252Fen%252FHome.md)

## What address to give it

1. A repo, `https://github.com/owner/repo`. You get a list of the vault's pages, by folder, each a link.
2. A folder in a repo, `https://github.com/owner/repo/tree/main/folder`. The same list, for that folder. Use this when the vault isn't at the top of the repo.
3. A page, `https://github.com/owner/repo/blob/main/folder/Page.md`. You get the page.

These are the addresses in your browser's address bar when you're looking at the repo on GitHub.

## What it does to a page

1. `[[Page name]]` becomes a link to that page. The link comes back through mdVaultRead, so the next page gets the same treatment.
2. `[[Page name|other words]]` becomes a link that says other words.
3. `[[Page name#Heading]]` becomes a link to the page, pointed at the heading.
4. A link to a page that hasn't been written shows as its words, not a link.
5. The page's ordinary links and pictures, the ones written relative to the file, are made whole so they still work.
6. The file's name goes at the top as the headline, as Obsidian shows it, when the page doesn't have one.
7. At the bottom, the way back up: the vault and each folder above the page, and a link to the page on GitHub.

## What it doesn't do

1. `![[Page name]]`, a page or picture placed inside another, is left as it is.
2. Callouts, `> [!note]`, are left as they are. They show as quoted text.
3. It doesn't save anything. Each time you ask, it reads the page from GitHub. It remembers a vault's list of files for an hour, because GitHub limits how often we can ask for it.
4. It reads public repos only.

## Vaults to try

1. Obsidian's own help: `https://github.com/obsidianmd/obsidian-help/tree/master/en`
2. Steph Ango's vault template: `https://github.com/kepano/kepano-obsidian`
3. The Obsidian Hub, the community's vault, very big: `https://github.com/community-archive/obsidian-hub`

## Running your own

It's a Node app. `npm install`, then run `mdvaultread.js` with the port in the `PORT` environment variable. Under PagePark, put the folder in the domains folder and PagePark starts it and gives it a port.

`config.json` has two settings: `urlDefaultVault`, the vault shown when the address doesn't name one, and `cacheMinutes`, how long a vault's list of files is remembered.

It's the sibling of [mdFeedRead](https://github.com/scripting/bonBon/tree/main/utils/mdFeedRead), which does this for RSS feeds.

## Questions and comments

Dave wrote about mdVaultRead in an issue on the BonBon repo: [Pieces joined: Obsidian vaults and BonBon](https://github.com/scripting/bonBon/issues/28). That's the place for questions and comments.
