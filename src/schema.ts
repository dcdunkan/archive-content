import { z } from "zod/v4";

export const COURSE_SCHEMA = z.object({
	code: z.string().nonempty(),
	name: z.string().nonempty()
		.refine((arg) => isNaN(Number(arg))),
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
	parts: z.array(z.string()).default([]),
});

export type CourseData = z.infer<typeof COURSE_SCHEMA>;
export type ModuleData = z.infer<typeof MODULE_SCHEMA>;

export type TOCItem = {
	id: string; // slugged id
	level: number;
	title: string;
	children: TOCItem[];
};

export type Hierarchy = (TOCItem & { content: string })[];

export type Module = ModuleData & {
	path: string;
	slug: string;
	number: number;
	hierarchy: Hierarchy;
	images: Set<string>;
};

export type Course = CourseData & {
	path: string;
	modules: Module[];
};
