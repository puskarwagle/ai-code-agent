# AI Web Agent Bot Generator - Technical Implementation Plan

## Core Architecture

### System Flow
```
User Intent + URL
    ↓
HTML Intelligence Layer (analyze page structure)
    ↓
Progressive Bot Generator (step-by-step with validation)
    ↓
Adaptive Executor (self-healing with AI feedback)
    ↓
Working Bot with error recovery
```

---

## Phase 1: HTML Intelligence Layer

### PageAnalysis Interface
```typescript
interface PageAnalysis {
  // Interactive elements discovery
  interactive_elements: {
    buttons: Array<{
      selector: string;
      text: string;
      purpose: string;
      selectors: SelectorChain; // Multiple fallback selectors
    }>;
    inputs: Array<{
      selector: string;
      type: string;
      label: string;
      selectors: SelectorChain;
    }>;
    links: Array<{
      selector: string;
      text: string;
      href: string;
      selectors: SelectorChain;
    }>;
  };

  // Page structure understanding
  page_structure: {
    main_content_area: string;
    navigation: string;
    forms: Array<FormStructure>;
  };

  // NEW: Semantic zones for better context
  semantic_zones: {
    header: { selectors: string[], purpose: string };
    navigation: { selectors: string[], items: InteractiveElement[] };
    main_content: { selectors: string[], confidence: number };
    footer: { selectors: string[], purpose: string };
  };

  // NEW: Data patterns recognition
  data_patterns: {
    lists: Array<{ container: string, items: string, repeat_pattern: boolean }>;
    tables: Array<{ selector: string, headers: string[] }>;
    cards: Array<{ selector: string, fields: Record<string, string> }>;
  };

  // NEW: Element visibility detection
  element_visibility: {
    above_fold: InteractiveElement[];
    requires_scroll: InteractiveElement[];
    hidden_by_css: InteractiveElement[];
  };

  // Dynamic content detection
  dynamic_content: {
    infinite_scroll: boolean;
    lazy_loaded_images: boolean;
    ajax_navigation: boolean;
  };

  // Anti-bot signal detection
  anti_bot_signals: {
    captcha_present: boolean;
    rate_limiting_likely: boolean;
    requires_javascript: boolean;
  };
}

// Enhanced selector strategy with fallback chains
interface SelectorChain {
  primary: string;              // Most stable (data-testid, aria-label, ID)
  fallbacks: string[];           // Semantic, hierarchical, index-based
  validation: {
    must_be_visible: boolean;
    must_be_enabled: boolean;
    expected_text?: string;
    screenshot_verification: boolean;
  };
}
```

### HTML Processing Pipeline
1. **Fetch raw HTML** (Playwright for JS-heavy sites)
2. **Strip unnecessary data** (inline styles, scripts, tracking pixels)
3. **Annotate elements** with multiple selector strategies + confidence scores
4. **Identify semantic zones** (header, nav, main content, footer)
5. **Detect data patterns** (lists, tables, cards)
6. **Classify element visibility** (above fold, needs scroll, hidden)
7. **Compress to structured format** for AI consumption

---

## Phase 2: Prompt Architecture for DeepSeek

### Context Compression Strategy
```typescript
// Don't send full HTML - send structured intent
const compressedContext = {
  page_purpose: "ecommerce_product_listing", // AI-determined
  available_actions: ["search", "filter", "sort", "paginate"],
  current_data: { items_count: 24, page_number: 1 },
  target_elements: {
    search_box: { selector: '#search', type: 'input', selectors: SelectorChain },
    sort_dropdown: { selector: '.sort-select', type: 'select', selectors: SelectorChain },
    product_cards: { selector: '.product-card', count: 24 }
  }
};
```

### Step-Specific Prompt Builder
```typescript
function buildStepPrompt(
  intent: string,
  analysis: PageAnalysis,
  stepContext: StepContext
): string {
  return `
You are generating ONE step of a Selenium bot. Output ONLY valid TypeScript and YAML.

=== CRITICAL CONTEXT FOR STEP ${stepContext.stepNumber} ===

