# AI Web Agent - New Adaptive Architecture

## Overview

This document explains the new architecture improvements that make the job hunting bots smarter, more adaptive, and resilient to website changes.

## Key Improvements

### 1. ✅ Removed ASCII Art
- Cleaner CLI output
- Faster startup
- More professional appearance

### 2. 🎯 Generic Plan with Iteration Loop

**Before:**
- AI generated specific steps with hardcoded selectors
- User approved plan once
- If plan failed, bot stopped

**After:**
- AI generates **GENERIC PLAN** with phases and strategies
- User can **iterate** on the plan (approve/modify/cancel)
- Plan focuses on **semantic patterns**, not specific selectors
- More resilient to website changes

**Example:**
```
PHASE: SEARCH
Strategies:
  • Find search input by placeholder text, label, or type
  • Enter keywords and location
  • Submit search (button click or Enter key)

Fallbacks:
  • Navigate directly to pre-built search URL
  • Use site navigation to browse jobs
```

### 3. 📝 CLI Sticky Todo List

When user approves plan, the system creates a **visible todo list** showing:
- All phases to be executed
- Required vs optional phases
- Real-time progress updates

**Example Output:**
```
╭─────────────────────────────────────────────────────────────╮
│                       TODO LIST                             │
╰─────────────────────────────────────────────────────────────╯

☐ 1. HOMEPAGE [REQUIRED]
   Navigate to the target site

☐ 2. LOGIN [OPTIONAL]
   Detect login state and authenticate if needed

☐ 3. SEARCH [REQUIRED]
   Search for jobs matching criteria

☐ 4. COLLECT_JOBS [REQUIRED]
   Find all job listings on page
```

### 4. 🔄 Adaptive Strategy Fallback System

**How it works:**

1. **Primary Strategy** - Try main approach
2. **Fallback Strategies** - If primary fails, try alternatives
3. **AI Alternative** - If all fail, ask AI for new approach
4. **User Notification** - If all exhausted, notify user

**Example Flow:**
```
Phase: SEARCH
├─ Try: "Find search input by placeholder"
│  └─ ❌ Failed: No placeholder found
├─ Try: "Find search input by label"
│  └─ ❌ Failed: No label found
├─ Ask AI for alternative
│  └─ 💡 AI suggests: "Use URL parameters to search directly"
│     └─ ✅ Success!
```

### 5. 📋 Job Hunting Template System

Created `src/templates/job_hunting_template.ts` with pre-defined phases for job hunting:

- **CONTEXT** - Initialize configuration
- **HOMEPAGE** - Navigate to job site
- **LOGIN** - Handle authentication
- **SEARCH** - Search for jobs
- **FILTER** - Apply filters
- **JOB_CARDS** - Collect job listings
- **DETECT_APPLY** - Identify Quick Apply vs Regular Apply
- **QUICK_APPLY** - Handle quick application flow
- **PAGINATION** - Navigate to next page
- **COMPLETION** - Generate report and cleanup

Each phase includes:
- Multiple strategies
- Fallback approaches
- Common selectors
- Success criteria

### 6. 🤖 Enhanced AI Methods

**New DeepSeek Client Methods:**

1. `createGenericPlan()` - Creates adaptive, semantic-based plans
2. `refinePlan()` - Refines plan based on user feedback
3. `findAlternativeStrategy()` - Suggests alternatives when strategies fail

**New Prompt Builder Methods:**

1. `buildStrategyExecutionPrompt()` - Generates code for specific strategies
2. `buildSelectorDiscoveryPrompt()` - Discovers selectors for patterns

## Usage

### Running the Bot

```bash
npm start
```

### New User Flow

1. **Select Bot** - Choose existing or create new
2. **Intent Analysis** - AI analyzes your goal
3. **Generic Plan Creation** - AI creates phase-based plan
4. **Plan Iteration Loop:**
   - View plan
   - Options: [A]pprove / [M]odify / [C]ancel
   - If Modify: Provide feedback → AI refines plan → Review again
