/**
 * Local test script for ASCE Wind Speed Extractor
 * Replicates Apify environment without requiring Docker
 * 
 * Usage: node test-local.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_INPUT = {
    address: "411 Crusaders Drive, Sanford, NC 27330",
    debugScreenshots: true
};

// Create screenshots directory
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Configuration
const CONFIG = {
    url: 'https://ascehazardtool.org/',
    timeouts: {
        navigation: 60000,
        element: 30000,
        action: 5000
    },
    delays: {
        short: 500,
        medium: 1000,
        long: 2000
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveScreenshot(page, name) {
    const filepath = path.join(SCREENSHOTS_DIR, `${name}.png`);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot saved: ${filepath}`);
}

async function dismissModals(page) {
    console.log('🔍 Checking for modals to dismiss...');

    // 1. Dismiss cookie consent banner
    const cookieDismissed = await page.evaluate(() => {
        const cookieBtn = document.querySelector('button.cc-btn.cc-dismiss');
        if (cookieBtn && cookieBtn.offsetParent !== null) {
            cookieBtn.click();
            return true;
        }
        return false;
    });

    if (cookieDismissed) {
        console.log('✅ Dismissed cookie banner');
        await delay(CONFIG.delays.short);
    }

    // 2. Hide Welcome modal via DOM (close icon is tiny and not keyboard-accessible)
    const modalHidden = await page.evaluate(() => {
        const popup = document.getElementById('welcomePopup');
        if (popup) {
            popup.style.display = 'none';
            return 'hidden via style';
        }
        // Fallback: try removing from DOM
        const popupByClass = document.querySelector('.details-popup');
        if (popupByClass) {
            popupByClass.remove();
            return 'removed from DOM';
        }
        return null;
    });

    if (modalHidden) {
        console.log(`✅ Dismissed Welcome modal (${modalHidden})`);
        await delay(CONFIG.delays.short);
    } else {
        console.log('ℹ️ Welcome modal not found');
    }
}

async function main() {
    console.log('🚀 Starting Local ASCE Wind Speed Test...');
    console.log(`📍 Address: ${TEST_INPUT.address}`);
    console.log(`📸 Debug screenshots: enabled`);
    console.log('');

    const browser = await puppeteer.launch({
        headless: false, // Set to true for headless, false to watch
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const result = {
        address: TEST_INPUT.address,
        windSpeed: null,
        unit: 'mph',
        riskCategory: 'II',
        success: false,
        error: null
    };

    try {
        // Step 1: Navigate
        console.log('🌐 Step 1: Navigating to ASCE Hazard Tool...');
        await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: CONFIG.timeouts.navigation });
        await delay(CONFIG.delays.long);
        await saveScreenshot(page, 'step_01_page_loaded');

        // Step 2: Dismiss modal
        console.log('🔍 Step 2: Dismissing modal...');
        await dismissModals(page);
        await saveScreenshot(page, 'step_02_modal_dismissed');

        // Step 3: Enter address
        console.log('📝 Step 3: Entering address...');
        const addressInput = await page.$('#geocoder_input');
        if (addressInput) {
            await addressInput.click();
            await delay(CONFIG.delays.short);
            await addressInput.type(TEST_INPUT.address, { delay: 50 });
            console.log('✅ Address entered');
        } else {
            throw new Error('Address input not found');
        }
        await saveScreenshot(page, 'step_03_address_entered');
        await delay(CONFIG.delays.medium);

        // Step 4: Click SEARCH
        console.log('🔍 Step 4: Clicking SEARCH...');
        const searchClicked = await page.evaluate(() => {
            const elements = document.querySelectorAll('div, button, span');
            for (const el of elements) {
                if (el.textContent.trim() === 'SEARCH') {
                    el.click();
                    return true;
                }
            }
            return false;
        });

        if (searchClicked) {
            console.log('✅ SEARCH clicked');
        } else {
            await page.keyboard.press('Enter');
            console.log('✅ Used Enter key');
        }
        await delay(CONFIG.delays.long * 2);
        await saveScreenshot(page, 'step_04_search_clicked');

        // Step 5: Select Risk Category II
        console.log('🎯 Step 5: Selecting Risk Category II...');
        const riskSelected = await page.evaluate(() => {
            const select = document.getElementById('risk-level-selector');
            if (!select) return false;
            // Value '2' = Risk Category II (confirmed via browser inspection)
            select.value = '2';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return select.options[select.selectedIndex].text;
        });

        console.log(`✅ Risk Category selected: ${riskSelected}`);
        await delay(CONFIG.delays.medium);
        await saveScreenshot(page, 'step_05_risk_selected');

        // Step 6: Select Wind
        console.log('💨 Step 6: Selecting Wind hazard...');
        const windClicked = await page.evaluate(() => {
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
                if (label.textContent.includes('Wind')) {
                    label.click();
                    return true;
                }
            }
            return false;
        });

        if (windClicked) {
            console.log('✅ Wind selected');
        } else {
            console.warn('⚠️ Wind checkbox not found');
        }
        await delay(CONFIG.delays.medium);
        await saveScreenshot(page, 'step_06_wind_selected');

        // Step 7: Click VIEW RESULTS
        console.log('📊 Step 7: Clicking VIEW RESULTS...');

        // Scroll panel to bottom to see VIEW RESULTS button
        await page.evaluate(() => {
            const panel = document.getElementById('leftPanel');
            if (panel) panel.scrollTop = panel.scrollHeight;
        });
        await delay(CONFIG.delays.short);

        const viewClicked = await page.evaluate(() => {
            // Primary: Use ID #resultsButton finding the anchor tag inside
            const btnContainer = document.getElementById('resultsButton');
            if (btnContainer) {
                const btn = btnContainer.querySelector('a');
                if (btn) {
                    btn.click();
                    return 'by-id-container';
                }
            }

            // Fallback: text search
            const buttons = document.querySelectorAll('button, a, div, span');
            for (const el of buttons) {
                const text = el.textContent.trim().toUpperCase();
                if (text === 'VIEW RESULTS' || text === 'VIEW RESULT') {
                    if (el.offsetParent !== null) {
                        el.click();
                        return 'by-text';
                    }
                }
            }
            return null;
        });

        console.log(`✅ VIEW RESULTS clicked (${viewClicked})`);
        await delay(CONFIG.delays.long * 3);  // Wait for "Retrieving Data..."
        await saveScreenshot(page, 'step_07_results_page');

        // Step 8: Extract wind speed
        console.log('📈 Step 8: Extracting wind speed...');

        // Scroll panel back to top to see results
        await page.evaluate(() => {
            const panel = document.getElementById('leftPanel');
            if (panel) panel.scrollTop = 0;
        });
        await delay(CONFIG.delays.short);

        const extractionResult = await page.evaluate(() => {
            // Primary strategy: Use specific selector found in screenshot
            const detailSpan = document.querySelector('.loads-container__main-details');
            if (detailSpan) {
                const text = detailSpan.innerText;
                const match = text.match(/(\d{2,3})\s*(Vmph|mph|MPH)/i);
                if (match) {
                    return { found: true, windSpeed: match[1], unit: match[2], method: 'selector' };
                }
            }

            // Fallback: search body text
            const body = document.body.innerText;
            const match = body.match(/(\d{2,3})\s*(Vmph|mph|MPH)/i);
            if (match) {
                return { found: true, windSpeed: match[1], unit: match[2], method: 'regex' };
            }

            return { found: false, sample: body.substring(0, 300) };
        });

        console.log('📋 Extraction:', JSON.stringify(extractionResult));

        if (extractionResult.found) {
            result.windSpeed = extractionResult.windSpeed;
            result.success = true;
            console.log(`✅ Extracted wind speed: ${result.windSpeed} mph`);
        } else {
            result.error = 'Could not extract wind speed';
            console.warn('⚠️ Wind speed not found');
            console.log('Page sample:', extractionResult.sample);
        }

        await saveScreenshot(page, 'step_08_final');

    } catch (error) {
        console.error('❌ Error:', error.message);
        result.error = error.message;
        await saveScreenshot(page, 'error_state');
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('📋 RESULT:');
    console.log(JSON.stringify(result, null, 2));
    console.log('═══════════════════════════════════════');
    console.log(`📸 Screenshots saved to: ${SCREENSHOTS_DIR}`);

    // Keep browser open for inspection (close manually or press Ctrl+C)
    console.log('');
    console.log('🔍 Browser kept open for inspection. Press Ctrl+C to exit.');

    // Comment out below line to keep browser open
    // await browser.close();
}

main().catch(console.error);
