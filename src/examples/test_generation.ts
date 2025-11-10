/**
 * Example: Test bot generation
 */

import { BotGenerator } from '../generators/bot_generator.js';
import { getConfig } from '../utils/config.js';

async function testBotGeneration() {
  console.log('🧪 Testing Bot Generation...\n');

  try {
    const config = getConfig();
    const generator = new BotGenerator(config.deepseek_api_key);

    // Example 1: Simple navigation bot
    const botFiles = await generator.generateBot(
      'https://example.com',
      'Visit the page and find all links'
    );

    console.log('\n✅ Bot generated successfully!');
    console.log(`📁 Bot name: ${botFiles.botName}`);
    console.log(`📄 YAML length: ${botFiles.yaml.length} bytes`);
    console.log(`📄 TypeScript length: ${botFiles.typescript.length} bytes`);

    console.log('\n--- Generated YAML ---');
    console.log(botFiles.yaml.substring(0, 500) + '...\n');

    console.log('--- Generated TypeScript (first function) ---');
    const firstFunction = botFiles.typescript.split('\n\n')[1] || '';
    console.log(firstFunction.substring(0, 500) + '...\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

testBotGeneration();
