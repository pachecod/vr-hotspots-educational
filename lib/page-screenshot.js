const fs = require('fs');

const DEFAULT_VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };

async function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.platform === 'linux') {
    try {
      const chromium = require('@sparticuz/chromium');
      return chromium.executablePath();
    } catch (_) {}
  }
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function buildLaunchOptions() {
  const executablePath = await resolveExecutablePath();
  if (!executablePath) return null;

  if (process.platform === 'linux') {
    try {
      const chromium = require('@sparticuz/chromium');
      return {
        executablePath,
        headless: chromium.headless ?? true,
        args: [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
        defaultViewport: DEFAULT_VIEWPORT,
      };
    } catch (_) {}
  }

  return {
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
    defaultViewport: DEFAULT_VIEWPORT,
  };
}

function isScreenshotAvailable() {
  if (process.env.PLAYGROUND_SCREENSHOT_ENABLED === 'false') return false;
  return true;
}

async function waitForPageReady(page) {
  await page.evaluate(async () => {
    const fonts = document.fonts;
    if (fonts && fonts.ready) {
      try {
        await fonts.ready;
      } catch (_) {}
    }
    const images = Array.from(document.images || []);
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          })
      )
    );
  });
  await new Promise((r) => setTimeout(r, 250));
}

/**
 * Render HTML in headless Chrome and return a JPEG buffer of the viewport.
 * Returns null when no browser is available.
 */
async function captureHtmlScreenshot(html, options = {}) {
  if (!isScreenshotAvailable()) return null;

  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (err) {
    console.warn('Page screenshot skipped: puppeteer-core not installed');
    return null;
  }

  const launchOptions = await buildLaunchOptions();
  if (!launchOptions) {
    console.warn('Page screenshot skipped: no Chrome/Chromium executable found');
    return null;
  }

  const viewport = { ...DEFAULT_VIEWPORT, ...(options.viewport || {}) };
  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setContent(String(html || ''), {
      waitUntil: ['load', 'domcontentloaded', 'networkidle2'],
      timeout: options.timeout || 20000,
    });
    await waitForPageReady(page);
    return await page.screenshot({
      type: 'jpeg',
      quality: options.quality ?? 85,
      fullPage: false,
    });
  } catch (err) {
    console.warn('Page screenshot failed:', err.message);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
  }
}

module.exports = {
  captureHtmlScreenshot,
  isScreenshotAvailable,
  resolveExecutablePath,
};
