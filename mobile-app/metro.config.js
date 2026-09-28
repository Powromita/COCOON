// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);

// `@cocoon/contracts` is the M0 TypeScript package on main
// (packages/contracts/typescript). Its package.json points at a dist/ build
// that isn't committed, so the app resolves the package name straight to its
// source entry instead. Nothing in packages/contracts is modified.
const contractsEntry = path.join(repoRoot, "packages", "contracts", "typescript", "src", "index.ts");
// The M0 sample fixtures (packages/contracts/fixtures/valid) are imported
// directly by mocks/fixtureRegistry.ts rather than copied into the app.
const contractsFixtures = path.join(repoRoot, "packages", "contracts", "fixtures");
config.watchFolders = [...(config.watchFolders ?? []), path.dirname(contractsEntry), contractsFixtures];

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@cocoon/contracts") {
    return { type: "sourceFile", filePath: contractsEntry };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
