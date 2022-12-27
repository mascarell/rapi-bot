const { promises: fs } = require("fs");

// https://dev.to/leonard/get-files-recursive-with-the-node-js-file-system-fs-2n7o
async function getFiles(path) {
	const entries = await fs.readdir(path, { withFileTypes: true });

	// Get files within the current directory and add a path key to the file objects
	const files = entries
		.filter(file => !file.isDirectory())
		.map(file => ({ ...file, path: path + file.name, name: file.name }));

	return files;
}
module.exports = getFiles;