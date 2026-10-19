import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, '..');
const projectDirectory = resolve(desktopDirectory, '..');
const outputDirectory = resolve(desktopDirectory, 'dist');
const files = [
    'memory match copy.html',
    'memory-match.css',
    'memory-match.js',
    'manifest.json',
    'app-icon.svg',
    'service-worker.js',
];
const directories = ['features', 'multiplayer'];

mkdirSync(outputDirectory, { recursive: true });
for (const file of files) {
    cpSync(resolve(projectDirectory, file), resolve(outputDirectory, file));
}
for (const directory of directories) {
    cpSync(resolve(projectDirectory, directory), resolve(outputDirectory, directory), {
        recursive: true,
    });
}

console.log(`Prepared the offline game files in ${outputDirectory}`);
