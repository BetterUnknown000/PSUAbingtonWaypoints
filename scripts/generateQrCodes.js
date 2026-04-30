const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { buildPayload, getQrTargets } = require("./qrCodeTargets");

const outputDir = path.join(__dirname, "..", "src", "assets", "qrcodes");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function writeQrFile(waypoint, category) {
  const buildingDir = path.join(outputDir, waypoint.building);
  ensureDir(buildingDir);

  const filename = `${waypoint.id}.png`;
  const filePath = path.join(buildingDir, filename);
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
    file: path.relative(path.join(__dirname, ".."), filePath).replace(/\\/g, "/"),
  };
}

async function main() {
  ensureDir(outputDir);
  const uniqueTargets = getQrTargets();

  const manifest = [];

  for (const { waypoint, category } of uniqueTargets) {
    const entry = await writeQrFile(waypoint, category);
    manifest.push(entry);
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        generated: manifest.length,
        manifest: path.relative(path.join(__dirname, ".."), manifestPath).replace(/\\/g, "/"),
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
