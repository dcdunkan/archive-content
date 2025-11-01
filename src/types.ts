import "unified";
import { CssAtRuleAST } from "@adobe/css-tools";
import * as Hast from "hast";
import * as Mdast from "mdast";
import { z } from "zod/v4";
import { UsageHistoryMap } from "./utilities.js";

// === UNIFIED STUFF
export interface Figure extends Mdast.Node {
	type: "figure";
	caption: string;
	number: number;
	child: Mdast.Image | D2Node;
}

export interface D2Node extends Mdast.Node {
	type: "d2";
	meta: string | null | undefined;
	diagram: {
		type: "source";
		value: string;
	} | {
		type: "svg";
		hash: string;
		width: number;
		height: number;
		raw: string;
	};
}

declare module "mdast" {
	interface HeadingData {
		id: string;
	}

	interface ImageData {
		height: number;
		width: number;
		size: number;
	}

	interface RootContentMap {
		figure: Figure;
	}
}

declare module "mdast-util-math" {
	interface Math {
		renderedString: string;
	}

	interface InlineMath {
		renderedString: string;
	}
}

declare module "unified" {
	export interface Data {
	}
}

// === PARSED CONTENT
export type HeadingItem = {
	slug: string;
	title: string;
	depth: number;
	children: HeadingItem[];
};

export type ModuleChapter = {
	number: number;
	title: string;
	slug: string;
	structure: HeadingItem[];
	content: Mdast.Root;
};

export const COURSE_DATA_SCHEMA = z.object({
	code: z.string().nonempty(),
	name: z.string().nonempty()
		.refine((arg) => isNaN(Number(arg))),
	description: z.string().nonempty(),
	preamble: z.string(),
	textbooks: z.array(z.string()),
	referenceBooks: z.array(z.string()),
	nptelCourse: z
		.union([
			z.object({ title: z.string().nonempty(), url: z.url() }),
			z.object({ title: z.string().nonempty() }),
			z.object({ url: z.url() }),
		])
		.optional(),
});

export const MODULE_DATA_SCHEMA = z.object({
	number: z.int(),
	name: z.string(),
	syllabus: z.array(z.string()).default([]),
	chapters: z.array(z.string()).default([]),
});

export type CourseData = z.infer<typeof COURSE_DATA_SCHEMA>;
export type ModuleData = z.infer<typeof MODULE_DATA_SCHEMA>;

export type Module = Omit<ModuleData, "chapters"> & {
	path: string;
	slug: string;
	number: number;
	chapters: ModuleChapter[];
};

export type Course = CourseData & {
	path: string;
	modules: Module[];
};

// === SEARCH INDEX
// todo: make this shared between repos
export type SearchDocument = z.infer<typeof searchDocumentSchema>;

export const baseSearchDocumentSchema = z.object({
	id: z.string().nonempty(),
	title: z.string().nonempty(),
}).strict();

// Global scope: courses, and other possible utilities
export const courseSearchDocumentSchema = baseSearchDocumentSchema.extend({
	type: z.literal("course"),
	context: z.object({
		courseCode: z.string(),
		courseName: z.string(),
	}).strict(),
}).strict();

// Course scope: modules
export const moduleSearchDocumentSchema = baseSearchDocumentSchema.extend({
	type: z.literal("module"),
	context: z.object({
		courseCode: z.string(),
		courseName: z.string(),

		moduleNumber: z.int(),
		moduleSlug: z.string(),
		moduleName: z.string(),
	}).strict(),
}).strict();
// Module Scope: chapters, sections, questions, figures, videos, terms.

export const chapterSearchDocumentSchema = baseSearchDocumentSchema.extend({
	type: z.literal("chapter"),
	context: z.object({
		courseCode: z.string(),
		courseName: z.string(),

		moduleNumber: z.int(),
		moduleSlug: z.string(),
		moduleName: z.string(),

		chapterNumber: z.int(),
		chapterSlug: z.string(),
		chapterName: z.string(),
	}).strict(),
}).strict();

export const sectionSearchDocumentSchema = baseSearchDocumentSchema.extend({
	type: z.literal("section"),
	context: z.object({
		courseCode: z.string(),
		courseName: z.string(),

		moduleNumber: z.int(),
		moduleSlug: z.string(),
		moduleName: z.string(),

		chapterNumber: z.int(),
		chapterSlug: z.string(),
		chapterName: z.string(),

		sectionParent: z.array(z.string()),
		sectionSlug: z.string(),
	}).strict(),
}).strict();

export const searchDocumentSchema = z.discriminatedUnion("type", [
	courseSearchDocumentSchema,
	moduleSearchDocumentSchema,
	chapterSearchDocumentSchema,
	sectionSearchDocumentSchema,
]);

// Build
export type Diagram = {
	// value: string;
	fontClasses: Set<string>;
	// themeColors: Map<string, string>;
	colorStylesheetRules: CssAtRuleAST[];
	hastTree: Hast.Root;
	themeKeys: Set<string>;
};
export type ImageIdMap = UsageHistoryMap<string, string>;
export type DiagramMap = Map<string, Diagram>;
export type MapTypes<M extends Map<unknown, unknown>> = M extends Map<infer K, infer V> ? [K, V]
	: never;

// Generated file schemas
export const COURSE_FILE_SCHEMA = z.object({
	code: z.string().nonempty(),
	name: z.string().nonempty(),
	description: z.string().nonempty(),
	preamble: z.string().nonempty(),
	referenceBooks: z.array(z.string()),
	textbooks: z.array(z.string()),
	modules: z.array(
		z.object({
			number: z.int().positive(),
			name: z.string().nonempty(),
			slug: z.string().nonempty(),
			syllabus: z.array(z.string()).nonempty(),
		}).strict(),
	),
}).strict();
const headingItemSchema: z.ZodSchema<HeadingItem> = z.lazy(() =>
	z.object({
		slug: z.string(),
		title: z.string(),
		depth: z.number(),
		children: z.array(headingItemSchema),
	}).strict()
);
export const MODULE_FILE_SCHEMA = z.object({
	number: z.int().positive(),
	name: z.string().nonempty(),
	slug: z.string().nonempty(),
	syllabus: z.array(z.string()).nonempty(),
	chapters: z.array(
		z.object({
			number: z.int().positive(),
			title: z.string().nonempty(),
			slug: z.string().nonempty(),
			structure: z.array(headingItemSchema),
		}).strict(),
	),
}).strict();
export const CHAPTER_FILE_COMMON_SCHEMA = z.object({
	number: z.int().positive(),
	title: z.string().nonempty(),
	slug: z.string().nonempty(),
	structure: z.array(headingItemSchema),
}).strict();
export const CHAPTER_FILE_JSON_SCHEMA = CHAPTER_FILE_COMMON_SCHEMA.extend({
	content: z.object({
		type: z.literal("root"),
		data: z.object().optional(),
		children: z.array(z.any()), // it's all good for our case, mdast type safety is covered by the typings.
		position: z.undefined(),
	}).strict(),
}).strict();
export const CHAPTER_FILE_HTML_SCHEMA = CHAPTER_FILE_COMMON_SCHEMA.extend({
	content: z.string(),
}).strict();
export const COURSES_FILE_SCHEMA = z.array(
	z.object({
		code: z.string().nonempty(),
		name: z.string().nonempty(),
		description: z.string().nonempty(),
		modules: z.array(
			z.object({
				number: z.int().positive(),
				name: z.string().nonempty(),
				slug: z.string().nonempty(),
			}).strict(),
		),
	}).strict(),
);

export const SEARCH_INDEX_FILE_SCHEMA = z.array(searchDocumentSchema);
