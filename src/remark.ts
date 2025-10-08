import { sha256 } from "@oslojs/crypto/sha2";
import { slugifyWithCounter } from "@sindresorhus/slugify";
import { parse } from "@std/yaml";
import { D2 } from "@terrastruct/d2";
import { default as GithubSlugger } from "github-slugger";
import { fromHtml } from "hast-util-from-html";
import { default as katex } from "katex";
import * as Mdast from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import { customRandom, random } from "nanoid";
import * as fs from "node:fs/promises";
import { extname, join } from "node:path";
import { default as remarkGfm } from "remark-gfm";
import { default as remarkMath } from "remark-math";
import { default as remarkParse } from "remark-parse";
import { default as remarkSmartypants } from "remark-smartypants";
import { default as sharp } from "sharp";
import { unified } from "unified";
import { removePosition } from "unist-util-remove-position";
import { visit } from "unist-util-visit";
import { z } from "zod/v4";
import {
	D2_BACKGROUND_COLOR_THEME_KEY,
	D2_CLASS_REGEXP,
	D2_COMMON_CLASS_PROPERTIES,
	D2_COMPILE_OPTIONS,
	D2_RENDER_OPTIONS,
	D2_THEME_VARIABLE_PREFIX,
	DARK_THEME_COLORS,
	IMAGE_EXT,
	LIGHT_THEME_COLORS,
} from "./constants.js";
import {
	type Course,
	COURSE_SCHEMA,
	type D2Node,
	DiagramMap,
	type Figure,
	type HeadingItem,
	ImageIdMap,
	type Module,
	MODULE_SCHEMA,
	type ModuleChapter,
} from "./types.js";

import * as css from "@adobe/css-tools";
import { AstRule, createParser, render as renderCSSSelector } from "css-selector-parser";
import { toHtml } from "hast-util-to-html";
import * as cssValueParser from "postcss-values-parser";
import { optimize } from "svgo";

// === image path to id mapping

// I don't prefer dashes and underscores in image IDs for some reason
const LOWER_CASE_ENGLISH_ALPHABETS = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "1234567890";
const RANDOM_ID_BYTE_SET = LOWER_CASE_ENGLISH_ALPHABETS
	// todo: should add this back
	// + LOWER_CASE_ENGLISH_ALPHABETS.toUpperCase(): need to find a better way to serve stuff
	+ DIGITS;
const IMAGE_ID_LENGTH = 36;
const customNanoId = customRandom(RANDOM_ID_BYTE_SET, IMAGE_ID_LENGTH, random);
const KNOWN_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"]; // for now, yes

const textEncoder = new TextEncoder();

const moduleNameSlugger = slugifyWithCounter();

