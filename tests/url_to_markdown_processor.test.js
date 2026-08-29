const processor = require('../url_to_markdown_processor.js');
const JSDOM = require('jsdom').JSDOM;

function fake_res() {
	let headers = {};
	return {
		header: (name, value) => { headers[name] = value; },
		headers
	};
}

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
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		"http://some.url", doc, res, "", { inline_title: true, ignore_links: false }
	);

	expect(actual_markdown_output).toBe(expected_markdown_output);
})

test('process html without inlining title still sets X-Title header', () => {
	const doc = new JSDOM(test_html_document);
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		"http://some.url", doc, res, "", { inline_title: false, ignore_links: false }
	);

	expect(actual_markdown_output.startsWith("# test page")).toBe(false);
	expect(res.headers['X-Title']).toBe(encodeURIComponent('test page'));
});

test('process html with ignore_links strips the link but keeps the image', () => {
	const doc = new JSDOM(test_html_document);
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		"http://some.url", doc, res, "", { inline_title: false, ignore_links: true }
	);

	expect(actual_markdown_output).not.toContain('](http://some.url/link)');
	expect(actual_markdown_output).toContain('link');
	// note: the ignore_links filter also strips the URL out of image markdown,
	// leaving just the alt text - this mirrors the current filter behaviour.
	expect(actual_markdown_output).toContain('!photo');
	expect(actual_markdown_output).not.toContain('http://some.url/img');
});

test('process html defaults options when none are given explicitly', () => {
	const doc = new JSDOM(test_html_document);
	const res = fake_res();

	let actual_markdown_output = processor.process_dom("http://some.url", doc, res, "", {});

	expect(actual_markdown_output).toBe(expected_markdown_output);
});

test('process html handles a missing title gracefully', () => {
	const doc = new JSDOM("<html><body><p>no title here</p></body></html>");
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		"http://some.url", doc, res, "", { inline_title: true }
	);

	expect(actual_markdown_output).toBe("no title here");
	expect(res.headers['X-Title']).toBeUndefined();
});

test('process html scoped to an element id only converts that fragment', () => {
	const html =
		"<html><head><title>full page</title></head><body>" +
		"<div id='nav'>navigation</div>" +
		"<div id='main'><p>main content only</p></div>" +
		"</body></html>";
	const doc = new JSDOM(html);
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		"http://some.url", doc, res, "main", { inline_title: false, improve_readability: false }
	);

	expect(actual_markdown_output).toBe("main content only");
	expect(actual_markdown_output).not.toContain("navigation");
});

test('process html with clean disabled skips Readability extraction', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<nav>site nav</nav><p>real content</p><footer>footer text</footer>" +
		"</body></html>";
	const doc = new JSDOM(html);
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		"http://some.url", doc, res, "", { inline_title: false, improve_readability: false }
	);

	expect(actual_markdown_output).toContain("site nav");
	expect(actual_markdown_output).toContain("real content");
	expect(actual_markdown_output).toContain("footer text");
});

test('process html converts embedded tables via the table formatter', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<table><tr><td>One</td><td>Two</td></tr><tr><td>1</td><td>2</td></tr></table>" +
		"</body></html>";
	const doc = new JSDOM(html);
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		"http://some.url", doc, res, "", { inline_title: false, improve_readability: false }
	);

	expect(actual_markdown_output).toContain("|One|Two|");
});

test('process html converts embedded code blocks via the codeblock formatter', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<pre><code>const x = 1;</code></pre>" +
		"</body></html>";
	const doc = new JSDOM(html);
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		"http://some.url", doc, res, "", { inline_title: false, improve_readability: false }
	);

	expect(actual_markdown_output).toContain("```");
	expect(actual_markdown_output).toContain("const x = 1;");
});

test('process html applies domain-specific filters via the url', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<p><a href='/relative-page'>relative link</a></p>" +
		"</body></html>";
	const doc = new JSDOM(html);
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		"https://example.com/section/page", doc, res, "", { inline_title: false }
	);

	expect(actual_markdown_output).toContain("[relative link](https://example.com/relative-page)");
});

test('process html with no url skips domain-specific filtering', () => {
	const html =
		"<html><head><title>t</title></head><body>" +
		"<p><a href='/relative-page'>relative link</a></p>" +
		"</body></html>";
	const doc = new JSDOM(html);
	const res = fake_res();

	let actual_markdown_output = processor.process_dom(
		undefined, doc, res, "", { inline_title: false }
	);

	expect(actual_markdown_output).toContain("[relative link](/relative-page)");
});
