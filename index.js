const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================
const settings = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
    GITHUB_REPO: process.env.GITHUB_REPO || '',
    GITHUB_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
};

if (!settings.GITHUB_TOKEN) {
    throw new Error('Missing required environment variable: GITHUB_TOKEN or GH_TOKEN');
}

// ==================== LOG CAPTURE SYSTEM ====================
const logBuffer = [];
const browserConsoleBuffer = [];
const originalConsoleLog = console.log;

function captureLog(type, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
    const logLine = `[${timestamp}] [${type}] ${message}`;
    logBuffer.push(logLine);
    originalConsoleLog.apply(console, args);
}

console.log = (...args) => captureLog('INFO', ...args);
console.error = (...args) => captureLog('ERROR', ...args);
console.warn = (...args) => captureLog('WARN', ...args);

function getCapturedLogs() {
    let logs = logBuffer.join('\n');
    if (browserConsoleBuffer.length > 0) {
        logs += '\n\n=================== BROWSER CONSOLE LOGS ===================\n' + browserConsoleBuffer.join('\n');
    }
    return logs;
}

function saveLogsToFile(prefix = 'error_log') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFilePath = path.join(__dirname, `${prefix}_${timestamp}.txt`);
    fs.writeFileSync(logFilePath, getCapturedLogs(), 'utf8');
    return logFilePath;
}

// ==================== TELEGRAM FUNCTIONS ====================
async function sendTelegramMessage(message) {
    if (!settings.TELEGRAM_BOT_TOKEN || !settings.TELEGRAM_CHAT_ID) return;
    try {
        const url = `https://api.telegram.org/bot${settings.TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: settings.TELEGRAM_CHAT_ID, text: message })
        });
    } catch (e) {
        originalConsoleLog("Failed to send Telegram message:", e.message);
    }
}

async function sendTelegramDocument(filePath, caption = '') {
    if (!settings.TELEGRAM_BOT_TOKEN || !settings.TELEGRAM_CHAT_ID) return false;
    try {
        const fileData = fs.readFileSync(filePath);
        const formData = new FormData();
        formData.append('chat_id', settings.TELEGRAM_CHAT_ID);
        formData.append('document', new Blob([fileData]), path.basename(filePath));
        if (caption) formData.append('caption', caption);

        const url = `https://api.telegram.org/bot${settings.TELEGRAM_BOT_TOKEN}/sendDocument`;
        const response = await fetch(url, { method: 'POST', body: formData });

        if (response.ok) {
            originalConsoleLog("✅ Log file sent to Telegram successfully.");
            return true;
        } else {
            const err = await response.text();
            originalConsoleLog("❌ Failed to send log to Telegram:", err);
            return false;
        }
    } catch (e) {
        originalConsoleLog("❌ Error sending document to Telegram:", e.message);
        return false;
    }
}

async function sendTelegramPhoto(photoPath, caption = '') {
    if (!settings.TELEGRAM_BOT_TOKEN || !settings.TELEGRAM_CHAT_ID) return false;
    try {
        const fileData = fs.readFileSync(photoPath);
        const formData = new FormData();
        formData.append('chat_id', settings.TELEGRAM_CHAT_ID);
        formData.append('photo', new Blob([fileData]), path.basename(photoPath));
        if (caption) formData.append('caption', caption);

        const url = `https://api.telegram.org/bot${settings.TELEGRAM_BOT_TOKEN}/sendPhoto`;
        const response = await fetch(url, { method: 'POST', body: formData });

        if (response.ok) {
            originalConsoleLog("✅ Screenshot sent to Telegram successfully.");
            return true;
        } else {
            const err = await response.text();
            originalConsoleLog("❌ Failed to send screenshot to Telegram:", err);
            return false;
        }
    } catch (e) {
        originalConsoleLog("❌ Error sending screenshot to Telegram:", e.message);
        return false;
    }
}

