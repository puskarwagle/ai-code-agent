/**
 * Sandbox Executor
 * Executes generated bot steps in isolated environment for testing
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import type { StepExecutionResult } from '../types/bot.js';
import { SessionManager } from '../utils/session_manager.js';

export class SandboxExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sessionManager: SessionManager;
  private currentUrl: string = '';

  constructor() {
    this.sessionManager = new SessionManager();
  }

  async initialize(headless: boolean = true, useSession: boolean = false, url?: string): Promise<void> {
    this.browser = await chromium.launch({
      headless,
      args: ['--disable-blink-features=AutomationControlled']
    });

    // Try to load existing session if requested
    if (useSession && url) {
      this.currentUrl = url;
      this.context = await this.sessionManager.loadSession(this.browser, url);
    }

    // Create new context if no session loaded
    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });
    }

    this.page = await this.context.newPage();

    // Anti-detection measures
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
  }

  async saveSession(): Promise<void> {
    if (this.context && this.currentUrl) {
      await this.sessionManager.saveSession(this.context, this.currentUrl);
    }
  }

  async executeStep(
    stepCode: string,
    functionName: string,
    context?: Record<string, any>
  ): Promise<StepExecutionResult> {
    if (!this.page) {
      throw new Error('Sandbox not initialized. Call initialize() first.');
    }

    try {
      console.log(`🧪 Executing step: ${functionName}`);

      // Create execution context
      const ctx = {
        page: this.page,
        driver: this.page, // Alias for compatibility
        ...context
      };

      // Compile and execute the step function
      const wrappedCode = `
        ${stepCode}

        // Export the function
        (async () => {
          const generator = ${functionName}(ctx);
          const result = await generator.next();
          return result.value;
        })();
      `;

      // Use dynamic import to execute TypeScript code
      // For now, we'll use a simpler approach with eval (in production, use proper TS compilation)
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const executeStep = new AsyncFunction('ctx', 'Page', wrappedCode);

      const event = await Promise.race([
        executeStep(ctx, this.page.constructor),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Step execution timeout')), 30000)
        )
      ]);

      // Capture page state after execution
      const page_state = await this.capturePageState();

      console.log(`✅ Step completed: event="${event}"`);

      return {
        success: true,
        event: event as string,
        page_state
      };

    } catch (error: any) {
      console.error(`❌ Step execution failed:`, error.message);

      const screenshot = await this.page.screenshot().catch(() => undefined);
      const page_state = await this.capturePageState().catch(() => undefined);

      return {
        success: false,
        error: error.message,
        screenshot,
        page_state
      };
    }
  }

  async navigateToUrl(url: string): Promise<void> {
    if (!this.page) throw new Error('Sandbox not initialized');

    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Update current URL for session management
    this.currentUrl = url;

    console.log(`🌐 Navigating to: ${url}`);

    // Use domcontentloaded instead of networkidle (faster, more reliable)
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Wait a bit for dynamic content
    await this.page.waitForTimeout(3000);
  }

  async capturePageState(): Promise<StepExecutionResult['page_state']> {
    if (!this.page) throw new Error('Sandbox not initialized');

    const title = await this.page.title();
    const url = this.page.url();
    const html = await this.page.content();

    return { title, url, html };
  }



  async captureScreenshot(): Promise<Buffer> {
    if (!this.page) throw new Error('Sandbox not initialized');
    return await this.page.screenshot({ fullPage: false });
  }

  getPage(): Page {
    if (!this.page) throw new Error('Sandbox not initialized');
    return this.page;
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
