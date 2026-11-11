import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

// The pg set (deck-main RULING 4823): test files with a `.pg.` name segment need a throwaway PostgreSQL
// (SETUP_PG_URL) and fail loud without one. `npm test` leaves them out; `npm run test:pg` (vitest.pg.config.ts)
// runs only them, through scripts/with-throwaway-pg.sh. src/lib/test-collection.test.ts fails if a tracked
// test file is in neither set or in both.
export const PG_TESTS = ["src/**/*.pg.test.{ts,tsx}", "src/**/*.pg.*.test.{ts,tsx}"];

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
    exclude: [...configDefaults.exclude, ...PG_TESTS],
  },
});