5. **Plan Approval** - System creates CLI todo list
6. **Execution** - Bot executes phases with adaptive fallback
7. **Completion** - Results summary

### Example: Modifying a Plan

```
👉 [A]pprove / [M]odify / [C]ancel? m

💬 What would you like to change about the plan?
Your feedback: Skip the login step and focus only on quick apply jobs

🔄 Refining plan based on your feedback...

[AI generates refined plan with LOGIN marked as optional and emphasis on QUICK_APPLY]
```

## Benefits

### 🎯 More Intelligent
- AI understands **patterns** not just specific elements
- Can adapt to website changes
- Learns from failures

### 🔧 More Resilient
- Multiple fallback strategies
- AI-suggested alternatives
- Semantic selector discovery

### 👥 More User-Friendly
- Interactive plan refinement
- Visible todo list
- Clear progress tracking

### 🚀 More Maintainable
- Generic templates reduce duplication
- Strategies are reusable across sites
- Less hardcoding = easier updates

## Architecture Comparison

### Old Architecture
```
User Intent
    ↓
Specific Plan (hardcoded selectors)
    ↓
User Approves (one-time)
    ↓
Execute Steps
    ↓
If fails → Stop
```

### New Architecture
```
User Intent
    ↓
Generic Plan (semantic strategies)
    ↓
┌─────────────────┐
│ Plan Iteration  │
│  - View         │
│  - Modify       │
│  - Approve      │
└─────────────────┘
    ↓
CLI Todo List
    ↓
Execute Phases
    ↓
For each phase:
  ├─ Primary Strategy
  ├─ Fallback Strategies
  ├─ AI Alternative
  └─ User Notification
```

## Template-Based Job Hunting

The system now uses a **template-based approach** for job hunting sites:

1. **Generic Template** (`job_hunting_template.ts`) - Reusable phases
2. **Site-Specific Config** - Selectors and quirks for each site
3. **AI Discovery** - Discover selectors at runtime
4. **Adaptive Execution** - Try multiple approaches

This is similar to how `seek_impl.ts` works but more generalized.

## Future Enhancements

1. **Multi-site Support** - Apply to multiple job sites in parallel
2. **Learning System** - Remember successful strategies per site
3. **Real-time Todo Updates** - Update CLI todo as phases complete
4. **Strategy Marketplace** - Share successful strategies with community
5. **Visual Plan Editor** - GUI for plan modification
6. **Rollback Capability** - Undo failed phases

## Testing

To test the new system:

```bash
# Create a new bot
npm start

# Select a job site (e.g., LinkedIn)
# Follow the new flow
# Try modifying the plan
# Observe the CLI todo list
# Watch adaptive fallback in action
```

## Migration Guide

**For existing bots:**
- Old bots still work with backward compatibility
- To use new features, create a new bot
- Copy user preferences from old bot context

**For developers:**
- Use `createGenericPlan()` instead of `createPlan()`
- Implement `executeWithStrategies()` for phase execution
- Use `job_hunting_template.ts` as reference for new templates

## Troubleshooting

**Plan iteration loop stuck:**
- Press Ctrl+C to exit
- Restart with `npm start`

**AI suggestions not working:**
- Check DeepSeek API key in `.env`
- Verify API quota/limits

**Strategies all failing:**
- Site may have changed significantly
- Try modifying plan to use different approach
- Check browser console for errors

## Contributing

When adding new features:
1. Use semantic strategies, not hardcoded selectors
2. Always provide fallback approaches
3. Update `job_hunting_template.ts` if adding new phases
4. Test with multiple job sites
5. Document in this file

## Summary

The new architecture makes your job hunting bots:
- **Smarter** - Uses patterns and strategies
- **More Adaptive** - Handles changes gracefully
- **User-Friendly** - Interactive plan refinement
- **Maintainable** - Template-based, reusable code

Happy job hunting! 🎉
