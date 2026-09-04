const table_to_markdown = require('../html_table_to_markdown.js');

test('convert renders a simple two row table', () => {
	let html = "<table><tr><td>One</td><td>Two</td></tr><tr><td>1</td><td>2</td></tr></table>";
	expect(table_to_markdown.convert(html)).toBe("\n|One|Two|\n|---|---|\n|1  |2  |\n");
});

test('convert returns empty string for a table with fewer than 2 rows', () => {
	let html = "<table><tr><td>Only row</td></tr></table>";
	expect(table_to_markdown.convert(html)).toBe("");
});

test('convert returns empty string for a table with no rows', () => {
	let html = "<table></table>";
	expect(table_to_markdown.convert(html)).toBe("");
});

test('convert includes a caption when present', () => {
	let html = "<table><caption>My Table</caption><tr><td>a</td></tr><tr><td>b</td></tr></table>";
	let output = table_to_markdown.convert(html);
	expect(output.startsWith("\nMy Table\n\n")).toBe(true);
});

test('convert normalises rows with uneven column counts', () => {
	let html = "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>";
	let output = table_to_markdown.convert(html);
	expect(output).toContain("|a  |b  |");
	expect(output).toContain("|c  |   |");
});

test('convert cleans html tags and entities from cell content', () => {
	let html = "<table><tr><td><strong>Bold</strong> &amp; text</td><td>Two</td></tr><tr><td>1</td><td>2</td></tr></table>";
	let output = table_to_markdown.convert(html);
	expect(output).toContain("Bold & text");
	expect(output).not.toContain("<strong>");
});

test('convert falls back to an indented list when columns are too wide for a table', () => {
	let wide_cell_1 = "x".repeat(95);
	let wide_cell_2 = "y".repeat(95);
	let html = `<table><tr><th>Header</th><th>${wide_cell_1}</th></tr><tr><td>Row</td><td>${wide_cell_2}</td></tr></table>`;
	let output = table_to_markdown.convert(html);
	expect(output).not.toContain("|");
	expect(output).toContain("* Header: Row");
	expect(output).toContain(`  * ${wide_cell_1}: ${wide_cell_2}`);
});

test('convert supports th header cells the same as td cells', () => {
	let html = "<table><tr><th>Name</th><th>Age</th></tr><tr><td>Ada</td><td>30</td></tr></table>";
	let output = table_to_markdown.convert(html);
	expect(output).toContain("|Name|Age|");
	expect(output).toContain("|Ada |30 |");
});

test('convert does not throw on a row with no cells (e.g. MediaWiki empty placeholder rows)', () => {
	// regression: real Wikipedia pages include rows like
	// <tr class="mw-empty-elt"></tr> with zero td/th cells, which previously
	// crashed the whole conversion process (TypeError: Cannot read properties
	// of null (reading 'length')) because the per-row cell match wasn't
	// guarded against no matches, unlike the row match above it.
	let html = "<table><tr><td>a</td><td>b</td></tr><tr class=\"mw-empty-elt\"></tr><tr><td>c</td><td>d</td></tr></table>";
	expect(() => table_to_markdown.convert(html)).not.toThrow();
	let output = table_to_markdown.convert(html);
	expect(output).toContain("|a  |b  |");
	expect(output).toContain("|c  |d  |");
});
