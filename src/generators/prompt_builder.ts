/**
 * Prompt Builder
 * Creates surgical prompts for DeepSeek to generate bot steps
 */

import type { PageAnalysis, InteractiveElement } from '../types/analysis.js';

export interface StepContext {
  stepNumber: number;
  previousAction?: string;
  context: string;
  completedSteps?: string[];
}

export class PromptBuilder {
  buildStepPrompt(
    intent: string,
    pageContext: { raw_html: string, url: string, title: string }, // New shape
    stepContext: any
  ): string {
    const truncatedHtml = pageContext.raw_html.substring(0, 75000); // Truncate to avoid token limits

    return `
You are an expert Selenium/Playwright bot developer. Your task is to analyze the provided HTML and generate the YAML and TypeScript for the SINGLE BEST NEXT STEP to achieve the user's goal.

═══════════════════════════════════════════════════════════════
CRITICAL CONTEXT FOR STEP ${stepContext.stepNumber}
═══════════════════════════════════════════════════════════════

USER GOAL: ${intent}
${stepContext.additionalContext ? `USER GUIDANCE: ${stepContext.additionalContext}` : ''}

PREVIOUS ACTION: ${stepContext.previousAction || 'None (this is the first step)'}
CURRENT PAGE: ${pageContext.title}
PAGE URL: ${pageContext.url}

COMPLETED STEPS SO FAR:
${stepContext.completedSteps?.map((s: any, i: number) => `${i + 1}. ${s}`).join('\n') || 'None'}

═══════════════════════════════════════════════════════════════
CURRENT PAGE HTML
═══════════════════════════════════════════════════════════════

\`\`\`html
${truncatedHtml}
\`\`\`

═══════════════════════════════════════════════════════════════
CRITICAL RULES FOR THIS STEP
═══════════════════════════════════════════════════════════════

1.  **Analyze the HTML above.** Based on the user's goal and the completed steps, determine the single most logical next action.
2.  **Generate ONE atomic action.** This action should be a single interaction (e.g., click, fill, select, wait).
3.  **Generate YAML and TypeScript.** Follow the output format precisely.
4.  **Verify success.** The generated code must include a way to verify the action was successful (e.g., \`waitForLoadState\`, \`waitForSelector\` for a new element).
5.  **Handle errors.** The code must use try/catch and yield appropriate events on failure.

═══════════════════════════════════════════════════════════════
SELECTOR GENERATION RULES
═══════════════════════════════════════════════════════════════

1.  **Use REAL selectors from the HTML.** Do not invent or hallucinate selectors.
2.  **PRIORITIZE stable selectors in this order:**
    - 1. \`data-testid\`, \`data-qa\`, \`data-cy\`
    - 2. \`aria-label\`, \`aria-labelledby\`
    - 3. \`id\` (if it looks stable and not dynamically generated)
    - 4. \`name\` (especially for form elements)
    - 5. Robust \`class\` names that are not style-related.
3.  **Your generated selector string MUST be valid and properly quoted.**
    - GOOD: \`button[aria-label="Next page"]\`
    - BAD: \`button[aria-label*=\`
    - BAD: \`a[href=/jobs]\`

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

First, output YAML for the workflow step:

\`\`\`yaml
step_${stepContext.stepNumber}:
  step: ${stepContext.stepNumber}
  func: "function_name_here"
  transitions:
    success_event: "step_${stepContext.stepNumber + 1}"
    element_not_found: "retry_step_${stepContext.stepNumber}"
    timeout: "error_handler"
  timeout: 30
  on_timeout_event: "timeout"
\`\`\`

Then, output TypeScript implementation:

CRITICAL: Your code MUST use page.waitForSelector() on the FIRST line after try block.
This is REQUIRED for the execution engine to parse your code.

\`\`\`typescript
import { Page } from 'playwright';

export async function* function_name_here(ctx: any): AsyncGenerator<string, void> {
  const page: Page = ctx.page;

  try {
    // REQUIRED: Use page.waitForSelector as FIRST LINE
    const element = await page.waitForSelector('YOUR_REAL_SELECTOR_FROM_HTML', {
      timeout: 10000,
      state: 'visible'
    });

    if (!element) {
      yield 'element_not_found';
      return;
    }

    // Perform the action
    await element.click(); // or .fill('value'), .selectOption(), etc.

    // Wait for change
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    yield 'success_event';

  } catch (error) {
    console.error('Step failed:', error);

    if (error.message.includes('timeout')) {
      yield 'timeout';
    } else {
      yield 'element_not_found';
    }
  }
}
\`\`\`

═══════════════════════════════════════════════════════════════
NOW, ANALYZE THE HTML AND GENERATE THE CODE FOR STEP ${stepContext.stepNumber}
═══════════════════════════════════════════════════════════════
`;
  }

