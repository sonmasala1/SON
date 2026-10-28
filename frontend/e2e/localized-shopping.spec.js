const {
  test,
  expect,
  customerSignIn,
  enterCustomerCode,
  mfaCode,
} = require("./fixtures");

async function hindi(page) {
  await page.locator(".language-toggle button").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
}
async function english(page) {
  await page.locator(".language-toggle button").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

test("switching languages updates a visible cart notification without changing the guest bag", async ({
  page,
}) => {
  await page.goto("/shop");
  await hindi(page);
  const card = page.locator(".product-card").filter({
    has: page.getByRole("heading", { name: "हल्दी पाउडर", exact: true }),
  });
  await card
    .getByRole("button", { name: "कार्ट में जोड़ें", exact: true })
    .click();
  await expect(page.locator(".toast")).toHaveText(
    "हल्दी पाउडर आपके बैग में जुड़ गया",
  );
  await page
    .getByRole("button", { name: "शॉपिंग बैग बंद करें", exact: true })
    .click();
  await english(page);
  await expect(page.locator(".toast")).toHaveText(
    "Haldi Powder added to your bag",
  );
  await expect(
    page.getByRole("button", { name: "Shopping cart, 1 items", exact: true }),
  ).toBeVisible();
  await hindi(page);
  await expect(page.locator(".toast")).toHaveText(
    "हल्दी पाउडर आपके बैग में जुड़ गया",
  );
  await expect(
    page.getByRole("button", { name: "शॉपिंग कार्ट, 1 उत्पाद", exact: true }),
  ).toBeVisible();
});

for (const width of [320, 390, 768, 1440])
  test(`language toggle and Hindi catalogue stay responsive at ${width}px`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/shop");
    await expect(
      page.getByRole("heading", { name: "Haldi Powder", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".save-product, .wishlist-link")).toHaveCount(0);
    await hindi(page);
    await expect(
      page.getByRole("heading", { name: "हल्दी पाउडर", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "कार्ट में जोड़ें", exact: true }),
    ).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(
      page.getByRole("heading", { name: "हल्दी पाउडर", exact: true }),
    ).toBeVisible();
    if ([390, 1440].includes(width))
      await page.screenshot({
        path: `../artifacts/hindi-shop-${width}.png`,
        fullPage: true,
      });
    await page.goto("/login");
    await expect(page.getByLabel("पूरा नाम", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "गूगल से आगे बढ़ें", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: "../artifacts/hindi-login-390.png",
        fullPage: true,
      });
    await english(page);
    await expect(page.getByLabel("FULL NAME", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

test("Hindi guest cart → OTP → checkout → demo confirmation preserves quantities, totals and language", async ({
  page,
  backendURL,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/shop");
  await hindi(page);
  const card = page.locator(".product-card").filter({
    has: page.getByRole("heading", { name: "हल्दी पाउडर", exact: true }),
  });
  await card
    .getByRole("button", { name: "कार्ट में जोड़ें", exact: true })
    .click();
  await page
    .getByRole("button", { name: "हल्दी पाउडर की मात्रा बढ़ाएँ" })
    .click();
  await page.getByRole("button", { name: "शॉपिंग बैग बंद करें" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "शॉपिंग कार्ट, 2 उत्पाद" }),
  ).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText("₹247.00", { exact: true })).toBeVisible();
  const before = (await (await page.request.get(backendURL + "/cart")).json())
    .cart;
  await page.getByRole("link", { name: "चेकआउट पर जाएँ", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  await customerSignIn(page, { name: "सीमा देवी", channel: "WhatsApp OTP" });
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByLabel("पूरा नाम", { exact: true })).toHaveValue(
    "सीमा देवी",
  );
  const after = (await (await page.request.get(backendURL + "/cart")).json())
    .cart;
  expect(after.count).toBe(2);
  expect(after.items).toHaveLength(1);
  expect(after.totals).toEqual(before.totals);
  await page.getByRole("button", { name: "ऑर्डर की समीक्षा करें" }).click();
  expect(
    await page
      .locator('input[name="email"]')
      .evaluate((element) => element.validationMessage),
  ).toMatch(/[\u0900-\u097f]/u);
  const delivery = {
    fullName: "सीमा देवी",
    email: "synthetic@example.com",
    phone: "9876543210",
    address: "123 नमूना मार्ग",
    city: "जयपुर",
    state: "राजस्थान",
    pincode: "302001",
  };
  for (const [name, value] of Object.entries(delivery))
    await page.locator(`[name="${name}"]`).fill(value);
  await page.getByRole("button", { name: "ऑर्डर की समीक्षा करें" }).click();
  await expect(
    page.getByRole("heading", { name: "अपने नमूना ऑर्डर की समीक्षा करें" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "नमूना भुगतान पर जाएँ" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "सफल भुगतान का परीक्षण करें", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "आपका नमूना ऑर्डर हो गया है!" }),
  ).toBeVisible();
  await expect(page.getByText("₹247.00", { exact: true })).toBeVisible();
  await expect(
    page.getByText("नमूना भुगतान सफल", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../artifacts/hindi-order-confirmation.png",
    fullPage: true,
  });
  await page.goto("/login?next=%2Fcheckout");
  await expect(page).toHaveURL(/\/checkout$/);
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "नमस्ते, सीमा देवी." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "आपके ऑर्डर" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("MongoDB favourites restore across sign-out/new browser cookies and remain private to a different customer", async ({
  page,
  browser,
  backendURL,
  advanceAuthClock,
}) => {
  await page.goto("/shop");
  await expect(page.locator(".save-product")).toHaveCount(0);
  await page.goto("/wishlist");
  await expect(
    page.getByRole("heading", { name: "Sign in to save your favourites." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign In", exact: true }).last().click();
  await customerSignIn(page, { name: "Favourite Shopper" });
  await expect(page).toHaveURL(/\/wishlist$/);
  await page.goto("/shop");
  await page
    .getByRole("button", { name: "Save Haldi Powder to wishlist" })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove Haldi Powder from wishlist" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/product/dhaniya-powder");
  await page
    .getByRole("button", { name: "Save Dhaniya Powder to wishlist" })
    .click();
  await page.goto("/wishlist");
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/shop");
  await expect(page.locator(".save-product, .wishlist-link")).toHaveCount(0);
  expect((await page.request.get(backendURL + "/wishlist")).status()).toBe(401);
  await page.goto("/login");
  await customerSignIn(page, { name: "Other Shopper", phone: "9876543211" });
  await page.goto("/wishlist");
  await expect(page.locator(".product-card")).toHaveCount(0);
  const clean = await browser.newContext();
  try {
    const restored = await clean.newPage();
    await restored.route("**/api/v1/**", (route) => {
      const url = new URL(route.request().url());
      url.port = new URL(backendURL).port;
      return route.continue({ url: url.toString() });
    });
    await advanceAuthClock(61000);
    await restored.goto("http://localhost:3000/login");
    await customerSignIn(restored, { name: "Ignored Name" });
    await expect(
      restored.getByRole("heading", { name: "Hello, Favourite Shopper." }),
    ).toBeVisible();
    await restored.goto("http://localhost:3000/wishlist");
    await expect(restored.locator(".product-card")).toHaveCount(2);
    await restored
      .getByRole("button", { name: "Remove Haldi Powder from wishlist" })
      .click();
    await expect(restored.locator(".product-card")).toHaveCount(1);
    await restored.reload();
    await expect(restored.locator(".product-card")).toHaveCount(1);
  } finally {
    await clean.close();
  }
});

test("guest direct checkout redirects, and an expired session cannot continue checkout", async ({
  page,
  backendURL,
  advanceAuthClock,
}) => {
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  await customerSignIn(page);
  await expect(page).toHaveURL(/\/checkout$/);
  await advanceAuthClock(31 * 86400000);
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  expect(
    (
      await page.request.post(backendURL + "/checkout/preview", {
        headers: { Origin: "http://localhost:3000" },
        data: {},
      })
    ).status(),
  ).toBe(401);
});

test("Hindi validation and public information pages switch back completely to English", async ({
  page,
}) => {
  await page.goto("/login");
  await hindi(page);
  await page.locator("#customer-full-name").fill("सीमा देवी");
  await page.locator("#customer-mobile").fill("9876543210");
  const sent = page.waitForResponse((response) =>
    response.url().includes("/auth/send-otp"),
  );
  await page.locator(".customer-auth-primary").click();
  const challenge = await (await sent).json();
  const wrong = String(
    (Number(challenge.developmentCode) + 1) % 1000000,
  ).padStart(6, "0");
  await enterCustomerCode(page, wrong);
  await page.locator(".customer-auth-primary").click();
  await expect(
    page.locator(".customer-auth-card").getByRole("alert"),
  ).toContainText("सत्यापन कोड गलत है");
  for (const [route, heading] of [
    ["/about", "थोड़ा मसाला। घर जैसा स्वाद।"],
    ["/policies", "दुकान की जानकारी।"],
    ["/contact", "हमेशा गुंजाइश है बातचीत के लिए।"],
    ["/recipes", "अच्छा भोजन। अपनापन भरे एहसास।"],
  ]) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    expect(
      (await page.locator("main").innerText()).replace(
        /SON MASALA|sonmasala1@gmail.com|\+91 9026041718/g,
        "",
      ),
    ).not.toMatch(/[A-Za-z]{3}/);
  }
  await english(page);
  expect(await page.locator("main").innerText()).not.toMatch(
    /[\u0900-\u097f]/u,
  );
});

test("Hindi owner and staff dashboards retain separate authentication and customer-only APIs", async ({
  page,
  backendURL,
  staffCredentials,
  ownerCredentials,
}) => {
  await page.goto("/admin/login");
  await hindi(page);
  for (const [realm, credentials, button] of [
    ["admin", staffCredentials, "प्रशासक के रूप में लॉग इन करें"],
    ["owner", ownerCredentials, "मालिक के रूप में लॉग इन करें"],
  ]) {
    await page.goto(`/${realm}/login`);
    await page.locator('input[name="adminId"]').fill(credentials.adminId);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page
      .locator('input[name="mfaCode"]')
      .fill(mfaCode(credentials.secret));
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "व्यवसाय डैशबोर्ड", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "प्रशासनिक नेविगेशन" }),
    ).toBeVisible();
    expect((await page.request.get(backendURL + "/wishlist")).status()).toBe(
      401,
    );
    expect(
      (
        await page.request.post(backendURL + "/checkout/preview", {
          headers: { Origin: "http://localhost:3000" },
          data: {},
        })
      ).status(),
    ).toBe(401);
  }
  await english(page);
  await expect(
    page.getByRole("heading", { name: "Business dashboard", exact: true }),
  ).toBeVisible();
});
