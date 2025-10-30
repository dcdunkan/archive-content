import * as fs from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
	BUILD_DIR,
	D2_BACKGROUND_COLOR_THEME_KEY,
	D2_IMAGE_EXT,
	D2_THEME_VARIABLE_PREFIX,
	D2_THEME_VARIABLE_REGEX,
	D2_THUMBNAIL_EXT,
	DARK_THEME_COLORS,
	DATA_DIR,
	DIAGRAMS_COMMON_STYLES_PATH,
	DIAGRAMS_DIR,
	DIAGRAMS_PREVIEWS_DIR,
	DIAGRAMS_THUMBNAILS_DIR,
	FONT_CLASSES_MAPPING,
	IMAGE_DIR,
	IMAGE_EXT,
	IMAGE_MAPPING_GENERATED_FILE,
	IMAGE_THUMBNAILS_DIR,
	LIGHT_THEME_COLORS,
	RESVG_RENDER_OPTIONS,
	THUMBNAIL_EXT,
	THUMBNAIL_HEIGHT,
	THUMBNAIL_WIDTH,
} from "./constants.js";
import { resolveCourseDirectory } from "./remark.js";
import { Course, DiagramMap, HeadingItem, ImageIdMap, SearchDocument } from "./types.js";
import { openImageMapFile, UsageHistoryMap, validateImageMap } from "./utilities.js";

import * as css from "@adobe/css-tools";
import { Resvg } from "@resvg/resvg-js";
import * as Hast from "hast";
import { toHtml } from "hast-util-to-html";
import { rehypeMdast } from "./rehype.js";

process.on("exit", (x) => {
	console.log(`\x1b[34mbuild complete: ${x === 0 ? "success" : "failed"}\x1b[0m`); // todo: switch to picocolors
});

// === GLOBALS
const existingImageMap = await openImageMapFile(IMAGE_MAPPING_GENERATED_FILE);
const imageIdMap: ImageIdMap = new UsageHistoryMap(existingImageMap); // todo: should this also switch to hex?

const diagramMap: DiagramMap = new Map();

// === UTILS
const recmkdir = (path: string) => fs.mkdir(path, { recursive: true });
const writeJSON = (path: string, content: any) =>
	fs.writeFile(path, JSON.stringify(content), "utf8");

