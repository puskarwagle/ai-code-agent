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
    analysis: PageAnalysis,
    stepContext: StepContext
  ): string {
    const compressedContext = this.compressPageContext(analysis);

    return `
You are generating ONE step of a Selenium/Playwright bot. Output ONLY valid TypeScript and YAML.

═══════════════════════════════════════════════════════════════
CRITICAL CONTEXT FOR STEP ${stepContext.stepNumber}
═══════════════════════════════════════════════════════════════

USER GOAL: ${intent}

PREVIOUS ACTION: ${stepContext.previousAction || 'None (this is the first step)'}
CURRENT PAGE: ${analysis.metadata.title}
PAGE URL: ${analysis.url}
PAGE PURPOSE: ${compressedContext.page_purpose}

COMPLETED STEPS SO FAR:
${stepContext.completedSteps?.map((s, i) => `${i + 1}. ${s}`).join('\n') || 'None'}

═══════════════════════════════════════════════════════════════
AVAILABLE ACTIONS FOR THIS STEP
═══════════════════════════════════════════════════════════════

${this.generateActionSuggestions(analysis, intent)}

═══════════════════════════════════════════════════════════════
INTERACTIVE ELEMENTS YOU CAN USE
═══════════════════════════════════════════════════════════════

${this.formatInteractiveElements(analysis.interactive_elements)}

═══════════════════════════════════════════════════════════════
PAGE STRUCTURE
═══════════════════════════════════════════════════════════════

Main Content: ${analysis.page_structure.main_content_area}
Navigation: ${analysis.page_structure.navigation}
Forms: ${analysis.page_structure.forms.length} detected
Data Patterns: ${analysis.data_patterns.map(p => `${p.type} (${p.count} items)`).join(', ')}

═══════════════════════════════════════════════════════════════
CRITICAL RULES FOR THIS STEP
═══════════════════════════════════════════════════════════════

1. Generate ONLY ONE atomic action for this step
2. Use ONLY the selectors provided above (with fallback chains)
3. MUST verify success with observable page change
4. ALWAYS handle errors (yield 'element_not_found', 'timeout', etc.)
5. Take screenshot on errors for AI diagnosis
6. Use exponential backoff for retries
7. Import from 'playwright' not 'selenium-webdriver'

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
    const element = await page.waitForSelector('your_selector_here', {
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

IMPORTANT:
- ALWAYS use page.waitForSelector('selector', ...) as the FIRST LINE in try block
- Do NOT use complex selector chains or variables for the primary selector
- Put the actual selector string directly in waitForSelector()
- Example: page.waitForSelector('[aria-label="Search"]', ...)

═══════════════════════════════════════════════════════════════
NOW GENERATE STEP ${stepContext.stepNumber}
═══════════════════════════════════════════════════════════════

Context: ${stepContext.context}

Output the YAML and TypeScript code blocks now.
`;
  }

  private compressPageContext(analysis: PageAnalysis): {
    page_purpose: string;
    available_actions: string[];
  } {
    const available_actions: string[] = [];

    if (analysis.interactive_elements.inputs.length > 0) {
      available_actions.push('fill_form', 'search');
    }
    if (analysis.interactive_elements.buttons.length > 0) {
      available_actions.push('click_button', 'submit');
    }
    if (analysis.interactive_elements.links.length > 0) {
      available_actions.push('navigate', 'follow_link');
    }
    if (analysis.interactive_elements.selects.length > 0) {
      available_actions.push('select_option', 'filter');
    }
    if (analysis.data_patterns.length > 0) {
      available_actions.push('extract_data', 'scrape_list');
    }

    // Determine page purpose based on structure
    let page_purpose = 'general_webpage';

    if (analysis.page_structure.forms.length > 0) {
      const forms = analysis.page_structure.forms;
      if (forms.some(f => f.inputs.some(i => i.type === 'password'))) {
        page_purpose = 'login_page';
      } else if (forms.some(f => f.inputs.some(i => i.type === 'search'))) {
        page_purpose = 'search_page';
      } else {
        page_purpose = 'form_page';
      }
    } else if (analysis.data_patterns.some(p => p.type === 'cards' || p.type === 'list')) {
      page_purpose = 'listing_page';
    } else if (analysis.data_patterns.some(p => p.type === 'table')) {
      page_purpose = 'data_table_page';
    }

    return { page_purpose, available_actions };
  }

  private generateActionSuggestions(analysis: PageAnalysis, intent: string): string {
    const suggestions: string[] = [];

    // Suggest actions based on available elements
    if (analysis.interactive_elements.inputs.length > 0) {
      const searchInput = analysis.interactive_elements.inputs.find(i =>
        i.type === 'search' ||
        i.attributes['name']?.toLowerCase().includes('search') ||
        i.attributes['placeholder']?.toLowerCase().includes('search')
      );

      if (searchInput) {
        suggestions.push(`• SEARCH: Fill search input "${searchInput.selector}" and submit`);
      }

      const textInputs = analysis.interactive_elements.inputs.filter(i =>
        i.type === 'text' || i.type === 'email' || !i.type
      );

      if (textInputs.length > 0) {
        suggestions.push(`• FILL FORM: ${textInputs.length} text inputs available`);
      }
    }

    if (analysis.interactive_elements.buttons.length > 0) {
      const submitBtn = analysis.interactive_elements.buttons.find(b =>
        b.type === 'submit' ||
        b.text?.toLowerCase().includes('submit') ||
        b.text?.toLowerCase().includes('search') ||
        b.text?.toLowerCase().includes('go')
      );

      if (submitBtn) {
        suggestions.push(`• SUBMIT: Click "${submitBtn.text}" button (${submitBtn.selector})`);
      }
    }

    if (analysis.interactive_elements.links.length > 0) {
      const links = analysis.interactive_elements.links.slice(0, 5);
      suggestions.push(`• NAVIGATE: ${links.length} links available`);
    }

    if (analysis.data_patterns.length > 0) {
      suggestions.push(`• EXTRACT DATA: ${analysis.data_patterns.length} data patterns detected`);
    }

    if (suggestions.length === 0) {
      suggestions.push('• WAIT: Page may still be loading, wait for elements');
      suggestions.push('• SCROLL: Content may be below the fold');
    }

    return suggestions.join('\n');
  }

  private formatInteractiveElements(elements: PageAnalysis['interactive_elements']): string {
    const lines: string[] = [];

    // Format buttons
    if (elements.buttons.length > 0) {
      lines.push('BUTTONS:');
      elements.buttons.slice(0, 10).forEach((btn, i) => {
        lines.push(`  ${i + 1}. "${btn.text || '(no text)'}" [${btn.tagName}]`);
        lines.push(`     Primary selector: ${btn.selectors.primary}`);
        lines.push(`     Fallbacks: ${btn.selectors.fallbacks.slice(0, 2).join(', ')}`);
        lines.push(`     Stability: ${btn.selectors.stability_score}/100`);
        if (i < elements.buttons.length - 1) lines.push('');
      });
      lines.push('');
    }

    // Format inputs
    if (elements.inputs.length > 0) {
      lines.push('INPUTS:');
      elements.inputs.slice(0, 10).forEach((input, i) => {
        lines.push(`  ${i + 1}. [${input.type || 'text'}] "${input.label || input.attributes['placeholder'] || '(no label)'}"`);
        lines.push(`     Primary selector: ${input.selectors.primary}`);
        lines.push(`     Fallbacks: ${input.selectors.fallbacks.slice(0, 2).join(', ')}`);
        lines.push(`     Name: ${input.attributes['name'] || 'N/A'}`);
        if (i < elements.inputs.length - 1) lines.push('');
      });
      lines.push('');
    }

    // Format selects
    if (elements.selects.length > 0) {
      lines.push('SELECT DROPDOWNS:');
      elements.selects.slice(0, 5).forEach((select, i) => {
        lines.push(`  ${i + 1}. "${select.label || select.attributes['name'] || '(no label)'}"`);
        lines.push(`     Selector: ${select.selectors.primary}`);
      });
      lines.push('');
    }

    // Format important links
    if (elements.links.length > 0) {
      lines.push(`LINKS: (showing first 5 of ${elements.links.length})`);
      elements.links.slice(0, 5).forEach((link, i) => {
        lines.push(`  ${i + 1}. "${link.text?.substring(0, 50) || link.href}"`);
        lines.push(`     Href: ${link.href}`);
        lines.push(`     Selector: ${link.selectors.primary}`);
      });
    }

    return lines.join('\n');
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
