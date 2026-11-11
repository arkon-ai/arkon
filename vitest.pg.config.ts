import { configDefaults, defineConfig } from "vitest/config";
import base, { PG_TESTS } from "./vitest.config";

// `npm run test:pg`: only the pg set, against the throwaway database scripts/with-throwaway-pg.sh starts.
export default defineConfig({
  ...base,
  test: { ...base.test, include: PG_TESTS, exclude: configDefaults.exclude },
});
