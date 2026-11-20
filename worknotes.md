#### 11/20/26; 8:32:16 AM by DW

We should have an RSS 2.0 feed for updates, but for now this worknotes.md file will have to do. I will try to keep it current. 

Version 0.6.55 is released. 

Files ending with .js or .json are rendered as listings. 

New [demo](https://github.com/scripting/bonBon/blob/main/demos/bloginmarkdown/readme.md) with the Markdown source for the Scripting News in Markdown website, a snapshot from yesterday. Should provide a decent example for developers trying to convert the output of a CMS from HTML to Markdown.  

Main feature -- this is the first release where we have released the JavaScript code for the Electron app.  

We're using the MIT License. I want there to be quick growth in the Markdown web, and this is a way to drive it. We will keep moving the app forward, lots of plans for things to do here, and at least one of them will come out in the next few days. I am serious about doing for text what we did for talk radio with podcasting. And we're looking for people to fill in the blank areas, we could use some serious Markdown editors with storage, designed for publishing apps. 

#### 11/19/26; 6:57:03 PM by DW

As part of getting BonBon ready for the world, we converted a few websites from HTML to Markdown. 

Not just the files, but the structures -- the home page, the monthly archive, daily pages, and story pages and more. 

I'm seeing people start to experiment with making their own sites. I want to show them how we did it with Scripting News.

#### This is [where you go](https://github.com/scripting/bonBon/blob/main/demos/bloginmarkdown/readme.md). 

#### 11/19/26; 2:48:53 PM by DW

The Mac app has its icon back, the Black Lab, which 0.6.52 and 0.6.53 shipped without. It's back in 0.6.54. 

A bon:// link is a link that opens in BonBon. Click one in Chrome, in email, anywhere on the Mac, and BonBon comes to the front showing that page. Example below. 

* bon://dave.writersweb.org/worknotes.md

The startup script calls hitCounter function. 

#### 11/18/26; 5:16:23 PM by DW -- v0.6.53

A page that a server sends zipped now shows as a normal page.

On reload the text stays in place, it no longer jumps to the left edge and back.

The brief clear between pages is gone, the old page stays until the new one replaces it.

The Markdown copy of Scripting News now takes its posts from the feed, and hears about a new one from FeedLand’s socket.

The Mac app is now signed with a Developer ID and checked by Apple, so macOS opens it without saying it’s damaged.

#### 11/18/26; 10:41:19 AM by DW

Added note to Mac download instructions, if the system says the file is damaged. 

#### 11/14/26; 9:12:30 AM by DW

Started work on this.

Fixed problem in build script call.