export async function resolveCourseDirectory(options: {
	root: string;
	imageMap: ImageIdMap;
	diagramMap: DiagramMap;
}): Promise<Course> {
	const course = await fs.readFile(join(options.root, "course.yaml"), "utf8")
		.then((content) => z.parse(COURSE_SCHEMA, parse(content)));

	const modules: Module[] = [];
	for (const entry of await fs.readdir(options.root, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		moduleNameSlugger.reset();
		const module = await resolveModuleDirectory({
			root: join(options.root, entry.name),
			imageMap: options.imageMap,
			diagramMap: options.diagramMap,
		});
		modules.push(module);
	}

	return {
		// metadata
		code: course.code,
		name: course.name,
		description: course.description,
		preamble: course.preamble,
		referenceBooks: course.referenceBooks,
		textbooks: course.textbooks,
		nptelCourse: course.nptelCourse,

		// generated for build purposes
		path: options.root,
		modules: modules,
	};
}

function isRootNode(node: Mdast.Node): node is Mdast.Root {
	return node.type === "root";
}

const baseProcessor = unified()
	.use(remarkParse)
	.use(remarkMath)
	.use(remarkGfm)
	.use(remarkSmartypants) // todo: customize this
	.use(customFigurizerPlugin) // custom
	.use(customSluggerPlugin)
	.use(customMathRendererPlugin); // custom

const chapterItemSlugger = new GithubSlugger(); // previously "moduleItemSlugger"

export async function resolveModuleDirectory(options: {
	root: string;
	imageMap: ImageIdMap;
	diagramMap: DiagramMap;
}): Promise<Module> {
	const metadata = await fs.readFile(join(options.root, "module.yaml"), "utf8")
		.then((content) => z.parse(MODULE_SCHEMA, parse(content)));

	const moduleNameSlug = moduleNameSlugger(metadata.name.trim(), {
		lowercase: true,
		separator: "-",
	});

	const chapters: ModuleChapter[] = [];

	const processor = baseProcessor()
		// have to extend the base one beacuse it has module/context specific arguments
		.use(customImageDetailsPlugin, {
			rootDir: options.root,
			imageMap: options.imageMap,
			diagramMap: options.diagramMap,
		});

	for (const [index, chapterFilename] of metadata.chapters.entries()) {
		chapterItemSlugger.reset();

		const chapterContent = await fs.readFile(join(options.root, chapterFilename), "utf8");
		const parsedTree = processor.parse(chapterContent);
		const transformed = await processor.run(parsedTree);
		removePosition(transformed);

		if (!isRootNode(transformed)) {
			throw new Error("Expected the transformed node to be of type root");
		}

		const structure = generateStructure(transformed);
		// printStructure(structure.children, 0);
		chapters.push({
			number: index + 1,
			title: structure.title,
			slug: structure.slug, // todo: really needed?
			structure: structure.children,
			content: transformed,
		});
	}

	return {
		// metadata
		number: metadata.number,
		name: metadata.name,
		slug: moduleNameSlug,
		syllabus: metadata.syllabus,

		// generated for build
		path: options.root,
		chapters: chapters,
	};
}

function generateStructure(root: Mdast.Root): HeadingItem {
	const stack: HeadingItem[] = [];

	let i = 0;

	visit(root, "heading", (node, index, parent) => {
		if (node.depth > stack.length + 1) {
			throw new Error("Improper stacking of headings");
		}
		if (node.data == null) {
			throw new Error("Expected generated slug");
		}

		const item: HeadingItem = {
			slug: node.data.id,
			title: mdastToString(node),
			depth: node.depth,
			children: [],
		};

		while (
			stack.length > 0
			&& node.depth < stack.length + 1
		) {
			const finished = stack.pop();
			if (finished == null) throw new Error("Expected a parent node: invalid structure");
			// If the stack becomes empty, it means that there are more than one H1 -> unintended
			stack[stack.length - 1].children.push(finished);
		}

		if (node.depth == stack.length + 1) {
			i++;
			stack.push(item);
		}
	});

	// push whats left
	while (stack.length > 1) {
		const finished = stack.pop();
		if (finished == null) throw new Error("Expected a parent node: invalid structure");
		stack[stack.length - 1].children.push(finished);
	}

	if (stack.length !== 1 || stack[0].depth !== 1) {
		throw new Error("Expected primary heading");
	}
	return stack[0];
}

function customSluggerPlugin() {
	return function(tree: Mdast.Root) {
		visit(tree, "heading", (node) => {
			const stringContent = mdastToString(node);
			node.data = {
				...(node.data || {}),
				// note: rememnber to reset the slugger for each chapter.
				id: chapterItemSlugger.slug(stringContent, false),
			};
		});
	};
}

/**
 * Plugin for rendering the math blocks into HTML string on the content side itself.
 */
function customMathRendererPlugin() {
	return function(tree: Mdast.Root) {
		visit(tree, ["math", "inlineMath"], (node, index, parent) => {
			if (parent == null) {
				throw new Error("Didn't expected to be null");
			}
			if (node.type !== "math" && node.type !== "inlineMath") return;
			const rendered = katex.renderToString(node.value, {
				displayMode: node.type === "math",
				throwOnError: true,
				output: "mathml", // todo: stick to mathml? or default?
			});

			node.renderedString = rendered;
			node.data = undefined; // this stuff is unnecessary
		});
	};
}

/**
 * Wrap images and diagrams and figure-like items in a figure tag with captions
 * inferred from titles and comments from the block.
 */
function customFigurizerPlugin() {
	return function(tree: Mdast.Root) {
		let figureNumber = 1;

		visit(tree, (node, index, parent) => {
			if (parent == null || index == null) {
				if (node.type !== "root")
					throw new Error("unexpected instance: all figures are supposed to have parent");
				return;
			} else if (node.type === "image") {
				if (!node.alt || !node.title) {
					// todo: complete & enforce this
					console.error(node); // todo: generate alt using vision models
					throw new Error("Image needs both alt and title");
				}
				const figureNode: Figure = {
					type: "figure",
					caption: node.title,
					number: figureNumber,
					child: node,
				};

				parent.children.splice(index, 1, figureNode);
				figureNumber++;
			} else if (node.type === "code" && node.lang === "d2") {
				const COMMENT_PREFIX = "# "; // todo: switch to a d2 ast parser if possible?
				const [firstLine, ...codeLines] = node.value.split("\n");
				if (
					!firstLine || !firstLine.startsWith(COMMENT_PREFIX)
					|| firstLine.length <= COMMENT_PREFIX.length + 1
				) {
					console.error(node);
					throw new Error("First line of d2 diagram must be a comment with caption");
				}
				const actualCode = codeLines.join("\n").trim();
				if (actualCode.length == 0) {
					throw new Error("empty diagrams");
				}
				const d2Node: D2Node = {
					type: "d2",
					meta: node.meta,
					diagram: {
						type: "source",
						value: actualCode,
					},
					data: node.data,
					position: node.position,
				};
				const figureNode: Figure = {
					type: "figure",
					caption: firstLine.slice(COMMENT_PREFIX.length).trim(),
					number: figureNumber,
					child: d2Node,
				};
				parent.children.splice(index, 1, figureNode);
				figureNumber++;
			} else {
				return;
			}
		});
	};
}

const d2 = new D2();
const parseCSSSelector = createParser({ syntax: "latest" });

// function findElementsByTagName(root: Hast.Element, tagName: string) {
// 	const textElements: Hast.Element[] = [];
// 	visit(root, "element", (node) => {
// 		if (node.tagName === tagName)
// 			textElements.push(node);
// 	});
// 	return textElements;
// }

/**
 * Generate thumbnails, unique ID based URLs (persistent as long as the path exists),
 * dimensions, generated SVGs, file size.
 */
function customImageDetailsPlugin(options: {
	rootDir: string;
	imageMap: ImageIdMap;
	diagramMap: DiagramMap;
}) {
	return async function(tree: Mdast.Root) {
		const imageNodes: Mdast.Image[] = [];
		const d2Nodes: D2Node[] = [];

		visit(tree, "figure", (node, index, parent) => {
			if (node.child.type === "image") {
				const { url } = node.child;
				if (URL.canParse(url)) {
					console.error(node);
					throw new Error("Expected a local relative path");
				}
				imageNodes.push(node.child);
			} else if (node.child.type === "d2") {
				d2Nodes.push(node.child);
			} else {
				throw new Error("not implemented");
			}
		});

		for (const node of imageNodes) {
			const path = join(options.rootDir, node.url);
			const fstat = await fs.lstat(path);
			const picture = sharp(path);
			const metadata = await picture.metadata();
			node.data = {
				...(node.data || {}),
				height: metadata.height,
				width: metadata.width,
				size: fstat.size,
			};

			let imageId: string;
			if (options.imageMap.has(path)) {
				const id = options.imageMap.get(path);
				if (id == null)
					throw new Error("unexpected"); // could ignore and just set it, but...
				imageId = id;
			} else {
				do imageId = customNanoId(); while (
					options.imageMap.values()
						.find((value) => value === imageId) != null
				);
				options.imageMap.set(path, imageId);
			}

			const ext = extname(path);
			if (!KNOWN_IMAGE_EXTENSIONS.includes(ext)) {
				throw new Error("extension of image url " + path + " is not supported");
			}
			node.url = `/images/${imageId}.${IMAGE_EXT}`;
		}

		// todo: use cli or server side implementation to generate mermaid diagrams on the server side.
		// or switch to pintora or plantUML?
		// done: switched to D2 for life
		for (const node of d2Nodes) {
			if (node.diagram.type !== "source") {
				throw new Error("only expected diagram with their sources in this plugin");
			}

			const value = node.diagram.value.trim();
			const encodedValue = textEncoder.encode(value); // todo: strip comments
			const sha256Hash = sha256(encodedValue);
			const hexedHash = Buffer.from(sha256Hash).toString("hex");

			if (options.diagramMap.has(hexedHash)) {
				const diagram = options.diagramMap.get(hexedHash);
				if (diagram == null)
					throw new Error("unexpected");
				// todo: compare the values, maybe?
				continue;
			}

			// [expired] todo: svgo to optimise; should have done a long time ago.
			// now no use until a full rewrite of the following happens
			const compiledDiagram = await d2.compile(value, {
				options: D2_COMPILE_OPTIONS,
			});
			const renderedSvg = await d2.render(compiledDiagram.diagram, D2_RENDER_OPTIONS);

			const hastTree = fromHtml(renderedSvg, { space: "svg", fragment: true });
			if (hastTree.children.length !== 1) {
				throw new Error("Expected only one <svg> child");
			}
			const svgNode = hastTree.children[0];
			if (svgNode.type !== "element" || svgNode.tagName !== "svg") {
				throw new Error("Expected <svg> as the first element");
			}
			if (
				svgNode.children.length !== 1 || svgNode.children[0].type !== "element"
				|| svgNode.children[0].tagName !== "svg"
			) {
				throw new Error("Expected an inner SVG node (and only that single element)");
			}
			const innerSvgNode = svgNode.children[0];

			const innerSvgClassName = innerSvgNode.properties.className;
			if (
				innerSvgClassName == null || !Array.isArray(innerSvgClassName)
				|| innerSvgClassName.length !== 2
			) {
				throw new Error("Expected className to contain 2 class names");
			}

			const d2diagramHash = innerSvgClassName.find((v) => v !== "d2-svg");
			const width = Number(innerSvgNode.properties.width);
			const height = Number(innerSvgNode.properties.height);
			if (isNaN(width) || isNaN(height)) {
				throw new Error("Expected width and height set for the SVG");
			}

			const backgroundRectEl = innerSvgNode.children.shift();
			if (
				backgroundRectEl == null || backgroundRectEl.type !== "element"
				|| backgroundRectEl.tagName !== "rect"
			) {
				throw new Error("Expected a background <rect> element");
			}

			const fontStyleEl = innerSvgNode.children.shift();
			if (
				fontStyleEl == null || fontStyleEl.type !== "element"
				|| fontStyleEl.tagName !== "style" || fontStyleEl.properties.type !== "text/css"
				|| fontStyleEl.children.length !== 1 || fontStyleEl.children[0].type !== "text"
			) {
				throw new Error("Expected a <style> element with styling related to fonts");
			}

			const fontStylesheet = css.parse(fontStyleEl.children[0].value);

			const definedFontFamilies = new Set<string>();
			const usedFontFamilies = new Map<string, string>();
			for (const rule of fontStylesheet.stylesheet.rules) {
				if (rule.type === css.CssTypes.fontFace) {
					const declarations = rule.declarations
						.reduce((p, c) => {
							if (c.type !== "declaration") return p;
							return { ...p, [c.property]: c.value };
						}, {} as Record<string, string>);
					if ("font-family" in declarations && "src" in declarations) {
						const parsedSrc = cssValueParser.parse(declarations.src);
						if (
							parsedSrc.first == null
							|| !(parsedSrc.first instanceof cssValueParser.Word)
							|| !parsedSrc.first.isUrl
						) {
							throw new Error("expected only a single URL node for the value");
						}
						definedFontFamilies.add(declarations["font-family"]);
					} else {
						throw new Error(
							"Expected @font-face rule to have both font-family and src properties",
						);
					}
				} else if (rule.type === css.CssTypes.rule) {
					const fontFamilyDecl = rule.declarations
						.filter((decl) => decl.type === css.CssTypes.declaration)
						.find((decl) => decl.property === "font-family");
					if (fontFamilyDecl == null) continue;
					if (rule.selectors.length !== 1) {
						throw new Error("Expected a single selector for the font classes");
					}
					const selector = parseCSSSelector(rule.selectors[0]);
					if (selector.rules.length !== 1) {
						throw new Error(
							"Expected a single rule for the selector for the font classes",
						);
					}
					const selectorRule = selector.rules[0];
					if (
						selectorRule.items.length !== 1
						|| selectorRule.items[0].type !== "ClassName"
						|| selectorRule.items[0].name !== d2diagramHash
						|| selectorRule.nestedRule == null
						|| selectorRule.nestedRule.items.length !== 1
						|| selectorRule.nestedRule.items[0].type !== "ClassName"
					) {
						throw new Error("font class selector is invalid");
					}
					const textClassName = selectorRule.nestedRule.items[0].name;

					const parsedFontFamily = cssValueParser.parse(fontFamilyDecl.value);
					const fontFamily = parsedFontFamily.first
						? parsedFontFamily.first instanceof cssValueParser.Word
							? parsedFontFamily.first.value
							: parsedFontFamily.first instanceof cssValueParser.Quoted
							? parsedFontFamily.first.contents
							: null
						: null;
					if (fontFamily == null) {
						throw new Error("Invalid font-family");
					}

					usedFontFamilies.set(fontFamily, textClassName);
				} else {
					console.warn("unexpected type of rules");
				}
			}
			for (const fontFamily of definedFontFamilies) {
				if (!usedFontFamilies.has(fontFamily)) {
					throw new Error("Mismatch in CSS parsing, expected to have all fonts defined");
				}
			}

			const colorStyleEl = innerSvgNode.children.shift();

			if (
				colorStyleEl == null
				|| colorStyleEl.type !== "element"
				|| colorStyleEl.tagName !== "style"
				|| colorStyleEl.properties.type !== "text/css"
				|| colorStyleEl.children.length !== 1
				|| colorStyleEl.children[0].type !== "text"
			) {
				throw new Error("Expected a <style> element with styling related to colors");
			}

			const detectedThemeColors = new Map<string, string>();

			const colorStylesheet = css.parse(colorStyleEl.children[0].value);

			for (let index = 0; index < colorStylesheet.stylesheet.rules.length; index++) {
				const rule = colorStylesheet.stylesheet.rules[index];
				if (rule.type !== css.CssTypes.rule) {
					throw new Error("Unexpected rule type in color stylesheet, handle this.");
				}

				rule.selectors = rule.selectors.map((selector) => {
					const parsedSelector = parseCSSSelector(selector);
					if (
						parsedSelector.rules.length !== 1 // only 1, since selectors are already split into an array, right?
						|| parsedSelector.rules[0].type !== "Rule"
						|| parsedSelector.rules[0].items.length === 0
					) {
						throw new Error("Unexpected selector on the color stylesheet");
					}
					if (
						parsedSelector.rules[0].items.length !== 1
						|| parsedSelector.rules[0].items[0].type !== "ClassName"
						|| parsedSelector.rules[0].items[0].name !== d2diagramHash
					) {
						return selector;
					}

					const nestedRule = parsedSelector.rules[0].nestedRule;
					if (nestedRule == null) {
						throw new Error(
							"Expected a nested rule for the diagram hash class rule",
						);
					} else if (
						nestedRule.items.length !== 1
						|| nestedRule.items[0].type !== "ClassName"
					) {
						throw new Error(
							"Unexpected type of nested rule item in color stylesheet under diagram hash class rule",
						);
					} else {
						const nestedRuleItem = nestedRule.items[0];
						parsedSelector.rules[0].items.splice(0, 1, nestedRuleItem);
						delete parsedSelector.rules[0].nestedRule;
						delete parsedSelector.rules[0].combinator; // just in case

						const matches = nestedRuleItem.name.match(D2_CLASS_REGEXP);
						if (matches != null) {
							const [_match, prefix, group, level] = matches;
							const themeColorKey = `${group}${level}`;

							const themeColorDeclarations = rule.declarations
								.filter((decl) => decl.type === css.CssTypes.declaration)
								.filter((decl) =>
									D2_COMMON_CLASS_PROPERTIES.includes(decl.property)
								);

							if (themeColorDeclarations.length !== 1) {
								throw new Error(
									"Expected only one declaration per theme classes",
								);
							}

							const parsedValue = cssValueParser.parse(
								themeColorDeclarations[0].value,
							);
							if (
								parsedValue.first == null
								|| !(parsedValue.first instanceof cssValueParser.Word)
								|| !parsedValue.first.isColor
								|| parsedValue.first.value == null
							) {
								throw new Error(
									"Expected color value for the theme classes in color stylesheet",
								);
							}

							if (
								!(themeColorKey in LIGHT_THEME_COLORS)
								|| !(themeColorKey in DARK_THEME_COLORS)
							) {
								throw new Error(
									"missing theme color key " + themeColorKey
										+ " in theme colors values",
								);
							}

							if (detectedThemeColors.has(themeColorKey)) {
								const themeColor = detectedThemeColors.get(themeColorKey)!;
								if (themeColor !== parsedValue.first.value) {
									throw new Error(
										"Mismatch in the detected colors for the theme classes",
									);
								}
							} else {
								detectedThemeColors.set(themeColorKey, parsedValue.first.value);
							}

							themeColorDeclarations[0].value =
								`var(--${D2_THEME_VARIABLE_PREFIX}-${themeColorKey})`; // rewrite the hardcoded value to variable
						}
					}

					return renderCSSSelector(parsedSelector);
				});

				const hasNonSketchSelectors = rule.selectors.some((selector) => {
					const parsed = parseCSSSelector(selector);
					if (
						parsed.rules.length !== 1
						|| parsed.rules[0].items.length === 0
						|| parsed.rules[0].items[0].type !== "ClassName"
					) return true;
					const className = parsed.rules[0].items[0].name;
					return !className.startsWith("sketch-");
				});
				if (!hasNonSketchSelectors) { // does the class only belong to the sketch type?
					colorStylesheet.stylesheet.rules.splice(index--, 1); // if so, remove. NO SKETCH SUPPORT
					continue;
				}

				// SPECIAL CONSIDERATIONS

				// https://github.com/terrastruct/d2/blob/dd965e6045a6dd8c74c8a0bfc5c8df6f92b2fdc7/d2renderers/d2svg/d2svg.go#L3208
				if (rule.selectors[0] === ".appendix text.text") {
					const fillProperty = rule.declarations.find((decl) =>
						decl.type === css.CssTypes.declaration && decl.property === "fill"
					) as css.CssDeclarationAST;
					fillProperty.value = `var(--${D2_THEME_VARIABLE_PREFIX}-N1)`;
				}
				// https://github.com/terrastruct/d2/blob/dd965e6045a6dd8c74c8a0bfc5c8df6f92b2fdc7/d2renderers/d2svg/d2svg.go#L3211
				if (rule.selectors[0] === ".md") {
					const mdColorKeys = [
						"N1",
						"N2",
						"N3",
						"N7",
						"N6",
						"B1",
						"B2",
						"N6",
						"B2",
						"B2",
						"N2",
					]
						.map((colorKey) => `var(--${D2_THEME_VARIABLE_PREFIX}-${colorKey})`)
						.concat("red");

					if (mdColorKeys.length !== rule.declarations.length) {
						throw new Error("Both should be of the same length");
					}
					for (let i = 0; i < mdColorKeys.length; i++) {
						const decl = rule.declarations[i];
						if (decl.type === css.CssTypes.declaration) {
							decl.value = mdColorKeys[i];
						}
					}
				}

				// todo: removed the classes that toggles the themed code blocks.
				// now, have to remove dark code block. and extract light and dark token colors
				// and make them variables.
				if (rule.selectors[0] === ".light-code" || rule.selectors[0] === ".dark-code")
					colorStylesheet.stylesheet.rules.splice(index--, 1);
			}

			visit(hastTree, "element", (node, index, parent) => {
				const className = node.properties.className;
				if (
					className != null
					&& Array.isArray(className)
					&& (className.includes("light-code") || className.includes("dark-code"))
				) {
					throw new Error("code blocks are not supported currently");
				}
			});

			// CLEANINIG UP SVG

			// removing every node that references an unknown class
			const declaredClasses = new Set<string>([
				...getDeclaredClasses(fontStylesheet),
				...getDeclaredClasses(colorStylesheet),
			]);
			visit(hastTree, "element", (node) => {
				if (
					node.properties.className == null || !Array.isArray(node.properties.className)
					|| node.properties.className.some((c) => typeof c !== "string")
				)
					return;

				for (let i = 0; i < node.properties.className.length; i++) {
					const className = node.properties.className[i];
					if (typeof className !== "string") continue;
					if (!declaredClasses.has(className)) {
						node.properties.className.splice(i--, 1);
						continue;
					}
				}

				if (node.properties.className.length === 0) {
					delete node.properties.className;
				}
			});

			// remove the explicit properties if they are already mentioned as classes to compress the svg further
			visit(hastTree, "element", (node) => {
				const classNames = node.properties.className;
				if (classNames == null || !Array.isArray(classNames) || classNames.length === 0)
					return;
				const colorKeys = classNames.filter((value) => typeof value === "string")
					.filter((className) => D2_CLASS_REGEXP.test(className))
					.map((className) => {
						const [, property, group, number] = className.match(D2_CLASS_REGEXP)!;
						return { property, code: `${group}${number}` };
					});
				if (colorKeys.length === 0) return;
				for (const { property, code } of colorKeys) {
					if (!detectedThemeColors.has(code)) {
						throw new Error("that's interesting");
					}
					if (property in node.properties) {
						if (node.properties[property] === detectedThemeColors.get(code)) {
							delete node.properties[property];
						}
					}
				}
			});

			// find the used classes, and filter out used rules (only find which is related to that classes)
			const usedClasses = new Set<string>();
			visit(hastTree, "element", (node) => {
				if (node.type !== "element") return;
				if (
					node.properties.className == null || !Array.isArray(node.properties.className)
					|| node.properties.className.some((c) => typeof c !== "string")
				)
					return;

				for (const className of node.properties.className) {
					if (typeof className !== "string") continue;
					usedClasses.add(className);
				}
			});
			for (let i = 0; i < colorStylesheet.stylesheet.rules.length; i++) {
				const rule = colorStylesheet.stylesheet.rules[i];
				if (rule.type !== css.CssTypes.rule) continue;

				const classNames = new Set<string>();

				for (const selector of rule.selectors) {
					const parsedSelector = parseCSSSelector(selector);

					for (const selectorRule of parsedSelector.rules) {
						function addRecursively(rule: AstRule) {
							const classNameItems = rule.items
								.filter((item) => item.type === "ClassName")
								.map((item) => item.name);
							for (const item of classNameItems)
								classNames.add(item);
							if (rule.nestedRule != null) {
								addRecursively(rule.nestedRule);
							}
						}
						addRecursively(selectorRule);
					}
				}

				if (classNames.size === 0) continue;

				if (usedClasses.difference(classNames).size === usedClasses.size) { // no classes are used
					colorStylesheet.stylesheet.rules.splice(i--, 1);
				}
			}

			const usedThemeKeys = new Set<string>();
			visit(hastTree, "element", (node) => {
				const classNames = node.properties.className;
				if (classNames == null || !Array.isArray(classNames) || classNames.length === 0)
					return;
				const colorKeys = classNames.filter((value) => typeof value === "string")
					.filter((className) => D2_CLASS_REGEXP.test(className))
					.map((className) => {
						const [, property, group, number] = className.match(D2_CLASS_REGEXP)!;
						return { property, code: `${group}${number}` };
					});
				if (colorKeys.length === 0) return;
				for (const { property, code } of colorKeys) {
					if (!detectedThemeColors.has(code)) {
						throw new Error("that's interesting x2");
					}
					usedThemeKeys.add(code);
				}
			});

			if (compiledDiagram.diagram.root.fill !== D2_BACKGROUND_COLOR_THEME_KEY) {
				throw new Error(
					`Expected diagram fill to be ${D2_BACKGROUND_COLOR_THEME_KEY}, this need to be fixed.`,
				);
			}

			const optimizedSvg = optimize(toHtml(hastTree, { space: "svg" }), {
				multipass: true,
				plugins: [{
					name: "preset-default",
					params: {
						overrides: {
							convertShapeToPath: false,
						},
					},
				}],
			});

			node.diagram = {
				type: "svg",
				hash: hexedHash,
				width: width,
				height: height,
				raw: optimizedSvg.data,
			};

			// for the diagram build step to manage:
			options.diagramMap.set(hexedHash, {
				fontClasses: new Set(usedFontFamilies.values()),
				colorStylesheetRules: colorStylesheet.stylesheet.rules,
				hastTree: hastTree,
				themeKeys: usedThemeKeys,
			});

			// todo: remove dark-code elements. add unique css rules to common stylesheet
			// track dark-code element colors to

			// const codeNodes: Element[] = [];
			// visit(hastTree, "element", (node, index, parent) => {
			// 	const className = node.properties.className;
			// 	if (
			// 		className != null
			// 		&& Array.isArray(className)
			// 		&& (className.includes("light-code") || className.includes("dark-code"))
			// 	) {
			// 		if (className.length > 1)
			// 			throw new Error(
			// 				"This code snippet has some extra classes, check out them and evalute",
			// 			);
			// 		const lightMode = className.includes("light-code");
			// 		if (lightMode) {
			// 			if (codeNodes.length % 2 !== 0)
			// 				throw new Error("Should be an even length");
			// 			codeNodes.push(node);
			// 		} else {
			// 			if (codeNodes.length % 2 !== 1)
			// 				throw new Error("Should be an odd length");
			// 			codeNodes.push(node);
			// 		}
			// 	}
			// });
			// if (codeNodes.length % 2 !== 0) {
			// 	throw new Error("invalid structure");
			// }
			// for (let i = 0; i < codeNodes.length; i += 2) {
			// 	const lightNode = findElementsByTagName(codeNodes[i], "text"),
			// 		darkNode = findElementsByTagName(codeNodes[i + 1], "text");

			// 	if (lightNode.length !== darkNode.length) {
			// 		throw new Error("Mismatch in number of lines");
			// 	}

			// 	for (const text of lightNode) {
			// 		for (let i = 0; i < text.children.length; i++) {
			// 			const node = text.children[i];
			// 			if (
			// 				node.type === "element"
			// 				&& node.tagName === "tspan"
			// 				&& node.children.length === 0
			// 			) {
			// 				text.children.splice(i--, 1);
			// 				continue;
			// 			}

			// 			// convert orphan high lvel text nodes to tspan element nodes.
			// 			if (node.type === "text") {
			// 				text.children.splice(i--, 1, {
			// 					type: "element",
			// 					tagName: "tspan",
			// 					children: [node],
			// 					properties: {},
			// 				});
			// 				continue;
			// 			}
			// 		}
			// 	}

			// 	for (const text of darkNode) {
			// 		for (let i = 0; i < text.children.length; i++) {
			// 			const node = text.children[i];
			// 			if (node.type === "comment") {
			// 				continue;
			// 			} else if (node.type === "text") {
			// 				throw new Error("Did not expect text nodes in dark mode code blocks");
			// 			} else if (node.tagName === "tspan") {
			// 				if (node.children.length === 0) {
			// 					text.children.splice(i--, 1);
			// 					continue;
			// 				}
			// 				const textNode = node.children[0];
			// 				if (textNode.type !== "text") {
			// 					throw new Error("kek??");
			// 				}

			// 				while (i + 1 < text.children.length) {
			// 					const next = text.children[i + 1];
			// 					if (next.type === "element" && next.tagName === "tspan") {
			// 						if (next.children.length === 0) {
			// 							text.children.splice(i + 1, 1);
			// 							continue;
			// 						} else if (
			// 							next.children.length === 1 && next.children[0].type === "text"
			// 							&& equal(node.properties, next.properties)
			// 						) {
			// 							const mergable = next.children[0];
			// 							textNode.value += mergable.value;
			// 							text.children.splice(i + 1, 1);
			// 						} else {
			// 							break;
			// 						}
			// 					}
			// 				}
			// 			} else {
			// 				throw new Error("hmm?");
			// 			}
			// 		}
			// 	}

			// 	for (let i = 0; i < lightNode.length; i++) {
			// 		if (lightNode[i].children.length !== darkNode[i].children.length) {
			// 			// if this gets triggered, that means this method no longer works.
			// 			throw new Error("hmm, mismatch in tokens");
			// 		}
			// 	}
			// }

			// const codeThemeMap = new Map<string, string>();

			// for (let i = 0; i < codeNodes.length; i += 2) {
			// 	const lightNode = findElementsByTagName(codeNodes[i], "text"),
			// 		darkNode = findElementsByTagName(codeNodes[i + 1], "text");

			// 	if (lightNode.length !== darkNode.length) // extra verification
			// 		throw new Error("Mismatch in number of lines in rendered light and dark code blocks");

			// 	for (let i = 0; i < lightNode.length; i++) {
			// 		const lightText = findElementsByTagName(lightNode[i], "tspan"),
			// 			darkText = findElementsByTagName(darkNode[i], "tspan");
			// 		// todo: should i check for unknown properties in lightText and darkText?
			// 		if (lightText.length !== darkText.length) {
			// 			throw new Error(
			// 				"Mismatch in number of same colored tokens in dark and light code blocks",
			// 			);
			// 		}
			// 		for (let j = 0; j < lightText.length; j++) {
			// 			const lightTspan = lightText[j], darkTspan = darkText[j];
			// 			const key = typeof lightTspan.properties.fill === "string"
			// 				? lightTspan.properties.fill
			// 				: "";
			// 			const value = typeof darkTspan.properties.fill === "string"
			// 				? darkTspan.properties.fill
			// 				: "";
			// 			if (codeThemeMap.has(key)) {
			// 				if (codeThemeMap.get(key) !== value) {
			// 					console.log(codeThemeMap);
			// 					console.log({
			// 						key,
			// 						value,
			// 						prev: codeThemeMap.get(key),
			// 					});
			// 					throw new Error("delete all this shit");
			// 				}
			// 			} else {
			// 				codeThemeMap.set(key, value);
			// 			}
			// 		}
			// 	}
			// }

			// const extendedStylesheet: css.CssStylesheetAST = {
			// 	type: css.CssTypes.stylesheet,
			// 	stylesheet: { rules: [] },
			// };

			// console.log(css.stringify(extendedStylesheet, { indent: "\t" }));

			// console.log(themeColors);
			// innerSvgNode.children.unshift(colorStyleEl);

			// console.log(innerSvgNode, d2id); // todo: see if the last child 'mask' need to be removed
		}

		// todo: ai based alt explanation generator
	};
}

function getDeclaredClasses({ stylesheet }: css.CssStylesheetAST) {
	const classes: string[] = [];
	for (const rule of stylesheet.rules) {
		if (rule.type !== css.CssTypes.rule) continue;
		for (const selector of rule.selectors) {
			const parsed = parseCSSSelector(selector);
			for (const selectorRule of parsed.rules) {
				function addRecursively(rule: AstRule) {
					classes.push(
						...rule.items
							.filter((item) => item.type === "ClassName")
							.map((item) => item.name),
					);
					if (rule.nestedRule != null) {
						addRecursively(rule.nestedRule);
					}
				}
				addRecursively(selectorRule);
			}
		}
	}
	return classes;
}
// todo: write a util for finding unused images
