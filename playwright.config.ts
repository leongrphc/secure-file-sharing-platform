import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: { baseURL: "http://localhost:33073", headless: true },
  webServer: [
    {
      command: "npm run dev -w @sfs/api",
      url: "http://localhost:34073/api/ready",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -w @sfs/web",
      url: "http://localhost:33073",
      reuseExistingServer: !process.env.CI,
    },
  ],
  timeout: 30000,
});
