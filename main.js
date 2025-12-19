/**
 * ASCE Wind Speed Extractor
 * 
 * Extracts wind speed hazard data from the ASCE Hazard Tool for a given address.
 * Designed to run on Apify platform.
 * 
 * @see https://ascehazardtool.org/
 */

const { Actor } = require('apify');
const puppeteer = require('puppeteer');

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
    },
    retries: 3
};

// Selectors (verified from actual page inspection on 2025-12-19)
const SELECTORS = {
    // Modal/cookie dismissal - greeting modal appears on load
    modalCloseButton: 'div.modal-header span, i.close-modal, .close-modal',

    // Search interface - left sidebar
    addressInput: '#geocoder_input',
    addressInputPlaceholder: 'Find address or place',
    searchButton: 'div.search-button, .search-button',

    // Risk category selection - dropdown with ID
    riskCategoryDropdown: '#risk-level-selector',

    // Hazard type selection - checkboxes in list
    windCheckbox: 'label:has-text("Wind")',

    // Results
    viewResultsButton: '.view-results, button.view-results'
};

/**
 * Delay execution for specified milliseconds
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Save screenshot if debug mode is enabled
 */
async function saveScreenshot(page, name, debugMode, keyValueStore) {
    if (!debugMode) return;

    try {
        const screenshot = await page.screenshot({ fullPage: true });
        await keyValueStore.setValue(name, screenshot, { contentType: 'image/png' });
        console.log(`📸 Screenshot saved: ${name}`);
    } catch (error) {
        console.warn(`Failed to save screenshot ${name}:`, error.message);
    }
}

/**
 * Try to dismiss any modals or cookie banners
 * Selectors confirmed via browser inspection:
 * - Welcome modal: #welcomePopup (hide via DOM - close icon is tiny/inaccessible)
 * - Cookie consent: button.cc-btn.cc-dismiss (text: "Got it!")
 */
async function dismissModals(page) {
    console.log('🔍 Checking for modals/banners to dismiss...');

    const dismissed = await page.evaluate(() => {
        const results = [];

        // 1. Cookie consent banner - dismiss first (at bottom of screen)
        const cookieBtn = document.querySelector('button.cc-btn.cc-dismiss');
        if (cookieBtn && cookieBtn.offsetParent !== null) {
            cookieBtn.click();
            results.push('cookie: Got it!');
        }

        // 2. Welcome modal - hide via DOM (close icon is tiny and not keyboard-accessible)
        const popup = document.getElementById('welcomePopup');
        if (popup) {
            popup.style.display = 'none';
            results.push('modal: hidden via style');
        } else {
            // Fallback: try removing by class
            const popupByClass = document.querySelector('.details-popup');
            if (popupByClass) {
                popupByClass.remove();
                results.push('modal: removed from DOM');
            }
        }

        return results;
    });

    if (dismissed.length > 0) {
        console.log(`✅ Dismissed: ${dismissed.join(', ')}`);
    } else {
        console.log('ℹ️ No modal/cookie banner found to dismiss');
    }

    await delay(CONFIG.delays.short);
}

/**
 * Main extraction function
 */
