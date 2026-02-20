const { execSync } = require("child_process");

exports.default = async function (context) {
  const appOutDir = context.appOutDir;
  console.log("[afterPack] Cleaning:", appOutDir);

  // Strip all extended attributes recursively
  execSync(`xattr -cr "${appOutDir}"`);

  // Remove ._* files (AppleDouble resource forks)
  execSync(`find "${appOutDir}" -name '._*' -delete 2>/dev/null || true`);

  // Remove .DS_Store files
  execSync(`find "${appOutDir}" -name '.DS_Store' -delete 2>/dev/null || true`);

  // Remove existing code signatures from all binaries so codesign can sign clean
  execSync(`find "${appOutDir}" -type f -name '*.dylib' -exec codesign --remove-signature {} \\; 2>/dev/null || true`);
  execSync(`find "${appOutDir}" -type d -name '*.app' -exec codesign --remove-signature {} \\; 2>/dev/null || true`);
  execSync(`find "${appOutDir}" -type d -name '*.framework' -exec codesign --remove-signature {} \\; 2>/dev/null || true`);

  // Strip xattrs again after signature removal
  execSync(`xattr -cr "${appOutDir}"`);

  console.log("[afterPack] Done cleaning");
};
