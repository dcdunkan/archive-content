import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { $, which } from "zx";
import { D2_DIAGRAM_FONTS_ROOT_DIR, D2_FONT_FILENAMES } from "./constants.js";

// todo: generalize this for all stored maps
export async function openImageMapFile(src: string): Promise<Map<string, string>> {
	if (!existsSync(src)) {
		return new Map();
	}
	const content = await fs.readFile(src, "utf8");
	const parsed = JSON.parse(content);
	if (typeof parsed !== "object") {
		throw new Error("invalid encoding of image mapping file");
	}
	const map = new Map<string, string>(Object.entries(parsed));
	validateImageMap(map);
	return map;
}

export function validateImageMap(map: Map<string, string>) {
	const used = new Set<string>();
	for (const [key, value] of map) {
		if (!existsSync(key)) {
			map.delete(key);
			continue;
		}
		if (typeof value !== "string") {
			throw new Error("invalid image id type");
		}
		if (value.length == 0) {
			throw new Error("invalid image id (length of zero)");
		}
		if (used.has(value)) {
			throw new Error("duplicate image id was used: " + value);
		}
		used.add(value);
	}
}

/**
 * Class created specifically for handling two versions of mappings. The class
 * takes in a previously generated map of the same type.
 *
 * Whenever a value is set, it reuses the value from the previous map if it
 * exists, otherwise sets the new value. Unused keys can be iterated through the
 * `getUnusedKeys` method.
 */
export class UsageHistoryMap<K, V> extends Map<K, V> {
	#usedKeys: Set<K>;

	constructor(prev: Map<K, V>) {
		super(); // its kind of stupid that `super()` calls `this` instead of `super` when doing `set()`.
		for (const [key, value] of prev) {
			super.set(key, value);
		}

		this.#usedKeys = new Set();
	}

	get(key: K): V | undefined {
		this.#usedKeys.add(key);
		return super.get(key);
	}

	set(key: K, value: V): this {
		super.set(key, value);
		this.#usedKeys.add(key);
		return this;
	}

	delete(key: K): boolean {
		this.#usedKeys.delete(key);
		return super.delete(key);
	}

	clear(): void {
		this.#usedKeys.clear();
		return super.clear();
	}

	getUnusedKeys(): SetIterator<K> {
		return new Set(this.keys())
			.difference(this.#usedKeys)
			.keys();
	}
}

// todo: tool for checking the formatting of d2 in markdown

const D2_FLAGS = ([
	["--pad", 0],
	["--no-xml-tag"],
	["--font-regular", join(D2_DIAGRAM_FONTS_ROOT_DIR, D2_FONT_FILENAMES.Regular)],
	["--font-italic", join(D2_DIAGRAM_FONTS_ROOT_DIR, D2_FONT_FILENAMES.Italic)],
	["--font-semibold", join(D2_DIAGRAM_FONTS_ROOT_DIR, D2_FONT_FILENAMES.Semibold)],
	["--font-bold", join(D2_DIAGRAM_FONTS_ROOT_DIR, D2_FONT_FILENAMES.Bold)],
] satisfies ([string] | [string, unknown])[]).flat().map((s) => String(s));

const D2_PATH = process.env.D2_PATH || await which("d2", { nothrow: true });
if (D2_PATH == null) {
	throw new Error("D2 executable not found in PATH. Set D2_PATH if its elsewhere");
}

// The library version of D2 has some dangling promises and worker threads that are not closed
// after the usage. This is likely a bug in the library. Hence, switch to CLI, which makes the
// d2 cli a requirement for building the content.
// todo: remove this later when library is working fine
export async function renderD2toSVG(str: string) {
	if (str.length === 0) {
		throw new Error("Empty string was passed to d2 render job");
	}

	const result = await $`echo ${str}`
		.pipe($`${D2_PATH} ${D2_FLAGS} -`)
		.quiet();

	if (!result.ok) {
		console.error(result);
		console.error(str);
		throw new Error("Failed to render the d2 node");
	}
	if (result.stdout.length === 0) {
		throw new Error("Expected an SVG output");
	}
	return result.stdout.trim();
}