PREVIOUS ACTION: ${stepContext.previousAction || 'None'}
CURRENT PAGE: ${analysis.metadata.title}
PAGE PURPOSE: ${analysis.semantic_zones.main_content.purpose}
USER GOAL: ${intent}

=== AVAILABLE ACTIONS FOR THIS STEP ===
${generateActionSuggestions(analysis, intent)}

=== INTERACTIVE ELEMENTS YOU CAN USE ===
${formatInteractiveElements(analysis.interactive_elements)}

=== CRITICAL RULES ===
1. Generate ONLY ONE atomic action for this step
2. Use ONLY the selectors provided above (with fallback chains)
3. MUST verify success with observable page change
4. ALWAYS handle errors (yield 'element_not_found', 'timeout', etc.)
5. Take screenshot on errors for AI diagnosis
6. Use exponential backoff for retries

=== OUTPUT FORMAT ===

YAML (workflow step):
---
step_${stepContext.stepNumber}:
  step: ${stepContext.stepNumber}
  func: "[function_name]"
  transitions:
    success_event: "step_${stepContext.stepNumber + 1}"
    failure_event: "retry_step_${stepContext.stepNumber}"
    timeout_event: "error_handler"
  timeout: 30
  on_timeout_event: "timeout_event"
---

TypeScript (step implementation):
\`\`\`typescript
export async function* [function_name](ctx: any): AsyncGenerator<string, void> {
  try {
    // 1. Verify element exists (with fallback chain)
    const element = await findElementWithFallback(ctx.driver, selectors);
    if (!element) yield 'element_not_found';

    // 2. Perform action
    await element.click(); // or .sendKeys(), etc.

    // 3. Verify success (wait for observable change)
    await ctx.driver.wait(until.elementLocated(By.css('[success_indicator]')), 10000);

    // 4. Take screenshot for verification
    await ctx.driver.takeScreenshot();

    yield 'success_event';
  } catch (error) {
    console.error('Step failed:', error);
    await ctx.driver.takeScreenshot(); // For AI diagnosis
    yield 'failure_event';
  }
}
\`\`\`

NOW GENERATE STEP ${stepContext.stepNumber}:
`;
}
```

---

## Phase 3: Progressive Bot Generation (Iterative, Not All-At-Once)

### Multi-Phase Generation Strategy
```typescript
class ProgressiveBotGenerator {
  async generateBot(intent: string, url: string): Promise<BotFiles> {
    // PHASE 1: Discovery (navigate + understand page)
    const discoverySteps = await this.generateDiscoveryPhase(intent, url);

    // PHASE 2: Main workflow (execute user intent)
    const workflowSteps = await this.generateWorkflowPhase(intent, discoverySteps);

    // PHASE 3: Error handling (retry logic, fallbacks)
    const errorHandlers = await this.generateErrorHandlers(workflowSteps);

    // PHASE 4: Optimization (remove redundant steps)
    return await this.optimizeBot([...discoverySteps, ...workflowSteps, ...errorHandlers]);
  }

  private async generateDiscoveryPhase(intent: string, url: string) {
    // Step 1: Navigate to page
    const page_html = await fetchAndAnalyze(url);

    const step_1 = await deepseek.generate({
      prompt: buildStepPrompt(intent, page_html, {
        stepNumber: 1,
        previousAction: null,
        context: "Navigate to URL and verify page loads"
      })
    });

    // Execute in sandbox to validate
    const result = await executeStepInSandbox(step_1);

    if (!result.success) {
      // AI fixes the step based on error
      return await this.fixStep(step_1, result.error, result.screenshot);
    }

    // Step 2: Understand page structure
    const new_page_state = await capturePageState(result.driver);

    const step_2 = await deepseek.generate({
      prompt: buildStepPrompt(intent, new_page_state, {
        stepNumber: 2,
        previousAction: 'page_loaded',
        context: `Page loaded successfully. Now identify key elements for: ${intent}`
      })
    });

    return [step_1, step_2];
  }