  /**
   * Build prompt for executing a generic strategy
   * This is used for phase-based execution with adaptive strategies
   */
  buildStrategyExecutionPrompt(
    phase: string,
    strategy: string,
    analysis: PageAnalysis,
    context: {
      goal: string;
      completedPhases?: string[];
      attemptedStrategies?: string[];
    }
  ): string {
    const compressedContext = this.compressPageContext(analysis);

    return `
You are executing ONE STRATEGY for a bot automation phase. Output ONLY valid TypeScript code.

═══════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════

USER GOAL: ${context.goal}
CURRENT PHASE: ${phase}
STRATEGY TO EXECUTE: ${strategy}

CURRENT PAGE: ${analysis.metadata.title}
PAGE URL: ${analysis.url}
PAGE TYPE: ${compressedContext.page_purpose}

COMPLETED PHASES:
${context.completedPhases?.map((p, i) => `${i + 1}. ${p}`).join('\n') || 'None yet'}

${context.attemptedStrategies && context.attemptedStrategies.length > 0 ? `
ALREADY TRIED (these failed):
${context.attemptedStrategies.map((s, i) => `${i + 1}. ${s}`).join('\n')}

YOUR APPROACH MUST BE DIFFERENT FROM THE ABOVE!
` : ''}

═══════════════════════════════════════════════════════════════
AVAILABLE ELEMENTS
═══════════════════════════════════════════════════════════════

${this.formatInteractiveElements(analysis.interactive_elements)}

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════

1. Implement the STRATEGY, not specific selectors
2. Use SEMANTIC discovery (find elements by their purpose, not hardcoded selectors)
3. Try multiple selector patterns (data attributes, labels, placeholders, etc.)
4. Return success/failure clearly
5. Handle errors gracefully

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Output TypeScript code that implements this strategy:

\`\`\`typescript
import { Page } from 'playwright';

export async function executeStrategy(page: Page): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {
  try {
    // Implement the strategy: ${strategy}

    // Example: If strategy is "Find search input by placeholder"
    // const searchInput = await page.locator('input[placeholder*="search" i]').first();
    // await searchInput.fill('keywords');

    // Return success with details
    return {
      success: true,
      message: 'Strategy executed successfully',
      data: { /* any relevant data */ }
    };

  } catch (error) {
    return {
      success: false,
      message: \`Strategy failed: \${error.message}\`
    };
  }
}
\`\`\`

NOW GENERATE THE CODE FOR THIS STRATEGY: ${strategy}
`;
  }

  /**
   * Build prompt for discovering selectors for a specific pattern
   */
  buildSelectorDiscoveryPrompt(
    pattern: string,
    analysis: PageAnalysis,
    examples?: string[]
  ): string {
    return `
You are discovering CSS selectors for a specific pattern on a webpage.

PATTERN TO FIND: ${pattern}

CURRENT PAGE: ${analysis.metadata.title}
URL: ${analysis.url}

${examples && examples.length > 0 ? `
EXAMPLE SELECTORS FROM SIMILAR SITES:
${examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}
` : ''}

AVAILABLE ELEMENTS:
${this.formatInteractiveElements(analysis.interactive_elements)}

OUTPUT FORMAT: JSON only
{
  "primary_selector": "Most reliable CSS selector",
  "fallback_selectors": ["Alternative 1", "Alternative 2", "Alternative 3"],
  "confidence": "high|medium|low",
  "reasoning": "Why this selector pattern should work"
}

Provide selectors that will find: ${pattern}
`;
  }
}