async function extractWindSpeed(page, address, debugMode, keyValueStore) {
    const result = {
        address,
        windSpeed: null,
        unit: 'mph',
        riskCategory: 'II',
        source: 'ASCE Hazard Tool',
        timestamp: new Date().toISOString(),
        success: false,
        error: null
    };

    try {
        // Step 1: Navigate to ASCE Hazard Tool
        console.log('🌐 Navigating to ASCE Hazard Tool...');
        await page.goto(CONFIG.url, {
            waitUntil: 'networkidle2',
            timeout: CONFIG.timeouts.navigation
        });
        await delay(CONFIG.delays.long);
        await saveScreenshot(page, 'step_01_page_loaded', debugMode, keyValueStore);

        // Step 2: Dismiss any modals
        await dismissModals(page);
        await saveScreenshot(page, 'step_02_modal_dismissed', debugMode, keyValueStore);

        // Step 3: Enter address in geocoder input
        console.log('🔍 Looking for address input...');

        // Use verified selector: #geocoder_input
        const addressInput = await page.$(SELECTORS.addressInput);
        if (addressInput) {
            await addressInput.click();
            await delay(CONFIG.delays.short);
            // Type with human-like delay
            await addressInput.type(address, { delay: 50 });
            console.log('✅ Address entered');
        } else {
            throw new Error('Could not find address input field (#geocoder_input)');
        }

        await saveScreenshot(page, 'step_03_address_entered', debugMode, keyValueStore);
        await delay(CONFIG.delays.medium);

        // Step 4: Click SEARCH button
        console.log('🔍 Clicking SEARCH button...');

        // Use page.evaluate to click by text content (more reliable)
        const searchClicked = await page.evaluate(() => {
            // Look for SEARCH button/div
            const elements = document.querySelectorAll('div, button, span');
            for (const el of elements) {
                if (el.textContent.trim() === 'SEARCH') {
                    el.click();
                    return true;
                }
            }
            // Fallback: look for search button class
            const searchBtn = document.querySelector('.search-button, [class*="search-btn"]');
            if (searchBtn) {
                searchBtn.click();
                return true;
            }
            return false;
        });

        if (searchClicked) {
            console.log('✅ SEARCH clicked');
        } else {
            // Fallback: press Enter
            await page.keyboard.press('Enter');
            console.log('✅ Used Enter key as fallback');
        }

        // Wait for search results
        await delay(CONFIG.delays.long * 2);
        await saveScreenshot(page, 'step_04_search_clicked', debugMode, keyValueStore);

        // Step 5: Select Risk Category II
        console.log('🎯 Selecting Risk Category II...');

        // Dropdown uses numeric values: 1=I, 2=II, 3=III, 4=IV (confirmed via browser inspection)
        const riskResult = await page.evaluate(() => {
            const select = document.getElementById('risk-level-selector');
            if (!select) return { success: false, error: 'dropdown not found' };

            // Set value to '2' for Risk Category II
            select.value = '2';
            select.dispatchEvent(new Event('change', { bubbles: true }));

            // Verify it was set
            const selectedText = select.options[select.selectedIndex].text;
            return { success: true, value: select.value, text: selectedText };
        });

        console.log('📋 Risk selection result:', JSON.stringify(riskResult));

        if (riskResult.success && riskResult.text === 'II') {
            console.log(`✅ Selected Risk Category II (value=${riskResult.value})`);
        } else {
            console.warn(`⚠️ Risk category selection may have failed:`, riskResult);
        }

        await delay(CONFIG.delays.medium);
        await saveScreenshot(page, 'step_05_risk_selected', debugMode, keyValueStore);

        // Step 6: Select Wind hazard type (checkbox)
        console.log('💨 Selecting Wind hazard...');

        // Find and click the Wind label/checkbox
        const windClicked = await page.evaluate(() => {
            // Look for label containing "Wind"
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
                if (label.textContent.includes('Wind')) {
                    label.click();
                    return true;
                }
            }
            // Fallback: look for checkbox input
            const inputs = document.querySelectorAll('input[type="checkbox"]');
            for (const input of inputs) {
                if (input.value === 'wind' || input.id.includes('wind')) {
                    input.click();
                    return true;
                }
            }
            return false;
        });

        if (windClicked) {
            console.log('✅ Selected Wind hazard');
        } else {
            console.warn('⚠️ Wind checkbox not found');
        }

        await delay(CONFIG.delays.medium);
        await saveScreenshot(page, 'step_06_wind_selected', debugMode, keyValueStore);

        // Step 7: Click VIEW RESULTS button
        console.log('📊 Clicking VIEW RESULTS...');

        // First scroll the left panel to make VIEW RESULTS visible
        await page.evaluate(() => {
            const panel = document.getElementById('leftPanel');
            if (panel) {
                panel.scrollTop = panel.scrollHeight;
            }
        });
        await delay(CONFIG.delays.short);

        // The button is inside a div with ID 'resultsButton' and is an <a> tag
        const viewResultsClicked = await page.evaluate(() => {
            // Primary: Use ID #resultsButton finding the anchor tag inside
            const btnContainer = document.getElementById('resultsButton');
            if (btnContainer) {
                const btn = btnContainer.querySelector('a');
                if (btn) {
                    btn.click();
                    return 'by-id-container';
                }
            }

            // Fallback: Look for VIEW RESULTS text in any button/anchor/div
            const buttons = document.querySelectorAll('button, a, div, span');
            for (const el of buttons) {
                const text = el.textContent.trim().toUpperCase();
                if (text === 'VIEW RESULTS' || text === 'VIEW RESULT') {
                    // Make sure it's visible
                    if (el.offsetParent !== null) {
                        el.click();
                        return 'by-text';
                    }
                }
            }
            return null;
        });

        if (viewResultsClicked) {
            console.log(`✅ VIEW RESULTS clicked (${viewResultsClicked})`);
        } else {
            console.warn('⚠️ VIEW RESULTS button not found');
        }

        // Wait for results to load (the panel shows "Retrieving Data..." first)
        await delay(CONFIG.delays.long * 3);
        await saveScreenshot(page, 'step_07_results_page', debugMode, keyValueStore);

        // Step 8: Extract wind speed value
        console.log('📈 Extracting wind speed value...');

        // Scroll panel back to top to see results
        await page.evaluate(() => {
            const panel = document.getElementById('leftPanel');
            if (panel) {
                panel.scrollTop = 0;
            }
        });
        await delay(CONFIG.delays.medium);

        // Try to extract wind speed from the page
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

            // Alternative: look for elements with "Wind" label nearby
            const allText = body;
            const windIndex = allText.indexOf('Wind Speed');
            if (windIndex !== -1) {
                const nearby = allText.substring(windIndex, windIndex + 100);
                const numMatch = nearby.match(/(\d{2,3})/);
                if (numMatch) {
                    return { found: true, windSpeed: numMatch[1], method: 'wind-speed-label' };
                }
            }

            // Debug: return snippet of page content
            return { found: false, debug: body.substring(0, 500) };
        });

        console.log('📋 Extraction result:', JSON.stringify(extractionResult));

        if (extractionResult.found) {
            result.windSpeed = extractionResult.windSpeed;
            console.log(`✅ Extracted wind speed: ${result.windSpeed} mph (via ${extractionResult.method})`);
            result.success = true;
        } else {
            console.log('⚠️ Wind speed not found. Page content preview:', extractionResult.debug?.substring(0, 200));
            result.error = 'Could not extract wind speed value from results page';
        }

        await saveScreenshot(page, 'step_08_extraction', debugMode, keyValueStore);

    } catch (error) {
        console.error('❌ Error during extraction:', error.message);
        result.error = error.message;
        await saveScreenshot(page, 'error_state', debugMode, keyValueStore);
    }

    return result;
}

