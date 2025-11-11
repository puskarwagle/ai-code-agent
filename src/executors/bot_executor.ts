/**
 * Bot Executor
 * Loads and executes generated bot files using the WorkflowEngine
 */

import { WorkflowEngine, WorkflowContext } from './workflow_engine.js';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import { pathToFileURL } from 'url';

export class BotExecutor {
  private engine: WorkflowEngine | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private botDir: string;
  private botName: string;
  private yamlPath: string;
  private implPath: string;
  private stepFunctions: Map<string, Function> = new Map();

  constructor(botDir: string, botName: string) {
    this.botDir = botDir;
    this.botName = botName;
    this.yamlPath = path.join(botDir, `${botName}_steps.yaml`);
    this.implPath = path.join(botDir, `${botName}_impl.ts`);
  }

  /**
   * Initialize browser and load bot files
   */
  async initialize(headless: boolean = false): Promise<void> {
    console.log('🔧 Initializing BotExecutor...');

    // 1. Launch browser
    this.browser = await chromium.launch({
      headless,
      args: ['--disable-blink-features=AutomationControlled']
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    this.page = await this.context.newPage();

    // Anti-detection - this code runs in browser context
    await this.page.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    `);

    console.log('✅ Browser initialized');

    // 2. Load workflow engine
    await this.reloadEngine();

    console.log('✅ BotExecutor ready\n');
  }

  /**
   * Reload the workflow engine (picks up newly generated steps)
   */
  async reloadEngine(): Promise<void> {
    // Create new workflow engine
    this.engine = new WorkflowEngine(this.yamlPath);

    // Set up context
    this.engine.setContext('page', this.page);
    this.engine.setContext('driver', this.page); // Alias for compatibility

    // Dynamically import step functions from bot_impl.ts
    await this.loadStepFunctions();
  }

  /**
   * Dynamically load step functions from the bot implementation file
   */
  private async loadStepFunctions(): Promise<void> {
    try {
      // Convert file path to file:// URL for ES module import
      const implFileUrl = pathToFileURL(path.resolve(this.implPath)).href;

      // Add cache-busting query parameter to force reload
      const modulePath = `${implFileUrl}?t=${Date.now()}`;

      // Dynamic import
      const botModule = await import(modulePath);

      // Register all exported generator functions
      for (const [name, func] of Object.entries(botModule)) {
        if (typeof func === 'function') {
          this.engine!.registerStepFunction(name, func as any);
        }
      }

      console.log(`📦 Loaded bot implementation functions`);
    } catch (error: any) {
      throw new Error(`Failed to load bot implementation: ${error.message}`);
    }
  }

  /**
   * Execute a single step by name
   */
  async executeStep(stepName: string): Promise<string> {
    if (!this.engine) {
      throw new Error('BotExecutor not initialized');
    }

    console.log(`▶️  Executing step: ${stepName}`);
    const result = await this.engine.executeStep(stepName);
    console.log(`✅ Step completed with event: ${result}\n`);

    return result;
  }

  /**
   * Get current page state for AI analysis
   */
  async getPageState(): Promise<{ html: string; url: string; title: string }> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    return {
      html: await this.page.content(),
      url: this.page.url(),
      title: await this.page.title()
    };
  }

  /**
   * Get the current page object (for direct manipulation if needed)
   */
  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    return this.page;
  }

  /**
   * Get workflow context (accessible by step functions)
   */
  getContext(): WorkflowContext {
    if (!this.engine) {
      throw new Error('BotExecutor not initialized');
    }
    return this.engine.getContext();
  }

  /**
   * Set a value in the workflow context
   */
  setContext(key: string, value: any): void {
    if (!this.engine) {
      throw new Error('BotExecutor not initialized');
    }
    this.engine.setContext(key, value);
  }

  /**
   * Run the entire workflow from start to finish
   */
  async runWorkflow(): Promise<void> {
    if (!this.engine) {
      throw new Error('BotExecutor not initialized');
    }

    await this.engine.run();
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
    }
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
  }
}
