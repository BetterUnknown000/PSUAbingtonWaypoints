const QRCode = require("qrcode");
const { buildPayload, getQrTargets } = require("./qrCodeTargets");

async function main() {
  const targets = getQrTargets().map(({ waypoint, category }) => ({
    waypoint,
    category: category.charAt(0).toUpperCase() + category.slice(1),
  }));

  for (let index = 0; index < targets.length; index += 1) {
    const { waypoint, category } = targets[index];
    const payload = buildPayload(waypoint);
    const qr = await QRCode.toString(payload.app_url, {
      type: "terminal",
      small: true,
    });

    process.stdout.write("\n");
    process.stdout.write("=".repeat(72) + "\n");
    process.stdout.write(`${category}: ${waypoint.label}\n`);
    process.stdout.write(
      `Building: ${waypoint.building} | Floor: ${waypoint.floor} | QR ID: ${waypoint.qr_code}\n`
    );
    process.stdout.write(
      `Coordinates: ${waypoint.latitude}, ${waypoint.longitude}\n`
    );
    process.stdout.write("-".repeat(72) + "\n");
    process.stdout.write(qr);
    process.stdout.write("-".repeat(72) + "\n");
    process.stdout.write(`App Link: ${payload.app_url}\n`);
    process.stdout.write(`Payload: ${JSON.stringify(payload)}\n`);

    if (index < targets.length - 1) {
      process.stdout.write("\f\n");
    }
  }

  process.stdout.write("\n" + "=".repeat(72) + "\n");
  process.stdout.write(`Printed ${targets.length} QR codes.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
