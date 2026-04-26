import { expect, test } from "@playwright/test";

test.describe("App smoke checks", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page).toHaveTitle(/.+/);
  });

  test("signup page loads", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/signup/);
    await expect(page).toHaveTitle(/.+/);
  });

  test("sentry example page loads", async ({ page }) => {
    await page.goto("/sentry-example-page");
    await expect(page).toHaveURL(/\/sentry-example-page/);
    await expect(page).toHaveTitle(/.+/);
  });
});
