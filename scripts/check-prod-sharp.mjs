// scripts/check-prod-sharp.mjs: the resize step of scripts/check-prod-sharp.sh (transformate WI-3986),
// moved out of its `node -e` text by transformate WI-4821 (layout only, the same code).
// check-prod-sharp.sh runs it with its working directory at the temporary install dir $W, and it
// resolves next and sharp from that dir (process.cwd()), never from the repo tree beside this file.
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(join(process.cwd(), "check-prod-sharp.cjs"));
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));
sharp({ create: { width: 64, height: 64, channels: 4, background: "#3366ff" } })
  .png().toBuffer()
  .then((png) => sharp(png).resize(16, 16).png().toBuffer({ resolveWithObject: true }))
  .then(({ info }) => {
    if (info.width !== 16 || info.height !== 16) throw new Error("resize gave " + info.width + "x" + info.height);
    console.log("prod sharp OK", sharp.versions.sharp, "libvips", sharp.versions.vips, process.platform, process.arch);
  })
  .catch((e) => { console.error("prod sharp FAILED:", e.message); process.exit(1); });
