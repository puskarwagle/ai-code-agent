/**
 * Job Hunting Template
 * Generic template for job application bots with adaptive strategies
 */

export interface PhaseStrategy {
  name: string;
  description: string;
  primary_approach: string;
  fallback_approaches: string[];
  success_criteria: string[];
  common_selectors?: string[];
}

export interface JobHuntingPhase {
  phase_name: string;
  description: string;
  strategies: PhaseStrategy[];
  optional: boolean;
  retry_limit: number;
}

export const JOB_HUNTING_TEMPLATE: Record<string, JobHuntingPhase> = {
  CONTEXT: {
    phase_name: 'Initialize Context',
    description: 'Load configuration and prepare search parameters',
    optional: false,
    retry_limit: 1,
    strategies: [
      {
        name: 'load_config',
        description: 'Load site-specific selectors and user preferences',
        primary_approach: 'Load from config files (selectors.json, user-config.json)',
        fallback_approaches: ['Use default selectors', 'Discover selectors via AI'],
        success_criteria: ['Config loaded', 'Search URL built']
      }
    ]
  },

  HOMEPAGE: {
    phase_name: 'Navigate to Homepage',
    description: 'Open the job site and verify it loads',
    optional: false,
    retry_limit: 3,
    strategies: [
      {
        name: 'navigate',
        description: 'Navigate to the target job site',
        primary_approach: 'Direct navigation to URL',
        fallback_approaches: ['Retry with different user agent', 'Use cached session'],
        success_criteria: ['Page title loaded', 'No error page', 'Main content visible'],
        common_selectors: ['header', 'nav', 'main', 'body']
      }
    ]
  },

  LOGIN: {
    phase_name: 'Login Detection & Authentication',
    description: 'Detect if login is required and handle authentication',
    optional: true,
    retry_limit: 1,
    strategies: [
      {
        name: 'detect_login_state',
        description: 'Check if user is already logged in',
        primary_approach: 'Look for logged-in indicators (avatar, profile menu, etc.)',
        fallback_approaches: [
          'Check for sign-in buttons',
          'Analyze page structure',
          'Check session storage'
        ],
        success_criteria: ['Login state determined'],
        common_selectors: [
          '[data-testid*="avatar"]',
          '[class*="avatar"]',
          '[data-testid*="profile"]',
          'button:has-text("Sign in")',
          'a:has-text("Log in")'
        ]
      },
      {
        name: 'wait_for_manual_login',
        description: 'Pause and wait for user to login manually',
        primary_approach: 'Show banner and wait for user confirmation',
        fallback_approaches: ['Use saved session', 'Proceed without login'],
        success_criteria: ['User confirms login complete', 'Logged-in indicators present']
      }
    ]
  },

  SEARCH: {
    phase_name: 'Perform Job Search',
    description: 'Enter search criteria and submit search',
    optional: false,
    retry_limit: 3,
    strategies: [
      {
        name: 'enter_keywords',
        description: 'Fill in job title/keywords search field',
        primary_approach: 'Find search input by placeholder or label',
        fallback_approaches: [
          'Use name attribute',
          'Find first visible text input',
          'Use AI to discover search field'
        ],
        success_criteria: ['Keywords entered', 'Input value matches'],
        common_selectors: [
          'input[placeholder*="job" i]',
          'input[placeholder*="search" i]',
          'input[name*="keywords" i]',
          'input[type="search"]'
        ]
      },
      {
        name: 'enter_location',
        description: 'Fill in location search field',
        primary_approach: 'Find location input by placeholder or label',
        fallback_approaches: [
          'Use name attribute',
          'Find second text input',
          'Skip if not required'
        ],
        success_criteria: ['Location entered or skipped'],
        common_selectors: [
          'input[placeholder*="location" i]',
          'input[placeholder*="where" i]',
          'input[name*="location" i]'
        ]
      },
      {
        name: 'submit_search',
        description: 'Click search/submit button',
        primary_approach: 'Find and click search button',
        fallback_approaches: [
          'Press Enter in search field',
          'Navigate directly to search results URL',
          'Use form submit'
        ],
        success_criteria: ['URL changed to search results', 'Job cards visible'],
        common_selectors: [
          'button[type="submit"]',
          'button:has-text("Search")',
          'input[type="submit"]',
          '[data-automation*="search"]'
        ]
      }
    ]
  },

  FILTER: {
    phase_name: 'Apply Filters',
    description: 'Apply additional filters (job type, salary, etc.)',
    optional: true,
    retry_limit: 2,
    strategies: [
      {
        name: 'apply_job_type_filter',
        description: 'Filter by job type (full-time, part-time, contract, etc.)',
        primary_approach: 'Find and click job type checkboxes or dropdowns',
        fallback_approaches: ['Skip if not required', 'Use URL parameters'],
        success_criteria: ['Filter applied', 'Results updated']
      },
      {
        name: 'apply_experience_filter',
        description: 'Filter by experience level',
        primary_approach: 'Find experience level selector',
        fallback_approaches: ['Skip if not required'],
        success_criteria: ['Filter applied or skipped']
      }
    ]
  },

  JOB_CARDS: {
    phase_name: 'Collect Job Cards',
    description: 'Find and collect all job listings on the page',
    optional: false,
    retry_limit: 5,
    strategies: [
      {
        name: 'discover_job_cards',
        description: 'Identify the pattern for job card elements',
        primary_approach: 'Look for repeating article/div patterns with job data',
        fallback_approaches: [
          'Use site-specific selectors',
          'AI-based pattern discovery',
          'Look for data attributes'
        ],
        success_criteria: ['At least 1 job card found', 'Cards are clickable'],
        common_selectors: [
          'article[data-testid*="job-card"]',
          '[data-automation*="job-card"]',
          '.job-card',
          'div[class*="jobCard"]',
          'li[data-job-id]'
        ]
      },
      {
        name: 'iterate_job_cards',
        description: 'Loop through each job card',
        primary_approach: 'Click each card sequentially',
        fallback_approaches: ['Extract data without clicking', 'Open in new tabs'],
        success_criteria: ['All cards processed', 'Application attempts tracked']
      }
    ]
  },

  DETECT_APPLY: {
    phase_name: 'Detect Apply Type',
    description: 'Determine if job uses Quick Apply or redirects to external site',
    optional: false,
    retry_limit: 2,
    strategies: [
      {
        name: 'detect_apply_button_type',
        description: 'Identify Quick Apply vs Regular Apply vs External',
        primary_approach: 'Search for apply button text patterns',
        fallback_approaches: [
          'Check for external link indicators',
          'Assume Regular Apply'
        ],
        success_criteria: ['Apply type determined'],
        common_selectors: [
          'button:has-text("Quick Apply")',
          'button:has-text("Easy Apply")',
          'button:has-text("Apply")',
          'a:has-text("Apply on company site")'
        ]
      }
    ]
  },

  PARSE_JOB: {
    phase_name: 'Parse Job Details',
    description: 'Extract job information for later reference',
    optional: true,
    retry_limit: 1,
    strategies: [
      {
        name: 'extract_job_data',
        description: 'Extract title, company, salary, description, etc.',
        primary_approach: 'Use DOM selectors to extract structured data',
        fallback_approaches: ['Extract visible text', 'Skip extraction'],
        success_criteria: ['Job data extracted', 'Data saved to file']
      }
    ]
  },

  QUICK_APPLY: {
    phase_name: 'Quick Apply Flow',
    description: 'Handle the quick apply process (resume, cover letter, questions)',
    optional: true,
    retry_limit: 1,
    strategies: [
      {
        name: 'click_quick_apply',
        description: 'Click the Quick Apply button',
        primary_approach: 'Click button with Quick Apply text',
        fallback_approaches: ['Skip to next job'],
        success_criteria: ['Quick Apply form opened', 'Progress bar visible']
      },
      {
        name: 'handle_cover_letter',
        description: 'Generate and fill cover letter',
        primary_approach: 'Use AI to generate personalized cover letter',
        fallback_approaches: [
          'Use template cover letter',
          'Skip cover letter',
          'Select "Don\'t include cover letter"'
        ],
        success_criteria: ['Cover letter filled or skipped']
      },
      {
        name: 'handle_resume',
        description: 'Select resume to upload',
        primary_approach: 'Select from previously uploaded resumes',
        fallback_approaches: [
          'Upload new resume',
          'Skip resume',
          'Select "Don\'t include resume"'
        ],
        success_criteria: ['Resume selected or skipped']
      },
      {
        name: 'answer_questions',
        description: 'Answer employer screening questions',
        primary_approach: 'Use AI to generate answers based on job description',
        fallback_approaches: ['Use default answers', 'Skip questions'],
        success_criteria: ['All questions answered']
      },
      {
        name: 'review_and_submit',
        description: 'Review application and submit',
        primary_approach: 'Click continue/submit buttons',
        fallback_approaches: ['Manual review pause', 'Skip submission'],
        success_criteria: ['Application submitted or saved for review']
      }
    ]
  },

  SKIP_JOB: {
    phase_name: 'Skip Job',
    description: 'Skip jobs that require external application',
    optional: true,
    retry_limit: 1,
    strategies: [
      {
        name: 'skip_to_next',
        description: 'Move to the next job card',
        primary_approach: 'Increment job index',
        fallback_approaches: ['Return to search results'],
        success_criteria: ['Next job card ready']
      }
    ]
  },

  PAGINATION: {
    phase_name: 'Navigate to Next Page',
    description: 'Move to the next page of search results',
    optional: true,
    retry_limit: 2,
    strategies: [
      {
        name: 'click_next_page',
        description: 'Click next page button',
        primary_approach: 'Find and click next/pagination button',
        fallback_approaches: [
          'Use page number links',
          'Modify URL parameters',
          'Stop if no more pages'
        ],
        success_criteria: ['New page loaded', 'New job cards found'],
        common_selectors: [
          'a[rel="next"]',
          'button:has-text("Next")',
          '[data-automation*="next"]',
          '.pagination .next'
        ]
      }
    ]
  },

  COMPLETION: {
    phase_name: 'Complete Workflow',
    description: 'Clean up and report results',
    optional: false,
    retry_limit: 1,
    strategies: [
      {
        name: 'generate_report',
        description: 'Summarize applications submitted',
        primary_approach: 'Count successful applications and generate report',
        fallback_approaches: ['Log to console'],
        success_criteria: ['Report generated']
      },
      {
        name: 'cleanup',
        description: 'Close browser and save session',
        primary_approach: 'Save cookies and close gracefully',
        fallback_approaches: ['Force close'],
        success_criteria: ['Session saved', 'Browser closed']
      }
    ]
  }
};

