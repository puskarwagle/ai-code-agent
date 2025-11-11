#!/usr/bin/env node

/**
 * AI Web Agent - Main Entry Point
 * Generate bots from natural language
 */

import { BotGenerator } from './generators/bot_generator.js';
import { getConfig } from './utils/config.js';
import * as readline from 'readline';


interface UserInput {
  url: string;
  intent: string;
  botName?: string;
  existingBotId?: string;
  additionalContext?: string;
  mode: 'new' | 'continue';
}

interface QuickSite {
  name: string;
  url: string;
  defaultIntent: string;
}

const QUICK_SITES: QuickSite[] = [
  {
    name: 'LinkedIn',
    url: 'https://linkedin.com',
    defaultIntent: 'find and apply to jobs'
  },
  {
    name: 'Indeed',
    url: 'https://indeed.com',
    defaultIntent: 'find and apply to jobs'
  },
  {
    name: 'Seek',
    url: 'https://seek.com.au',
    defaultIntent: 'find and apply to jobs'
  },
  {
    name: 'Glassdoor',
    url: 'https://glassdoor.com',
    defaultIntent: 'find and apply to jobs'
  },
  {
    name: 'ZipRecruiter',
    url: 'https://ziprecruiter.com',
    defaultIntent: 'find and apply to jobs'
  }
];

async function promptUser(generator: BotGenerator): Promise<UserInput> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise(resolve => {
      rl.question(prompt, answer => resolve(answer.trim()));
    });
  };

  console.log('\n🤖 AI Web Agent - Let\'s build a bot!\n');

  // Check for existing bots
  const existingBots = await generator.listBots();

  if (existingBots.length > 0) {
    console.log('📚 Existing Bots:\n');
    existingBots.forEach((bot, i) => {
      const status = bot.status === 'completed' ? '✅' : bot.status === 'in_progress' ? '⏳' : '❌';
      const date = new Date(bot.updated_at).toLocaleDateString();
      console.log(`  ${i + 1}. ${status} ${bot.name}`);
      console.log(`     URL: ${bot.url}`);
      console.log(`     Intent: ${bot.original_intent}`);
      console.log(`     Progress: ${bot.current_step} steps | Updated: ${date}\n`);
    });

    const choice = await question('Continue existing bot? (1-' + existingBots.length + ') or press ENTER for new bot: ');

    if (choice && parseInt(choice) > 0 && parseInt(choice) <= existingBots.length) {
      const selectedBot = existingBots[parseInt(choice) - 1];

      console.log(`\n📂 Selected: ${selectedBot.name}`);
      console.log(`📍 URL: ${selectedBot.url}`);
      console.log(`🎯 Original Intent: ${selectedBot.original_intent}\n`);

      const additionalContext = await question('💬 Additional guidance for the bot (or press ENTER to continue): ');

      rl.close();

      return {
        mode: 'continue',
        url: selectedBot.url,
        intent: selectedBot.original_intent,
        existingBotId: selectedBot.id,
        additionalContext: additionalContext || undefined
      };
    }
  }

  // New bot flow - show quick sites
  console.log('🚀 Quick Sites:\n');
  QUICK_SITES.forEach((site, i) => {
    console.log(`  ${i + 1}. ${site.name}`);
    console.log(`     ${site.url}`);
    console.log(`     Default: ${site.defaultIntent}\n`);
  });

  const siteChoice = await question('Choose quick site (1-' + QUICK_SITES.length + ') or press ENTER for custom URL: ');

  let url: string;
  let intent: string;

  if (siteChoice && parseInt(siteChoice) > 0 && parseInt(siteChoice) <= QUICK_SITES.length) {
    const selectedSite = QUICK_SITES[parseInt(siteChoice) - 1];
    url = selectedSite.url;

    console.log(`\n✅ Selected: ${selectedSite.name}`);
    console.log(`📍 URL: ${url}`);
    console.log(`💡 Default intent: ${selectedSite.defaultIntent}\n`);

    const customIntent = await question('🎯 Intent (or press ENTER for default): ');
    intent = customIntent || selectedSite.defaultIntent;
  } else {
    url = await question('📍 Target URL: ');
    intent = await question('🎯 What should the bot do? ');
  }

  const botName = await question('🤖 Give your bot a name (e.g., "linkedin-job-applier"): ');
  rl.close();

  return { mode: 'new', url, intent, botName };
}

async function main() {
  try {
    // Load config
    const config = getConfig();

    // Create generator instance
    const generator = new BotGenerator(config.deepseek_api_key);

    // Check for command-line arguments
    const args = process.argv.slice(2);

    let url: string;
    let intent: string;
    let botName: string | undefined;
    let existingBotId: string | undefined;
    let additionalContext: string | undefined;

    if (args.length >= 2) {
      // CLI mode: npm start <url> "<intent>"
      url = args[0];
      intent = args.slice(1).join(' ');

      console.log('\n🤖 AI Web Agent - CLI Mode\n');
      console.log(`📍 Target URL: ${url}`);
      console.log(`🎯 Intent: ${intent}\n`);
    } else {
      // Interactive mode
      const userInput = await promptUser(generator);
      url = userInput.url;
      intent = userInput.intent;
      botName = userInput.botName;
      existingBotId = userInput.existingBotId;
      additionalContext = userInput.additionalContext;
    }

    // Validate input
    if (!url || !intent) {
      console.error('❌ Error: URL and intent are required');
      process.exit(1);
    }

    // Generate bot
    const botFiles = await generator.generateBot(url, intent, {
      botName,
      existingBotId,
      additionalContext,
      useSession: true,
      allowManualLogin: true
    });

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    BOT GENERATED SUCCESSFULLY                 ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log(`🤖 Bot Name: ${botFiles.botName}`);
    console.log(`📁 Files saved to: ./generated_bots/${botFiles.botName}/\n`);

    console.log('Next steps:');
    console.log(`1. Review the generated code in ./generated_bots/${botFiles.botName}/`);
    console.log(`2. Test the bot by running it with the workflow engine`);
    console.log(`3. Modify as needed\n`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error: any) => {
  console.error('\n❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run
main();
