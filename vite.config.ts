import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Version shown in the pause menu and the console: package.json's version plus the commit it was built from. */
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
let commit = 'dev';
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // Not a git checkout: keep 'dev'.
}

export default defineConfig({
  base: './',
  server: { port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
});
