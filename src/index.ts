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

async function resolveModuleDirectory(root: string): Promise<Module> {
	const moduleMetadata = await fs.readFile(join(root, "module.yaml"), "utf8")
		.then((content) => z.parse(MODULE_SCHEMA, parse(content)));

	mdit.renderer.rules.image = function(tokens, idx) {
		const token = tokens[idx];
		let src = token.attrGet("src");
		if (src == null) {
			throw new Error("invalid image src");
		}

		// todo: find missing images
		const alt = token.content;
		const title = token.attrGet("title");

		return [
			`<figure>`,
			[
				`<img`,
				`src="${src}"`,
				`alt="${alt}"`,
				`loading="lazy"`,
				`decoding="async"`,
				title ? `data-caption="${mdit.utils.escapeHtml(title)}"` : "",
				`/>`,
			].join(" "),
			...(title ? [`<figcaption>${title}</figcaption>`] : []),
			`</figure>`,
		].join("");
	};

	const USED_IMAGES = new Set<string>();
	const ALL_IMAGES = new Set<string>();
	const hierarchy: Hierarchy = [];

	for (const filename of moduleMetadata.parts) {
		headingSlugger.reset(); // reset each time

		const fileContent = await fs.readFile(join(root, filename), "utf8");

		const tokens = mdit.parse(fileContent.trim(), {});
		const fileToc = getMarkdownToc(tokens);
		if (fileToc.length !== 1 || fileToc[0].level !== 1) {
			throw new Error("Module part should have the the part name as H1 and only one H1");
		}

		mdit.renderer.render(tokens, mdit.options, {});

		// manage content and toc
		hierarchy.push({
			...fileToc[0],
			content: fileContent,
			// content: mdit.renderer.render(tokens, mdit.options, {}), // to prevent the slug re-occurrence
		});

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
		console.log(unusedImages.size, "unused images found:");
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
		path: root,
		slug: moduleNameSlugify(moduleMetadata.name.trim(), {
			lowercase: true,
			separator: "-",
		}),
		images: USED_IMAGES,
	};
}

function getMarkdownToc(tokens: Token[]) {
	const root: TOCItem[] = [];
	const stack: TOCItem[][] = [root];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.type === "heading_open") {
			const level = Number(token.tag[1]);
			if (level <= MAX_TOC_DEPTH) {
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
			...course satisfies CourseData,
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
				...module,
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