// Main Apify actor entry point
Actor.main(async () => {
    console.log('🚀 Starting ASCE Wind Speed Extractor...');
    console.log('📋 Debug mode enabled for troubleshooting');

    // Get input
    const input = await Actor.getInput();
    const { address, debugScreenshots = true } = input || {};

    if (!address) {
        throw new Error('Address is required');
    }

    console.log(`📍 Processing address: ${address}`);
    console.log(`📸 Debug screenshots: ${debugScreenshots ? 'enabled' : 'disabled'}`);

    // Initialize storage
    const keyValueStore = await Actor.openKeyValueStore();
    const dataset = await Actor.openDataset();

    // Launch browser using puppeteer directly (SDK v3 pattern)
    console.log('🌐 Launching browser...');
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const page = await browser.newPage();
    console.log('✅ Browser launched');

    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });

    // Set user agent to appear as regular browser
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    try {
        // Extract wind speed
        const result = await extractWindSpeed(page, address, debugScreenshots, keyValueStore);

        // Save result
        await dataset.pushData(result);
        console.log('📦 Result saved to dataset');

        // Also save to key-value store for easy access
        await keyValueStore.setValue('OUTPUT', result);

        console.log('✅ Extraction complete!');
        console.log(JSON.stringify(result, null, 2));

    } finally {
        await browser.close();
        console.log('🔒 Browser closed');
    }
});

