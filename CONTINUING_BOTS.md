# Continuing Bot Development

## Overview

You can now save bot progress and continue building upon existing bots with additional context. The AI maintains full awareness of previous steps and user guidance.

---

## How It Works

### First Run: Creating a Bot

```bash
npm start
```

**Flow:**
1. Shows list of existing bots (if any)
2. You choose "new bot"
3. Enter URL and intent
4. Bot generates steps
5. **Progress automatically saved** after each phase
6. Session saved for future use

**Saved Data:**
- ✅ All generated steps (YAML + TypeScript)
- ✅ Execution results
- ✅ Original intent
- ✅ Current progress (step number)
- ✅ Browser session

---

### Second Run: Continuing a Bot

```bash
npm start
```

**Flow:**
1. **Shows your existing bots:**
   ```
   📚 Existing Bots:

     1. ⏳ find_software_engineer_jobs
        URL: https://linkedin.com
        Intent: find software engineer jobs in SF
        Progress: 3 steps | Updated: 1/15/2025

     2. ✅ scrape_product_prices
        URL: https://amazon.com
        Intent: monitor prices for gaming laptops
        Progress: 5 steps | Updated: 1/14/2025
   ```

2. **You choose a bot** (e.g., enter `1`)

3. **Bot context loaded:**
   ```
   📂 Loading existing bot...
   🤖 Bot: find_software_engineer_jobs
   📍 URL: https://linkedin.com
   🎯 Original Intent: find software engineer jobs in SF
   📊 Progress: 3/3 steps
   ```

4. **You can add guidance:**
   ```
   💬 Additional guidance for the bot (or press ENTER to continue):
   > Now apply to the first 5 jobs that mention Python
   ```

5. **Bot continues with full context:**
   - Knows all previous steps
   - Understands what was already done
   - Uses your new guidance to extend functionality
   - AI prompt includes: original intent + progress + new guidance

---

## What DeepSeek Knows

When continuing a bot, DeepSeek receives:

### 1. **Original Intent**
```
Original Intent: find software engineer jobs in SF
```

### 2. **All Completed Steps**
```
Completed Steps:
1. Navigate to LinkedIn
2. Click Jobs tab
3. Fill search with "software engineer"
4. Filter location to "San Francisco"
```

### 3. **Your New Guidance** (if provided)
```
USER GUIDANCE: Now apply to the first 5 jobs that mention Python
```

### Combined Prompt Example:
```
USER GOAL: find software engineer jobs in SF

PREVIOUS ACTIONS:
1. Navigate to LinkedIn
2. Click Jobs tab
3. Fill search with "software engineer"
4. Filter location to "San Francisco"

USER GUIDANCE: Now apply to the first 5 jobs that mention Python

CURRENT PAGE: LinkedIn Jobs Search Results
AVAILABLE ACTIONS: [list of buttons/forms on current page]

Generate the next step...
```

---

## Use Cases

### Use Case 1: Extending Functionality

**Initial Intent:** "Find Python jobs on LinkedIn"
- Bot generates 3 steps to search

**Continue With:** "Now apply to the top 5 jobs"
- Bot generates steps to click Apply, fill forms, submit

**Continue Again:** "Track application status for each"
- Bot adds steps to save job IDs, check status

### Use Case 2: Fixing Issues

**Initial Intent:** "Scrape product prices"
- Bot fails at step 4 (wrong selector)

**Continue With:** "The price element is actually in .product-price span"
- AI regenerates step 4 with corrected selector

### Use Case 3: Adding Filters

**Initial Intent:** "Find apartments for rent"
- Bot generates search steps

**Continue With:** "Filter by price $1000-$2000 and 2 bedrooms"
- Bot adds filtering steps

### Use Case 4: Different Action Per Run

**Initial Intent:** "Monitor Twitter for mentions"
- Bot navigates, sets up monitoring

**Continue With:** "Reply to the first 3 mentions with 'Thanks!'"
- Bot adds reply functionality

---

## Storage Structure

```
generated_bots/
├── bots_metadata.json          # Index of all bots
└── find_software_engineer_jobs/
    ├── workflow.yaml            # Complete workflow
    ├── find_software_engineer_jobs.ts  # Implementation
    └── context.json             # Full generation context
```

