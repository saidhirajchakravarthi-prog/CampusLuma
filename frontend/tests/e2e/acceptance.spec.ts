import { expect, test } from '@playwright/test';

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const firebaseBaseUrl = process.env.PLAYWRIGHT_FIREBASE_URL || 'http://127.0.0.1:5174';

async function openApp(page: import('@playwright/test').Page) {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) runtimeErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 500) runtimeErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CampusLuma' })).toBeVisible();
  return runtimeErrors;
}

async function enterGuest(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Explore as Guest/ }).click();
  await expect(page.getByText('Guest Demo', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Overview/ })).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem('siq_token'));
  const resetStatus = await page.evaluate(async (accessToken) => {
    const response = await fetch('/api/demo/reset', { method: 'POST', headers: {
      Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ confirm: 'RESTORE_DEMO' }) });
    return response.status;
  }, token);
  expect(resetStatus).toBe(200);
}

test('guest can open every product module and use sandbox-only import and intervention workflows', async ({ page }, testInfo) => {
  const runtimeErrors = await openApp(page);
  const password = page.locator('#user-password');
  await page.locator('#user-email').focus();
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await password.fill('temporary-invalid-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');

  await page.getByLabel('Institutional Email').fill('browser-check.invalid@example.invalid');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/Invalid email or password|Could not connect|not configured/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Explore as Guest/ })).toBeVisible();

  await enterGuest(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Overview/ })).toBeVisible();
  await expect(page.getByText('Guest Demo', { exact: false }).first()).toBeVisible();
  const guestRoutes = [
    ['/imports', /Data Import/], ['/interventions', /Interventions/], ['/reports', /Reports/],
    ['/predictions', /Predictive Classifier/], ['/model-status', /Model Status/],
  ] as const;
  for (const [path, heading] of guestRoutes) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  }
  await page.goto('/predictions');
  const runPrediction = page.getByRole('button', { name: 'Generate Academic Risk Inference' });
  await expect(runPrediction).toBeEnabled();
  await runPrediction.click();
  await expect(page.getByText('Class Prediction')).toBeVisible();
  await expect(page.getByText(/Pass Probability/)).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.recharts-pie-sector')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('campusluma-desktop.png'), fullPage: true });
  await expect(page.getByText(/synthetic/i).first()).toBeVisible();
  await page.getByRole('link', { name: 'Directory' }).click();
  await expect(page.getByRole('heading', { name: /Student Directory|Students/ })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Search students by ID or name' });
  await search.fill('no-match-browser-check');
  await expect(page.getByText(/No matching student records found/i)).toBeVisible();
  await search.clear();
  await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled();
  const firstPageId = await page.locator('tbody tr').first().locator('td').nth(1).innerText();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText(/Showing 25 of \d+ students/)).toBeVisible();
  await expect(page.locator('tbody tr').first().locator('td').nth(1)).not.toHaveText(firstPageId);
  await page.getByRole('button', { name: 'Previous page' }).click();
  await page.getByRole('link', { name: 'View Profile' }).first().click();
  await expect(page.locator('h1')).toContainText('Synthetic Student');
  await page.getByRole('button', { name: 'Create Intervention' }).click();
  await page.getByPlaceholder('e.g., Scheduled remedial tutoring for mathematics backlogs...').fill('Guest profile support plan');
  await page.getByRole('button', { name: 'Save Intervention' }).click();
  await expect(page.getByText('Intervention logged successfully.')).toBeVisible();
  await expect(page.getByText('Guest profile support plan')).toBeVisible();
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Directory' }).click();

  await page.getByRole('link', { name: 'Early Warning' }).click();
  await expect(page.getByRole('heading', { name: /At-Risk|Early Warning|Students Needing Attention/i })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search at-risk students by ID, name, or department' }).fill('no-match-browser-check');
  await expect(page.getByText(/No students match|No at-risk students/i)).toBeVisible();
  await page.getByRole('textbox', { name: 'Search at-risk students by ID, name, or department' }).clear();
  await page.getByRole('button', { name: 'Start Intervention' }).first().click();
  await page.getByPlaceholder('e.g., Scheduled remedial sessions and barrier consultation with advisor...').fill('Guest early warning support plan');
  await page.getByRole('button', { name: 'Confirm Intervention' }).click();
  await expect(page.getByText(/Support action recorded for/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Filter at-risk students by risk tier' }).selectOption('Medium Risk');
  await expect(page.getByRole('combobox', { name: 'Filter at-risk students by risk tier' })).toHaveValue('Medium Risk');
  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('siq_token'));
  expect(token).toBeTruthy();
  const protectedExport = await page.evaluate(async (accessToken) => {
    const response = await fetch('/api/reports/students.csv', { headers: { Authorization: `Bearer ${accessToken}` } });
    return { status: response.status, text: await response.text() };
  }, token);
  expect(protectedExport.status).toBe(200);
  expect(protectedExport.text).not.toContain('INSTITUTIONAL');

  await page.goto('/imports');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'browser-synthetic.csv', mimeType: 'text/csv',
    buffer: Buffer.from('student_id,name,data_origin,department\nGUEST-BROWSER-1,Guest Browser Learner,SYNTHETIC_TEST,Demo Studies\n'),
  });
  await page.getByRole('button', { name: 'Proceed to Verification' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm & Execute Import' }).click();
  await expect(page.getByRole('heading', { name: 'Import Batch Finished' })).toBeVisible();
  await expect(page.getByText('SYNTHETIC_GUEST_IMPORT:browser-synthetic.csv').first()).toBeVisible();
  await page.goto('/students/GUEST-BROWSER-1');
  await page.reload();
  await expect(page.locator('h1')).toContainText('Guest Browser Learner');

  const demoStudentId = await page.evaluate(async (accessToken) => {
    const response = await fetch('/api/students?page=1&page_size=1', { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await response.json();
    return body.items[0].student_id as string;
  }, token);
  await page.goto('/interventions');
  await page.getByRole('button', { name: /Log New Intervention/ }).click();
  await page.getByPlaceholder('e.g., DEMO-1001').fill(demoStudentId);
  await page.getByPlaceholder('Specify the support or remediation intervention...').fill('Guest demo tutoring follow-up');
  await page.getByRole('button', { name: 'Save Intervention' }).click();
  await expect(page.getByText('Guest demo tutoring follow-up')).toBeVisible();
  await page.getByRole('button', { name: 'Update' }).first().click();
  await expect(page.getByRole('region', { name: 'Intervention change history' })).toContainText('created');
  await page.locator('form select').last().selectOption('In Progress');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Intervention record updated.')).toBeVisible();

  const guestSandboxRead = await page.evaluate(async (accessToken) => {
    const response = await fetch('/api/students/GUEST-BROWSER-1', { headers: { Authorization: `Bearer ${accessToken}` } });
    return response.status;
  }, token);
  expect(guestSandboxRead).toBe(200);

  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: /Reports/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('aside')).toHaveClass(/-translate-x-full/);
  await page.screenshot({ path: testInfo.outputPath('campusluma-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await expect(page.getByRole('button', { name: 'Close navigation menu' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Reports' }).click();
  const closeMobileMenu = page.getByRole('button', { name: 'Close navigation menu' }).first();
  if (await closeMobileMenu.isVisible()) await closeMobileMenu.click();
  await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Restore demo data' }).click();
  await expect(page).toHaveURL(`${appBaseUrl}/`);
  const restoredLookup = await page.evaluate(async (accessToken) => {
    const response = await fetch('/api/students/GUEST-BROWSER-1', { headers: { Authorization: `Bearer ${accessToken}` } });
    return response.status;
  }, token);
  expect(restoredLookup).toBe(404);
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page.getByRole('button', { name: /Explore as Guest/ })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('administrator can open staff pages, forms and download existing reports without modifying records', async ({ page }) => {
  const runtimeErrors = await openApp(page);
  const adminQuickFill = page.getByRole('button', { name: /Administrator/ });
  await expect(adminQuickFill).toBeVisible();
  await adminQuickFill.click();
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Data Import' })).toBeVisible();

  await page.getByRole('link', { name: 'Interventions' }).click();
  await expect(page.getByRole('heading', { name: /Interventions/ })).toBeVisible();
  await page.getByRole('button', { name: /Log New Intervention/ }).click();
  const idInput = page.getByPlaceholder('e.g., DEMO-1001');
  await expect(idInput).toBeVisible();
  await expect(idInput).toHaveAttribute('required', '');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('link', { name: 'Data Import' }).click();
  await expect(page.getByRole('heading', { name: 'Data Import & Data Quality' })).toBeVisible();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: 'invalid-check.csv', mimeType: 'text/csv', buffer: Buffer.from('unexpected_column\ninvalid') });
  await expect(page.getByText(/unexpected_column|missing|required|map/i).first()).toBeVisible();

  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: /Reports/ })).toBeVisible();
  const downloads = [
    { label: 'Download .XLSX Report', index: 0, name: /campusluma_report\.xlsx$/ },
    { label: 'Download .CSV Report', index: 0, name: /campusluma_report\.csv$/ },
    { label: 'Download .PDF Report', index: 0, name: /campusluma_report\.pdf$/ },
    { label: 'Download .CSV Report', index: 1, name: /campusluma_observations\.csv$/ },
  ];
  for (const { label, index, name } of downloads) {
    const download = page.waitForEvent('download', { timeout: 12_000 }).catch(() => null);
    await page.getByRole('button', { name: label }).nth(index).click();
    const result = await download;
    if (!result) {
      await expect(page.getByRole('heading', { name: /Report Generation Error/ })).toBeVisible();
    } else {
      expect(result.suggestedFilename()).toMatch(name);
    }
  }
  await page.getByRole('button', { name: 'Sign Out' }).click();
  expect(runtimeErrors).toEqual([]);
});

