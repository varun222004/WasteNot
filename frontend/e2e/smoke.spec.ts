import { expect, test } from "@playwright/test";

// Requires the API running with DEV_OTP_ENABLED=true (development only).
test("sign in with email code and reach My activity", async ({ page }) => {
  await page.goto("/login?next=/me");
  await page.getByTestId("login-email-input").fill(`e2e-${Date.now()}@example.com`);
  await page.getByTestId("login-send-code-btn").click();
  const code = await page.getByTestId("dev-otp-code").innerText();
  await page.getByTestId("login-code-input").fill(code);
  await page.getByTestId("login-verify-btn").click();
  await page.getByTestId("profile-name-input").fill("E2E Neighbour");
  await page.getByTestId("profile-save-btn").click();
  await expect(page.getByTestId("my-stats")).toBeVisible();
});

test("public discovery works without signing in", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByTestId("discover-search-input")).toBeVisible();
});