  private async generateWorkflowPhase(intent: string, discoverySteps: Steps[]) {
    const steps = [];
    let currentStep = discoverySteps.length + 1;
    let pageState = discoverySteps[discoverySteps.length - 1].finalState;

    while (!this.isIntentFulfilled(intent, pageState)) {
      const nextStep = await deepseek.generate({
        prompt: buildStepPrompt(intent, pageState, {
          stepNumber: currentStep,
          previousAction: steps[steps.length - 1]?.action || 'page_analyzed',
          context: `Continue working towards: ${intent}`
        })
      });

      // Execute and validate
      const result = await executeStepInSandbox(nextStep);

      if (result.success) {
        steps.push(nextStep);
        pageState = await capturePageState(result.driver);
        currentStep++;
      } else {
        // AI fixes the step
        const fixed = await this.fixStep(nextStep, result.error, result.screenshot);
        steps.push(fixed);
      }

      // Safety: max 20 steps per workflow
      if (currentStep > 20) break;
    }

    return steps;
  }
}
```

---

## Phase 4: Adaptive Execution with Safety Nets

### Execution Safety Checks
```typescript
class ExecutionSafetyNet {
  async executeWithRecovery(step: WorkflowStep, ctx: Context): Promise<string> {
    // Run pre-execution safety checks
    const safetyChecks = [
      this.checkForModals.bind(this),           // Unexpected popups
      this.checkForLoginWalls.bind(this),       // Session expired
      this.checkForRateLimiting.bind(this),     // Too many requests
      this.checkForCaptcha.bind(this)           // Bot detection
    ];

    for (const check of safetyChecks) {
      const issue = await check(ctx);
      if (issue) {
        return await this.handleSafetyIssue(issue, step, ctx);
      }
    }

    // Execute step with retry logic
    return await this.executeStepWithRetry(step, ctx);
  }

  private async checkForModals(ctx: Context): Promise<SafetyIssue|null> {
    const modalSelectors = [
      '.modal', '[role="dialog"]', '.popup', '.overlay',
      '[data-testid*="modal"]', '.cookie-banner'
    ];

    for (const selector of modalSelectors) {
      const modal = await ctx.driver.findElement(By.css(selector)).catch(() => null);
      if (modal && await modal.isDisplayed()) {
        return {
          type: 'modal_blocking',
          selector,
          severity: 'high',
          suggested_action: 'dismiss_modal'
        };
      }
    }
    return null;
  }

  private async executeStepWithRetry(step: WorkflowStep, ctx: Context): Promise<string> {
    let attempts = 0;
    const max_attempts = 3;

    while (attempts < max_attempts) {
      try {
        // Capture state before execution
        const beforeState = await this.captureState(ctx);

        // Execute the step
        const result = await runStep(step, ctx);

        // Validate state change occurred
        const afterState = await this.captureState(ctx);
        const isValid = await this.validateStateTransition(beforeState, afterState, step);

        if (isValid) return result;

        throw new Error('State validation failed - no observable change detected');

      } catch (error) {
        attempts++;

        // Capture failure context for AI diagnosis
        const screenshot = await ctx.driver.takeScreenshot();
        const page_html = await ctx.driver.getPageSource();

        // AI diagnoses the failure
        const diagnosis = await deepseek.diagnose({
          step_code: step.code,
          error: error.message,
          screenshot: screenshot,
          html_snippet: extractRelevantHTML(page_html, error),
          selector: step.selector
        });

        if (diagnosis.fixable) {
          // AI suggests new selector or retry strategy
          step = diagnosis.fixed_step;
          console.log(`🔧 Adapted step: ${diagnosis.explanation}`);

          // Exponential backoff before retry
          await sleep(Math.pow(2, attempts) * 1000);
        } else {
          throw new Error(`Unfixable: ${diagnosis.reason}`);
        }
      }
    }

    throw new Error(`Step failed after ${max_attempts} attempts`);
  }
}
```

### State Validation Layer
```typescript
class StateValidator {
  async validateStepSuccess(step: WorkflowStep, ctx: Context): Promise<ValidationResult> {
    const validators = {
      'navigation': this.validateNavigationSuccess.bind(this),
      'click': this.validateClickSuccess.bind(this),
      'form_submit': this.validateFormSubmitSuccess.bind(this),
      'extraction': this.validateDataExtraction.bind(this)
    };

    const validator = validators[step.type] || this.validateGenericSuccess;
    return await validator(step, ctx);
  }

