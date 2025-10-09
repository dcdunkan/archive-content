import { ResvgRenderOptions } from "@resvg/resvg-js";
import { CompileOptions } from "@terrastruct/d2";
import { join } from "node:path";

export const DATA_DIR = "./data";
export const BUILD_DIR = "./build";

export const IMAGE_EXT = "jpeg";
export const THUMBNAIL_EXT = "jpeg";
export const THUMBNAIL_WIDTH = 64;
export const THUMBNAIL_HEIGHT = 64;
export const IMAGE_DIR = join(BUILD_DIR, "images");
export const IMAGE_MAPPING_GENERATED_FILE = "./image-map.data.json";
export const IMAGE_THUMBNAILS_DIR = join(IMAGE_DIR, "thumbnails");

export const D2_IMAGE_EXT = "png";
export const D2_THUMBNAIL_EXT = "jpeg";
export const DIAGRAMS_DIR = join(BUILD_DIR, "diagrams");
export const DIAGRAMS_COMMON_STYLES_PATH = join(DIAGRAMS_DIR, "styles.css");
export const DIAGRAMS_PREVIEWS_DIR = join(DIAGRAMS_DIR, "previews");
export const DIAGRAMS_THUMBNAILS_DIR = join(DIAGRAMS_DIR, "thumbnails");

type FontKeys = keyof CompileOptions;
type FontSuffix<K> = K extends `font${infer X}` ? X : never;
type FontNames = FontSuffix<FontKeys>;
export const D2_DIAGRAM_FONTS_ROOT_DIR = "./src/resources/fonts-d2";
export const D2_FONT_FILENAMES: Record<FontNames, string> = {
	Regular: "RecursiveSansLnrSt-Regular.ttf",
	Italic: "RecursiveSansLnrSt-Italic.ttf",
	Semibold: "RecursiveSansLnrSt-SemiBold.ttf",
	Bold: "RecursiveSansLnrSt-Bold.ttf",
};

// todo: switch back to library mode from CLI mode when the dangling workers are fixed

// export const D2_RENDER_OPTIONS: RenderOptions = {
// 	pad: 0,
// 	noXMLTag: true,
// };
// export const D2_COMPILE_OPTIONS: CompileOptions = {
// 	fontRegular: await readD2FontFile(D2_FONT_FILENAMES.Regular),
// 	fontItalic: await readD2FontFile(D2_FONT_FILENAMES.Italic),
// 	fontSemibold: await readD2FontFile(D2_FONT_FILENAMES.Semibold),
// 	fontBold: await readD2FontFile(D2_FONT_FILENAMES.Bold),
// 	...D2_RENDER_OPTIONS,
// };
// function readD2FontFile(filename: string) {
// 	return fs.readFile(join(D2_DIAGRAM_FONTS_ROOT_DIR, filename));
// }

export const FONT_CLASSES_MAPPING: Record<string, Record<string, string>> = {
	"text": {
		"font-family": "\"Recursive\"",
		"font-weight": "400",
	},
	"text-bold": {
		"font-family": "\"Recursive\"",
		"font-weight": "700",
	},
	"text-semibold": {
		"font-family": "\"Recursive\"",
		"font-weight": "600",
	},
	"text-italic": {
		"font-family": "\"Recursive\"",
		"font-weight": "400",
		"font-style": "italic",
	},
};
// https://github.com/terrastruct/d2/blob/dbd5895305e9896cf2cc6487786d0ef3ac0a39a6/d2themes/d2themes.go#L138
const WARM_NEUTRAL = {
	N1: "#170206",
	N2: "#535152",
	N3: "#787777",
	N4: "#CCCACA",
	N5: "#DFDCDC",
	N6: "#ECEBEB",
	N7: "#FFFFFF",
};
// https://github.com/terrastruct/d2/blob/dbd5895305e9896cf2cc6487786d0ef3ac0a39a6/d2themes/d2themes.go#L148
const DARK_NEUTRAL = {
	N1: "#F4F6FA",
	N2: "#BBBEC9",
	N3: "#868A96",
	N4: "#676D7D",
	N5: "#3A3D49",
	N6: "#191C28",
	N7: "#000410",
};
export const THEMES = {
	// https://github.com/terrastruct/d2/blob/dbd5895305e9896cf2cc6487786d0ef3ac0a39a6/d2themes/d2themescatalog/everglade_green.go#L5
	EVERGLADE_GREEN: {
		...WARM_NEUTRAL,

		B1: "#023324",
		B2: "#048E63",
		B3: "#49BC99",
		B4: "#A6E2D0",
		B5: "#CAF2E6",
		B6: "#EBFDF7",

		AA2: "#D35F0A",
		AA4: "#FABA8A",
		AA5: "#FFE0C7",

		AB4: "#C9B9A1",
		AB5: "#E9DBCA",
	},
	// lets see
	DARK_EVERGLADE_GREEN: {
		...DARK_NEUTRAL,

		B1: "#A5D6A7",
		B2: "#81C784",
		B3: "#4CAF50",
		B4: "#2E7D32",
		B5: "#1B5E20",
		B6: "#0D3B1E",

		AA2: "#FFB74D",
		AA4: "#FB8C00",
		AA5: "#EF6C00",

		AB4: "#C8E6C9",
		AB5: "#388E3C",
	},
};
export const LIGHT_THEME_COLORS = THEMES.EVERGLADE_GREEN;
export const DARK_THEME_COLORS = THEMES.DARK_EVERGLADE_GREEN;
export const D2_BACKGROUND_COLOR_THEME_KEY = "N7"; // https://github.com/terrastruct/d2/blob/dbd5895305e9896cf2cc6487786d0ef3ac0a39a6/lib/color/color.go#L133
export const D2_THEME_VARIABLE_PREFIX = "d2-theme";
export const D2_COMMON_CLASS_PROPERTIES = ["fill", "background-color", "stroke", "color"];
export const D2_COLOR_PREFIXES = ["N", "B", "AA", "AB"];
export const D2_CLASS_REGEXP = new RegExp(
	`(${D2_COMMON_CLASS_PROPERTIES.join("|")})-(${D2_COLOR_PREFIXES.join("|")})(\\d+)`,
);
export const D2_THEME_VARIABLE_REGEX = new RegExp(
	`var\\(--${D2_THEME_VARIABLE_PREFIX}-(${D2_COLOR_PREFIXES.join("|")})(\\d+)\\)`,
);

export const RESVG_RENDER_OPTIONS: ResvgRenderOptions = {
	font: {
		fontFiles: Object.values(D2_FONT_FILENAMES)
			.map((filename) => join(D2_DIAGRAM_FONTS_ROOT_DIR, filename)),
		loadSystemFonts: false,
	},
};
