/**
 * Session Manager
 * Handles browser session persistence for authenticated bots
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BrowserContext, Browser } from 'playwright';

export class SessionManager {
  private sessionsDir: string;

  constructor(sessionsDir: string = './sessions') {
    this.sessionsDir = sessionsDir;
  }

  async ensureSessionsDir(): Promise<void> {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  getSessionPath(url: string): string {
    // Create session filename from URL (sanitized)
    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    const sessionName = domain.replace(/[^a-z0-9]/gi, '_');
    return path.join(this.sessionsDir, `${sessionName}_session`);
  }

  async sessionExists(url: string): Promise<boolean> {
    const sessionPath = this.getSessionPath(url);
    try {
      const stat = await fs.stat(sessionPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async saveSession(context: BrowserContext, url: string): Promise<void> {
    await this.ensureSessionsDir();
    const sessionPath = this.getSessionPath(url);

    console.log(`💾 Saving session to: ${sessionPath}`);

    // Create session directory
    await fs.mkdir(sessionPath, { recursive: true });

    // Playwright saves cookies, localStorage, sessionStorage automatically
    await context.storageState({ path: `${sessionPath}/state.json` });

    console.log('✅ Session saved');
  }

  async loadSession(browser: Browser, url: string): Promise<BrowserContext | null> {
    const sessionPath = this.getSessionPath(url);
    const statePath = `${sessionPath}/state.json`;

    try {
      await fs.access(statePath);

      console.log(`📂 Loading session from: ${sessionPath}`);

      const context = await browser.newContext({
        storageState: statePath,
        viewport: { width: 1920, height: 1080 }
      });

      console.log('✅ Session loaded');
      return context;

    } catch (error) {
      console.log('ℹ️  No existing session found');
      return null;
    }
  }

  async clearSession(url: string): Promise<void> {
    const sessionPath = this.getSessionPath(url);
    try {
      await fs.rm(sessionPath, { recursive: true });
      console.log('🗑️  Session cleared');
    } catch (error) {
      // Session might not exist
    }
  }
}