  private async validateClickSuccess(step: WorkflowStep, ctx: Context): Promise<ValidationResult> {
    // Check for observable changes:
    // 1. URL changed
    // 2. New elements appeared
    // 3. Loading indicators disappeared
    // 4. Expected content is visible

    const checks = [
      this.checkForUrlChange(ctx.beforeState.url, ctx.afterState.url),
      this.checkForNewElements(ctx.beforeState.domHash, ctx.afterState.domHash),
      this.checkLoadingIndicatorsGone(ctx),
      this.checkExpectedContentVisible(step.successIndicator, ctx)
    ];

    const results = await Promise.all(checks);
    return {
      success: results.every(r => r.passed),
      details: results
    };
  }
}
```

---

## Phase 5: Enhanced Selector Strategy

### Robust Selector Generation
```typescript
class RobustSelectorGenerator {
  generateSelectorChain(element: InteractiveElement): SelectorChain {
    return {
      // Priority order: stability > specificity
      primary: this.generateStableSelector(element),
      fallbacks: [
        this.generateSemanticSelector(element),      // Text-based
        this.generateHierarchicalSelector(element),  // Parent-child path
        this.generateIndexSelector(element),         // Position-based (last resort)
      ],
      validation: {
        must_be_visible: true,
        must_be_enabled: element.type === 'button' || element.type === 'input',
        expected_text: element.text?.substring(0, 20),
        screenshot_verification: true
      }
    };
  }

  private generateStableSelector(element: InteractiveElement): string {
    // PRIORITY ORDER for selector stability:
    // 1. data-testid, data-qa, data-cy (test attributes)
    if (element.attributes['data-testid']) {
      return `[data-testid="${element.attributes['data-testid']}"]`;
    }

    // 2. aria-label, aria-labelledby (accessibility)
    if (element.attributes['aria-label']) {
      return `[aria-label="${element.attributes['aria-label']}"]`;
    }

    // 3. ID (if not dynamic/hashed)
    if (element.id && !this.isDynamicId(element.id)) {
      return `#${element.id}`;
    }

    // 4. Name attribute (for forms)
    if (element.attributes['name']) {
      return `[name="${element.attributes['name']}"]`;
    }

    // 5. Stable class patterns (avoid hashes like "css-a3f2g")
    const stableClasses = element.classes.filter(c => !this.isHashedClass(c));
    if (stableClasses.length > 0) {
      return `.${stableClasses.join('.')}`;
    }

    // Fallback to semantic selector
    return this.generateSemanticSelector(element);
  }

