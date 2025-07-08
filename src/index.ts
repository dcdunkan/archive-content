import { slugifyWithCounter } from "@sindresorhus/slugify";
import { parse } from "@std/yaml";
import GithubSlugger from "github-slugger";
import MarkdownIt from "markdown-it";
import markdownItAnchorPlugin from "markdown-it-anchor";
import Token from "markdown-it/lib/token.mjs";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { basename, join, posix } from "node:path";
import { z } from "zod/v4";
import { markdownItFancyListPlugin } from "./markdown-it-plugins/fancy-lists/index.js";
import { markdownItKatexPlugin } from "./markdown-it-plugins/katex/index.js";
import {
	Course,
	COURSE_SCHEMA,
	CourseData,
	Hierarchy,
	Module,
	MODULE_SCHEMA,
	TOCItem,
} from "./schema.js";

const DATA_DIR = "./data";
const MAX_TOC_DEPTH = 3;
const BUILD_DIR = "./build";

const moduleNameSlugify = slugifyWithCounter();

async function resolveCourseDirectory(root: string) {
	const courseMetadata = await fs.readFile(join(root, "course.yaml"), "utf8")
		.then((content) => z.parse(COURSE_SCHEMA, parse(content)));

	const modules: Module[] = [];
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;

		moduleNameSlugify.reset();
		const module = await resolveModuleDirectory(join(root, entry.name));
		modules.push(module);
	}

	return {
		code: courseMetadata.code,
		name: courseMetadata.name,
		preamble: courseMetadata.preamble,
		textbooks: courseMetadata.textbooks,
		referenceBooks: courseMetadata.referenceBooks,
		nptelCourse: courseMetadata.nptelCourse,
		modules: modules,
		path: root,
	};
}

const headingSlugger = new GithubSlugger();
const mdit = new MarkdownIt({
	html: true,
	linkify: true,
	typographer: true,
})
	.use(markdownItAnchorPlugin, {
		slugify: (str) => headingSlugger.slug(str, false),
		permalink: markdownItAnchorPlugin.permalink
			.headerLink({ symbol: "#" }),
	})
	.use(markdownItKatexPlugin)
	.use(markdownItFancyListPlugin, {});

async function resolveModuleDirectory(
	root: string,
): Promise<Module> {
	const moduleMetadata = await fs.readFile(join(root, "module.yaml"), "utf8")
		.then((content) => z.parse(MODULE_SCHEMA, parse(content)));

	const USED_IMAGES = new Set<string>();
	const ALL_IMAGES = new Set<string>();

	// todo: make a single full hierarchy and restrict the depth as needed instead of generating twice.
	const hierarchy: Hierarchy = [];
	const fullHierarchy: TOCItem[] = [];

	for (const filename of moduleMetadata.parts) {
		headingSlugger.reset(); // reset each time

		const fileContent = await fs.readFile(join(root, filename), "utf8");

		const tokens = mdit.parse(fileContent.trim(), {});
		const fileToc = getMarkdownToc(tokens, MAX_TOC_DEPTH);
		if (fileToc.length !== 1 || fileToc[0].level !== 1) {
			throw new Error("Module part should have the the part name as H1 and only one H1");
		}

		// mdit.renderer.render(tokens, mdit.options, {});

		// manage content and toc
		hierarchy.push({
			...fileToc[0],
			content: fileContent,
			// content: mdit.renderer.render(tokens, mdit.options, {}), // to prevent the slug re-occurrence
		});

		const fullHierarchyToc = getMarkdownToc(tokens, 6);
		fullHierarchy.push(fullHierarchyToc[0]);

		// manage images
		const images = tokens.filter((token) => token.type === "inline")
			.flatMap((token) => token.children || [])
			.filter((child) => child.type === "image")
			.map((image) => image.attrGet("src"))
			.filter((src) => src != null)
			.filter((src) => src.length > 0 && !URL.canParse(src))
			.map((src) => join(root, src));

		for (const image of images) {
			USED_IMAGES.add(image);
		}
	}

	const imagesDir = join(root, "images");
	if (existsSync(imagesDir)) {
		for await (const entry of await fs.readdir(imagesDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			ALL_IMAGES.add(join(imagesDir, entry.name));
		}
	}

	// list unused images
	const unusedImages = ALL_IMAGES.difference(USED_IMAGES);
	if (unusedImages.size > 0) {
		console.log(unusedImages.size, "Unused images found:");
		console.log("\t" + Array.from(unusedImages).join("\n\t"));
	}

	const missingImages = USED_IMAGES.difference(ALL_IMAGES);
	if (missingImages.size > 0) {
		console.log(missingImages.size, "Missing images found:");
		console.log("\t" + Array.from(missingImages).join("\n\t"));
	}

	return {
		number: moduleMetadata.number,
		name: moduleMetadata.name,
		syllabus: moduleMetadata.syllabus,
		parts: moduleMetadata.parts,
		hierarchy: hierarchy,
		fullHierarchy: fullHierarchy,
		path: root,
		slug: moduleNameSlugify(moduleMetadata.name.trim(), {
			lowercase: true,
			separator: "-",
		}),
		images: USED_IMAGES,
	};
}

function getMarkdownToc(tokens: Token[], maxDepth: number) {
	const root: TOCItem[] = [];
	const stack: TOCItem[][] = [root];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.type === "heading_open") {
			const level = Number(token.tag[1]);
			if (level <= maxDepth) {
				const anchorToken = tokens[i + 1];
				if (
					anchorToken.children == null
					|| anchorToken.children[0]?.type !== "link_open"
				) {
					throw new Error("Invalid heading & link");
				}
				const inlineToken = tokens[i + 1].children![1];
				const title = inlineToken.type === "text" ? inlineToken.content : "";
				const id = token.attrGet("id");
				if (id == null) {
					throw new Error("invalid id");
				}
				const entry: TOCItem = {
					id: id,
					level: level,
					title: title,
					children: [],
				};
				if (!stack[level - 1]) {
					stack[level - 1] = root;
				}
				stack[level - 1].push(entry);
				stack[level] = entry.children;
			}
		}
	}
	return root;
}

