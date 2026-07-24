import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const platform = process.argv[2];
const outputDirectory = resolve(process.argv[3] ?? "release");
const supportedPlatforms = new Set(["macos", "windows", "linux"]);

if (!supportedPlatforms.has(platform)) {
  console.error(
    `Usage: node scripts/verify-release-artifacts.mjs <${[...supportedPlatforms].join("|")}> [output-directory]`,
  );
  process.exit(2);
}

if (!existsSync(outputDirectory) || !statSync(outputDirectory).isDirectory()) {
  console.error(`Release output directory does not exist: ${outputDirectory}`);
  process.exit(1);
}

const files = readdirSync(outputDirectory).filter((file) =>
  statSync(resolve(outputDirectory, file)).isFile(),
);

const requirements = {
  macos: [
    ["DMG", (file) => file.endsWith(".dmg")],
    ["DMG blockmap", (file) => file.endsWith(".dmg.blockmap")],
    ["ZIP", (file) => file.endsWith(".zip")],
    ["ZIP blockmap", (file) => file.endsWith(".zip.blockmap")],
    ["macOS update metadata", (file) => file === "latest-mac.yml"],
  ],
  windows: [
    ["NSIS installer", (file) => file.endsWith(".exe")],
    ["NSIS blockmap", (file) => file.endsWith(".exe.blockmap")],
    ["MSI installer", (file) => file.endsWith(".msi")],
    ["Windows update metadata", (file) => file === "latest.yml"],
  ],
  linux: [
    ["AppImage", (file) => file.endsWith(".AppImage")],
    ["DEB package", (file) => file.endsWith(".deb")],
    ["Linux update metadata", (file) => file === "latest-linux.yml"],
  ],
};

const missing = requirements[platform]
  .filter(([, matches]) => !files.some(matches))
  .map(([label]) => label);

const empty = files.filter(
  (file) => statSync(resolve(outputDirectory, file)).size === 0,
);

const packageVersion = JSON.parse(
  readFileSync(resolve("package.json"), "utf8"),
).version;
const metadataName = {
  macos: "latest-mac.yml",
  windows: "latest.yml",
  linux: "latest-linux.yml",
}[platform];
const metadataPath = resolve(outputDirectory, metadataName);
const metadata = existsSync(metadataPath)
  ? readFileSync(metadataPath, "utf8")
  : "";
const metadataHasExpectedVersion =
  metadata.length > 0 &&
  new RegExp(
    `^version:\\s*['"]?${packageVersion.replaceAll(".", "\\.")}['"]?\\s*$`,
    "m",
  ).test(metadata);
const metadataHasChecksums = /^\s*sha512:\s*\S+/m.test(metadata);

const metadataReferences = [
  ...metadata.matchAll(/^\s*(?:url|path):\s*(.+?)\s*$/gm),
].map(([, value]) => {
  const unquoted = value.replace(/^(['"])(.*)\1$/, "$2");
  let decoded = unquoted;
  try {
    decoded = decodeURIComponent(unquoted);
  } catch {
    // Electron Builder normally emits plain or percent-encoded filenames.
  }
  return decoded.replaceAll("\\", "/").split("/").at(-1);
});
const missingMetadataReferences = [
  ...new Set(
    metadataReferences.filter(
      (file) => !file || !files.includes(file),
    ),
  ),
];

const primaryPath = metadata.match(/^path:\s*(.+?)\s*$/m)?.[1];
const expectedPrimaryExtension = {
  macos: ".zip",
  windows: ".exe",
  linux: ".AppImage",
}[platform];
const metadataHasExpectedPrimary =
  typeof primaryPath === "string" &&
  primaryPath
    .replace(/^(['"])(.*)\1$/, "$2")
    .endsWith(expectedPrimaryExtension);

if (
  missing.length > 0 ||
  empty.length > 0 ||
  !metadataHasExpectedVersion ||
  !metadataHasChecksums ||
  metadataReferences.length === 0 ||
  missingMetadataReferences.length > 0 ||
  !metadataHasExpectedPrimary
) {
  if (missing.length > 0) {
    console.error(`Missing ${platform} artifacts: ${missing.join(", ")}`);
  }
  if (empty.length > 0) {
    console.error(`Empty release artifacts: ${empty.join(", ")}`);
  }
  if (!metadataHasExpectedVersion) {
    console.error(
      `${metadataName} does not declare package version ${packageVersion}.`,
    );
  }
  if (!metadataHasChecksums) {
    console.error(`${metadataName} does not contain SHA-512 checksums.`);
  }
  if (metadataReferences.length === 0) {
    console.error(`${metadataName} does not reference any release artifacts.`);
  }
  if (missingMetadataReferences.length > 0) {
    console.error(
      `${metadataName} references artifacts that are not present: ${missingMetadataReferences.join(", ")}.`,
    );
  }
  if (!metadataHasExpectedPrimary) {
    console.error(
      `${metadataName} does not use ${expectedPrimaryExtension} as its primary auto-update artifact.`,
    );
  }
  process.exit(1);
}

console.log(`Verified ${platform} release artifacts:`);
for (const file of files.sort()) {
  console.log(`- ${file}`);
}