// ==================== GITHUB UPLOAD ====================
async function uploadToGithub(fileName, content, retries = 3) {
    const url = `https://api.github.com/repos/${settings.GITHUB_REPO}/contents/${fileName}`;
    const headers = {
        'Authorization': `token ${settings.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'NodeJS-Script'
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`[GitHub Upload] Attempt ${attempt} of ${retries}...`);
            let sha = '';

            const getRes = await fetch(url, { headers });
            if (getRes.ok) {
                const data = await getRes.json();
                sha = data.sha;
            }

            const body = {
                message: `🤖 Auto update ${fileName} - ${new Date().toISOString()}`,
                content: Buffer.from(content).toString('base64')
            };
            if (sha) body.sha = sha;

            const putRes = await fetch(url, {
                method: 'PUT',
                headers,
                body: JSON.stringify(body)
            });

            if (putRes.ok) {
                console.log(`✅ Successfully uploaded ${fileName} to GitHub.`);
                return true;
            } else {
                const err = await putRes.json();
                console.log(`❌ GitHub API Error (Attempt ${attempt}): ${err.message}`);
            }
        } catch (error) {
            console.log(`❌ Network Error during upload (Attempt ${attempt}): ${error.message}`);
        }

        if (attempt < retries) {
            console.log("⏳ Waiting 3 seconds before retrying...");
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    console.log(`❌ Failed to upload ${fileName} to GitHub after ${retries} attempts.`);
    return false;
}

// ==================== HUMAN-LIKE BEHAVIOR ====================
async function addHumanBehavior(page) {
    try {
        const randomX = Math.random() * 800 + 100;
        const randomY = Math.random() * 400 + 100;
        await page.mouse.move(randomX, randomY, { steps: 10 });
        await new Promise(r => setTimeout(r, Math.random() * 500 + 200));

        await page.evaluate(() => {
            window.scrollBy(0, Math.random() * 100 - 50);
        });
        await new Promise(r => setTimeout(r, 300));
    } catch (e) {
        // تجاهل الأخطاء
    }
}

// ==================== IMPROVED TURNSTILE BYPASS ====================
async function waitForTurnstile(page, maxWait = 120000) {
    const startTime = Date.now();
    let lastClickAttempt = 0;
    let retryCount = 0;

    while (Date.now() - startTime < maxWait) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);

        if (elapsed % 5 === 0 && elapsed > 0) {
            await addHumanBehavior(page);
        }

        const buttonState = await page.evaluate(() => {
            const btn = document.querySelector('#create-btn') ||
                Array.from(document.querySelectorAll('button, input[type="submit"]'))
                    .find(el => (el.value || el.innerText || '').toLowerCase().includes('create free iptv account'));
            const tokenInput = document.querySelector('[name="cf-turnstile-response"]');
            const token = tokenInput ? tokenInput.value : '';

            if (!btn) return { found: false, tokenLength: token.length };

            const style = window.getComputedStyle(btn);
            const visible = btn.offsetWidth > 0 && btn.offsetHeight > 0 &&
                style.display !== "none" && style.visibility !== "hidden";
            const disabled = Boolean(btn.disabled ||
                btn.getAttribute('aria-disabled') === 'true' ||
                btn.classList.contains('disabled'));

            return {
                found: true,
                visible,
                disabled,
                tokenLength: token.length,
                pageText: document.body ? document.body.innerText.slice(0, 500) : ''
            };
        });

        if (buttonState.found && buttonState.visible && !buttonState.disabled) {
            console.log(`   [${elapsed}s] ✅ Button is enabled! (Token length: ${buttonState.tokenLength})`);
            return { success: true, buttonState };
        }

        if (Date.now() - lastClickAttempt > 8000 && buttonState.tokenLength === 0) {
            lastClickAttempt = Date.now();
            retryCount++;

            try {
                const frames = page.frames();
                const cfFrame = frames.find(f => f.url().includes('challenges.cloudflare.com'));

                if (cfFrame) {
                    const iframeElement = await page.$('iframe[src*="challenges.cloudflare.com"]');
                    if (iframeElement) {
                        const box = await iframeElement.boundingBox();
                        if (box && box.width > 0 && box.height > 0) {
                            const clickX = box.x + Math.min(30, box.width / 4);
                            const clickY = box.y + box.height / 2;

                            await page.mouse.move(clickX, clickY, { steps: 15 });
                            await new Promise(r => setTimeout(r, Math.random() * 300 + 200));
                            await page.mouse.down();
                            await new Promise(r => setTimeout(r, Math.random() * 50 + 30));
                            await page.mouse.up();

                            console.log(`   [${elapsed}s] 🖱️ Clicked Turnstile (attempt ${retryCount})`);
                        }
                    }
                }
            } catch (e) {
                console.log("⚠️ Turnstile click failed:", e.message);
            }
        }

        if (retryCount >= 5) {
            console.log("🔄 Reloading page after 5 failed Turnstile attempts...");
            retryCount = 0;
            try {
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise(r => setTimeout(r, 3000));
            } catch (e) {
                console.log("⚠️ Page reload failed:", e.message);
            }
        }

        if (elapsed % 5 === 0) {
            console.log(`   [${elapsed}s] ⏳ Waiting for Turnstile...`, {
                disabled: buttonState ? buttonState.disabled : null,
                tokenLength: buttonState ? buttonState.tokenLength : 0
            });
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { success: false, buttonState: null };
}

// ==================== GITHUB AI EXTRACTION ====================
async function extractWithGithubAI(fullText, pageUrl) {
    if (!settings.GITHUB_TOKEN) return null;

    const apiEndpoint = 'https://models.inference.ai.azure.com/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.GITHUB_TOKEN}`
    };

    const prompt = `
You are analyzing the text content of a webpage after an IPTV account generation.
Extract the following information:
1. username (the generated account username)
2. password (the generated account password)
3. m3u_link (the generated M3U playlist URL, usually ending in .m3u or containing get.php)

Context URL: ${pageUrl}

Text content (truncated if too long):
${fullText.substring(0, 8000)}

Return the result ONLY as a strict JSON object with keys: "username", "password", "m3u_link".
If a value is not found, set it to null. Do not include any explanations, markdown formatting, or code blocks. Just the raw JSON.
`;

    const body = {
        messages: [
            { role: "system", content: "You are a helpful assistant that extracts structured data from text. Always respond with valid raw JSON without markdown." },
            { role: "user", content: prompt }
        ],
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 500,
        top_p: 1.0
    };

    try {
        console.log("🧠 Using GitHub Models (AI) to intelligently extract account details...");
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.log(`⚠️ GitHub Models API Error: ${response.status} ${errText}`);
            return null;
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content || "";
        console.log("🤖 AI Raw Response:", content);

        let parsed = null;
        try {
            parsed = JSON.parse(content.trim());
        } catch (e) {
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || content.match(/(\{[\s\S]*\})/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                } catch (err) {
                    console.log("❌ Failed to parse AI JSON:", err.message);
                }
            }
        }

        if (parsed) {
            return {
                extractedUser: parsed.username || null,
                extractedPass: parsed.password || null,
                extractedM3u: parsed.m3u_link || null
            };
        }
        return null;
    } catch (error) {
        console.log(`❌ Error calling GitHub AI: ${error.message}`);
        return null;
    }
}

