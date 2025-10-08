// make sure to build / go dev before running

import { serve } from "@hono/node-server";
import { createReadStream, promises as fsPromises } from "fs";
import { Hono } from "hono";
import mime from "mime";
import { join } from "path";
import { BUILD_DIR } from "./constants.js";

const PORT = 8000;
const SERVE_DIR = BUILD_DIR;

const app = new Hono();

async function resolveCaseInsensitive(filePath: string): Promise<string | null> {
	const parts = filePath.split("/").filter(Boolean);
	let currentDir = SERVE_DIR;

	for (const part of parts) {
		const entries = await fsPromises.readdir(currentDir);
		const match = entries.find(name => name.toLowerCase() === part.toLowerCase());
		if (!match) {
			console.log(currentDir);
			return null;
		}
		currentDir = join(currentDir, match);
	}

	return currentDir;
}

app.get("*", async (c) => {
	const urlPath = decodeURIComponent(c.req.path);
	const resolvedPath = await resolveCaseInsensitive(urlPath);
	if (!resolvedPath) {
		return c.text("File not found", 404);
	}

	try {
		const stat = await fsPromises.stat(resolvedPath);
		if (stat.isDirectory()) {
			return c.text("Forbidden", 403);
		}
		return new Response(createReadStream(resolvedPath) as any, {
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": mime.getType(resolvedPath) || "application/octet-stream",
			},
		});
	} catch (err) {
		return c.text("Internal Server Error", 500);
	}
});

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" });

console.log("File server running at", PORT);
