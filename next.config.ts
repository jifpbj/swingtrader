import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// When running from a git worktree, node_modules may be a symlink to the main
// repo. Turbopack's sandbox requires its root to contain the *real* node_modules
// path — so we resolve the symlink and use its parent as the root.
const realNodeModules = fs.realpathSync(path.join(__dirname, "node_modules"));
const turbopackRoot = path.dirname(realNodeModules);

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
};

export default nextConfig;
