/**
 * Bot Implementation Template
 * This file provides the standard starting point for all generated bots
 */

import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * STEP 0: Initialize Context
 * Loads configuration, selectors, and sets up the bot's runtime context
 */
export async function* init_context(ctx: any): AsyncGenerator<string, void> {
  console.log('🔧 Initializing bot context...');

  try {
    // Load configuration files
    const configPath = path.join(__dirname, '{{BOT_NAME}}_config.json');
    const selectorsPath = path.join(__dirname, '{{BOT_NAME}}_selectors.json');

    // Read and parse configuration
    ctx.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    ctx.selectors = JSON.parse(fs.readFileSync(selectorsPath, 'utf8'));

    // Set core context properties
    ctx.targetUrl = ctx.config.url;
    ctx.intent = ctx.config.intent;
    ctx.botName = ctx.config.botName;

    // Initialize tracking and retry counters
    ctx.retry_counts = {
      page_load_retries: 0,
      navigation_retries: 0,
      MAX_RETRIES: 3
    };

    // Initialize data collection
    ctx.collected_data = [];
    ctx.errors = [];

    console.log(`✅ Context initialized`);
    console.log(`🤖 Bot: ${ctx.botName}`);
    console.log(`🎯 Intent: ${ctx.intent}`);
    console.log(`🌐 Target: ${ctx.targetUrl}`);
    console.log('');

    yield 'context_ready';

  } catch (error: any) {
    console.error(`❌ Context initialization failed: ${error.message}`);
    yield 'context_failed';
  }
}

/**
 * STEP 1: Navigate to Homepage
 * Opens the target URL and verifies the page loads successfully
 */
export async function* navigate_to_homepage(ctx: any): AsyncGenerator<string, void> {
  const page: Page = ctx.page;

  try {
    console.log(`🌐 Navigating to: ${ctx.targetUrl}`);

    // Navigate to the target URL
    await page.goto(ctx.targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Wait for page to stabilize
    await page.waitForTimeout(2000);

    // Verify page loaded
    const currentUrl = page.url();
    const title = await page.title();

    console.log(`✅ Page loaded successfully`);
    console.log(`📄 Title: ${title}`);
    console.log(`📍 URL: ${currentUrl}`);
    console.log('');

    // Check for error pages
    if (title.toLowerCase().includes('error') ||
        title.toLowerCase().includes('not found') ||
        currentUrl.includes('/error')) {
      console.warn(`⚠️  Possible error page detected`);
      yield 'navigation_warning';
      return;
    }

    yield 'homepage_loaded';

  } catch (error: any) {
    console.error(`❌ Navigation failed: ${error.message}`);

    // Retry logic
    if (ctx.retry_counts.navigation_retries < ctx.retry_counts.MAX_RETRIES) {
      ctx.retry_counts.navigation_retries++;
      console.log(`🔄 Retrying navigation (${ctx.retry_counts.navigation_retries}/${ctx.retry_counts.MAX_RETRIES})`);
      yield 'retry_navigation';
    } else {
      console.error(`❌ Navigation failed permanently after ${ctx.retry_counts.MAX_RETRIES} retries`);
      yield 'navigation_failed';
    }
  }
}

// =============================================================================
// STEP 2 (detect_login_state) WILL BE AI-GENERATED
// This is the first step the AI writes - it analyzes the actual page HTML
// to create site-specific login detection logic
// =============================================================================

/**
 * STEP 2.5: Wait for Manual Login
 * Pauses execution and waits for user to login manually
 *
 * NOTE: This is a template function - it just signals that login is needed.
 * The BotGenerator handles the actual user prompt.
 */
export async function* wait_for_manual_login(ctx: any): AsyncGenerator<string, void> {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                     MANUAL LOGIN REQUIRED                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log('🔐 Please login to the website in the browser window');
  console.log('⏳ Take your time to complete the login process...');
  console.log('📍 Current URL:', ctx.page.url());
  console.log('');

  // This function yields immediately, signaling that manual login is needed
  // The BotGenerator will prompt the user and wait for them to press Enter
  yield 'login_complete';
}

// =============================================================================
// AI-GENERATED STEPS (3, 4, 5, ...) WILL BE APPENDED BELOW THIS LINE
// =============================================================================
