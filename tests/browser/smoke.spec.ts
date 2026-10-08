import { test, expect } from "@playwright/test";
test("demo uploads, shares a one-time file, downloads and revokes", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try isolated demo" }).click();
  await expect(
    page.getByText("Isolated demo account.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("File", { exact: true }).setInputFiles({
    name: "browser-smoke.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("browser sample"),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "browser-smoke.txt text/plain" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  const url = await page.getByLabel("Share link (shown only now)").inputValue();
  const recipientContext = await browser.newContext();
  const recipient = await recipientContext.newPage();
  await recipient.goto(url);
  await expect(
    recipient.getByRole("heading", { name: "Shared file" }),
  ).toBeVisible();
  const downloaded = recipient.waitForEvent("download");
  const redemption = recipient.waitForResponse((response) =>
    response.url().endsWith("/api/shares/redeem"),
  );
  await recipient.getByRole("button", { name: "Download file" }).click();
  const result = await redemption;
  expect(result.status(), "Anonymous share redemption").toBe(200);
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("browser-smoke.txt");
  const { readFile } = await import("node:fs/promises");
  expect(await readFile((await download.path())!, "utf8")).toBe(
    "browser sample",
  );
  await recipient.goto(url);
  await recipient.getByRole("button", { name: "Download file" }).click();
  await expect(recipient.locator('p[role="alert"]')).toContainText(
    "Share unavailable",
  );
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Revoked", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No files found.")).toBeVisible();
  await recipientContext.close();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Try isolated demo" }),
  ).toBeVisible();
});
