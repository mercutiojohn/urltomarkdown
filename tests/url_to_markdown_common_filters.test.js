const filters = require('../url_to_markdown_common_filters.js');

const test_markdown = "![photo](https://upload.wikimedia.org/wikipedia/en/thumb/1/1b/photo.svg/20px-photo.svg.png)";
const expected_markdown = "![photo](https://upload.wikimedia.org/wikipedia/en/1/1b/photo.svg)";

test('filter', () => {
		let filtered_markdown = filters.filter("https://en.wikipedia.org/wiki/test", test_markdown);
		expect(filtered_markdown).toBe(expected_markdown);
});

test('strip style and script blocks', () => {
	const test_html_with_styleblock =
		"<html><head><script>var url = window.location;</script></head><body><style>p { font-weight: bold; }</style><p>Bold?</p></body></html>";

	const expected_html =
		"<html><head></head><body><p>Bold?</p></body></html>";

	let output_html = filters.strip_style_and_script_blocks(test_html_with_styleblock);
	expect(output_html).toBe(expected_html);
})

test('filter removes unwanted spacing inside links', () => {
	let input = "[\n  link text \n](https://example.com/page)";
	let output = filters.filter("https://example.com", input);
	expect(output).toBe("[link text ](https://example.com/page)");
});

test('filter separates links that are stuck together', () => {
	let input = "[first](https://example.com/a)[second](https://example.com/b)";
	let output = filters.filter("https://example.com", input);
	expect(output).toBe("[first](https://example.com/a)\n[second](https://example.com/b)");
});

test('filter adds a missing scheme to protocol-relative links', () => {
	let input = "[home](//example.com/page)";
	let output = filters.filter("https://example.com", input);
	expect(output).toBe("[home](https://example.com/page)");
});

test('filter makes relative urls absolute using the source domain', () => {
	let input = "[about](/about-us)";
	let output = filters.filter("https://example.com/section/page", input);
	expect(output).toBe("[about](https://example.com/about-us)");
});

test('filter strips inline links and reference numbers when ignore_links is set', () => {
	let input = "See [the docs](https://example.com/docs) for more[1].";
	let output = filters.filter("https://example.com", input, true);
	expect(output).toBe("See the docs for more[1].");
});

test('filter leaves non-matching domains alone besides global rules', () => {
	let input = "[edit](https://example.com/edit)";
	let output = filters.filter("https://example.com", input);
	expect(output).toBe(input);
});

test('filter strips wikipedia edit links and citation refs', () => {
	let input = "History[edit](https://en.wikipedia.org/w/index.php?title=Test&action=edit&section=1 \"Edit section: History\")\n" +
		"Some claim[1](#cite_ref-1)";
	let output = filters.filter("https://en.wikipedia.org/wiki/Test", input);
	expect(output).toBe("History\nSome claim");
});

test('filter converts wikipedia setext-style headings back to hyphen-matched underlines', () => {
	let input = "\nHistory\n--------------------------------\n";
	let output = filters.filter("https://en.wikipedia.org/wiki/Test", input);
	expect(output).toBe("\nHistory\n-------\n");
});

test('filter enlarges medium thumbnail image widths', () => {
	let input = "![cover](https://miro.medium.com/max/60/1*abc123.png)";
	let output = filters.filter("https://medium.com/@author/post", input);
	expect(output).toBe("![cover](https://miro.medium.com/max/600/1*abc123.png)");
});

test('filter collapses medium linked figure captions', () => {
	let input = "[![alt text](https://miro.medium.com/max/600/1*abc.png)](https://miro.medium.com/max/600/1*abc.png?q=20)";
	let output = filters.filter("https://medium.com/@author/post", input);
	expect(output).toBe(
		"\n![alt text](https://miro.medium.com/max/600/1*abc.png)\n[alt text](https://miro.medium.com/max/600/1*abc.png)\n\n"
	);
});

test('filter strips the stackoverflow related-links block', () => {
	let input = "Question body text\n* Links\nsome junk here\nThree | of something\nMore answer text";
	let output = filters.filter("https://stackoverflow.com/questions/1/test", input);
	expect(output).toBe("Question body text\n of something\nMore answer text");
});

test('filter with no url still applies default (non-domain-specific) rules', () => {
	let input = "[\n padded \n](https://example.com)";
	let output = filters.filter(undefined, input);
	expect(output).toBe("[padded ](https://example.com)");
});

test('strip style and script blocks removes multiple and multiline blocks', () => {
	let input = "<style>\n.a { color: red; }\n</style><p>keep</p><script>\nconsole.log(1);\n</script><script>console.log(2);</script>";
	let output = filters.strip_style_and_script_blocks(input);
	expect(output).toBe("<p>keep</p>");
});
