# AI Web Agent - Usage Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env` file with:
```
DEEPSEEK_API_KEY=your_key_here
HEADLESS=false
```

### 3. Generate a Bot

**Interactive Mode:**
```bash
npm start
```

**CLI Mode:**
```bash
npm start "https://example.com" "Visit the page and extract all links"
```

## How It Works

### Phase 1: HTML Analysis
- Fetches target URL
- Extracts interactive elements (buttons, inputs, links)
- Identifies semantic zones (header, nav, main content)
- Detects data patterns (lists, tables, cards)
- Generates stable selectors with fallback chains

### Phase 2: Progressive Generation
1. **Discovery Phase**: Navigate to URL, analyze page structure
2. **Workflow Phase**: Generate steps one-by-one until intent is fulfilled
3. **Validation**: Execute each step in sandbox, verify success
4. **Adaptation**: If step fails, AI diagnoses and fixes it

### Phase 3: Compilation
- Merges all generated steps into workflow YAML
- Combines TypeScript functions into bot implementation
- Saves to `./generated_bots/<bot_name>/`

## Generated Files

```
generated_bots/
└── your_bot_name/
    ├── workflow.yaml       # State machine configuration
    └── your_bot_name.ts    # Bot implementation
```

## Testing Components

### Test HTML Analyzer
```bash
npm run test:analyzer
```

### Test Bot Generation
```bash
tsx src/examples/test_generation.ts
```

## Architecture

```
src/
├── core/
│   ├── html_analyzer.ts      # Page analysis & element extraction
│   └── deepseek_client.ts    # AI API client
├── generators/
│   ├── bot_generator.ts      # Main bot generation logic
│   └── prompt_builder.ts     # Prompt engineering
├── executors/
│   └── sandbox_executor.ts   # Step execution & testing
├── types/
│   ├── analysis.ts           # HTML analysis types
│   └── bot.ts                # Bot generation types
└── utils/
    ├── config.ts             # Environment config
    └── file_helpers.ts       # File system utilities
```

## Examples

### Example 1: Simple Navigation
```bash
npm start "https://example.com" "Visit the homepage"
```

### Example 2: Search & Extract
```bash
npm start "https://news.ycombinator.com" "Find all story titles on the front page"
```

### Example 3: Form Interaction
```bash
npm start "https://google.com" "Search for 'playwright automation' and get results"
```

## Advanced Features

### Selector Stability Ranking
Selectors are ranked by stability (0-100):
- 95: `data-testid`, `data-qa` (most stable)
- 85: `aria-label` (very stable)
- 80: Non-dynamic IDs
- 75: `name` attributes
- 60: Stable CSS classes
- 30: Generic tag names

### Error Recovery
- **Element not found**: Try fallback selectors
- **Timeout**: Increase wait, check for loading indicators
- **Unexpected modal**: Detect and dismiss
- **Page structure changed**: Re-analyze and regenerate step

### Anti-Bot Detection
- Sets `navigator.webdriver` to undefined
- Disables automation flags
- Human-like delays (configurable)
- Respects `robots.txt` (planned)

## Limitations

- Max 10 steps per workflow (configurable)
- 30 second timeout per step
- Requires DeepSeek API key
- JavaScript-heavy SPAs may need additional wait logic

## Troubleshooting

### "DeepSeek API key not found"
- Check `.env` file exists in project root
- Verify `DEEPSEEK_API_KEY` is set

### "Playwright browser not found"
```bash
npx playwright install chromium
```

### "Step execution failed"
- Check generated code in `./generated_bots/`
- Review step screenshots (if enabled)
- AI diagnosis in console output

## Next Steps

1. Review generated bot code
2. Test bot with workflow engine (from `zzzz/`)
3. Modify steps as needed
4. Add error handling for edge cases

## Developer Mode

Enable verbose logging:
```bash
DEBUG=* npm start
```

Show browser during generation:
```env
HEADLESS=false
```