// ==================== MAIN EXECUTION ====================
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
            originalConsoleLog(`📸 Screenshot saved: ${screenshotPath}`);
            await sendTelegramPhoto(screenshotPath, `📸 Screenshot [${label}] - ${new Date().toLocaleString()}`);
        } catch (e) {
            originalConsoleLog(`⚠️ Failed to take screenshot: ${e.message}`);
        }
    }

    try {
        console.log("1. Opening Real Browser...");
        const response = await connect({
            headless: false,
            turnstile: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1280,800',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars'
            ],
            customConfig: {
                chromePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
            },
            connectOption: {
                defaultViewport: { width: 1280, height: 800 }
            }
        });

        browser = response.browser;
        page = response.page;

        page.on('console', msg => {
            const text = `[Browser Console] [${msg.type().toUpperCase()}] ${msg.text()}`;
            browserConsoleBuffer.push(text);
            originalConsoleLog(text);
        });

        // إضافة user agent حقيقي
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const url = 'https://freeiptv2023-d.ottc.xyz/';
        console.log(`2. Opening URL: ${url}`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        } catch (e) {
            console.log(`⚠️ Navigation warning: ${e.message}`);
        }

        // إضافة human behavior قبل الانتظار
        await addHumanBehavior(page);

        console.log("3. Waiting for Cloudflare Turnstile completion & button activation (max 120s)...");
        const turnstileResult = await waitForTurnstile(page);

        if (!turnstileResult.success) {
            await takeAndSendScreenshot('turnstile_failed');
            const pageText = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 700) : '');
            console.log("Create account button did not become enabled. Current page text:", pageText);
            throw new Error("Cloudflare Turnstile was not solved within 120 seconds.");
        }

        const buttonState = turnstileResult.buttonState;

        console.log("4. Clicking the enabled create-account button...");
        let clicked = false;
        try {
            const elements = await page.$$('button, a, input[type="submit"], input[type="button"]');
            for (const el of elements) {
                const isTarget = await page.evaluate(node => {
                    const label = (node.innerText || node.value || node.getAttribute('aria-label') || '').trim().toLowerCase();
                    if (!label.includes('create free iptv account')) return false;
                    const style = window.getComputedStyle(node);
                    const visible = node.offsetWidth > 0 && node.offsetHeight > 0 && style.display !== "none" && style.visibility !== "hidden";
                    const disabled = Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true' || node.classList.contains('disabled') || node.classList.contains('is-disabled') || style.pointerEvents === 'none');
                    return visible && !disabled;
                }, el);

                if (isTarget) {
                    await el.scrollIntoViewIfNeeded().catch(() => {});
                    await new Promise(r => setTimeout(r, 500));
                    const box = await el.boundingBox();
                    if (box) {
                        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
                        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    } else {
                        await el.click();
                    }
                    clicked = true;
                    console.log("   Click dispatched using mouse interaction.");
                    break;
                }
            }
        } catch (e) {
            console.log("⚠️ Puppeteer mouse click failed, falling back to JS click:", e.message);
        }

        if (!clicked) {
            clicked = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]'));
                const target = elements.find(el => {
                    const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
                    if (!label.includes('create free iptv account')) return false;
                    const style = window.getComputedStyle(el);
                    const visible = el.offsetWidth > 0 && el.offsetHeight > 0 && style.display !== "none" && style.visibility !== "hidden";
                    const disabled = Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled') || el.classList.contains('is-disabled') || style.pointerEvents === 'none');
                    return visible && !disabled;
                });
                if (!target) return false;
                target.click();
                return true;
            });
        }

        if (!clicked) throw new Error("The create-account button became unavailable before the click.");

        console.log("5. Waiting for generated account details or page update (max 60s)...");
        const pageTextBeforeClick = buttonState.pageText || "";

        try {
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
                page.waitForFunction(
                    previousText => {
                        const currentText = document.body ? (document.body.innerText || "") : "";
                        const lower = currentText.toLowerCase();
                        const hasAccountLabels = (lower.includes("username") || lower.includes("user")) && (lower.includes("password") || lower.includes("pass"));
                        const hasPlaylistLink = Array.from(document.querySelectorAll("a")).some(a => /\.m3u|get\.php/i.test(a.href));
                        const hasM3uInput = Array.from(document.querySelectorAll("input, textarea")).some(i => (i.value || "").includes("get.php") || (i.value || "").includes(".m3u"));
                        const changed = currentText.length !== previousText.length;
                        return (hasAccountLabels && changed) || hasPlaylistLink || hasM3uInput;
                    },
                    { timeout: 60000 },
                    pageTextBeforeClick
                )
            ]);
            console.log("Account details, URL update, or response detected.");
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (e) {
            console.log("No explicit change detected within wait limit. Proceeding with deep page analysis...");
        }

        await takeAndSendScreenshot('after_click');

        const accountData = await page.evaluate(() => {
            const data = {};
            const inputs = document.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                const val = (input.value || '').trim();
                const name = (input.name || input.id || input.placeholder || input.className || '').toLowerCase();
                if (val && !['submit', 'button', 'hidden', 'reset'].includes(input.type)) {
                    data[name || 'field_' + Math.random().toString(36).substring(7)] = val;
                }
            });

            const rows = document.querySelectorAll('tr');
            rows.forEach(tr => {
                const cells = tr.querySelectorAll('td, th');
                if (cells.length >= 2) {
                    const key = cells[0].innerText.trim();
                    const val = cells[1].innerText.trim() || cells[1].querySelector('input')?.value || cells[1].querySelector('a')?.href || '';
                    if (key && val) data[key] = val;
                }
            });

            const alertCards = document.querySelectorAll('.alert, .card, .result, .panel, pre, code, [class*="alert"], [class*="result"], [class*="success"]');
            let alertText = '';
            alertCards.forEach(c => {
                const t = (c.innerText || '').trim();
                if (t.length > 5 && t.length < 1500) {
                    alertText += '\n' + t;
                }
            });

            const links = Array.from(document.querySelectorAll('a')).map(a => a.href);
            const m3uLink = links.find(l => /\.m3u|get\.php/i.test(l)) || '';

            return {
                structured: data,
                alertText: alertText,
                m3uLink: m3uLink,
                fullText: document.body ? document.body.innerText : ''
            };
        });

        console.log("\n================ [ Extracted Account Data ] ================\n");

        let foundDetails = false;
        let extractedUser = '';
        let extractedPass = '';

        // --- 1. AI Extraction using GitHub Models ---
        const aiExtraction = await extractWithGithubAI(accountData.fullText, url);
        if (aiExtraction) {
            if (aiExtraction.extractedUser) {
                extractedUser = aiExtraction.extractedUser;
                console.log(`🤖 AI Extracted User: ${extractedUser}`);
            }
            if (aiExtraction.extractedPass) {
                extractedPass = aiExtraction.extractedPass;
                console.log(`🤖 AI Extracted Pass: ${extractedPass}`);
            }
            if (aiExtraction.extractedM3u && !accountData.m3uLink) {
                accountData.m3uLink = aiExtraction.extractedM3u;
            }
        }

        // --- 2. Fallback to DOM & Regex if AI didn't find everything ---
        if (!extractedUser || !extractedPass) {
            console.log("🔍 AI didn't find all details, falling back to standard DOM & Regex parsing...");
            for (const [key, value] of Object.entries(accountData.structured)) {
                console.log(`${key} : ${value}`);
                foundDetails = true;

                const lowerKey = key.toLowerCase();
                if (lowerKey.includes('user') && !extractedUser) extractedUser = value;
                if (lowerKey.includes('pass') && !extractedPass) extractedPass = value;
            }

            const linkToScan = accountData.m3uLink || Object.values(accountData.structured).find(v => typeof v === 'string' && (v.includes('.m3u') || v.includes('get.php')));
            if (linkToScan) {
                try {
                    const parsedUrl = new URL(linkToScan, url);
                    const u = parsedUrl.searchParams.get('username') || parsedUrl.searchParams.get('user');
                    const p = parsedUrl.searchParams.get('password') || parsedUrl.searchParams.get('pass');
                    if (u && !extractedUser) extractedUser = u;
                    if (p && !extractedPass) extractedPass = p;
                    if (!accountData.m3uLink) accountData.m3uLink = linkToScan;
                } catch (err) {
                    const matchU = linkToScan.match(/[?&](?:user(?:name)?)=([^&]+)/i);
                    const matchP = linkToScan.match(/[?&](?:pass(?:word)?)=([^&]+)/i);
                    if (matchU && !extractedUser) extractedUser = matchU[1];
                    if (matchP && !extractedPass) extractedPass = matchP[1];
                }
            }

            if (!extractedUser || !extractedPass) {
                console.log("🔍 Trying fallback extraction via Regex on full text & alert blocks...");
                const combinedText = (accountData.alertText + "\n" + accountData.fullText);

                const userMatches = combinedText.match(/(?:username|user|اسم\s*المستخدم)\s*[:=]\s*([^\r\n\t ]+)/i);
                const passMatches = combinedText.match(/(?:password|pass|كلمة\s*المرور)\s*[:=]\s*([^\r\n\t ]+)/i);

                if (userMatches && !extractedUser) extractedUser = userMatches[1].trim();
                if (passMatches && !extractedPass) extractedPass = passMatches[1].trim();

                if (extractedUser) console.log(`Regex Fallback - User: ${extractedUser}`);
                if (extractedPass) console.log(`Regex Fallback - Pass: ${extractedPass}`);
            }
        }

        if (accountData.m3uLink) {
            console.log(`M3U Link : ${accountData.m3uLink}`);
            foundDetails = true;
        }

        if (extractedUser) {
            console.log(`✅ Final User: ${extractedUser}`);
            foundDetails = true;
        }
        if (extractedPass) {
            console.log(`✅ Final Pass: ${extractedPass}`);
            foundDetails = true;
        }

        if (!foundDetails && !extractedUser) {
            console.log("Full text of the area after generation:\n", accountData.fullText);
        }
        console.log("\n=================================================================\n");

        const saveContent = JSON.stringify(accountData.structured, null, 2) +
            (accountData.m3uLink ? `\n\nM3U Link: ${accountData.m3uLink}` : '') +
            (extractedUser ? `\n\nExtracted User: ${extractedUser}\nExtracted Pass: ${extractedPass}` : '') +
            `\n\nFull Text:\n${accountData.fullText}`;
        fs.writeFileSync('iptv_account.txt', saveContent);
        console.log("Account saved to: iptv_account.txt");

        if (extractedUser && extractedPass) {
            console.log("6. Reading base.m3u and replacing data...");
            if (fs.existsSync('base.m3u')) {
                let baseM3uContent = fs.readFileSync('base.m3u', 'utf8');

                let finalM3uContent = baseM3uContent
                    .replace(/\{USERNAME\}/g, extractedUser)
                    .replace(/\{PASSWORD\}/g, extractedPass);

                fs.writeFileSync('final.m3u', finalM3uContent);
                console.log("✅ final.m3u created successfully.");

                console.log("7. Uploading final.m3u to GitHub...");
                const uploadStatus = await uploadToGithub('final.m3u', finalM3uContent);

                if (uploadStatus) {
                    isSuccess = true;
                }
            } else {
                console.log("❌ base.m3u file not found in the current directory.");
            }
        } else {
            process.exitCode = 1;
            console.log("⚠️ Username or Password not found in the extracted data.");
        }

    } catch (err) {
        process.exitCode = 1;
        console.log(`❌ Error occurred: ${err.message}`);
        const logFilePath = saveLogsToFile();
        originalConsoleLog(`📄 Error log saved to: ${logFilePath}`);
        await sendTelegramMessage(`❌ [Error] Script failed: ${err.message}\n\nLog file has been sent.`);
        await sendTelegramDocument(logFilePath, `❌ IPTV Error Log - ${new Date().toLocaleString()}`);
        await takeAndSendScreenshot('error');
        logSent = true;
    } finally {
        if (browser) {
            await takeAndSendScreenshot('final');
            console.log("Closing browser...");
            await browser.close();
        }

        if (isSuccess) {
            await sendTelegramMessage("✅ [Success] Script finished successfully and final.m3u is uploaded.");
            const successLogPath = saveLogsToFile('success_log');
            await sendTelegramDocument(successLogPath, `✅ IPTV Success Log - ${new Date().toLocaleString()}`);
            console.log("🛑 [End] Script finished successfully.");
        } else if (!isSuccess && browser) {
            await sendTelegramMessage("⚠️ [Warning] Script finished, but upload or generation failed. Check terminal.");
            if (!logSent) {
                const warningLogPath = saveLogsToFile('warning_log');
                await sendTelegramDocument(warningLogPath, `⚠️ IPTV Warning Log - ${new Date().toLocaleString()}`);
            }
            console.log("🛑 [End] Script finished with warnings/errors.");
        }
    }
})();
