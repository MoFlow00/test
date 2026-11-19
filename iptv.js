const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

// ... (نفس إعدادات settings و دوال Log و Telegram و uploadToGithub كما هي) ...

(async () => {
    console.log("🚀 [Start] Script started...");
    await sendTelegramMessage("🚀 [Start] IPTV Script started...");

    let browser;
    let page;
    let isSuccess = false;
    let logSent = false;

    async function takeAndSendScreenshot(label) {
        if (!page) return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = path.join(__dirname, `screenshot_${label}_${timestamp}.png`);
        try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            await sendTelegramPhoto(screenshotPath, `📸 Screenshot [${label}] - ${new Date().toLocaleString()}`);
        } catch (e) {
            originalConsoleLog(`⚠️ Failed to take screenshot: ${e.message}`);
        }
    }

    try {
        console.log("1. Opening Real Browser...");
        const response = await connect({
            headless: false, // ضروري جداً مع xvfb لتجاوز Turnstile
            turnstile: true, // تفعيل التجاوز التلقائي لكابتشا كلاود فلير
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1280,800'
            ],
            customConfig: {
                // إذا أردت استخدام كروم المثبت مسبقاً في النظام:
                chromePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
            },
            connectOption: {
                defaultViewport: { width: 1280, height: 800 }
            }
        });

        browser = response.browser;
        page = response.page;

        // لا تقم بتغيير User-Agent إلى Android حتى لا تتعارض البصمة مع نظام Linux

        const url = 'https://freeiptv2023-d.ottc.xyz/?action=view';
        console.log(`2. Opening URL: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        console.log("⏳ Waiting 20 seconds for Cloudflare Turnstile auto-solve...");
        await new Promise(r => setTimeout(r, 20000));

        // محاولة نقر يدوية احتياطية على iframe الخاص بـ Cloudflare إذا لم يُحل تلقائياً
        const frames = page.frames();
        const cfFrame = frames.find(f => f.url().includes('challenges.cloudflare.com'));
        if (cfFrame) {
            console.log("🔍 Cloudflare Turnstile iframe detected, simulating human interaction...");
            try {
                const iframeElement = await page.$('iframe[src*="challenges.cloudflare.com"]');
                if (iframeElement) {
                    const box = await iframeElement.boundingBox();
                    if (box) {
                        await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 15 });
                        await new Promise(r => setTimeout(r, 500));
                        await page.mouse.click(box.x + 30, box.y + box.height / 2);
                        await new Promise(r => setTimeout(r, 8000));
                    }
                }
            } catch (e) {
                console.log("⚠️ Manual Turnstile click attempt skipped:", e.message);
            }
        }

        // ... (أكمل من هنا الخطوة رقم 3: انتظار تفعيل زر Create Free IPTV Account كما في كودك) ...
