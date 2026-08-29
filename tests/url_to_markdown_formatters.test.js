const formatters = require('../url_to_markdown_formatters.js');

const test_html_table =
	"<html><body><table>"+
	"<tr><td>One</td><td>Two</td></tr>"+
	"<tr><td>1</td><td>2</td></tr>"+
	"</table></body></html>";

const expected_markdown_table =
	"\n|One|Two|\n|---|---|\n|1  |2  |\n";

test('format table', () => {
	let replacements = [];
	formatters.format_tables(test_html_table, replacements);
	let output_markdown_table = replacements[0].replacement;
	expect(output_markdown_table).toBe(expected_markdown_table);
});

test('format table replaces the table in the html with a placeholder', () => {
	let replacements = [];
	let output_html = formatters.format_tables(test_html_table, replacements);
	expect(output_html).toContain(replacements[0].placeholder);
	expect(output_html).not.toContain("<table>");
});

test('format table handles multiple tables and appends to existing replacements', () => {
	let html = "<div><table><tr><td>A</td></tr><tr><td>B</td></tr></table></div>" +
		"<div><table><tr><td>C</td></tr><tr><td>D</td></tr></table></div>";
	let replacements = [ { placeholder: "existing", replacement: "existing markdown" } ];
	let output_html = formatters.format_tables(html, replacements);
	expect(replacements.length).toBe(3);
	expect(output_html).not.toContain("<table>");
	expect(replacements[1].replacement).toContain("A");
	expect(replacements[2].replacement).toContain("C");
});

test('format table with no tables leaves html untouched and adds no replacements', () => {
	let html = "<div><p>no tables here</p></div>";
	let replacements = [];
	let output_html = formatters.format_tables(html, replacements);
	expect(output_html).toBe(html);
	expect(replacements.length).toBe(0);
});

const test_html_codeblock =
	"<html><body><pre><code>" +
	"#include &lt;stdio.h&gt;\n" +
	"int main() {\n" +
	"\tprintf(\"hello world\");\n" +
	"}" +
	"</code></pre></body></html>";

const expected_markdown_codeblock =
	"```\n#include <stdio.h>\nint main() {\n\tprintf(\"hello world\");\n}\n```\n";

test('format code block', () => {
	let replacements = [];
	formatters.format_codeblocks(test_html_codeblock, replacements);
	let output_markdown_codeblock = replacements[0].replacement;
	expect(output_markdown_codeblock).toBe(expected_markdown_codeblock);
})

test('format code block converts <br> and <p> tags to newlines', () => {
	let html = "<pre>line one<br>line two<p>line three</p></pre>";
	let replacements = [];
	formatters.format_codeblocks(html, replacements);
	expect(replacements[0].replacement).toBe("```\nline one\nline two\nline three\n```\n");
});

test('format code block strips any remaining tags and decodes entities', () => {
	let html = "<pre><span class=\"kw\">const</span> x = &amp;y &lt;3&gt;;</pre>";
	let replacements = [];
	formatters.format_codeblocks(html, replacements);
	expect(replacements[0].replacement).toBe("```\nconst x = &y <3>;\n```\n");
});

test('format code block with no pre blocks leaves html untouched', () => {
	let html = "<div><p>no code here</p></div>";
	let replacements = [];
	let output_html = formatters.format_codeblocks(html, replacements);
	expect(output_html).toBe(html);
	expect(replacements.length).toBe(0);
});

test('format code block replaces each block with a distinct placeholder', () => {
	let html = "<pre>first</pre><pre>second</pre>";
	let replacements = [];
	let output_html = formatters.format_codeblocks(html, replacements);
	expect(replacements.length).toBe(2);
	expect(replacements[0].placeholder).not.toBe(replacements[1].placeholder);
	expect(output_html).toContain(replacements[0].placeholder);
	expect(output_html).toContain(replacements[1].placeholder);
});