// todo: more logging during build
// todo: could potentially introduce serving parts separately

// == BUILD ==
await fs.rm(BUILD_DIR, { recursive: true, force: true });

const courses: Course[] = [];

const coursesDir = join(DATA_DIR, "courses");
for (const entry of await fs.readdir(coursesDir, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const coursePath = join(coursesDir, entry.name);
	const course = await resolveCourseDirectory(coursePath);
	courses.push(course);
}

const buildCoursesDir = join(BUILD_DIR, "course");
await fs.mkdir(buildCoursesDir, { recursive: true });

for (const { path, modules, ...course } of courses) {
	await fs.writeFile(
		join(buildCoursesDir, course.code + ".json"),
		JSON.stringify({
			// todo: could introduce some actual type and use the spread operators instead of explicit specifying.
			// or... is it really necessary? being explicit hides the ambiguity tho. sticking with it for now.
			code: course.code,
			name: course.name,
			preamble: course.preamble,
			referenceBooks: course.referenceBooks,
			textbooks: course.textbooks,
			modules: modules.map(({ number, name, slug, syllabus }) => ({
				number,
				name,
				slug,
				syllabus,
			})),
		}),
		"utf8",
	);

	const buildCourseDir = join(buildCoursesDir, course.code);
	await fs.mkdir(buildCourseDir, { recursive: true });

	const buildModulesDir = join(buildCourseDir, "module");
	await fs.mkdir(buildModulesDir, { recursive: true });

	for (const { path, hierarchy, parts, images, ...module } of modules) {
		const buildModuleImagesDir = join(buildModulesDir, module.number.toString(), "images");
		await fs.mkdir(buildModuleImagesDir, { recursive: true });

		for (const src of images) {
			const filename = basename(src);
			const filepath = join(path, "images", filename);
			await fs.copyFile(filepath, join(buildModuleImagesDir, filename));
		}

		await fs.writeFile(
			join(buildModulesDir, module.number + ".json"),
			JSON.stringify({
				// todo: could introduce some actual type and use the spread operators instead of explicit specifying.
				// or... is it really necessary? being explicit hides the ambiguity tho. sticking with it for now.
				number: module.number,
				name: module.name,
				syllabus: module.syllabus,
				slug: module.slug,
				hierarchy: hierarchy.map(({ content, ...part }) => part),
				parts: hierarchy.map(({ content }) => content),
			}),
			"utf8",
		);
	}
}

await fs.writeFile(
	join(BUILD_DIR, "courses.json"),
	JSON.stringify(courses.map((course) => {
		return {
			code: course.code,
			name: course.name,
			modules: course.modules.map((module) => {
				return {
					number: module.number,
					name: module.name,
					slug: module.slug,
				};
			}),
		};
	})),
	"utf8",
);

// == BUILD search index

type CourseSearchDocument = {
	type: "course";
	name: string;
	code: string;
	modules: number;
};
type ModuleSearchDocument = {
	type: "module";
	name: string;
	number: number;
	slug: string;
	courseCode: string;
	courseName: string;
};
// todo: full text search through the content (use smthing like remove-markdown?)
type ChapterSearchDocument = {
	type: "chapter";
	title: string;
	chapterId: string;
	chapterNumber: number;
	moduleName: string;
	moduleNumber: number;
	moduleSlug: string;
	courseCode: string;
	courseName: string;
};
type SectionSearchDocument = {
	type: "section";
	title: string;
	sectionId: string;
	parent: string[];
	level: number;
	moduleName: string;
	moduleNumber: number;
	moduleSlug: string;
	courseCode: string;
	courseName: string;
};
type TermSearchDocument = {
	type: "term";
}; // what about glossary??

// todo:
type FigureSearchDocument = {
	type: "figure";
	figure_type: "image" | "diagram";
	src: string;
	caption: string;
	alt: string;
};
type QuestionSearchDocument = {
	type: "question";
};
// could todo:
// - video descriptions/transcripts
// - bits & ai based search result

// todo: make this shared
type SearchDocument =
	| CourseSearchDocument
	| ModuleSearchDocument
	| ChapterSearchDocument
	| SectionSearchDocument
	| TermSearchDocument
	| FigureSearchDocument
	| QuestionSearchDocument;

const searchDocuments: SearchDocument[] = [];

for (const course of courses) {
	searchDocuments.push({
		type: "course",
		code: course.code,
		name: course.name,
		modules: course.modules.length,
	});

	for (const module of course.modules) {
		searchDocuments.push({
			type: "module",
			name: module.name,
			slug: module.slug,
			number: module.number,
			courseCode: course.code,
			courseName: course.name,
		});

		for (const [chapterIndex, hierarchyItem] of module.fullHierarchy.entries()) {
			searchDocuments.push({
				type: "chapter",
				title: hierarchyItem.title,
				chapterId: hierarchyItem.id,
				chapterNumber: chapterIndex + 1,
				courseCode: course.code,
				courseName: course.name,
				moduleName: module.name,
				moduleNumber: module.number,
				moduleSlug: module.slug,
			});
			addSectionsToSearchDocuments(
				{
					courseCode: course.code,
					courseName: course.name,
					moduleName: module.name,
					moduleNumber: module.number,
					moduleSlug: module.slug,
				},
				hierarchyItem.children,
				[hierarchyItem.title],
			);
		}
	}
}

function addSectionsToSearchDocuments(
	common: Omit<
		SectionSearchDocument,
		"type" | "title" | "level" | "sectionId" | "parent"
	>,
	tocItems: TOCItem[],
	parent: string[],
) {
	for (const item of tocItems) {
		searchDocuments.push({
			type: "section",
			title: item.title,
			level: item.level,
			sectionId: item.id,
			parent: parent,
			...common,
		});

		if (item.children.length > 0) {
			addSectionsToSearchDocuments(common, item.children, [...parent, item.title]);
		}
	}
}

await fs.writeFile(
	join(BUILD_DIR, "search-index.json"),
	JSON.stringify(searchDocuments),
	"utf8",
);

console.log("Indexed", searchDocuments.length, "search entries");
for (
	const [type, groupCount] of Object.entries(searchDocuments.reduce((p, c) => {
		if (p[c.type] == null) {
			p[c.type] = 0;
		}
		p[c.type]++;
		return p;
	}, {} as Record<string, number>))
) {
	console.log(type, groupCount);
}
