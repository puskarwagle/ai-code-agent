
  The Core Challenge

  Input: URL + User intent ("monitor Craigslist for bikes under $200")
  Output: Working bot that handles edge cases, errors, retries

  Architecture Breakdown

  Phase 1: HTML Intelligence Layer

  // html_analyzer.ts
  interface PageAnalysis {
    interactive_elements: {
      buttons: Array<{selector: string, text: string, purpose: string}>;
      inputs: Array<{selector: string, type: string, label: string}>;
      links: Array<{selector: string, text: string, href: string}>;
    };
    page_structure: {
      main_content_area: string;
      navigation: string;
      forms: Array<FormStructure>;
    };
    dynamic_content: {
      infinite_scroll: boolean;
      lazy_loaded_images: boolean;
      ajax_navigation: boolean;
    };
    anti_bot_signals: {
      captcha_present: boolean;
      rate_limiting_likely: boolean;
      requires_javascript: boolean;
    };
  }

  How it works:
  1. Fetch raw HTML (Playwright for JS-heavy sites)
  2. Strip it down to just the semantic structure (remove inline styles, scripts)
  3. Annotate elements with XPath/CSS selectors + confidence scores
  4. Send compressed HTML to DeepSeek

  Phase 2: Prompt Architecture for DeepSeek

  This is where we make or break. The prompt needs to be surgical.

  // prompt_builder.ts

  function buildBotGenerationPrompt(
    url: string, 
    intent: string, 
    html_analysis: PageAnalysis
  ): string {
    return `
  You are generating a Selenium bot implementation. Output ONLY valid TypeScript and YAML.

  CONTEXT:
  - Target URL: ${url}
  - User Intent: ${intent}
  - Page Structure: ${JSON.stringify(html_analysis.page_structure, null, 2)}
  - Interactive Elements: ${JSON.stringify(html_analysis.interactive_elements, null, 2)}

  CONSTRAINTS:
  - Use ONLY the selectors provided above
  - Every step MUST have error handling (yield 'element_not_found', 'timeout', etc.)
  - Every click/input MUST verify success before continuing
  - Use screenshots to verify state changes
  - Implement exponential backoff for retries

  OUTPUT FORMAT:

  1. Generate workflow YAML:
  ---
  workflow_meta:
    title: "[Bot Name]"
    description: "[What it does]"
    start_step: "step_1"

  steps_config:
    step_1:
      step: 1
      func: "navigate_to_page"
      transitions:
        page_loaded: "step_2"
        page_failed: "retry_navigation"
      timeout: 30
      on_timeout_event: "page_failed"
  ---

  2. Generate TypeScript implementation:
  \`\`\`typescript
  import { WebDriver, By, until } from 'selenium-webdriver';

  export async function* navigate_to_page(ctx: any): AsyncGenerator<string, void> {
    try {
      await ctx.driver.get('${url}');
      yield 'page_loaded';
    } catch (error) {
      console.error('Navigation failed:', error);
      yield 'page_failed';
    }
  }

  export async function* [next_function_name](ctx: any): AsyncGenerator<string, void> {
    // Implementation here
    // MUST yield transition events matching YAML
  }
  \`\`\`

  CRITICAL RULES:
  - EVERY function MUST be an async generator that yields transition events
  - ALWAYS verify elements exist before interaction
  - ALWAYS handle errors gracefully
  - Use ctx.driver for WebDriver, ctx.overlay for UI updates
  - Take screenshots on errors: await ctx.driver.takeScreenshot()

  NOW GENERATE THE BOT:
  `;
  }

  Phase 3: Iterative Bot Generation

  Here's the smart part - we don't generate the whole bot at once. We do it step by step with validation.

  // bot_builder.ts

  async function generateBot(url: string, intent: string): Promise<BotFiles> {
    // Step 1: Analyze the starting page
    const initial_html = await fetchAndAnalyze(url);

    // Step 2: Generate first step only
    const step_1 = await deepseek.generate({
      prompt: buildStepPrompt(intent, initial_html, step_number: 1),
      context: "This is step 1, just navigate and verify page loads"
    });

    // Step 3: Execute step 1 in test environment
    const test_result = await executeStepInSandbox(step_1);

    if (test_result.success) {
      // Capture new page state after step 1
      const new_html = await capturePageState(test_result.driver);

      // Step 4: Generate step 2 based on new state
      const step_2 = await deepseek.generate({
        prompt: buildStepPrompt(intent, new_html, step_number: 2),
        context: `Previous step succeeded. Current page: ${new_html.title}`
      });

      // Repeat until intent is fulfilled
    } else {
      // Step 1 failed - ask AI to fix it
      const fixed_step = await deepseek.fix({
        original_code: step_1,
        error: test_result.error,
        screenshot: test_result.screenshot
      });
    }

    return { yaml: workflow, typescript: bot_impl };
  }

  Phase 4: Self-Healing / Adaptive Execution

  The bot runs and learns from failures:

  // adaptive_executor.ts

  async function executeStep(step: WorkflowStep, ctx: any): Promise<string> {
    let attempts = 0;
    const max_attempts = 3;

    while (attempts < max_attempts) {
      try {
        const result = await runStep(step, ctx);
        return result;
      } catch (error) {
        attempts++;

        // Capture failure context
        const screenshot = await ctx.driver.takeScreenshot();
        const page_html = await ctx.driver.getPageSource();

        // Ask AI: "Why did this fail? How do we fix it?"
        const diagnosis = await deepseek.diagnose({
          step_code: step.func,
          error: error.message,
          screenshot: screenshot,
          html_snippet: extractRelevantHTML(page_html, error)
        });

        if (diagnosis.fixable) {
          // AI generates new selector or retry logic
          step = diagnosis.fixed_step;
          console.log(`🔧 Adapted step: ${diagnosis.explanation}`);
        } else {
          throw new Error(`Unfixable: ${diagnosis.reason}`);
        }
      }
    }
  }

  Phase 5: The Feedback Loop

  ┌─────────────────────────────────────────────┐
  │  1. User describes intent                   │
  └──────────────┬──────────────────────────────┘
                 ↓
  ┌─────────────────────────────────────────────┐
  │  2. Fetch HTML, analyze structure           │
  └──────────────┬──────────────────────────────┘
                 ↓
  ┌─────────────────────────────────────────────┐
  │  3. DeepSeek generates Step 1 only          │
  └──────────────┬──────────────────────────────┘
                 ↓
  ┌─────────────────────────────────────────────┐
  │  4. Execute in sandbox, capture state       │
  └──────────────┬──────────────────────────────┘
                 ↓
          ┌──────┴──────┐
          │   Success?  │
          └──────┬──────┘
           YES ↓     ↓ NO
      ┌─────────┐  ┌──────────────────┐
      │ Gen next│  │ AI fixes step    │
      │ step    │  │ (new selector/   │
      │         │  │  retry logic)    │
      └────┬────┘  └────┬─────────────┘
           │            │
           └────────┬───┘
                    ↓
           Repeat until done

  Key Technical Decisions

  1. HTML Compression Strategy

  - Don't send full HTML to DeepSeek (costs $$$, slow)
  - Extract only interactive elements + structure
  - Use readability algorithms to find main content
  - Annotate with confidence scores

  2. Selector Strategy

  - Generate multiple selectors per element (CSS, XPath, text-based)
  - Rank by stability (ID > data-testid > class > text)
  - Fallback chain: try selector 1, if fails → selector 2, etc.

  3. State Management

  interface BotExecutionState {
    current_step: string;
    context: Record<string, any>;
    page_states: Array<{
      step: string;
      url: string;
      html_hash: string;  // detect if page changed
      screenshot: Buffer;
    }>;
    errors: Array<ErrorLog>;
    adaptations: Array<{
      original_code: string;
      fixed_code: string;
      reason: string;
    }>;
  }

  4. Error Handling Matrix

  | Error Type             | AI Action                                                           |
  |------------------------|---------------------------------------------------------------------|
  | Element not found      | Try alternative selectors → Re-analyze page → Generate new selector |
  | Timeout                | Increase wait → Check for loading indicators → Retry                |
  | Unexpected modal       | Detect modal → Generate dismissal code → Retry action               |
  | CAPTCHA                | Notify user → Pause bot → Resume after manual solve                 |
  | Rate limit             | Exponential backoff → Rotate sessions → Human-like delays           |
  | Page structure changed | Re-fetch HTML → Re-generate step → Update YAML                      |

  What We Build First (This Week)

● You want me to start coding or you want to iterate on the architecture first? I can start with the HTML analyzer right now.

  Todos
  ☐ Build HTML analyzer - extract interactive elements + structure
  ☐ Design DeepSeek prompt templates for step generation
  ☐ Create sandbox executor for testing generated steps
  ☐ Implement iterative bot builder (gen step → test → gen next)
  ☐ Build error diagnosis system (screenshot + HTML → AI fix)
  ☐ Create selector fallback chain logic