### bots_metadata.json
```json
{
  "bots": [
    {
      "id": "bot_1234567890_abc123",
      "name": "find_software_engineer_jobs",
      "url": "https://linkedin.com",
      "original_intent": "find software engineer jobs in SF",
      "created_at": 1705329600000,
      "updated_at": 1705416000000,
      "status": "in_progress",
      "current_step": 3,
      "total_steps": 3,
      "user_feedback": [],
      "yaml_path": "./generated_bots/find_software_engineer_jobs/workflow.yaml",
      "typescript_path": "./generated_bots/find_software_engineer_jobs/find_software_engineer_jobs.ts",
      "context_path": "./generated_bots/find_software_engineer_jobs/context.json"
    }
  ]
}
```

### context.json
```json
{
  "original_intent": "find software engineer jobs in SF",
  "generated_steps": [
    {
      "step_number": 1,
      "action_description": "navigate to page",
      "yaml": "...",
      "typescript": "...",
      "execution_result": { "success": true, "page_state": {...} }
    },
    ...
  ],
  "user_feedback": [
    {
      "timestamp": 1705416000000,
      "feedback": "Now apply to the first 5 jobs that mention Python",
      "at_step": 3
    }
  ],
  "current_step": 3
}
```

---

## CLI Examples

### Start New Bot
```bash
npm start
# (press ENTER when shown existing bots list)
# URL: github.com
# Intent: find trending Python repos
```

### Continue Existing Bot
```bash
npm start
# Choose: 1
# Additional guidance: Star the top 3 repos
```

### CLI Mode (New Bot)
```bash
npm start "github.com" "find trending Python repos"
```

---

## Benefits

| Feature | Benefit |
|---------|---------|
| **Persistent Context** | AI remembers everything from previous runs |
| **Incremental Development** | Build bots piece by piece, testing as you go |
| **Easy Debugging** | Fix specific steps without starting over |
| **User Guidance** | Direct the AI with natural language at any point |
| **Session Reuse** | No need to re-login between runs |
| **Full History** | Track what worked, what failed, why |

---

## Advanced Usage

### Check Bot Status
All bots shown with status:
- ⏳ **in_progress** - Bot generation incomplete
- ✅ **completed** - Bot fully generated
- ❌ **failed** - Bot encountered errors

### Modify Intent Mid-Generation
```
Original: "Find jobs"
Continue: "Actually, just scrape job titles and companies to CSV"
```
AI adapts the remaining steps to the new goal.

### Build Complex Workflows Iteratively
```
Run 1: "Navigate and login"
Run 2: "Search for items"
Run 3: "Add to cart"
Run 4: "Complete checkout"
```
Each run adds steps to the same bot.

---

## Technical Details

### How Context is Passed to AI

```typescript
// When continuing a bot
const contextMessage = `Continue working towards: "${originalIntent}"

USER GUIDANCE: ${additionalContext}`;

// AI sees:
// - Original intent
// - All completed steps
// - Current page state
// - New user guidance

const prompt = buildStepPrompt(intent, pageAnalysis, {
  stepNumber: currentStep,
  previousAction: lastAction,
  context: contextMessage,
  completedSteps: allCompletedActions
});
```

### Bot Metadata Updates

After each phase:
```typescript
await saveBotProgress(context, url, intent);
```

Saves:
- Current step number
- All generated code
- Execution results
- Timestamps
- User feedback

---

## Best Practices

### 1. **Start Small**
Begin with simple intent, add complexity in continuation runs.

### 2. **Be Specific with Guidance**
Instead of: "Do more stuff"
Use: "Apply to jobs that mention Python and are remote"

### 3. **Test Incrementally**
Generate a few steps, verify they work, then continue.

### 4. **Use Descriptive Intents**
Bot names are generated from intents:
- Good: "find_software_engineer_jobs"
- Bad: "do_stuff"

### 5. **Review Context**
Check `context.json` to see what AI knows before continuing.

---

## Troubleshooting

### Bot Not Showing Up
- Check `generated_bots/bots_metadata.json` exists
- Ensure bot generation didn't fail

### Lost Context
- `context.json` contains full generation history
- Manually edit if needed

### Want to Start Fresh
Press ENTER at "Continue existing bot?" prompt

### Delete a Bot
```bash
rm -rf generated_bots/bot_name/
# Edit bots_metadata.json to remove entry
```

---

## Next Steps

1. **Run `npm start`**
2. Create a bot (generates a few steps)
3. Run `npm start` again
4. Choose your bot
5. Add guidance like "now do X"
6. Watch AI continue with full context

The bot remembers everything! 🧠
