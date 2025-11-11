/**
 * Helper methods for BotGenerator
 * Split into separate file to keep main file manageable
 */

// These will be added to bot_generator.ts as private methods
// Keeping them here for now during development

export const initializeBotExecutorCode = `
  /**
   * Initialize BotExecutor with generated bot files
   */
  private async initializeBotExecutor(): Promise<void> {
    console.log('🚀 Initializing BotExecutor...');

    this.botExecutor = new BotExecutor(this.currentOutputDir!, this.currentBotName!);
    await this.botExecutor.initialize(false); // headless = false for debugging

    console.log('✅ BotExecutor initialized\n');
  }
`;

export const executeTemplateStepsCode = `
  /**
   * Execute template steps (0, 1, 2) using BotExecutor
   */
  private async executeTemplateSteps(context: BotGenerationContext): Promise<void> {
    // Initialize bot executor
    await this.initializeBotExecutor();

    console.log('▶️  Executing template steps...\n');

    // Step 0: Initialize context
    console.log('📦 Step 0: init_context');
    await this.botExecutor!.executeStep('init_context');

    // Step 1: Navigate to homepage
    console.log('🌐 Step 1: navigate_to_homepage');
    await this.botExecutor!.executeStep('navigate_to_homepage');

    // Step 2: Detect login state
    console.log('🔍 Step 2: detect_login_state');
    const loginResult = await this.botExecutor!.executeStep('detect_login_state');

    // Step 2.5: Handle login if needed
    if (loginResult === 'login_required') {
      await this.promptUserForLogin();
      console.log('🔐 Step 2.5: wait_for_manual_login');
      await this.botExecutor!.executeStep('wait_for_manual_login');
    }

    console.log('\n✅ Template steps executed successfully\n');
  }
`;

export const initializeSandboxExecutorCode = `
  /**
   * Initialize SandboxExecutor (shares page state with BotExecutor)
   */
  private async initializeSandboxExecutor(): Promise<void> {
    console.log('🧪 Initializing SandboxExecutor for testing...');

    // Get the current page from bot executor
    const botPage = this.botExecutor!.getPage();

    // Initialize sandbox with shared browser state
    await this.sandbox.initialize(false, false, ''); // Don't navigate, we already have the page

    // Manually set the page in sandbox (we'll need to add a method for this)
    // For now, sandbox will create its own browser

    console.log('✅ SandboxExecutor ready for testing\n');
  }
`;

export const promptUserForLoginCode = `
  /**
   * Prompt user to login manually
   */
  private async promptUserForLogin(): Promise<void> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.log('');
      rl.question('✅ Press ENTER when you have logged in... ', () => {
        rl.close();
        console.log('');
        resolve();
      });
    });
  }
`;
