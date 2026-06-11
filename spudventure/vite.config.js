import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build so the game can be played by opening dist/index.html
// directly from disk (no server needed).
export default defineConfig({
  plugins: [viteSingleFile()],
});
