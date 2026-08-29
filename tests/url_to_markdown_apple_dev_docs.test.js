const apple_dev_parser = require('../url_to_markdown_apple_dev_docs.js');
const real_swift_array_json = require('./fixtures/apple_swift_array.json');

const swift_array_docs_url = "https://developer.apple.com/documentation/swift/array";
const expected_location_of_json = "https://developer.apple.com/tutorials/data/documentation/swift/array.json";

test('parse apple url', () => {
	let location_of_json = apple_dev_parser.dev_doc_url(swift_array_docs_url);
	expect(location_of_json).toBe(expected_location_of_json);
});

test('parse apple url with trailing slash', () => {
	let location_of_json = apple_dev_parser.dev_doc_url(swift_array_docs_url + "/");
	expect(location_of_json).toBe(expected_location_of_json);
});

test('parse apple url with query string', () => {
	let location_of_json = apple_dev_parser.dev_doc_url(swift_array_docs_url + "?changes=latest_minor");
	expect(location_of_json).toBe(expected_location_of_json);
});

test('parse dev doc json with inline title', () => {
	const json = {
		metadata: { title: 'Array' },
		primaryContentSections: []
	};
	let markdown = apple_dev_parser.parse_dev_doc_json(json, true, false);
	expect(markdown).toBe("# Array\n\n");
});

test('parse dev doc json without inline title', () => {
	const json = {
		metadata: { title: 'Array' },
		primaryContentSections: []
	};
	let markdown = apple_dev_parser.parse_dev_doc_json(json, false, false);
	expect(markdown).toBe("");
});

test('parse dev doc json falls back to sections when primaryContentSections is absent', () => {
	const json = {
		sections: [
			{ kind: 'hero', title: 'Array' }
		]
	};
	let markdown = apple_dev_parser.parse_dev_doc_json(json, false, false);
	expect(markdown).toBe("# Array\n");
});

test('parse dev doc json handles heading, paragraph and codeListing content', () => {
	const json = {
		primaryContentSections: [
			{
				kind: 'content',
				content: [
					{ type: 'heading', level: 2, text: 'Overview' },
					{ type: 'paragraph', inlineContent: [ { type: 'text', text: 'Some text.' } ] },
					{ type: 'codeListing', code: [ 'let x = 1', 'let y = 2' ] }
				]
			}
		]
	};
	let markdown = apple_dev_parser.parse_dev_doc_json(json, false, false);
	expect(markdown).toBe(
		"## Overview\n\nSome text.\n\n\n```\nlet x = 1\nlet y = 2\n```\n\n"
	);
});

test('parse dev doc json renders links, or plain titles when ignore_links is set', () => {
	const json_with_link = {
		primaryContentSections: [
			{
				kind: 'content',
				content: [
					{
						type: 'paragraph',
						inlineContent: [
							{ type: 'link', title: 'Element', destination: 'https://developer.apple.com/documentation/swift/element' }
						]
					}
				]
			}
		]
	};
	let with_links = apple_dev_parser.parse_dev_doc_json(json_with_link, false, false);
	expect(with_links).toBe("[Element](https://developer.apple.com/documentation/swift/element)\n\n");

	let without_links = apple_dev_parser.parse_dev_doc_json(json_with_link, false, true);
	expect(without_links).toBe("Element\n\n");
});

test('parse dev doc json resolves reference identifiers', () => {
	const json = {
		references: {
			'doc://com.apple.documentation/documentation/swift/element': { title: 'Element' }
		},
		primaryContentSections: [
			{
				kind: 'content',
				content: [
					{
						type: 'paragraph',
						inlineContent: [
							{ type: 'reference', identifier: 'doc://com.apple.documentation/documentation/swift/element' }
						]
					}
				]
			}
		]
	};
	let markdown = apple_dev_parser.parse_dev_doc_json(json, false, false);
	expect(markdown).toBe("Element\n\n");
});

test('parse dev doc json renders declarations with languages and platforms', () => {
	const json = {
		primaryContentSections: [
			{
				kind: 'declarations',
				declarations: [
					{
						tokens: [ { text: 'struct ' }, { text: 'Array<Element>' } ],
						languages: [ 'swift' ],
						platforms: [ 'iOS', 'macOS' ]
					}
				]
			}
		]
	};
	let markdown = apple_dev_parser.parse_dev_doc_json(json, false, false);
	expect(markdown).toBe("struct Array<Element> \nLanguages: swift \nPlatforms: iOS, macOS\n\n");
});

test('parse dev doc json handles unordered and ordered lists', () => {
	const json = {
		primaryContentSections: [
			{
				kind: 'content',
				content: [
					{
						type: 'unorderedList',
						items: [
							{ content: [ { type: 'paragraph', inlineContent: [ { type: 'text', text: 'first' } ] } ] },
							{ content: [ { type: 'paragraph', inlineContent: [ { type: 'text', text: 'second' } ] } ] }
						]
					},
					{
						type: 'orderedList',
						items: [
							{ content: [ { type: 'paragraph', inlineContent: [ { type: 'text', text: 'one' } ] } ] },
							{ content: [ { type: 'paragraph', inlineContent: [ { type: 'text', text: 'two' } ] } ] }
						]
					}
				]
			}
		]
	};
	let markdown = apple_dev_parser.parse_dev_doc_json(json, false, false);
	expect(markdown).toBe(
		"* first\n\n* second\n\n1. one\n\n2. two\n\n"
	);
});

test('parse dev doc json on a real captured Apple documentation payload', () => {
	let markdown = apple_dev_parser.parse_dev_doc_json(real_swift_array_json, true, false);
	expect(markdown.startsWith("# Array\n\n")).toBe(true);
	expect(markdown).toContain("## Overview");
	expect(markdown).toContain("```");
	expect(markdown.length).toBeGreaterThan(1000);
});

test('parse dev doc json handles missing/empty input gracefully', () => {
	expect(apple_dev_parser.parse_dev_doc_json({}, true, false)).toBe("");
});