  private generateSemanticSelector(element: InteractiveElement): string {
    // Text-based selector (most resilient to DOM changes)
    if (element.text) {
      const escapedText = element.text.replace(/"/g, '\\"');
      return `//${element.tagName}[contains(text(), "${escapedText}")]`;
    }

    // Role-based selector
    if (element.role) {
      return `[role="${element.role}"]`;
    }

    return this.generateHierarchicalSelector(element);
  }

  private generateHierarchicalSelector(element: InteractiveElement): string {
    // Navigate from nearest stable parent
    // Example: .header > .nav > button.login
    return element.hierarchyPath;
  }

  private generateIndexSelector(element: InteractiveElement): string {
    // Position-based (fragile, last resort)
    // Example: (//button)[3]
    return `(//${element.tagName})[${element.index}]`;
  }
}
```

---

## Implementation Timeline

### Week 1: Core Foundation (Days 1-5)

**Day 1-2: HTML Intelligence Layer**
- ✅ Build element extraction with visibility detection
- ✅ Implement semantic zone identification
- ✅ Add data pattern recognition (lists, cards, tables)
- ✅ Create selector stability scoring

**Day 3: Prompt Engineering**
- ✅ Design step-specific prompt templates
- ✅ Build context compression utilities
- ✅ Implement action suggestion generator
- ✅ Create output validation parsers

**Day 4-5: Sandbox Executor**
- ✅ Create isolated test environment
- ✅ Implement step execution with screenshots
- ✅ Build state capture between steps
- ✅ Add basic error detection

### Week 2: Intelligence Layer (Days 6-10)

**Day 6-7: Progressive Bot Builder**
- ✅ Implement multi-phase generation (discovery → workflow → error handling)
- ✅ Create step-by-step generation loop
- ✅ Build success/failure feedback system
- ✅ Add context passing between steps

**Day 8-9: Adaptive Execution**
- ✅ Implement safety checks (modals, auth walls, rate limits, CAPTCHA)
- ✅ Create AI-powered error diagnosis
- ✅ Build selector fallback chains
- ✅ Add adaptive retry logic with exponential backoff

**Day 10: Integration & Testing**
- ✅ End-to-end testing with real websites (Craigslist, LinkedIn, etc.)
- ✅ Performance optimization
- ✅ Error logging and monitoring
- ✅ Documentation and examples

---

## Key Technical Decisions

### 1. HTML Compression Strategy
- **Don't send full HTML** (expensive, slow)
- Extract **only interactive elements + semantic structure**
- Use readability algorithms for main content
- Annotate with confidence scores
- Send structured JSON, not raw HTML

### 2. Selector Strategy
- Generate **multiple selectors per element** (CSS, XPath, text-based)
- Rank by stability: `data-testid > aria-label > ID > name > stable classes > text > hierarchy > index`
- Implement **fallback chain**: try primary, if fails → fallback 1 → fallback 2, etc.
- Validate with visibility + interactability checks

### 3. State Management
```typescript
interface BotExecutionState {
  current_step: string;
  context: Record<string, any>;
  page_states: Array<{
    step: string;
    url: string;
    html_hash: string;        // Detect page changes
    screenshot: Buffer;
  }>;
  errors: Array<ErrorLog>;
  adaptations: Array<{
    original_code: string;
    fixed_code: string;
    reason: string;
  }>;
}
```

### 4. Error Handling Matrix

| Error Type | Detection | AI Action |
|------------|-----------|-----------|
| Element not found | Selector fails | Try fallback selectors → Re-analyze page → Generate new selector |
| Timeout | Operation exceeds limit | Increase wait → Check loading indicators → Retry |
| Unexpected modal | Common modal selectors detected | Dismiss modal → Retry action |
| CAPTCHA | CAPTCHA element found | Notify user → Pause bot → Resume after solve |
| Rate limit | 429 status / slow responses | Exponential backoff → Rotate sessions → Add human-like delays |
| Page structure changed | DOM hash mismatch | Re-fetch HTML → Re-analyze → Re-generate step |
| Login wall | Auth-related elements appear | Notify user → Wait for manual login → Resume |

---

## Critical Safety & Ethics

### Rate Limit Detection
- Monitor for 429 HTTP responses
- Detect CAPTCHA challenges
- Track request frequency
- Implement exponential backoff

### Session Management
- Handle login states gracefully
- Store/restore cookies securely
- Manage auth tokens
- Detect session expiration

### Resource Limits
- Max pages per execution
- Max execution time (timeout)
- Memory usage limits
- Prevent infinite loops

### Ethical Boundaries
- Respect robots.txt
- Don't bypass paywalls
- Rate limit requests
- No spam/abuse behavior

### User Confirmation
- Pause for critical actions (purchases, deletions, posts)
- Show preview before execution
- Allow manual intervention
- Log all actions

---

## Next Steps

**Immediate priorities:**
1. Start with **HTML Analyzer** (`html_analyzer.ts`)
2. Build **Prompt Templates** (`prompt_builder.ts`)
3. Create **Sandbox Executor** (`sandbox_executor.ts`)
4. Implement **Progressive Bot Generator** (`bot_generator.ts`)
5. Add **Adaptive Execution** (`adaptive_executor.ts`)

