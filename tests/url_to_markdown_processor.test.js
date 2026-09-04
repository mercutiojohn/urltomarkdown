const processor = require('../url_to_markdown_processor.js');
const JSDOM = require('jsdom').JSDOM;

const test_html_document =
	"<html><head><title>test page</title></head>" +
	"<body><p>first paragraph</p>" +
	"<h2>heading 2</h2><p>second paragraph</p>" +
	"<h3>heading 3</h3><p>third paragraph</p>" +
	"<p><em>italics</em> <strong>bold</strong></p>" +
	"<p><a href='http://some.url/link'>link</a></p>" +
	"<p><img alt='photo' src='http://some.url/img'></img></p>" +
	"</body></html>";

const expected_markdown_output =
	"# test page\nfirst paragraph\n\nheading 2\n---------\n\nsecond paragraph\n\n" +
	"### heading 3\n\nthird paragraph\n\n_italics_ **bold**\n\n" +
	"[link](http://some.url/link)\n\n![photo](http://some.url/img)";

test('process html with title inlined', () => {
	const doc = new JSDOM(test_html_document);

	let { markdown } = processor.process_dom(
		"http://some.url", doc, "", { inline_title: true, ignore_links: false }
	);

	expect(markdown).toBe(expected_markdown_output);
})

test('process html without inlining title still returns the title', () => {
	const doc = new JSDOM(test_html_document);

	let { markdown, title } = processor.process_dom(
		"http://some.url", doc, "", { inline_title: false, ignore_links: false }
	);

	expect(markdown.startsWith("# test page")).toBe(false);
	expect(title).toBe(encodeURIComponent('test page'));
});

test('process html with ignore_links strips the link but keeps the image', () => {
	const doc = new JSDOM(test_html_document);

	let { markdown } = processor.process_dom(
		"http://some.url", doc, "", { inline_title: false, ignore_links: true }
	);

	expect(markdown).not.toContain('](http://some.url/link)');
	expect(markdown).toContain('link');
	// note: the ignore_links filter also strips the URL out of image markdown,
	// leaving just the alt text - this mirrors the current filter behaviour.
	expect(markdown).toContain('!photo');
	expect(markdown).not.toContain('http://some.url/img');
});

test('process html defaults options when none are given explicitly', () => {
	const doc = new JSDOM(test_html_document);

	let { markdown } = processor.process_dom("http://some.url", doc, "", {});

	expect(markdown).toBe(expected_markdown_output);
});

test('process html handles a missing title gracefully', () => {
	const doc = new JSDOM("<html><body><p>no title here</p></body></html>");

	let { markdown, title } = processor.process_dom(
		"http://some.url", doc, "", { inline_title: true }
	);

	expect(markdown).toBe("no title here");
	expect(title).toBeNull();
});

test('process html scoped to an element id only converts that fragment', () => {
	const html =
		"<html><head><title>full page</title></head><body>" +
		"<div id='nav'>navigation</div>" +
		"<div id='main'><p>main content only</p></div>" +
		"</body></html>";
	const doc = new JSDOM(html);

	let { markdown } = processor.process_dom(
		"http://some.url", doc, "main", { inline_title: false, improve_readability: false }
	);

	expect(markdown).toBe("main content only");
	expect(markdown).not.toContain("navigation");
});

test('process html with clean disabled skips Readability extraction', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<nav>site nav</nav><p>real content</p><footer>footer text</footer>" +
		"</body></html>";
	const doc = new JSDOM(html);

	let { markdown } = processor.process_dom(
		"http://some.url", doc, "", { inline_title: false, improve_readability: false }
	);

	expect(markdown).toContain("site nav");
	expect(markdown).toContain("real content");
	expect(markdown).toContain("footer text");
});

test('process html converts embedded tables via the table formatter', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<table><tr><td>One</td><td>Two</td></tr><tr><td>1</td><td>2</td></tr></table>" +
		"</body></html>";
	const doc = new JSDOM(html);

	let { markdown } = processor.process_dom(
		"http://some.url", doc, "", { inline_title: false, improve_readability: false }
	);

	expect(markdown).toContain("|One|Two|");
});

test('process html converts embedded code blocks via the codeblock formatter', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<pre><code>const x = 1;</code></pre>" +
		"</body></html>";
	const doc = new JSDOM(html);

	let { markdown } = processor.process_dom(
		"http://some.url", doc, "", { inline_title: false, improve_readability: false }
	);

	expect(markdown).toContain("```");
	expect(markdown).toContain("const x = 1;");
});

test('process html applies domain-specific filters via the url', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<p><a href='/relative-page'>relative link</a></p>" +
		"</body></html>";
	const doc = new JSDOM(html);

	let { markdown } = processor.process_dom(
		"https://example.com/section/page", doc, "", { inline_title: false }
	);

	expect(markdown).toContain("[relative link](https://example.com/relative-page)");
});

test('process html with no url skips domain-specific filtering', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<p><a href='/relative-page'>relative link</a></p>" +
		"</body></html>";
	const doc = new JSDOM(html);

	let { markdown } = processor.process_dom(
		undefined, doc, "", { inline_title: false }
	);

	expect(markdown).toContain("[relative link](/relative-page)");
});
