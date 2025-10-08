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

export const COURSE_SCHEMA = z.object({
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

export const MODULE_SCHEMA = z.object({
	number: z.int(),
	name: z.string(),
	syllabus: z.array(z.string()).default([]),
	chapters: z.array(z.string()).default([]),
});

export type CourseData = z.infer<typeof COURSE_SCHEMA>;
export type ModuleData = z.infer<typeof MODULE_SCHEMA>;

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
export type SearchDocument =
	| CourseSearchDocument
	| ModuleSearchDocument
	| ChapterSearchDocument
	| SectionSearchDocument;

type BaseSearchDocument = {
	id: string;
	type: "course" | "module" | "chapter" | "section";
	title: string;
};

// Global scope: courses, and other possible utilities

interface CourseSearchDocument extends BaseSearchDocument {
	type: "course";
	context: {
		courseCode: string;
		courseName: string;
	};
}

// Course scope: modules

interface ModuleSearchDocument extends BaseSearchDocument {
	type: "module";

	context: {
		courseCode: string;
		courseName: string;

		moduleNumber: number;
		moduleSlug: string;
		moduleName: string;
	};
}

// Module Scope: chapters, sections, questions, figures, videos, terms.

interface ChapterSearchDocument extends BaseSearchDocument {
	type: "chapter";

	context: {
		courseCode: string;
		courseName: string;

		moduleSlug: string;
		moduleNumber: number;
		moduleName: string;

		chapterSlug: string;
		chapterNumber: number;
		chapterName: string;
	};
}

interface SectionSearchDocument extends BaseSearchDocument {
	type: "section";

	context: {
		courseCode: string;
		courseName: string;

		moduleSlug: string;
		moduleNumber: number;
		moduleName: string;

		chapterSlug: string;
		chapterNumber: number;
		chapterName: string;

		parent: string[];
	};
}

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