// === PARSE AND SETUP DATA
const courses: Course[] = [];
const coursesDir = join(DATA_DIR, "courses");
for (const entry of await fs.readdir(coursesDir, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const coursePath = join(coursesDir, entry.name);
	const course = await resolveCourseDirectory({
		root: coursePath,
		imageMap: imageIdMap,
		diagramMap: diagramMap,
	});
	courses.push(course);
}

// === GENERATE JSON FILES
await fs.rm(BUILD_DIR, { recursive: true, force: true });
await recmkdir(BUILD_DIR);

const buildCoursesDir = join(BUILD_DIR, "courses");
await recmkdir(buildCoursesDir);

for (const course of courses) {
	await writeJSON(
		join(buildCoursesDir, course.code + ".json"),
		{
			code: course.code,
			name: course.name,
			description: course.description,
			preamble: course.preamble,
			referenceBooks: course.referenceBooks,
			textbooks: course.textbooks,
			// todo: include nptelCourse as well (its undefinde right now)
			modules: course.modules.map((module) => {
				return {
					number: module.number,
					name: module.name,
					slug: module.slug,
					syllabus: module.syllabus, // todo: could generate the syallbus from the table of contents (take headings and comma-ize them)
				};
			}),
		},
	); // todo: introduce a zod schema on the client sides to validate the file generation

	const buildCourseDir = join(buildCoursesDir, course.code);
	await recmkdir(buildCourseDir);

	const buildModulesDir = join(buildCourseDir, "modules");
	await recmkdir(buildModulesDir);

	for (const module of course.modules) {
		await writeJSON(
			join(buildModulesDir, module.number + ".json"),
			{
				number: module.number,
				name: module.name,
				syllabus: module.syllabus,
				slug: module.slug,
				chapters: module.chapters.map((chapter) => ({
					title: chapter.title,
					slug: chapter.slug,
					number: chapter.number,
					structure: chapter.structure,
				})),
			}, // todo: satsifies using zod schema inferring (make schemas)
		);

		const buildModuleDir = join(buildModulesDir, module.number.toString());
		await recmkdir(buildModuleDir);

		const buildChaptersDir = join(buildModuleDir, "chapters");
		await recmkdir(buildChaptersDir);

		for (const chapter of module.chapters) {
			await writeJSON(
				join(buildChaptersDir, chapter.number + ".json"),
				{
					number: chapter.number,
					title: chapter.title,
					slug: chapter.slug,
					structure: chapter.structure,
					content: chapter.content,
				}, // todo: satsifies using zod schema inferring (make schemas)
			);
			await writeJSON(
				join(buildChaptersDir, chapter.number + ".html.json"),
				{
					number: chapter.number,
					title: chapter.title,
					slug: chapter.slug,
					structure: chapter.structure,
					content: await rehypeMdast(chapter.content, {
						moduleNumber: module.number,
						chapterNumber: chapter.number,
					}),
				}, // todo: satsifies using zod schema inferring (make schemas)
			);
		}
	}
}

await writeJSON(
	join(BUILD_DIR, "courses.json"),
	courses.map((course) => {
		return {
			code: course.code,
			name: course.name,
			description: course.description,
			modules: course.modules.map((module) => {
				return {
					number: module.number,
					name: module.name,
					slug: module.slug,
				};
			}),
		};
	}),
);

// === IMAGE MANAGEMENT
// * MOVE IMAGES TO A CENTRALIZED FOLDER (TO BE SERVED ON A IMAGE CACHE SERVER LATER)
// * GENERATE THUMBNAILS
await recmkdir(IMAGE_DIR);
await recmkdir(IMAGE_THUMBNAILS_DIR);

validateImageMap(imageIdMap); // check for mistakes

for (const key of imageIdMap.getUnusedKeys()) {
	imageIdMap.delete(key);
}

for (const [src, imageId] of imageIdMap) {
	const picture = sharp(src);
	await picture
		.toFormat(IMAGE_EXT)
		.toFile(join(IMAGE_DIR, `${imageId}.${IMAGE_EXT}`));

	await picture
		.resize({ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT, fit: "cover" })
		.toFormat(THUMBNAIL_EXT)
		.toFile(join(IMAGE_THUMBNAILS_DIR, `${imageId}.${THUMBNAIL_EXT}`));
}

await writeJSON(
	IMAGE_MAPPING_GENERATED_FILE,
	Object.fromEntries(imageIdMap.entries()),
);

/**
 * === DIAGRAM MANAGEMENT
 * - Render D2 to SVG
 * - Manipulate generated SVG to adjust styles:
 *   - remove fonts,
 *   - replace hardcoded colors with CSS variables.
 *   - extract styles
 *   - clean up SVG
 *   - generate common stylesheet
 * - Move rendered SVG diagrams to centralized folder (to be served on a image
 *   cache server later)
 * - Generate thumbnails
 *
 * rules for d2:
 * 1. no sketch mode. go proff.
 * 2. no appendix?
 * 3. no code blocks (only after https://github.com/terrastruct/d2/issues/25)
 */

await recmkdir(DIAGRAMS_DIR);
await recmkdir(DIAGRAMS_PREVIEWS_DIR);
await recmkdir(DIAGRAMS_THUMBNAILS_DIR);

// const D2_DETECTED_COLOR_KEYS = new Map<string, string>();
const D2_FONT_STYLESHEET_RULES = new Map<string, css.CssRuleAST>();
const D2_COLOR_STYLESHEET_RULES: css.CssRuleAST[] = [];
const D2_USED_COLOR_KEYS = new Set<string>();

for (const [diagramHexedHash, diagram] of diagramMap) {
	// STEP 1
	// update the common font stylesheet
	for (const fontClass of diagram.fontClasses) {
		if (FONT_CLASSES_MAPPING[fontClass] == null) {
			throw new Error("font class styles not defined");
		}
		if (!D2_FONT_STYLESHEET_RULES.has(fontClass)) {
			D2_FONT_STYLESHEET_RULES.set(fontClass, {
				type: css.CssTypes.rule,
				selectors: [`.${fontClass}`],
				declarations: Object
					.entries(FONT_CLASSES_MAPPING[fontClass])
					.map(([property, value]) => ({
						type: css.CssTypes.declaration,
						property: property,
						value: value,
					})),
			});
		}
	}

	// STEP 2
	// check for incorrect theme color mappings across diagrams
	// and also set the color keys
	// for (const [themeColorKey, themeColorValue] of diagram.themeColors) {
	// 	if (D2_DETECTED_COLOR_KEYS.has(themeColorKey)) {
	// 		const existingThemeColorValue = D2_DETECTED_COLOR_KEYS.get(themeColorKey)!;
	// 		if (existingThemeColorValue !== themeColorValue) {
	// 			throw new Error(
	// 				"Mismatch in the detected colors for the theme classes",
	// 			);
	// 		}
	// 	} else {
	// 		D2_DETECTED_COLOR_KEYS.set(themeColorKey, themeColorValue);
	// 	}
	// }
	// console.log(D2_DETECTED_COLOR_KEYS);

	const svgNode = diagram.hastTree.children[0];
	if (
		diagram.hastTree.children.length !== 1
		|| svgNode == null || svgNode.type !== "element"
		|| svgNode.tagName !== "svg"
	) {
		throw new Error("Expected an <svg> element as the only child of a diagram's hast tree");
	}

	// STEP 3
	// update the common color stylesheet:
	// first, optimize the stylesheet to filter out the unused classes.
	svgNode.children.unshift({
		type: "element",
		tagName: "style",
		properties: { type: "text/css" },
		children: [{
			type: "text",
			value: css.stringify({
				type: css.CssTypes.stylesheet,
				stylesheet: { rules: diagram.colorStylesheetRules },
			}, { compress: true }),
		}],
	});

	for (const colorKey of diagram.themeKeys) {
		D2_USED_COLOR_KEYS.add(colorKey);
	}

	for (const rule of diagram.colorStylesheetRules) {
		if (rule.type !== css.CssTypes.rule) {
			throw new Error("only expected rule type rules in color stylesheet");
		}
		const existingIndex = D2_COLOR_STYLESHEET_RULES.findIndex((existingRule) => {
			if (
				existingRule.type === rule.type // same type?
				&& new Set(existingRule.selectors)
						.symmetricDifference(new Set(rule.selectors)).size === 0 // same selectors?
			) {
				const existingRuleDecls = getDeclarationsMap(existingRule);
				const ruleDecls = getDeclarationsMap(rule);
				if (
					Object.keys(existingRuleDecls).length !== Object.keys(ruleDecls).length
				) { // same number of decls?
					return false;
				}
				const properties = Object.keys(existingRuleDecls);
				for (const property of properties) {
					if (existingRuleDecls[property] !== ruleDecls[property]) {
						return false;
					}
				}
				return true;
			}
			return false;
		});
		if (existingIndex === -1) { // if does not exist, then add.
			D2_COLOR_STYLESHEET_RULES.push(rule);
		}
	}

	// note: seems like svgo optimizes the css in the svg, removing even the
	// used classes. this looks like a bug caused by disabling the path
	// converter (conversion makes it hard to add the appropriate classes.
	// example: polygon to path, fill class maybe present, but only fill may not
	// work anymore). so for now, don't rely on svgo to optimise the css to find
	// the used ones

	// const optimizedSvg = optimize(toHtml(diagram.hastTree, { space: "svg" }), {
	// 	multipass: true,
	// 	plugins: [{
	// 		name: "preset-default",
	// 		params: {
	// 			overrides: {
	// 				convertShapeToPath: false,
	// 			},
	// 		},
	// 	}],
	// }).data;
	// const updatedHastTree = fromHtml(optimizedSvg, { space: "svg", fragment: true });
	// const optimizedSvgNode = updatedHastTree.children[0];
	// if (
	// 	updatedHastTree.children.length !== 1
	// 	|| optimizedSvgNode == null
	// 	|| optimizedSvgNode.type !== "element"
	// 	|| optimizedSvgNode.tagName !== "svg"
	// ) {
	// 	throw new Error("Expected an <svg> element as the only child of optimized svg");
	// }

	// // the <style> element may be completely removed in case of no usage of classes and
	// // the element is empty, which gets removed in the next pass of the optimization.
	// // so, only add so if the <style> element is active
	// const possibleStyleElement = optimizedSvgNode.children[0];
	// if (
	// 	possibleStyleElement.type === "element" && possibleStyleElement.tagName === "style"
	// 	&& possibleStyleElement.children.length === 1
	// 	&& possibleStyleElement.children[0].type === "text"
	// ) {
	// 	const optimizedStylesheetText = possibleStyleElement.children[0].value;
	// 	const optimizedStylesheet = css.parse(optimizedStylesheetText); // todo: check used

	// 	for (const rule of optimizedStylesheet.stylesheet.rules) {
	// 		if (rule.type !== css.CssTypes.rule) {
	// 			throw new Error("only expected rule type rules in color stylesheet");
	// 		}
	// 		console.log(rule.selectors);
	// 		const existingIndex = D2_COLOR_STYLESHEET_RULES.findIndex((existingRule) => {
	// 			if (
	// 				existingRule.type === rule.type // same type?
	// 				&& new Set(existingRule.selectors)
	// 						.symmetricDifference(new Set(rule.selectors)).size === 0 // same selectors?
	// 			) {
	// 				const existingRuleDecls = getDeclarationsMap(existingRule);
	// 				const ruleDecls = getDeclarationsMap(rule);
	// 				if (
	// 					Object.keys(existingRuleDecls).length !== Object.keys(ruleDecls).length
	// 				) { // same number of decls?
	// 					return false;
	// 				}
	// 				const properties = Object.keys(existingRuleDecls);
	// 				for (const property of properties) {
	// 					if (existingRuleDecls[property] !== ruleDecls[property]) {
	// 						return false;
	// 					}
	// 				}
	// 				return true;
	// 			}
	// 			return false;
	// 		});
	// 		if (existingIndex === -1) { // if does not exist, then add.
	// 			D2_COLOR_STYLESHEET_RULES.push(rule);
	// 		}
	// 	}
	// }

	svgNode.children.shift();

	// STEP 4
	// rendering previews for the generated <svg>
	async function renderPreviewAndThumbnailWithTheme(
		svgNode: Hast.Element,
		themeFilenameSuffix: string,
		themePalette: Record<string, string>,
	) {
		// add theme values as css stylesheet
		svgNode.children.unshift({
			type: "element",
			tagName: "style",
			properties: { type: "text/css" },
			children: [{
				type: "text",
				value: previewThemeCSS(themePalette),
			}],
		});

		const filename = `${diagramHexedHash}.${themeFilenameSuffix}`;

		const png = new Resvg(
			toHtml(diagram.hastTree, { space: "svg" }),
			RESVG_RENDER_OPTIONS,
		).render().asPng();

		await sharp(png)
			.toFormat(D2_IMAGE_EXT)
			.toFile(join(DIAGRAMS_PREVIEWS_DIR, `${filename}.${D2_IMAGE_EXT}`));

		await sharp(png)
			.resize({ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT, fit: "cover" })
			.flatten({ background: themePalette[D2_BACKGROUND_COLOR_THEME_KEY] }) // only thumbnails need the background
			.toFormat(D2_THUMBNAIL_EXT)
			.toFile(join(DIAGRAMS_THUMBNAILS_DIR, `${filename}.${D2_THUMBNAIL_EXT}`));

		svgNode.children.shift(); // remove the theme from the dom (actually for dark theme to be injected next, but also for any theme actually)
	}

	await renderPreviewAndThumbnailWithTheme(svgNode, "light", LIGHT_THEME_COLORS);
	await renderPreviewAndThumbnailWithTheme(svgNode, "dark", DARK_THEME_COLORS);
}

await fs.writeFile(
	DIAGRAMS_COMMON_STYLES_PATH,
	css.stringify({
		type: css.CssTypes.stylesheet,
		stylesheet: {
			rules: [
				...D2_FONT_STYLESHEET_RULES.values(),
				...[
					{
						type: css.CssTypes.rule,
						selectors: [":root"],
						declarations: colorPaletteToDeclarations(
							optimiseThemePalette(LIGHT_THEME_COLORS, D2_USED_COLOR_KEYS),
						),
					},
					{
						type: css.CssTypes.rule,
						selectors: [".dark"],
						declarations: colorPaletteToDeclarations(
							optimiseThemePalette(DARK_THEME_COLORS, D2_USED_COLOR_KEYS),
						),
					},
				] as css.CssRuleAST[],
				...D2_COLOR_STYLESHEET_RULES,
			],
		},
	}, { compress: true }),
	"utf-8",
);

function generatePaletteThemedRules(themePalette: Record<string, string>) {
	return Array.from(D2_COLOR_STYLESHEET_RULES).map((rule) => {
		return {
			...rule,
			declarations: rule.declarations.map((decl) => {
				if (decl.type !== css.CssTypes.declaration) return decl;
				const matches = decl.value.match(D2_THEME_VARIABLE_REGEX);
				if (matches == null) return decl;
				const [, group, number] = matches;
				const themeColorKey = group + number;
				if (
					!(themeColorKey in themePalette)
					|| themePalette[themeColorKey] == null
				) {
					throw new Error(
						"Invalid value found in themePalette for the color",
					);
				}
				return {
					...decl,
					value: themePalette[themeColorKey],
				};
			}),
		};
	});
}

function previewThemeCSS(themePalette: Record<string, string>) {
	return css.stringify({
		type: css.CssTypes.stylesheet,
		stylesheet: {
			rules: [
				...D2_FONT_STYLESHEET_RULES.values(),
				...generatePaletteThemedRules(themePalette),
			],
		},
	}, { compress: true });
}

function getDeclarationsMap(rule: css.CssRuleAST) {
	if (rule.type !== css.CssTypes.rule) {
		throw new Error("not a rule with declarations");
	}
	return rule.declarations.reduce((p, c) => {
		if (c.type === css.CssTypes.declaration)
			p[c.property] = c.value;
		return p;
	}, {} as Record<string, string>);
}

function optimiseThemePalette(themePalette: Record<string, string>, used: Set<string>) {
	return Object.fromEntries(
		Object.entries(themePalette)
			.filter(([colorKey]) => used.has(colorKey)),
	);
}

function colorPaletteToDeclarations(themePalette: Record<string, string>) {
	return Object.entries(themePalette).map(([colorKey, value]) => {
		return {
			type: css.CssTypes.declaration,
			property: `--${D2_THEME_VARIABLE_PREFIX}-${colorKey}`,
			value: value,
		} as css.CssDeclarationAST;
	});
}

// === SEARCH INDEX GENERATION
const searchDocuments: SearchDocument[] = [];

for (const course of courses) {
	searchDocuments.push({
		id: `course:${course.code}`,
		type: "course",
		title: course.name,
		context: {
			courseCode: course.code,
			courseName: course.name,
		},
	});

	for (const module of course.modules) {
		searchDocuments.push({
			id: `module:${course.code}-${module.number}`,
			type: "module",
			title: module.name,
			context: {
				courseCode: course.code,
				courseName: course.name,

				moduleName: module.name,
				moduleNumber: module.number,
				moduleSlug: module.slug,
			},
		});

		for (const chapter of module.chapters) {
			searchDocuments.push({
				id: `chapter:${course.code}-${module.number}-${chapter.number}`,
				type: "chapter",
				title: chapter.title,
				context: {
					courseCode: course.code,
					courseName: course.name,

					moduleName: module.name,
					moduleNumber: module.number,
					moduleSlug: module.slug,

					chapterName: chapter.title, // todo: change all "name" to "title"
					chapterNumber: chapter.number,
					chapterSlug: chapter.slug,
				},
			});

			function add(sections: HeadingItem[], parent: string[]) {
				for (const section of sections) {
					searchDocuments.push({
						id: `section:${course.code}-${module.number}-${chapter.number}-${section.slug}`,
						type: "section",
						title: section.title,
						context: {
							courseCode: course.code,
							courseName: course.name,

							moduleName: module.name,
							moduleNumber: module.number,
							moduleSlug: module.slug,

							chapterName: chapter.title,
							chapterNumber: chapter.number,
							chapterSlug: chapter.slug,

							sectionParent: parent,
							sectionSlug: section.slug,
						},
					});

					if (section.children.length > 0) {
						add(section.children, [...parent, section.title]);
					}
				}
			}

			add(chapter.structure, [chapter.title]);
		}
	}
}

console.log("Generated", searchDocuments.length, "search entries");
await writeJSON(join(BUILD_DIR, "search-index.json"), searchDocuments);
