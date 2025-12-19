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
 */
async function dismissModals(page) {
    console.log('🔍 Checking for modals/banners to dismiss...');

    // The ASCE Hazard Tool shows a "Welcome" greeting modal on first load
    // The close button is in div.modal-header span or i.close-modal
    const dismissSelectors = [
        'div.modal-header span',
        'i.close-modal',
        '.close-modal',
        'button[aria-label="Close"]',
        '.modal-close',
        '.close-button'
    ];

    for (const selector of dismissSelectors) {
        try {
            const element = await page.$(selector);
            if (element) {
                const isVisible = await element.isIntersectingViewport();
                if (isVisible) {
                    await element.click();
                    console.log(`✅ Dismissed modal using: ${selector}`);
                    await delay(CONFIG.delays.short);
                    return; // Exit after successful dismissal
                }
            }
        } catch (error) {
            // Selector not found or not clickable, continue
        }
    }
    console.log('ℹ️ No modal found to dismiss');
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

        // Find the SEARCH button (div with text "SEARCH")
        const searchButton = await page.$(SELECTORS.searchButton) ||
            await page.evaluateHandle(() => {
                const divs = document.querySelectorAll('div');
                for (const div of divs) {
                    if (div.textContent.trim() === 'SEARCH') return div;
                }
                return null;
            });

        if (searchButton && searchButton.click) {
            await searchButton.click();
            console.log('✅ SEARCH clicked');
        } else {
            // Fallback: press Enter
            await page.keyboard.press('Enter');
            console.log('✅ Used Enter key as fallback');
        }

        await delay(CONFIG.delays.long);
        await saveScreenshot(page, 'step_04_search_clicked', debugMode, keyValueStore);

        // Step 5: Select Risk Category II
        console.log('🎯 Selecting Risk Category II...');

        // Use verified selector: #risk-level-selector
        // Note: Standard JS value assignment may not trigger UI update
        // Use click + keyboard navigation as verified in browser test
        const riskDropdown = await page.$(SELECTORS.riskCategoryDropdown);
        if (riskDropdown) {
            await riskDropdown.click();
            await delay(CONFIG.delays.short);
            // Navigate to option "II" (ArrowDown twice: I -> II)
            await page.keyboard.press('ArrowDown'); // Select I
            await delay(100);
            await page.keyboard.press('ArrowDown'); // Select II
            await delay(100);
            await page.keyboard.press('Enter');
            console.log('✅ Selected Risk Category II');
        } else {
            console.warn('⚠️ Risk category dropdown not found, trying fallback');
            // Fallback: try to set value directly
            await page.evaluate(() => {
                const select = document.getElementById('risk-level-selector');
                if (select) {
                    select.value = 'II';
                    select.dispatchEvent(new Event('change'));
                }
            });
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

        // The button becomes active after selecting Risk Category + Load Type
        const viewResultsClicked = await page.evaluate(() => {
            // Look for VIEW RESULTS button
            const buttons = document.querySelectorAll('button, div, span');
            for (const btn of buttons) {
                const text = btn.textContent.trim().toUpperCase();
                if (text === 'VIEW RESULTS' || text === 'VIEW RESULT') {
                    btn.click();
                    return true;
                }
            }
            return false;
        });

        if (viewResultsClicked) {
            console.log('✅ VIEW RESULTS clicked');
        } else {
            // Try selector fallback
            const viewBtn = await page.$(SELECTORS.viewResultsButton);
            if (viewBtn) {
                await viewBtn.click();
                console.log('✅ VIEW RESULTS clicked via selector');
            } else {
                console.warn('⚠️ VIEW RESULTS button not found');
            }
        }

        // Wait for results to load
        await delay(CONFIG.delays.long * 2);
        await saveScreenshot(page, 'step_07_results_page', debugMode, keyValueStore);

        // Step 8: Extract wind speed value
        console.log('📈 Extracting wind speed value...');

        // Get all text content and look for wind speed pattern
        const pageContent = await page.content();

        // Pattern: look for "XXX mph" or "XXX Vmph" or similar
        const windSpeedMatch = pageContent.match(/(\d{2,3})\s*(mph|Vmph|MPH)/i);

        if (windSpeedMatch) {
            result.windSpeed = windSpeedMatch[1];
            console.log(`✅ Extracted wind speed: ${result.windSpeed} mph`);
            result.success = true;
        } else {
            // Alternative: look for specific result elements
            const resultElements = await page.$$('[class*="result"], [class*="value"], [class*="speed"]');
            for (const el of resultElements) {
                const text = await el.evaluate(e => e.textContent || '');
                const match = text.match(/(\d{2,3})/);
                if (match) {
                    result.windSpeed = match[1];
                    console.log(`✅ Extracted wind speed from element: ${result.windSpeed} mph`);
                    result.success = true;
                    break;
                }
            }
        }

        if (!result.success) {
            result.error = 'Could not extract wind speed value from results page';
        }

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

