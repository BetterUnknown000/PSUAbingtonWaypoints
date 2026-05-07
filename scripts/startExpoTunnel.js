#!/usr/bin/env node

const { spawn } = require("child_process");

const args = process.argv.slice(2);
const expoCli = require.resolve("expo/bin/cli");

const child = spawn(process.execPath, [expoCli, "start", "--tunnel", ...args], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    EXPO_FORCE_WEBCONTAINER_ENV: "1",
  },
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
