import { promises as fs } from "fs";
import path from "path";

export async function getFiles(dirPath: string): Promise<Array<{ path: string; name: string }>> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	return entries
		.filter((entry: { isFile: () => boolean; }) => entry.isFile())
		.map((file: { name: string; }) => ({
			path: path.join(dirPath, file.name),
			name: file.name
		}));
}
