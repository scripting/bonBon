/*  frontMatter.js -- 10/12/26 by CC

	YAML front matter: a block at the top of a page between two lines of
	three dashes, with a title and whatever else the writer wants there.
	It isn't Markdown, so it comes off before the Markdown is converted,
	and the values go to the shell to do with as it likes. A page with no
	front matter answers an empty object.  */

const yaml = require ("js-yaml");

function splitFrontMatter (theText) { //answers {frontMatter, markdown}
	var frontMatter = {}, markdown = theText;
	const theLines = theText.split ("\n");
	if (theLines [0].trim () === "---") {
		var ixEnd = -1, i;
		for (i = 1; i < theLines.length; i++) {
			const theLine = theLines [i].trim ();
			if ((theLine === "---") || (theLine === "...")) {
				ixEnd = i;
				break;
				}
			}
		if (ixEnd !== -1) {
			const yamlText = theLines.slice (1, ixEnd).join ("\n");
			try {
				const jstruct = yaml.load (yamlText);
				if ((jstruct !== null) && (typeof jstruct === "object")) {
					frontMatter = jstruct;
					}
				}
			catch (err) {
				console.log ("Can't read the front matter because " + err.message);
				}
			markdown = theLines.slice (ixEnd + 1).join ("\n");
			}
		}
	return ({frontMatter, markdown});
	}

exports.splitFrontMatter = splitFrontMatter;
