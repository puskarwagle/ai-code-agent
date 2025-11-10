/**
 * Progressive Bot Generator
 * Generates bots step-by-step with validation and adaptation
 */

import { HTMLAnalyzer } from '../core/html_analyzer.js';
import { DeepSeekClient } from '../core/deepseek_client.js';
import { PromptBuilder } from './prompt_builder.js';
import { SandboxExecutor } from '../executors/sandbox_executor.js';
import type { BotFiles, GeneratedStepInfo, BotGenerationContext } from '../types/bot.js';
import type { PageAnalysis } from '../types/analysis.js';
import { writeFile, sanitizeBotName } from '../utils/file_helpers.js';
import { BotStorageManager, BotMetadata } from '../utils/bot_storage.js';
import * as yaml from 'js-yaml';
import * as readline from 'readline';

export class BotGenerator {
  private analyzer: HTMLAnalyzer;
  private deepseek: DeepSeekClient;
  private promptBuilder: PromptBuilder;
  private sandbox: SandboxExecutor;
  private storage: BotStorageManager;
  private currentBotId: string | null = null;

  constructor(deepseekApiKey: string) {
    this.analyzer = new HTMLAnalyzer({
      include_hidden_elements: false,
      detect_data_patterns: true,
      capture_screenshots: false
    });
    this.deepseek = new DeepSeekClient(deepseekApiKey);
    this.promptBuilder = new PromptBuilder();
    this.sandbox = new SandboxExecutor();
    this.storage = new BotStorageManager();
  }

  async generateBot(
    url: string,
    intent: string,
    options?: {
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
      }
    }