test('reduced motion preference is respected and mobile guest navigation stays within the viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await enterGuest(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth > window.innerWidth,
    elements: Array.from(document.querySelectorAll('body *')).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, className: typeof element.className === 'string' ? element.className.slice(0, 100) : '', right: Math.round(rect.right), width: Math.round(rect.width) };
    }).filter((item) => item.width > 0 && item.right > window.innerWidth + 1).slice(0, 12),
  }));
  expect(overflow.page, JSON.stringify(overflow.elements)).toBe(false);
  const motionDuration = await page.locator('body').evaluate((body) => getComputedStyle(body).transitionDuration);
  expect(motionDuration.split(',').every((duration) => parseFloat(duration) <= 0.01)).toBe(true);
});

test('Firebase-mode login renders real provider and email account controls without sending live requests', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) runtimeErrors.push(message.text());
  });
  await page.goto(`${firebaseBaseUrl}/`);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore as Guest' })).toBeVisible();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByText(/Email verification is required/)).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('Firebase credential errors are readable and always release the sign-in loading state', async ({ page }) => {
  await page.route('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword**', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } }),
    });
  });
  await page.goto(`${firebaseBaseUrl}/`);
  await page.getByLabel('Institutional Email').fill('browser-auth-test@example.invalid');
  await page.locator('#user-password').fill('incorrect-test-password');
  const signIn = page.getByRole('button', { name: 'Sign In' });
  await signIn.click();
  await expect(page.getByText('Invalid email or password.')).toBeVisible();
  await expect(signIn).toBeEnabled();
  await expect(signIn).toHaveText(/Sign In/);
});
