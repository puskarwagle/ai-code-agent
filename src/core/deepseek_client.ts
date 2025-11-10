/**
 * DeepSeek API Client
 * Handles all AI interactions for bot generation and diagnosis
 */

import axios from 'axios';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GeneratedStep {
  yaml: string;
  typescript: string;
  explanation?: string;
}

export interface DiagnosisResult {
  fixable: boolean;
  fixed_step?: GeneratedStep;
  explanation: string;
  reason?: string;
  suggested_selector?: string;
}

export class DeepSeekClient {
  private apiKey: string;
  private baseURL = 'https://api.deepseek.com/v1';
  private model = 'deepseek-chat';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('DeepSeek API key is required');
    }
    this.apiKey = apiKey;
  }

  async chat(messages: DeepSeekMessage[], options?: {
    temperature?: number;
    max_tokens?: number;
  }): Promise<string> {
    try {
      const response = await axios.post<DeepSeekResponse>(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.max_tokens ?? 4000,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from DeepSeek API');
      }

      console.log(`🤖 DeepSeek: ${response.data.usage.total_tokens} tokens used`);
      return content;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('DeepSeek API error:', error.response?.data || error.message);
        throw new Error(`DeepSeek API failed: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  async generateStep(prompt: string): Promise<GeneratedStep> {
    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You are an expert Selenium/Playwright bot developer. You generate working TypeScript code and YAML workflow configurations.

CRITICAL RULES:
1. Output ONLY valid TypeScript and YAML, no explanations before/after
2. Every function MUST be an async generator that yields transition events
3. ALWAYS verify elements exist before interaction
4. ALWAYS handle errors gracefully with try/catch
5. Use the selectors provided in the prompt
6. Take screenshots on errors

OUTPUT FORMAT:
First output the YAML wrapped in \`\`\`yaml blocks.
Then output the TypeScript wrapped in \`\`\`typescript blocks.`
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await this.chat(messages, { temperature: 0.3, max_tokens: 3000 });

    // Parse YAML and TypeScript from response
    const yamlMatch = response.match(/```ya?ml\n([\s\S]*?)\n```/);
    const tsMatch = response.match(/```typescript\n([\s\S]*?)\n```/);

    if (!yamlMatch || !tsMatch) {
      throw new Error('DeepSeek response missing YAML or TypeScript code blocks');
    }

    return {
      yaml: yamlMatch[1].trim(),
      typescript: tsMatch[1].trim(),
      explanation: response.split('```')[0].trim() || undefined
    };
  }

  async diagnoseError(context: {
    step_code: string;
    error: string;
    screenshot?: string;
    html_snippet?: string;
    selector?: string;
  }): Promise<DiagnosisResult> {
    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You are debugging a Selenium/Playwright bot that failed. Analyze the error and suggest a fix.

CRITICAL RULES:
1. If the error is due to a bad selector, provide a new selector
2. If the error is due to timing, suggest wait logic
3. If unfixable (CAPTCHA, auth required), say so
4. Output format: JSON with fields { fixable: boolean, explanation: string, fixed_code?: string, suggested_selector?: string }`
      },
      {
        role: 'user',
        content: `
Bot step failed with this error:

STEP CODE:
\`\`\`typescript
${context.step_code}
\`\`\`

ERROR:
${context.error}

${context.selector ? `SELECTOR USED: ${context.selector}` : ''}

${context.html_snippet ? `RELEVANT HTML:\n${context.html_snippet}` : ''}

Diagnose the issue and provide a fix.`
      }
    ];

    const response = await this.chat(messages, { temperature: 0.2 });

    // Try to parse JSON response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          fixable: parsed.fixable,
          explanation: parsed.explanation,
          reason: parsed.reason,
          suggested_selector: parsed.suggested_selector
        };
      }
    } catch (e) {
      // Fallback: parse plain text response
    }

    // Fallback parsing
    const fixable = response.toLowerCase().includes('fixable') && !response.toLowerCase().includes('not fixable');
    return {
      fixable,
      explanation: response,
      reason: fixable ? undefined : 'Unable to automatically fix this error'
    };
  }

  async isIntentFulfilled(intent: string, pageState: {
    title: string;
    url: string;
    visible_text: string;
  }): Promise<boolean> {
    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: 'You determine if a user\'s intent has been fulfilled based on the current page state. Answer ONLY "yes" or "no".'
      },
      {
        role: 'user',
        content: `
USER INTENT: ${intent}

CURRENT PAGE STATE:
- Title: ${pageState.title}
- URL: ${pageState.url}
- Visible text (first 500 chars): ${pageState.visible_text.substring(0, 500)}

Has the intent been fulfilled? Answer ONLY "yes" or "no".`
      }
    ];

    const response = await this.chat(messages, { temperature: 0.1, max_tokens: 10 });
    return response.toLowerCase().trim().startsWith('yes');
  }

  async analyzeIntent(intent: string, url: string, pageAnalysis?: any): Promise<{
    understood_goal: string;
    clarifying_questions: string[];
    confidence: 'high' | 'medium' | 'low';
    site_knowledge?: string;
  }> {
    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You analyze user intent for web automation. Understand their goal, identify ambiguities, and ask clarifying questions if needed.

OUTPUT FORMAT: JSON only
{
  "understood_goal": "Clear description of what the user wants",
  "clarifying_questions": ["Question 1?", "Question 2?"],
  "confidence": "high|medium|low",
  "site_knowledge": "Optional: What you know about this site"
}`
      },
      {
        role: 'user',
        content: `
USER INTENT: ${intent}
TARGET URL: ${url}

${pageAnalysis ? `PAGE CONTEXT:\n- Title: ${pageAnalysis.metadata?.title}\n- Main sections: ${pageAnalysis.semantic_zones ? Object.keys(pageAnalysis.semantic_zones).join(', ') : 'unknown'}` : ''}

Analyze the intent and identify any clarifying questions needed.`
      }
    ];

    const response = await this.chat(messages, { temperature: 0.3, max_tokens: 500 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Fallback
    }

    return {
      understood_goal: intent,
      clarifying_questions: [],
      confidence: 'low',
    };
  }

  async createPlan(intent: string, url: string, pageAnalysis: any): Promise<{
    steps: Array<{
      step_number: number;
      action: string;
      reasoning: string;
    }>;
    estimated_steps: number;
    warnings?: string[];
  }> {
    const interactiveElements = pageAnalysis.interactive_elements || {};
    const buttons = interactiveElements.buttons?.slice(0, 10).map((b: any) => b.text) || [];
    const inputs = interactiveElements.inputs?.slice(0, 10).map((i: any) => `${i.label} (${i.type})`) || [];
    const links = interactiveElements.links?.slice(0, 10).map((l: any) => l.text) || [];

    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You create execution plans for web automation tasks. Break down the user's goal into logical, sequential steps.

CRITICAL RULES:
1. Each step should be ONE atomic action (click, type, select, etc.)
2. Consider the current page and available elements
3. Be specific about what to interact with
4. Flag potential issues (login walls, CAPTCHAs, etc.)

OUTPUT FORMAT: JSON only
{
  "steps": [
    { "step_number": 1, "action": "Click the 'Jobs' navigation link", "reasoning": "Need to navigate to jobs section" },
    { "step_number": 2, "action": "Enter 'software engineer' in search box", "reasoning": "User wants to find jobs" }
  ],
  "estimated_steps": 5,
  "warnings": ["May require login", "CAPTCHA possible"]
}`
      },
      {
        role: 'user',
        content: `
USER GOAL: ${intent}
TARGET URL: ${url}

CURRENT PAGE STATE:
- Title: ${pageAnalysis.metadata?.title || 'Unknown'}
- URL: ${pageAnalysis.url || url}

AVAILABLE ELEMENTS:
Buttons: ${buttons.join(', ') || 'None visible'}
Inputs: ${inputs.join(', ') || 'None visible'}
Links: ${links.join(', ') || 'None visible'}

Create a step-by-step plan to achieve the user's goal.`
      }
    ];

    const response = await this.chat(messages, { temperature: 0.4, max_tokens: 1000 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse plan:', e);
    }

    // Fallback
    return {
      steps: [
        { step_number: 1, action: 'Navigate to page', reasoning: 'Start the workflow' }
      ],
      estimated_steps: 1,
      warnings: ['Unable to generate detailed plan']
    };
  }

  /**
   * Create a generic, adaptive plan with phases and strategies
   * This plan is less specific and more resilient to page changes
   */
  async createGenericPlan(intent: string, url: string, pageAnalysis: any): Promise<{
    goal: string;
    phases: Array<{
      phase: string;
      description: string;
      strategies: string[];
      fallbacks: string[];
      required: boolean;
    }>;
    estimated_duration: string;
    warnings?: string[];
  }> {
    const interactiveElements = pageAnalysis.interactive_elements || {};
    const buttons = interactiveElements.buttons?.slice(0, 10).map((b: any) => b.text) || [];
    const inputs = interactiveElements.inputs?.slice(0, 10).map((i: any) => `${i.label} (${i.type})`) || [];

    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You create GENERIC, ADAPTIVE execution plans for web automation.

CRITICAL RULES:
1. DO NOT specify exact selectors or button text - these change frequently
2. Instead, describe STRATEGIES that work across similar sites
3. Each phase should have PRIMARY strategy + FALLBACK strategies
4. Focus on SEMANTIC patterns, not specific implementation
5. Think like seek_impl.ts - detect patterns, not hardcode selectors

EXAMPLE GENERIC PLAN:
{
  "goal": "Find and apply to software engineering jobs",
  "phases": [
    {
      "phase": "SEARCH",
      "description": "Search for jobs matching criteria",
      "strategies": [
        "Find search input (by placeholder text, label, or type)",
        "Enter keywords and location",
        "Submit search (button click or Enter key)"
      ],
      "fallbacks": [
        "Navigate directly to pre-built search URL",
        "Use site navigation to browse jobs"
      ],
      "required": true
    },
    {
      "phase": "COLLECT_JOBS",
      "description": "Find all job listings on page",
      "strategies": [
        "Detect repeating card/article pattern",
        "Use data attributes to identify job cards",
        "Look for list items with job metadata"
      ],
      "fallbacks": [
        "Scrape visible job titles",
        "Use site-specific known selectors"
      ],
      "required": true
    }
  ],
  "estimated_duration": "5-10 minutes",
  "warnings": ["May require login", "Some jobs may redirect externally"]
}

OUTPUT FORMAT: JSON only`
      },
      {
        role: 'user',
        content: `
USER GOAL: ${intent}
TARGET SITE: ${url}

PAGE CONTEXT:
- Title: ${pageAnalysis.metadata?.title || 'Unknown'}
- Detected buttons: ${buttons.slice(0, 5).join(', ') || 'None'}
- Detected inputs: ${inputs.slice(0, 5).join(', ') || 'None'}

Create a GENERIC, ADAPTIVE plan with phases and strategies (not specific steps).
Think about what PATTERNS to look for, not which exact elements to click.`
      }
    ];

    const response = await this.chat(messages, { temperature: 0.5, max_tokens: 1500 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse generic plan:', e);
    }

    // Fallback
    return {
      goal: intent,
      phases: [
        {
          phase: 'NAVIGATE',
          description: 'Navigate to the target site',
          strategies: ['Open URL and verify page loads'],
          fallbacks: ['Retry with different network settings'],
          required: true
        }
      ],
      estimated_duration: 'Unknown',
      warnings: ['Unable to generate detailed plan']
    };
  }

  /**
   * Refine an existing plan based on user feedback
   */
  async refinePlan(
    currentPlan: any,
    userFeedback: string
  ): Promise<any> {
    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You refine execution plans based on user feedback.

Keep the same JSON structure but modify according to feedback.
Add/remove/modify phases and strategies as needed.
Maintain the GENERIC, ADAPTIVE approach (no specific selectors).`
      },
      {
        role: 'user',
        content: `
CURRENT PLAN:
${JSON.stringify(currentPlan, null, 2)}

USER FEEDBACK:
${userFeedback}

Refine the plan based on this feedback. Output the updated plan in the same JSON format.`
      }
    ];

    const response = await this.chat(messages, { temperature: 0.4, max_tokens: 1500 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse refined plan:', e);
    }

    // Fallback - return original plan
    return currentPlan;
  }

  /**
   * Analyze raw HTML when HTML analyzer fails
   * This is the fallback - send HTML directly to AI
   */
  async analyzeRawHTML(
    html: string,
    goal: string,
    currentStep: string
  ): Promise<{
    can_proceed: boolean;
    next_actions: string[];
    selectors_found: Array<{ purpose: string; selector: string; confidence: number }>;
    warnings: string[];
  }> {
    // Truncate HTML to avoid token limits (keep first 50k chars)
    const truncatedHTML = html.substring(0, 50000);

    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You analyze raw HTML to determine what actions are possible.

CRITICAL RULES:
1. Focus on INTERACTIVE elements (buttons, inputs, links, forms)
2. Find patterns in the HTML (repeating structures)
3. Suggest specific selectors that will work
4. Be honest about what's possible vs not possible

OUTPUT FORMAT: JSON only
{
  "can_proceed": true|false,
  "next_actions": ["Action 1", "Action 2", "Action 3"],
  "selectors_found": [
    { "purpose": "search_input", "selector": "input[name='keywords']", "confidence": 90 },
    { "purpose": "submit_button", "selector": "button[type='submit']", "confidence": 85 }
  ],
  "warnings": ["CAPTCHA detected", "Login required", etc.]
}`
      },
      {
        role: 'user',
        content: `
GOAL: ${goal}
CURRENT STEP: ${currentStep}

HTML (truncated):
\`\`\`html
${truncatedHTML}
\`\`\`

Analyze this HTML and tell me:
1. Can we proceed with the goal?
2. What actions can we take next?
3. What selectors should we use?
4. Any warnings/blockers?`
      }
    ];

    const response = await this.chat(messages, { temperature: 0.3, max_tokens: 2000 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse HTML analysis:', e);
    }

    // Fallback
    return {
      can_proceed: false,
      next_actions: ['Manual analysis required'],
      selectors_found: [],
      warnings: ['Failed to analyze HTML automatically']
    };
  }

  /**
   * Create a MICRO-plan (3-5 steps only)
   * This is called repeatedly throughout the workflow
   */
  async createMicroPlan(
    goal: string,
    currentState: string,
    pageAnalysis: any,
    completedSteps: string[]
  ): Promise<{
    steps: Array<{
      step_number: number;
      action: string;
      selector?: string;
      test_criteria: string;
    }>;
    estimated_time: string;
  }> {
    const interactiveElements = pageAnalysis.interactive_elements || {};
    const buttons = interactiveElements.buttons?.slice(0, 10).map((b: any) => b.text || b.selector) || [];
    const inputs = interactiveElements.inputs?.slice(0, 10).map((i: any) => i.label || i.selector) || [];

    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You create MICRO-PLANS with 3-5 SMALL, TESTABLE steps.

CRITICAL RULES:
1. ONLY 3-5 steps max (not 10, not 20)
2. Each step must be ONE atomic action
3. Each step must be TESTABLE (we can verify it worked)
4. Provide specific selectors when possible
5. Think about NEXT micro-plan after this one

OUTPUT FORMAT: JSON only
{
  "steps": [
    {
      "step_number": 1,
      "action": "Find search input field",
      "selector": "input[placeholder*='job' i]",
      "test_criteria": "Input field is visible and enabled"
    },
    {
      "step_number": 2,
      "action": "Enter search keywords",
      "selector": "input[placeholder*='job' i]",
      "test_criteria": "Input has value 'software engineer'"
    }
  ],
  "estimated_time": "30 seconds"
}`
      },
      {
        role: 'user',
        content: `
OVERALL GOAL: ${goal}
CURRENT STATE: ${currentState}

COMPLETED SO FAR:
${completedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n') || 'Nothing yet'}

AVAILABLE ELEMENTS:
Buttons: ${buttons.slice(0, 5).join(', ') || 'None'}
Inputs: ${inputs.slice(0, 5).join(', ') || 'None'}

Create a MICRO-PLAN with 3-5 small steps to move closer to the goal.
Think: What's the NEXT logical thing to do from current state?`
      }
    ];

    const response = await this.chat(messages, { temperature: 0.4, max_tokens: 1000 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse micro-plan:', e);
    }

    // Fallback
    return {
      steps: [
        {
          step_number: 1,
          action: 'Analyze current page',
          test_criteria: 'Page analysis complete'
        }
      ],
      estimated_time: 'Unknown'
    };
  }

  /**
   * Find alternative strategy when current approach fails
   */
  async findAlternativeStrategy(
    phase: string,
    error: string,
    attemptedStrategies: string[]
  ): Promise<{
    alternative_strategy: string;
    explanation: string;
    confidence: 'high' | 'medium' | 'low';
  }> {
    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You suggest alternative approaches when automation strategies fail.

Think creatively about different ways to achieve the same goal.
Consider different selectors, interactions, or workflows.

OUTPUT FORMAT: JSON
{
  "alternative_strategy": "Description of new approach to try",
  "explanation": "Why this might work better",
  "confidence": "high|medium|low"
}`
      },
      {
        role: 'user',
        content: `
PHASE: ${phase}
ERROR: ${error}

ALREADY TRIED:
${attemptedStrategies.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Suggest an alternative strategy that might work.`
      }
    ];

    const response = await this.chat(messages, { temperature: 0.6, max_tokens: 500 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Fallback
    }

    return {
      alternative_strategy: 'Manual intervention required',
      explanation: 'Unable to find alternative approach automatically',
      confidence: 'low'
    };
  }
}
