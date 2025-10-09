import * as Hast from "hast";
import { h } from "hastscript";
import * as Mdast from "mdast";
import * as MdastMath from "mdast-util-math";
import { Handler } from "mdast-util-to-hast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePresetMinify from "rehype-preset-minify";
import rehypeStringify from "rehype-stringify";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { Figure } from "./types.js";

const BACKEND_ROOT_URL = process.env.URL; // netfliy context
if (BACKEND_ROOT_URL == null) {
	throw new Error("URL environment variable invalid");
}

export async function rehypeMdast(markdownRoot: Mdast.Root, options: {
	moduleNumber: number;
	chapterNumber: number;
}) {
	const processor = unified()
		.use(remarkRehype, {
			allowDangerousHtml: true,
			handlers: {
				heading: heading(), // todo: should i switch to rehype-slug from the current custom one?
				figure: figure({
					moduleNumber: options.moduleNumber,
					chapterNumber: options.chapterNumber,
				}),
				math: math(),
				inlineMath: math(),
				// reminder: make sure to add and modify handlers whenever remark custom plugins are modified
			},
		})
		.use(rehypeAutolinkHeadings, { behavior: "wrap" })
		.use(rehypeStringify, { allowDangerousHtml: true })
		.use(rehypePresetMinify);

	const hastTree = await processor.run(markdownRoot);

	return processor.stringify(hastTree);
}

function heading(): Handler {
	return function(state, node: Mdast.Heading) {
		if (node.data == null || node.data.id == null) {
			throw new Error("heading without data or id?");
		}
		return h("h" + node.depth, { id: node.data.id }, state.all(node));
	};
}

function figure(options: {
	moduleNumber: number;
	chapterNumber: number;
}): Handler {
	return function(state, node: Figure) {
		let childNode: Hast.ElementContent;

		if (node.child.type === "image") {
			const url = node.child.url[0] === "/"
				? BACKEND_ROOT_URL + node.child.url
				: node.child.url;

			childNode = h("img", {
				src: url,
				alt: node.child.alt,
				title: node.child.title,
				loading: "lazy",
				decoding: "async",
				"data-caption": node.child.title,
			});
		} else if (node.child.type === "d2") {
			if (node.child.diagram.type === "svg") {
				childNode = {
					type: "raw",
					value: node.child.diagram.raw,
				};
			} else if (node.child.diagram.type === "source") {
				throw new Error(
					"Source types must be transformed to compiled svg before rehype",
				);
			} else {
				throw new Error("Unknown diagram type inside figure");
			}
		} else {
			throw new Error("unknown type of figure");
		}

		const figureNumber = [
			options.moduleNumber,
			options.chapterNumber,
			node.number,
		].join(".");

		return h("figure", [
			childNode,
			h("figcaption", [
				h("div", "Fig " + figureNumber),
				h("div", node.caption),
			]),
		]);
	};
}

function math(): Handler {
	return function(state, node: MdastMath.Math | MdastMath.InlineMath) {
		if (typeof node.renderedString !== "string" || node.renderedString.trim().length === 0) {
			throw new Error("math rendering failed?");
		}
		return { type: "raw", value: node.renderedString };
	};
}
