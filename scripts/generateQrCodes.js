const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { buildPayload, getQrFilename, getQrTargets } = require("./qrCodeTargets");

const projectRoot = path.join(__dirname, "..");
const outputDir = path.join(projectRoot, "src", "assets", "qrcodes");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || args.has("--plan");
const cleanStale = !args.has("--no-clean");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toProjectRelative(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

function expectedFilePath(waypoint) {
  return path.join(outputDir, waypoint.building, getQrFilename(waypoint));
}

function listPngFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) files.push(...listPngFiles(entryPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) files.push(entryPath);
  }
  return files;
}

function removeEmptyDirs(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(dirPath, entry.name);
    removeEmptyDirs(entryPath);
    if (fs.readdirSync(entryPath).length === 0) fs.rmdirSync(entryPath);
  }
}

function getStaleFiles(expectedFiles) {
  const expected = new Set(expectedFiles.map((filePath) => path.resolve(filePath).toLowerCase()));
  return listPngFiles(outputDir).filter(
    (filePath) => !expected.has(path.resolve(filePath).toLowerCase())
  );
}

function cleanupStaleFiles(staleFiles) {
  for (const filePath of staleFiles) fs.unlinkSync(filePath);
  removeEmptyDirs(outputDir);
}

async function writeQrFile(waypoint, category) {
  const buildingDir = path.join(outputDir, waypoint.building);
  ensureDir(buildingDir);

  const filePath = expectedFilePath(waypoint);
  const payload = buildPayload(waypoint);

  await QRCode.toFile(filePath, payload.app_url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 480,
    color: {
      dark: "#0b1f33",
      light: "#ffffff",
    },
  });

  return {
    ...payload,
    category,
    encoded_value: payload.app_url,
    file: toProjectRelative(filePath),
  };
}

function summarizeTargets(targets) {
  return targets.reduce((summary, { category }) => {
    summary[category] = (summary[category] || 0) + 1;
    return summary;
  }, {});
}

async function main() {
  const uniqueTargets = getQrTargets();
  const expectedFiles = uniqueTargets.map(({ waypoint }) => expectedFilePath(waypoint));
  const staleFiles = cleanStale ? getStaleFiles(expectedFiles) : [];

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          wouldGenerate: uniqueTargets.length,
          byCategory: summarizeTargets(uniqueTargets),
          wouldRemoveStale: staleFiles.length,
          staleFiles: staleFiles.map(toProjectRelative),
          note: "No files were written. Run npm run qrs:generate when ready.",
        },
        null,
        2
      )
    );
    return;
  }

  ensureDir(outputDir);
  const manifest = [];

  for (const { waypoint, category } of uniqueTargets) {
    const entry = await writeQrFile(waypoint, category);
    manifest.push(entry);
  }

  if (cleanStale) cleanupStaleFiles(staleFiles);

  const manifestPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        generated: manifest.length,
        byCategory: summarizeTargets(uniqueTargets),
        removedStale: cleanStale ? staleFiles.length : 0,
        manifest: toProjectRelative(manifestPath),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