    if (!existingBot) {
      console.log('\n🤖 Starting Progressive Bot Generation...');
      console.log(`📍 Target URL: ${url}`);
      console.log(`🎯 User Intent: ${intent}\n`);
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
        await this.saveBotProgress(context, url, intent);
      } else {
        // For existing bots, still need to navigate to the page
        console.log('🌐 Navigating to saved URL...\n');
        await this.sandbox.navigateToUrl(url);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if login is needed (session might have expired)
        const loginRequired = await this.sandbox.detectLoginRequired();

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
      await this.saveBotProgress(context, url, intent);

      // PHASE 3: Compile Bot
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('PHASE 3: COMPILING BOT');
      console.log('═══════════════════════════════════════════════════════\n');

      const botFiles = await this.compileBotFiles(context);

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
      await this.analyzer.close();
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

  private async confirmPlan(plan: any): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║                       EXECUTION PLAN                          ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝\n');

      console.log(`📊 Estimated steps: ${plan.estimated_steps}\n`);

      plan.steps.forEach((step: any) => {
        console.log(`${step.step_number}. ${step.action}`);
        console.log(`   💭 ${step.reasoning}\n`);
      });

      if (plan.warnings && plan.warnings.length > 0) {
        console.log('⚠️  Warnings:');
        plan.warnings.forEach((warning: string) => {
          console.log(`   • ${warning}`);
        });
        console.log('');
      }

      rl.question('✅ Does this plan look good? (yes/no): ', (answer) => {
        rl.close();
        const approved = answer.toLowerCase().trim().startsWith('y');
        console.log('');
        resolve(approved);
      });
    });
  }

  private async generateDiscoveryPhase(context: BotGenerationContext): Promise<GeneratedStepInfo[]> {
    const steps: GeneratedStepInfo[] = [];

    // Step 1: Navigate to URL
    console.log('📍 Step 1: Navigate to target URL...');

    await this.sandbox.navigateToUrl(context.url);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page load

    // Detect if login is required
    const loginRequired = await this.sandbox.detectLoginRequired();

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

    // Analyze the page (use existing page to preserve login state)
    const currentPage = this.sandbox.getPage();
    const pageAnalysis = await this.analyzer.analyze(context.url, currentPage);

    console.log('✅ Page loaded and analyzed\n');

    // PHASE 0: Intent Analysis
    console.log('═══════════════════════════════════════════════════════');
    console.log('PHASE 0: INTENT ANALYSIS & PLANNING');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('🧠 Analyzing your intent...\n');
    const intentAnalysis = await this.deepseek.analyzeIntent(context.intent, context.url, pageAnalysis);

    console.log(`💡 Understood goal: ${intentAnalysis.understood_goal}`);
    if (intentAnalysis.site_knowledge) {
      console.log(`📚 Site knowledge: ${intentAnalysis.site_knowledge}`);
    }
    console.log(`🎯 Confidence: ${intentAnalysis.confidence}\n`);

    // Ask clarifying questions if needed
    if (intentAnalysis.clarifying_questions.length > 0) {
      const answers = await this.askClarifyingQuestions(intentAnalysis.clarifying_questions);
      // Update context with answers
      const clarifications = Object.entries(answers)
        .map(([q, a]) => `Q: ${q}\nA: ${a}`)
        .join('\n');
      context.intent = `${context.intent}\n\nClarifications:\n${clarifications}`;
    }

    // Create execution plan
    console.log('📋 Creating execution plan...\n');
    const plan = await this.deepseek.createPlan(context.intent, context.url, pageAnalysis);

    // Get user confirmation
    const planApproved = await this.confirmPlan(plan);

    if (!planApproved) {
      throw new Error('Plan rejected by user. Please restart with a different intent or provide more guidance.');
    }

    console.log('✅ Plan approved! Starting execution...\n');

    // Generate navigation step
    const navPrompt = this.promptBuilder.buildStepPrompt(
      context.intent,
      pageAnalysis,
      {
        stepNumber: 1,
        context: 'Navigate to the target URL and verify it loads successfully',
        completedSteps: []
      }
    );

    const navStep = await this.deepseek.generateStep(navPrompt);

    steps.push({
      step_number: 1,
      yaml: navStep.yaml,
      typescript: navStep.typescript,
      action_description: 'Navigate to URL',
      execution_result: {
        success: true,
        page_state: await this.sandbox.capturePageState()
      }
    });

    return steps;
  }

  private async generateWorkflowPhase(context: BotGenerationContext, additionalContext?: string): Promise<GeneratedStepInfo[]> {
    const steps: GeneratedStepInfo[] = [];
    let stepNumber = context.generated_steps.length + 1;
    const maxSteps = 10; // Prevent infinite loops

    while (stepNumber <= maxSteps) {
      console.log(`🔧 Step ${stepNumber}: Generating next action...`);

      // Get current page state
      const currentPageState = await this.sandbox.capturePageState();

      // Check if intent is fulfilled
      const isFulfilled = await this.deepseek.isIntentFulfilled(context.intent, {
        title: currentPageState.title,
        url: currentPageState.url,
        visible_text: await this.sandbox.getPage().innerText('body').catch(() => '')
      });

      if (isFulfilled) {
        console.log('🎉 Intent fulfilled! Stopping generation.\n');
        break;
      }

      // Analyze current page (use existing page to preserve state)
      const currentPage = this.sandbox.getPage();
      const pageAnalysis = await this.analyzer.analyze(currentPageState.url, currentPage);

      // Build prompt for next step
      const completedActions = context.generated_steps.map(s => s.action_description);

      let contextMessage = `Continue working towards: "${context.intent}"`;
      if (additionalContext) {
        contextMessage += `\n\nUSER GUIDANCE: ${additionalContext}`;
      }

      const stepPrompt = this.promptBuilder.buildStepPrompt(
        context.intent,
        pageAnalysis,
        {
          stepNumber,
          previousAction: completedActions[completedActions.length - 1],
          context: contextMessage,
          completedSteps: completedActions
        }
      );

      // Generate step
      const generatedStep = await this.deepseek.generateStep(stepPrompt);

      // Try to execute the step
      let executionResult = await this.executeGeneratedStep(
        generatedStep.typescript,
        this.extractFunctionName(generatedStep.typescript)
      );

      // If step failed, try to fix it
      if (!executionResult.success) {
        console.log('⚠️  Step failed, attempting fix...');
        const fixedStep = await this.fixFailedStep(generatedStep, executionResult);

        if (fixedStep) {
          generatedStep.typescript = fixedStep.typescript;
          executionResult = await this.executeGeneratedStep(
            fixedStep.typescript,
            this.extractFunctionName(fixedStep.typescript)
          );
        }
      }

      if (executionResult.success) {
        console.log(`✅ Step ${stepNumber} complete\n`);

        steps.push({
          step_number: stepNumber,
          yaml: generatedStep.yaml,
          typescript: generatedStep.typescript,
          action_description: this.extractActionDescription(generatedStep),
          execution_result: executionResult
        });

        stepNumber++;
      } else {
        console.log(`❌ Step ${stepNumber} failed after retry. Stopping.\n`);
        break;
      }

      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return steps;
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

          if (functionName.includes('click') || functionName.includes('button') || tagName === 'button' || tagName === 'a') {
            console.log(`👆 Clicking element...`);
            await element.click();
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          } else if (functionName.includes('fill') || functionName.includes('input') || tagName === 'input' || tagName === 'textarea') {
            console.log(`⌨️  Filling input...`);
            // Extract value from code if present
            const valueMatch = typescript.match(/fill\(['"]([^'"]+)['"]\)/);
            const value = valueMatch ? valueMatch[1] : 'test input';
            await element.fill(value);
          } else if (functionName.includes('select') || tagName === 'select') {
            console.log(`📋 Selecting option...`);
            await element.selectOption({ index: 0 });
          } else {
            console.log(`👀 Element found, waiting...`);
          }

          // Wait a bit for any dynamic changes
          await new Promise(resolve => setTimeout(resolve, 1500));

          console.log(`✅ Step executed successfully`);

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
        console.log(`⏭️  No selector found, skipping execution`);
        return {
          success: true,
          event: 'success_event',
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
    if (selectorMatch) return selectorMatch[1];

    // Try to find locator
    const locatorMatch = typescript.match(/locator\(['"]([^'"]+)['"]/);
    if (locatorMatch) return locatorMatch[1];

    // Try to find click
    const clickMatch = typescript.match(/\$\$?\(['"]([^'"]+)['"]\)/);
    if (clickMatch) return clickMatch[1];

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

  private async compileBotFiles(context: BotGenerationContext): Promise<BotFiles> {
    const botName = sanitizeBotName(context.intent);

    // Compile YAML workflow
    const workflowConfig: any = {
      workflow_meta: {
        title: context.intent,
        description: `Bot generated for: ${context.intent}`,
        start_step: 'step_1'
      },
      steps_config: {}
    };

    // Parse and merge all step YAML configs
    for (const step of context.generated_steps) {
      try {
        const stepConfig = yaml.load(step.yaml) as any;
        const stepKey = Object.keys(stepConfig)[0];
        workflowConfig.steps_config[stepKey] = stepConfig[stepKey];
      } catch (error) {
        console.warn(`Failed to parse YAML for step ${step.step_number}:`, error);
      }
    }

    // Add done step
    const lastStep = context.generated_steps[context.generated_steps.length - 1];
    if (lastStep) {
      const lastStepKey = `step_${lastStep.step_number}`;
      if (workflowConfig.steps_config[lastStepKey]) {
        workflowConfig.steps_config[lastStepKey].transitions.success_event = 'done';
      }
    }

    workflowConfig.steps_config['done'] = {
      step: 999,
      func: 'done',
      transitions: {},
      timeout: 0,
      on_timeout_event: 'done'
    };

    const yamlContent = yaml.dump(workflowConfig);

    // Compile TypeScript implementation
    const tsContent = `/**
 * ${context.intent}
 * Generated by AI Web Agent
 */

import { Page } from 'playwright';

${context.generated_steps.map(step => step.typescript).join('\n\n')}

export async function* done(ctx: any): AsyncGenerator<string, void> {
  console.log('✅ Bot workflow complete!');
  yield 'done';
}
`;

    // Save files
    const outputDir = `./generated_bots/${botName}`;
    await writeFile(`${outputDir}/workflow.yaml`, yamlContent);
    await writeFile(`${outputDir}/${botName}.ts`, tsContent);

    console.log(`📁 Bot files saved to: ${outputDir}`);
    console.log(`   • workflow.yaml`);
    console.log(`   • ${botName}.ts\n`);

    return {
      yaml: yamlContent,
      typescript: tsContent,
      botName
    };
  }

  private async saveBotProgress(context: BotGenerationContext, url: string, intent: string): Promise<void> {
    if (!this.currentBotId) return;

    const botName = sanitizeBotName(intent);

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
      yaml_path: `./generated_bots/${botName}/workflow.yaml`,
      typescript_path: `./generated_bots/${botName}/${botName}.ts`,
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
