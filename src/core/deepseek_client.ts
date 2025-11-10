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
}
