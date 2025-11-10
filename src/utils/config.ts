/**
 * Configuration utilities
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function getDeepSeekApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error('DEEPSEEK_API_KEY not found in .env file');
  }
  return key;
}

export function getConfig() {
  return {
    deepseek_api_key: getDeepSeekApiKey(),
    playwright: {
      headless: process.env.HEADLESS === 'true',
      viewport: {
        width: parseInt(process.env.VIEWPORT_WIDTH || '1920'),
        height: parseInt(process.env.VIEWPORT_HEIGHT || '1080')
      }
    }
  };
}
