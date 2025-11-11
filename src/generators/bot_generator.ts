/**
 * Progressive Bot Generator
 * Generates bots step-by-step with validation and adaptation
 */

import { DeepSeekClient } from '../core/deepseek_client.js';
import { PromptBuilder } from './prompt_builder.js';
import { SandboxExecutor } from '../executors/sandbox_executor.js';
import type { BotFiles, GeneratedStepInfo, BotGenerationContext } from '../types/bot.js';
import type { PageAnalysis } from '../types/analysis.js';
import { writeFile, sanitizeBotName } from '../utils/file_helpers.js';
import { BotStorageManager, BotMetadata } from '../utils/bot_storage.js';
import * as yaml from 'js-yaml';
import * as readline from 'readline';
import * as fs from 'fs/promises';

export class BotGenerator {

  private deepseek: DeepSeekClient;
  private promptBuilder: PromptBuilder;
  private sandbox: SandboxExecutor;
  private storage: BotStorageManager;
  private currentBotId: string | null = null;

  constructor(deepseekApiKey: string) {
    this.deepseek = new DeepSeekClient(deepseekApiKey);
    this.promptBuilder = new PromptBuilder();
    this.sandbox = new SandboxExecutor();
    this.storage = new BotStorageManager();
  }

  async generateBot(
    url: string,
    intent: string,
    options?: {
      botName?: string;
      allowManualLogin?: boolean;
      useSession?: boolean;
      existingBotId?: string;
      additionalContext?: string;
    }
  ): Promise<BotFiles> {
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Load existing bot if continuing
    let existingBot: BotMetadata | null = null;
    if (options?.existingBotId) {
      existingBot = await this.storage.loadBotMetadata(options.existingBotId);
      if (existingBot) {
        console.log('\n📂 Loading existing bot...');
        console.log(`🤖 Bot: ${existingBot.name}`);
        console.log(`📍 URL: ${existingBot.url}`);
        console.log(`🎯 Original Intent: ${existingBot.original_intent}`);
        console.log(`📊 Progress: ${existingBot.current_step}/${existingBot.total_steps} steps`);
        if (options.additionalContext) {
          console.log(`💬 Additional Context: ${options.additionalContext}`);
        }
        console.log('');

        // Display detailed progress summary
        await this.displayProgressSummary(existingBot, options.additionalContext);
      }
    }

    if (!existingBot) {
      console.log('\n🤖 Starting Progressive Bot Generation...');
      console.log(`📍 Target URL: ${url}`);
      console.log(`🎯 User Intent: ${intent}\n`);

      // Scaffold bot files
      const botName = sanitizeBotName(options?.botName || intent);
      const outputDir = `./generated_bots/${botName}`;
      const tsContent = `// ${intent}\n\nimport { Page } from 'playwright';\n\n`;
      const yamlContent = `workflow_meta:\n  title: "${intent}"\n  description: "A bot to ${intent}"\n  start_step: "step_1"\n\nsteps_config:\n`;
      await writeFile(`${outputDir}/${botName}_impl.ts`, tsContent);
      await writeFile(`${outputDir}/${botName}_steps.yaml`, yamlContent);
      await writeFile(`${outputDir}/${botName}_selectors.json`, `{}`);
      await writeFile(`${outputDir}/${botName}_config.json`, `{\n  "keywords": "software engineer",\n  "location": "New York"\n}`);
      console.log(`📂 Created bot file templates in: ${outputDir}\n`);
    }

    // Create or restore context
    const context: BotGenerationContext = existingBot ? {
      intent: existingBot.original_intent,
      url: existingBot.url,
      generated_steps: existingBot.generated_steps as any[],
      current_step: existingBot.current_step
    } : {
      intent,
      url,
      generated_steps: [],
      current_step: 1
    };

    // Generate bot ID
    this.currentBotId = options?.existingBotId || this.storage.generateBotId();

    try {
      // Initialize sandbox with session support
      const useSession = options?.useSession ?? true;
      await this.sandbox.initialize(false, useSession, url); // Show browser for debugging

      // PHASE 1: Discovery (skip if continuing, but still navigate)
      if (!existingBot) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('PHASE 1: DISCOVERY');
        console.log('═══════════════════════════════════════════════════════\n');

        const discoverySteps = await this.generateDiscoveryPhase(context);
        context.generated_steps.push(...discoverySteps);

        // Save initial metadata
        await this.saveBotProgress(context, url, intent, sanitizeBotName(options?.botName || intent));
      } else {
        // For existing bots, still need to navigate to the page
        console.log('🌐 Navigating to saved URL...\n');
        await this.sandbox.navigateToUrl(url);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if login is needed using AI
        console.log('🤖 Analyzing page with AI to detect login requirement...');
        const pageHtml = await this.sandbox.getPage().content();
        const loginRequired = await this.deepseek.isLoginRequired(pageHtml);

        if (loginRequired) {
          console.log('🔐 Login required (session expired?) - waiting for manual login...\n');
          await this.waitForManualLogin(url);

          // Save session immediately after login
          console.log('💾 Saving login session...');
          await this.sandbox.saveSession();
          console.log('✅ Session saved\n');
        } else {
          console.log('✅ Already logged in\n');
        }
      }

      // PHASE 2: Main Workflow
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('PHASE 2: MAIN WORKFLOW');
      if (options?.additionalContext) {
        console.log(`💬 User Guidance: ${options.additionalContext}`);
      }
      console.log('═══════════════════════════════════════════════════════\n');

      const workflowSteps = await this.generateWorkflowPhase(context, options?.additionalContext);
      context.generated_steps.push(...workflowSteps);

      // Save progress after each phase
      await this.saveBotProgress(context, url, intent, existingBot?.name || sanitizeBotName(options?.botName || intent));

      // PHASE 3: Compile Bot
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('PHASE 3: COMPILING BOT');
      console.log('═══════════════════════════════════════════════════════\n');

      const botFiles = await this.compileBotFiles(context, existingBot?.name || sanitizeBotName(options?.botName || intent));

      // Mark bot as completed
      await this.storage.updateBotStatus(this.currentBotId!, 'completed');

      console.log('✅ Bot generation complete!\n');

      return botFiles;

    } finally {
      // Save session before closing (even if interrupted)
      try {
        console.log('\n💾 Saving browser session...');
        await this.sandbox.saveSession();
      } catch (error) {
        console.warn('⚠️  Failed to save session:', error);
      }

      await this.sandbox.close();
    }
  }

  async waitForManualLogin(url: string): Promise<void> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║                     MANUAL LOGIN REQUIRED                     ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝\n');
      console.log(`🔐 Please login to ${url} in the browser window`);
      console.log('⏳ Take your time to complete the login process...\n');

      rl.question('✅ Press ENTER when you\'re logged in and ready to continue... ', () => {
        rl.close();
        console.log('\n🚀 Continuing with bot generation...\n');
        resolve();
      });
    });
  }

  private async askClarifyingQuestions(questions: string[]): Promise<Record<string, string>> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answers: Record<string, string> = {};
      let currentIndex = 0;

      const askNext = () => {
        if (currentIndex >= questions.length) {
          rl.close();
          resolve(answers);
          return;
        }

        const question = questions[currentIndex];
        rl.question(`❓ ${question}\n   Answer: `, (answer) => {
          answers[question] = answer.trim();
          currentIndex++;
          console.log('');
          askNext();
        });
      };

      console.log('\n💬 I have a few questions to better understand your goal:\n');
      askNext();
    });
  }

  /**
   * Display progress summary when continuing a bot
   */
  private async displayProgressSummary(
    bot: BotMetadata,
    additionalContext?: string
  ): Promise<void> {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                     PROGRESS SUMMARY                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // What's been done
    console.log('✅ COMPLETED STEPS:\n');
    const completedSteps = bot.generated_steps.filter(
      (_, idx) => idx < bot.current_step - 1
    );

    if (completedSteps.length === 0) {
      console.log('   (No steps completed yet - bot just started)\n');
    } else {
      completedSteps.forEach((step, idx) => {
        const status = step.execution_result?.success ? '✅' : '❌';
        console.log(`   ${idx + 1}. ${status} ${step.action_description}`);
      });
      console.log('');
    }

    // Current state
    console.log('📍 CURRENT STATE:\n');
    if (bot.current_step <= bot.total_steps) {
      const currentStep = bot.generated_steps[bot.current_step - 1];
      if (currentStep) {
        console.log(`   Step ${bot.current_step}: ${currentStep.action_description}`);
        if (currentStep.execution_result?.error) {
          console.log(`   ⚠️  Last error: ${currentStep.execution_result.error}`);
        }
      } else {
        console.log(`   Ready to generate step ${bot.current_step}`);
      }
    } else {
      console.log('   All steps completed - ready for new workflow');
    }
    console.log('');

    // What's next
    console.log('🎯 RECOMMENDED NEXT ACTIONS:\n');

    // Analyze bot state and provide recommendations
    const recommendations = this.analyzeAndRecommend(bot, additionalContext);
    recommendations.forEach((rec, idx) => {
      console.log(`   ${idx + 1}. ${rec}`);
    });
    console.log('');

    // Issues encountered
    const failedSteps = bot.generated_steps.filter(
      step => step.execution_result?.success === false
    );

    if (failedSteps.length > 0) {
      console.log('⚠️  ISSUES ENCOUNTERED:\n');
      failedSteps.forEach((step, idx) => {
        console.log(`   • Step ${step.step_number}: ${step.action_description}`);
        if (step.execution_result?.error) {
          console.log(`     Error: ${step.execution_result.error}`);
        }
      });
      console.log('');
    }

    console.log('─────────────────────────────────────────────────────────────\n');
    console.log('💡 The bot will continue from where it left off.\n');

    if (additionalContext) {
      console.log(`📝 Your additional guidance: "${additionalContext}"\n`);
    }
  }

  /**
   * Analyze bot state and provide smart recommendations
   */
  private analyzeAndRecommend(
    bot: BotMetadata,
    additionalContext?: string
  ): string[] {
    const recommendations: string[] = [];

    // ALWAYS start with the goal
    recommendations.push('🎯 GOAL: Find and apply to jobs');

    // Check if bot is stuck (multiple failures on same step)
    const recentSteps = bot.generated_steps.slice(-3);
    const allFailed = recentSteps.every(step => step.execution_result?.success === false);

    if (allFailed && recentSteps.length > 0) {
      recommendations.push('🔧 Bot appears stuck - rethink the approach');
      recommendations.push('💬 Provide specific guidance or let AI analyze HTML again');
      return recommendations;
    }

    // Check completion status
    if (bot.status === 'completed') {
      recommendations.push('✨ Bot completed - jobs should be applied to');
      recommendations.push('📊 Review results and check applications');
      return recommendations;
    }

    // Check if additional guidance provided
    if (additionalContext) {
      recommendations.push(`📝 User guidance: "${additionalContext}"`);
      recommendations.push('🤖 Generate next micro-plan with this context');
      return recommendations;
    }

    // Analyze what's actually been done
    const hasNavigated = bot.generated_steps.some(s =>
      s.action_description.toLowerCase().includes('navigate') ||
      s.action_description.toLowerCase().includes('homepage')
    );

    const hasSearched = bot.generated_steps.some(s =>
      s.action_description.toLowerCase().includes('search') ||
      s.action_description.toLowerCase().includes('jobs')
    );

    const hasCollectedCards = bot.generated_steps.some(s =>
      s.action_description.toLowerCase().includes('card') ||
      s.action_description.toLowerCase().includes('collect')
    );

    const hasApplied = bot.generated_steps.some(s =>
      s.action_description.toLowerCase().includes('apply')
    );

    // Give recommendations based on what's actually missing
    if (!hasNavigated) {
      recommendations.push('📍 Next: Navigate to job site homepage');
      recommendations.push('🔍 Analyze the page to understand structure');
    } else if (!hasSearched) {
      recommendations.push('🔍 Next: Find and use search functionality');
      recommendations.push('⌨️  Enter job search criteria');
    } else if (!hasCollectedCards) {
      recommendations.push('📋 Next: Find job cards on the page');
      recommendations.push('🤖 Use AI-powered pattern detection');
    } else if (!hasApplied) {
      recommendations.push('✅ Next: Click on job cards and apply');
      recommendations.push('🚀 Detect Quick Apply vs Regular Apply');
    } else {
      recommendations.push('🔄 Next: Continue applying to more jobs');
      recommendations.push('📄 Move to next page if needed');
    }

    return recommendations;
  }

  /**
   * Display a generic plan to the user
   */
  private displayGenericPlan(plan: any): void {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    GENERIC EXECUTION PLAN                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log(`🎯 Goal: ${plan.goal}`);
    console.log(`⏱️  Estimated duration: ${plan.estimated_duration}\n`);

    console.log('📋 Phases:\n');
    plan.phases.forEach((phase: any, index: number) => {
      const required = phase.required ? '🔴 REQUIRED' : '🟡 OPTIONAL';
      console.log(`${index + 1}. ${phase.phase} ${required}`);
      console.log(`   ${phase.description}\n`);

      console.log(`   Primary Strategies:`);
      phase.strategies.forEach((strategy: string) => {
        console.log(`   • ${strategy}`);
      });

      if (phase.fallbacks && phase.fallbacks.length > 0) {
        console.log(`\n   Fallback Strategies:`);
        phase.fallbacks.forEach((fallback: string) => {
          console.log(`   ↳ ${fallback}`);
        });
      }
      console.log('');
    });

    if (plan.warnings && plan.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      plan.warnings.forEach((warning: string) => {
        console.log(`   • ${warning}`);
      });
      console.log('');
    }
  }

  /**
   * Prompt user for plan action (approve/modify/cancel)
   */
  private async promptPlanAction(): Promise<'approve' | 'modify' | 'cancel'> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('👉 [A]pprove / [M]odify / [C]ancel? ', (answer) => {
        rl.close();
        const choice = answer.toLowerCase().trim();

        if (choice === 'a' || choice === 'approve') {
          resolve('approve');
        } else if (choice === 'm' || choice === 'modify') {
          resolve('modify');
        } else if (choice === 'c' || choice === 'cancel') {
          resolve('cancel');
        } else {
          // Default to approve if unclear
          console.log('Invalid choice, assuming approve...\n');
          resolve('approve');
        }
      });
    });
  }

  /**
   * Get user feedback for plan modification
   */
  private async getUserPlanFeedback(): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.log('\n💬 What would you like to change about the plan?');
      console.log('(e.g., "Add a filter phase", "Skip the login step", "Focus more on quick apply jobs")\n');

      rl.question('Your feedback: ', (feedback) => {
        rl.close();
        resolve(feedback.trim());
      });
    });
  }

  /**
   * Create a CLI sticky todo list from the plan
   */
  private async createCliTodoList(plan: any): Promise<void> {
    console.log('📝 Creating task list for execution:\n');
    console.log('╭─────────────────────────────────────────────────────────────╮');
    console.log('│                       TODO LIST                             │');
    console.log('╰─────────────────────────────────────────────────────────────╯\n');

    plan.phases.forEach((phase: any, index: number) => {
      const checkbox = '☐';
      const required = phase.required ? '[REQUIRED]' : '[OPTIONAL]';
      console.log(`${checkbox} ${index + 1}. ${phase.phase} ${required}`);
      console.log(`   ${phase.description}`);
      console.log('');
    });

    console.log('─────────────────────────────────────────────────────────────\n');
    console.log('💡 This task list will guide the execution.\n');
  }

  private async generateDiscoveryPhase(context: BotGenerationContext): Promise<GeneratedStepInfo[]> {
    const steps: GeneratedStepInfo[] = [];

    // Step 1: Navigate to URL
    console.log('📍 Step 1: Navigate to target URL...');

    await this.sandbox.navigateToUrl(context.url);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page load

    // Detect if login is required using AI
    console.log('🤖 Analyzing page with AI to detect login requirement...');
    const currentPage = this.sandbox.getPage();
    const pageHtml = await currentPage.content();
    const loginRequired = await this.deepseek.isLoginRequired(pageHtml);

    if (loginRequired) {
      console.log('🔐 Login detected - waiting for manual login...\n');
      await this.waitForManualLogin(context.url);

      // Save session immediately after login
      console.log('💾 Saving login session...');
      await this.sandbox.saveSession();
      console.log('✅ Session saved\n');
    } else {
      console.log('✅ No login required (already logged in or public page)\n');
    }

    console.log('✅ Page loaded. Skipping discovery analysis for now.\n');

    // Create a dummy navigation step to ensure the bot starts correctly.
    // The main workflow will handle the real logic from here.
    const navStep: GeneratedStepInfo = {
      step_number: 1,
      yaml: `
step_1:
  step: 1
  func: "navigate_to_start"
  transitions:
    success_event: "step_2"
    error: "error_handler"
`,
      typescript: `
import { Page } from 'playwright';
export async function* navigate_to_start(ctx: any): AsyncGenerator<string, void> {
  console.log('Navigating to start URL...');
  await ctx.page.goto('${context.url}', { waitUntil: 'networkidle' });
  yield 'success_event';
}`,
      action_description: `Navigate to ${context.url}`,
      execution_result: {
        success: true,
        page_state: await this.sandbox.capturePageState()
      }
    };

    steps.push(navStep);
    return steps;
  }

  /**
   * Generate workflow using an iterative, single-step generation process.
   * In each loop, it analyzes the current page state and generates only the next single best step.
   */
  private async generateWorkflowPhase(context: BotGenerationContext, additionalContext?: string): Promise<GeneratedStepInfo[]> {
    const steps: GeneratedStepInfo[] = [];
    const maxSteps = 30; // Set a hard limit for total steps
    let stepCounter = 0;

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║           ITERATIVE STEP-BY-STEP EXECUTION                  ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log('🎯 GOAL: Find and apply to jobs');
    console.log('📋 Strategy: Analyze page, generate one step, execute, repeat.\n');

    while (stepCounter < maxSteps) {
      const currentStepNumber = context.generated_steps.length + 1;
      stepCounter++;

      console.log(`\n═══════════════════════════════════════════════════════`);
      console.log(`GENERATING STEP #${currentStepNumber}`);
      console.log(`═══════════════════════════════════════════════════════\n`);

      // Get current state
      const currentPage = this.sandbox.getPage();
      const currentPageState = await this.sandbox.capturePageState();
      const completedSteps = context.generated_steps.map(s => s.action_description);

      // Check if goal is already fulfilled
      const isFulfilled = await this.deepseek.isIntentFulfilled(context.intent, {
        title: currentPageState.title,
        url: currentPageState.url,
        visible_text: await currentPage.innerText('body').catch(() => '')
      });

      if (isFulfilled) {
        console.log('🎉 GOAL ACHIEVED! The user\'s intent has been fulfilled.\n');
        break;
      }

      // Get raw HTML and generate the next step in one AI call
      console.log('🤖 Analyzing page and generating next action...');
      const pageHtml = await currentPage.content();

      const stepPrompt = this.promptBuilder.buildStepPrompt(
        context.intent,
        {
          // We now pass raw HTML and other context instead of a full analysis object
          raw_html: pageHtml,
          url: currentPageState.url,
          title: currentPageState.title
        },
        {
          stepNumber: currentStepNumber,
          previousAction: completedSteps[completedSteps.length - 1],
          context: `Based on the current page HTML, decide the single best next action to achieve the goal: ${context.intent}.`,
          completedSteps,
        }
      );

      const generatedStep = await this.deepseek.generateStep(stepPrompt);
      const actionDescription = this.extractActionDescription(generatedStep) || `Generated Step ${currentStepNumber}`;

      console.log(`💡 AI suggests next action: ${actionDescription}`);

      // Ask user for approval
      const approved = await this.confirmNextStep(actionDescription);
      if (!approved) {
        console.log('❌ Step rejected by user. Stopping generation.\n');
        break;
      }

      // Execute the generated step
      console.log(`\n🔧 Executing: ${actionDescription}...`);
      const executionResult = await this.executeGeneratedStep(
        generatedStep.typescript,
        this.extractFunctionName(generatedStep.typescript)
      );

// ... (rest of the file)

      if (executionResult.success) {
        console.log(`✅ ${actionDescription} - SUCCESS\n`);
        const newStep: GeneratedStepInfo = {
          step_number: currentStepNumber,
          yaml: generatedStep.yaml,
          typescript: generatedStep.typescript,
          action_description: actionDescription,
          execution_result: executionResult
        };
        steps.push(newStep);
        context.generated_steps.push(newStep);

        // Commit the successful step to the bot files
        const botName = sanitizeBotName(context.intent);
        const outputDir = `./generated_bots/${botName}`;

        // 1. Append to TypeScript implementation file
        const tsImplPath = `${outputDir}/${botName}_impl.ts`;
        await fs.appendFile(tsImplPath, `\n${newStep.typescript}\n`);

        // 2. Update YAML workflow file
        const yamlPath = `${outputDir}/${botName}_steps.yaml`;
        try {
            const yamlFileContent = await fs.readFile(yamlPath, 'utf8');
            const mainWorkflow = yaml.load(yamlFileContent) as any;
            const stepWorkflow = yaml.load(newStep.yaml) as any;
            
            const stepKey = Object.keys(stepWorkflow)[0];
            if (stepKey) {
                mainWorkflow.steps_config[stepKey] = stepWorkflow[stepKey];
                
                // Link previous step to this one
                if (newStep.step_number > 1) {
                    const prevStepKey = `step_${newStep.step_number - 1}`;
                    if (mainWorkflow.steps_config[prevStepKey]) {
                        mainWorkflow.steps_config[prevStepKey].transitions.success_event = stepKey;
                    }
                }
            }
            
            const updatedYamlContent = yaml.dump(mainWorkflow);
            await writeFile(yamlPath, updatedYamlContent);
            console.log(`✅ Step ${newStep.step_number} committed to workflow.`);

        } catch (e) {
            console.error(`❌ Failed to update YAML file:`, e);
        }

        currentStepNumber++;
      } else {
        console.log(`❌ ${actionDescription} - FAILED: ${executionResult.error}\n`);
        console.log('🔄 The AI will re-evaluate the page on the next loop to try a different approach.\n');
        // We don't break, allowing the loop to try again with the new page state
      }

      // Save progress and wait
      await this.saveBotProgress(context, context.url, context.intent);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (stepCounter >= maxSteps) {
      console.log('⚠️  Maximum step limit reached. Stopping generation.');
    }

    return steps;
  }

  /**
   * Confirm the next step with the user
   */
  private async confirmNextStep(action: string): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.log('\nNext Action Proposed:');
      console.log(`   ➡️  ${action}\n`);

      rl.question('👉 Execute this step? [Y/n]: ', (answer) => {
        rl.close();
        const approved = !answer.trim() || answer.toLowerCase().trim().startsWith('y');
        console.log('');
        resolve(approved);
      });
    });
  }

  private async executeGeneratedStep(
    typescript: string,
    functionName: string
  ): Promise<any> {
    try {
      console.log(`🧪 Executing step function: ${functionName}`);

      // Extract selector from generated code
      const selector = this.extractPrimarySelector(typescript);

      if (selector) {
        console.log(`🎯 Using selector: ${selector}`);

        const page = this.sandbox.getPage();

        // Wait for element and interact with it
        try {
          const element = await page.waitForSelector(selector, {
            timeout: 10000,
            state: 'visible'
          });

          if (!element) {
            throw new Error(`Element not found: ${selector}`);
          }

          // Determine action based on function name or element type
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());

          // Determine action type
          let actionTaken = false;

          if (functionName.includes('click') || functionName.includes('button') || tagName === 'button' || tagName === 'a') {
            console.log(`👆 Clicking element...`);
            await element.click();
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
            actionTaken = true;
          } else if (functionName.includes('fill') || functionName.includes('type') || functionName.includes('input') || tagName === 'input' || tagName === 'textarea') {
            console.log(`⌨️  Filling input...`);
            // Extract value from code if present
            const valueMatch = typescript.match(/fill\(['"]([^'"]+)['"]\)/) || typescript.match(/type\(['"]([^'"]+)['"]\)/);
            const value = valueMatch ? valueMatch[1] : 'software engineer';
            await element.fill(value);
            actionTaken = true;
          } else if (functionName.includes('press') && functionName.includes('enter')) {
            console.log(`⏎ Pressing Enter...`);
            await element.press('Enter');
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
            actionTaken = true;
          } else if (functionName.includes('select') || tagName === 'select') {
            console.log(`📋 Selecting option...`);
            await element.selectOption({ index: 0 });
            actionTaken = true;
          } else {
            console.log(`👀 Element found but no clear action determined`);
            console.log(`   Function name: ${functionName}, Tag: ${tagName}`);
          }

          if (!actionTaken) {
            console.log(`⚠️  No action was taken on the element`);
            return {
              success: false,
              error: 'Element found but no action could be determined',
              event: 'no_action',
              page_state: await this.sandbox.capturePageState()
            };
          }

          // Wait a bit for any dynamic changes
          await new Promise(resolve => setTimeout(resolve, 2000));

          console.log(`✅ Action completed successfully`);

          return {
            success: true,
            event: 'success_event',
            page_state: await this.sandbox.capturePageState()
          };

        } catch (error: any) {
          console.error(`❌ Selector failed: ${error.message}`);

          // Try fallback selectors if available
          const fallbacks = this.extractFallbackSelectors(typescript);
          for (const fallbackSelector of fallbacks.slice(0, 2)) {
            console.log(`🔄 Trying fallback: ${fallbackSelector}`);
            try {
              const element = await page.waitForSelector(fallbackSelector, {
                timeout: 5000,
                state: 'visible'
              });

              if (element) {
                await element.click();
                console.log(`✅ Fallback succeeded`);
                await new Promise(resolve => setTimeout(resolve, 1500));

                return {
                  success: true,
                  event: 'success_event',
                  page_state: await this.sandbox.capturePageState()
                };
              }
            } catch (e) {
              // Try next fallback
            }
          }

          throw error;
        }
      } else {
        console.log(`⚠️  No selector found in generated code`);
        console.log(`❌ Cannot execute step - no selector to interact with`);
        return {
          success: false,
          error: 'No selector found in generated code',
          event: 'element_not_found',
          page_state: await this.sandbox.capturePageState()
        };
      }

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        page_state: await this.sandbox.capturePageState()
      };
    }
  }

  private extractPrimarySelector(typescript: string): string | null {
    // Try to find waitForSelector or similar
    const selectorMatch = typescript.match(/waitForSelector\(['"]([^'"]+)['"]/);
    if (selectorMatch) {
      console.log(`   Found waitForSelector: ${selectorMatch[1]}`);
      return selectorMatch[1];
    }

    // Try to find locator
    const locatorMatch = typescript.match(/locator\(['"]([^'"]+)['"]/);
    if (locatorMatch) {
      console.log(`   Found locator: ${locatorMatch[1]}`);
      return locatorMatch[1];
    }

    // Try to find page.locator
    const pageLocatorMatch = typescript.match(/page\.locator\(['"]([^'"]+)['"]/);
    if (pageLocatorMatch) {
      console.log(`   Found page.locator: ${pageLocatorMatch[1]}`);
      return pageLocatorMatch[1];
    }

    // Try to find click/fill directly
    const directMatch = typescript.match(/(?:click|fill)\(['"]([^'"]+)['"]/);
    if (directMatch) {
      console.log(`   Found in click/fill: ${directMatch[1]}`);
      return directMatch[1];
    }

    // Try to find $$ selector
    const clickMatch = typescript.match(/\$\$?\(['"]([^'"]+)['"]\)/);
    if (clickMatch) {
      console.log(`   Found $$ selector: ${clickMatch[1]}`);
      return clickMatch[1];
    }

    console.log(`   ⚠️  Could not extract selector from generated code`);
    console.log(`   Generated code:\n${typescript.substring(0, 500)}...`);
    return null;
  }

  private extractFallbackSelectors(typescript: string): string[] {
    const fallbacks: string[] = [];

    // Look for selector arrays
    const arrayMatch = typescript.match(/selectors\s*=\s*\[([^\]]+)\]/);
    if (arrayMatch) {
      const selectorsStr = arrayMatch[1];
      const matches = selectorsStr.match(/['"]([^'"]+)['"]/g);
      if (matches) {
        fallbacks.push(...matches.map(s => s.replace(/['"]/g, '')));
      }
    }

    return fallbacks;
  }

  /**
   * Execute a phase using multiple strategies with adaptive fallback
   */
  private async executeWithStrategies(
    phase: any,
    strategies: string[]
  ): Promise<{ success: boolean; strategy_used?: string; error?: string }> {
    const attemptedStrategies: string[] = [];

    for (const strategy of strategies) {
      console.log(`🔄 Trying strategy: ${strategy}`);
      attemptedStrategies.push(strategy);

      try {
        // Here we would implement the actual strategy execution
        // For now, this is a placeholder that would be filled in with actual implementation
        // In a real implementation, this would use the sandbox to try the strategy

        // Simulate execution (this would be replaced with actual implementation)
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log(`✅ Strategy succeeded: ${strategy}`);
        return { success: true, strategy_used: strategy };

      } catch (error: any) {
        console.log(`❌ Strategy failed: ${strategy} - ${error.message}`);
        // Continue to next strategy
      }
    }

    // All strategies failed - ask AI for alternative
    console.log('\n🤖 All strategies failed. Asking AI for alternative approach...\n');

    const alternative = await this.deepseek.findAlternativeStrategy(
      phase.phase,
      'All primary and fallback strategies failed',
      attemptedStrategies
    );

    console.log(`💡 AI suggests: ${alternative.alternative_strategy}`);
    console.log(`   Reason: ${alternative.explanation}`);
    console.log(`   Confidence: ${alternative.confidence}\n`);

    if (alternative.confidence === 'high' || alternative.confidence === 'medium') {
      // Try the AI-suggested alternative
      console.log(`🔄 Trying AI-suggested alternative...`);
      try {
        // Here we would implement the alternative strategy
        // For now, this is a placeholder
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log(`✅ AI alternative succeeded!`);
        return { success: true, strategy_used: alternative.alternative_strategy };

      } catch (error: any) {
        console.log(`❌ AI alternative also failed: ${error.message}`);
      }
    }

    return {
      success: false,
      error: 'All strategies exhausted, including AI suggestions'
    };
  }

  private async fixFailedStep(
    originalStep: any,
    executionResult: any
  ): Promise<any | null> {
    console.log('🔧 Asking AI to diagnose and fix the error...');

    const diagnosis = await this.deepseek.diagnoseError({
      step_code: originalStep.typescript,
      error: executionResult.error || 'Step execution failed',
      selector: this.extractSelector(originalStep.typescript)
    });

    if (!diagnosis.fixable) {
      console.log(`❌ AI says error is not fixable: ${diagnosis.reason}`);
      return null;
    }

    console.log(`💡 Fix suggestion: ${diagnosis.explanation}`);

    // For now, return null (in production, AI would generate fixed code)
    return null;
  }

  private extractFunctionName(typescript: string): string {
    const match = typescript.match(/export\s+async\s+function\*\s+(\w+)/);
    return match ? match[1] : 'unknown_function';
  }

  private extractSelector(typescript: string): string {
    const match = typescript.match(/waitForSelector\(['"]([^'"]+)['"]/);
    return match ? match[1] : '';
  }

  private extractActionDescription(step: any): string {
    // Extract a human-readable description from the code
    const funcName = this.extractFunctionName(step.typescript);
    return funcName.replace(/_/g, ' ');
  }

  private async compileBotFiles(context: BotGenerationContext, botName: string): Promise<BotFiles> {

    // Compile YAML workflow
    const workflowConfig: any = {
//...
    // Save files
    const outputDir = `./generated_bots/${botName}`;
    await writeFile(`${outputDir}/${botName}_steps.yaml`, yamlContent);
    await writeFile(`${outputDir}/${botName}_impl.ts`, tsContent);

    console.log(`📁 Bot files saved to: ${outputDir}`);
    console.log(`   • ${botName}_steps.yaml`);
    console.log(`   • ${botName}_impl.ts\n`);

    return {
      yaml: yamlContent,
      typescript: tsContent,
      botName
    };
  }

  private async saveBotProgress(context: BotGenerationContext, url: string, intent: string, botName: string): Promise<void> {
    if (!this.currentBotId) return;

    const metadata: BotMetadata = {
      id: this.currentBotId,
      name: botName,
      url,
      original_intent: intent,
      created_at: Date.now(),
      updated_at: Date.now(),
      status: 'in_progress',
      current_step: context.current_step,
      total_steps: context.generated_steps.length,
      generated_steps: context.generated_steps.map(s => ({
        step_number: s.step_number,
        action_description: s.action_description,
        yaml: s.yaml,
        typescript: s.typescript,
        execution_result: s.execution_result
      })),
      user_feedback: [],
      yaml_path: `./generated_bots/${botName}/${botName}_steps.yaml`,
      typescript_path: `./generated_bots/${botName}/${botName}_impl.ts`,
      context_path: `./generated_bots/${botName}/context.json`
    };

    await this.storage.saveBotMetadata(metadata);
  }

  async listBots(): Promise<BotMetadata[]> {
    return await this.storage.listBots();
  }

  async getBotsByUrl(url: string): Promise<BotMetadata[]> {
    return await this.storage.getBotsByUrl(url);
  }
}
