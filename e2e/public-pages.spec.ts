import { expect, test } from "@playwright/test";

test.describe("public entry points", () => {
  test("landing page explains what Vaulty does", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /the important things in your life/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  });

  test("sign-in page renders", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.getByRole("heading", { name: /sign in to vaulty/i })).toBeVisible();
  });

  test("unauthenticated users are redirected from the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("heading", { name: /sign in to vaulty/i })).toBeVisible();
  });
});