/**
 * Get recommended phase sequence based on site and intent
 */
export function getRecommendedPhaseSequence(site: string, intent: string): string[] {
  const baseSequence = [
    'CONTEXT',
    'HOMEPAGE',
    'LOGIN',
    'SEARCH',
    'FILTER',
    'JOB_CARDS'
  ];

  // For each job card, we'll apply:
  const perJobSequence = [
    'DETECT_APPLY',
    'PARSE_JOB'
    // Then either QUICK_APPLY or SKIP_JOB
  ];

  const endSequence = [
    'PAGINATION', // Loop back to JOB_CARDS if more pages
    'COMPLETION'
  ];

  return [...baseSequence, ...perJobSequence, 'QUICK_APPLY', 'SKIP_JOB', ...endSequence];
}

/**
 * Helper to determine which phases are required for a given intent
 */
export function getRequiredPhases(intent: string): string[] {
  const required = ['CONTEXT', 'HOMEPAGE', 'JOB_CARDS', 'COMPLETION'];

  if (intent.toLowerCase().includes('apply')) {
    required.push('DETECT_APPLY', 'QUICK_APPLY');
  }

  if (intent.toLowerCase().includes('search') || intent.toLowerCase().includes('find')) {
    required.push('SEARCH');
  }

  if (intent.toLowerCase().includes('filter')) {
    required.push('FILTER');
  }

  return required;
}
