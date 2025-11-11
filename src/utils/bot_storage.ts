/**
 * Bot Storage Manager
 * Handles saving/loading bot metadata and progress
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ensureDir, readFile, writeFile, fileExists } from './file_helpers.js';

export interface BotMetadata {
  id: string;
  name: string;
  url: string;
  original_intent: string;
  created_at: number;
  updated_at: number;
  status: 'in_progress' | 'completed' | 'failed';

  // Generation context
  current_step: number;
  total_steps: number;
  generated_steps?: Array<{
    step_number: number;
    action_description: string;
    yaml: string;
    typescript: string;
    execution_result?: any;
  }>;

  // User interactions
  user_feedback: Array<{
    timestamp: number;
    feedback: string;
    at_step: number;
  }>;

  // Files
  yaml_path: string;
  typescript_path: string;
  context_path: string;
}

export class BotStorageManager {
  private storageDir: string;
  private metadataFile: string;

  constructor(storageDir: string = './generated_bots') {
    this.storageDir = storageDir;
    this.metadataFile = path.join(storageDir, 'bots_metadata.json');
  }

  async initialize(): Promise<void> {
    await ensureDir(this.storageDir);

    // Create metadata file if it doesn't exist
    if (!(await fileExists(this.metadataFile))) {
      await writeFile(this.metadataFile, JSON.stringify({ bots: [] }, null, 2));
    }
  }

  async saveBotMetadata(metadata: BotMetadata): Promise<void> {
    await this.initialize();

    // Create a lightweight version of the metadata for the main list
    const lightweightMetadata = { ...metadata };
    delete (lightweightMetadata as any).generated_steps; // Remove heavy data

    // Load existing metadata
    const data = JSON.parse(await readFile(this.metadataFile));

    // Update or add bot
    const existingIndex = data.bots.findIndex((b: BotMetadata) => b.id === metadata.id);
    if (existingIndex >= 0) {
      data.bots[existingIndex] = lightweightMetadata;
    } else {
      data.bots.push(lightweightMetadata);
    }

    // Sort by updated_at (most recent first)
    data.bots.sort((a: BotMetadata, b: BotMetadata) => b.updated_at - a.updated_at);

    await writeFile(this.metadataFile, JSON.stringify(data, null, 2));

    console.log(`💾 Bot metadata saved: ${metadata.name}`);
  }

  async loadBotMetadata(botId: string): Promise<BotMetadata | null> {
    await this.initialize();

    const data = JSON.parse(await readFile(this.metadataFile));
    return data.bots.find((b: BotMetadata) => b.id === botId) || null;
  }

  async listBots(): Promise<BotMetadata[]> {
    await this.initialize();

    const data = JSON.parse(await readFile(this.metadataFile));
    return data.bots || [];
  }

  async getBotsByUrl(url: string): Promise<BotMetadata[]> {
    const allBots = await this.listBots();
    return allBots.filter(b => b.url === url);
  }

  async addUserFeedback(botId: string, feedback: string, atStep: number): Promise<void> {
    const metadata = await this.loadBotMetadata(botId);
    if (!metadata) return;

    metadata.user_feedback.push({
      timestamp: Date.now(),
      feedback,
      at_step: atStep
    });

    metadata.updated_at = Date.now();

    await this.saveBotMetadata(metadata);
  }

  async updateBotStatus(botId: string, status: BotMetadata['status']): Promise<void> {
    const metadata = await this.loadBotMetadata(botId);
    if (!metadata) return;

    metadata.status = status;
    metadata.updated_at = Date.now();

    await this.saveBotMetadata(metadata);
  }

  generateBotId(): string {
    return `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
