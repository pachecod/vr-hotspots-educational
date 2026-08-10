const fs = require('fs');
const dns = require('dns').promises;
const net = require('net');
const { hostnameLooksBlocked, isPrivateOrMetadataIp } = require('./security/ssrf-guard');

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
        args: [...chromium.args, '--hide-scrollbars'],
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

async function assertUrlSafeForScreenshot(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return false;
  }
  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:' || parsed.protocol === 'about:') {
    return true;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostnameLooksBlocked(hostname)) return false;
  if (net.isIP(hostname)) {
    return !isPrivateOrMetadataIp(hostname);
  }
  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    for (const entry of addresses) {
      if (isPrivateOrMetadataIp(entry.address)) return false;
    }
    return addresses.length > 0;
  } catch (_) {
    return false;
  }
}

async function installScreenshotRequestGuard(page) {
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    try {
      const ok = await assertUrlSafeForScreenshot(request.url());
      if (!ok) {
        await request.abort('blockedbyclient');
        return;
      }
      await request.continue();
    } catch (_) {
      try {
        await request.abort('failed');
      } catch (__) {}
    }
  });
}

async function preparePageForScreenshot(page) {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `
      .a-modal,
      .a-enter-vr-modal,
      .a-orientation-modal,
      .a-loader-title,
      .loading-overlay,
      #loading-overlay {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);

    document.querySelectorAll('a-scene').forEach((scene) => {
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
      scene.setAttribute('embedded', 'true');
    });

    document.querySelectorAll('.a-modal, [class*="modal"]').forEach((el) => {
      const text = (el.textContent || '').toLowerCase();
      if (text.includes('https') || text.includes('device sensor') || text.includes('enter vr')) {
        el.remove();
      }
    });
  });

  const scene = await page.$('a-scene');
  if (scene) {
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('a-scene');
          return el && el.hasLoaded;
        },
        { timeout: 12000 }
      );
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 1500));
  } else {
    await waitForPageReady(page);
  }
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
    await installScreenshotRequestGuard(page);

    await page.evaluateOnNewDocument(() => {
      try {
        Object.defineProperty(window, 'isSecureContext', { get: () => true });
      } catch (_) {}
    });

    await page.setContent(String(html || ''), {
      waitUntil: ['load', 'domcontentloaded', 'networkidle2'],
      timeout: options.timeout || 20000,
    });
    await preparePageForScreenshot(page);
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
