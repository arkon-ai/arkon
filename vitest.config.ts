import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Every src test file (transformate WI-3996). vitest expands this itself: the old npm script's
    // `src/**/*.test.ts` ran under sh, where ** acts as *, and collected about half of src.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
