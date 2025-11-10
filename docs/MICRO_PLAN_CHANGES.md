# Micro-Plan Architecture - COMPLETE REDESIGN

## What You Asked For

> "fuck. it never made a todo. i want it to make to dos. we break things down in smaller problems and solve them 1 by 1."

> "it needs to present me with a todo at the beginning of the phase 2"

> "we might have to create like 10 such plans and 50 to do items before we finish a complete bot"

> "i want the agent to be interactive"

> "ai analyzes the html and it knows the goal and the current step and it knows to test the selectors and to write steps 1 by 1"

## What I Built

### ✅ ITERATIVE MICRO-PLAN WORKFLOW

**The New Flow:**

```
PHASE 2 (Main Work):

┌─────────────────────────────────────────┐
│ MICRO-PLAN #1                           │
├─────────────────────────────────────────┤
│ 1. Analyze HTML (or send to AI)        │
│ 2. AI creates 3-5 step plan             │
│ 3. Show TODO to user                    │
│ 4. User approves [Y/n]                  │
│ 5. Execute step 1 → test → success?    │
│ 6. Execute step 2 → test → success?    │
│ 7. Execute step 3 → test → success?    │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ MICRO-PLAN #2                           │
├─────────────────────────────────────────┤
│ 1. Analyze HTML again                   │
│ 2. AI creates NEXT 3-5 steps            │
│ 3. Show TODO to user                    │
│ 4. User approves [Y/n]                  │
│ 5. Execute...                           │
└─────────────────────────────────────────┘
          ↓
      (Repeat 10-20 times until goal achieved)
```

### ✅ TODO LIST EVERY MICRO-PLAN

**Example Output:**

```
═══════════════════════════════════════════════════════
MICRO-PLAN #3
═══════════════════════════════════════════════════════

🔍 Analyzing current page...
✅ Analysis complete: 45 buttons, 12 inputs

🤖 Creating micro-plan (3-5 steps)...

📝 TODO (this micro-plan):

   ☐ 1. Find job search input field
      Selector: input[placeholder*='job' i]
      Test: Input field is visible and enabled

   ☐ 2. Enter search keywords 'software engineer'
      Selector: input[placeholder*='job' i]
      Test: Input has value 'software engineer'

   ☐ 3. Click search button
      Selector: button[type='submit']
      Test: URL changes to search results page

⏱️  Estimated time: 30 seconds

👉 Execute this micro-plan? [Y/n]:
```

### ✅ HTML-TO-AI FALLBACK

**When HTML analyzer fails:**

```typescript
// If analyzer found < 5 elements
if (totalElements < 5) {
  console.log('⚠️  HTML Analyzer found few elements, using AI fallback...');

  const html = await currentPage.content();
  const aiAnalysis = await this.deepseek.analyzeRawHTML(
    html,
    'find and apply to jobs',
    'Currently on LinkedIn homepage'
  );

  // AI returns:
  // - can_proceed: true/false
  // - next_actions: ["Click Jobs link", "Use search", etc.]
  // - selectors_found: [{ purpose: "jobs_link", selector: "a[href*='jobs']", confidence: 90 }]
  // - warnings: ["Login required", etc.]
}
```

### ✅ GOAL-ORIENTED RECOMMENDATIONS

**Before (BROKEN):**
```
🎯 RECOMMENDED NEXT ACTIONS:
   1. Approaching completion - finalize remaining steps  ❌ WRONG!
   2. Prepare for workflow completion                    ❌ WRONG!
```

**After (SMART):**
```
🎯 RECOMMENDED NEXT ACTIONS:
   1. 🎯 GOAL: Find and apply to jobs                    ✅ ALWAYS SHOWS GOAL
   2. 📍 Next: Navigate to job site homepage             ✅ SMART
   3. 🔍 Analyze the page to understand structure        ✅ ACTIONABLE
```

The system now **analyzes what's been done** and recommends **what's actually missing**:
- Not navigated yet? → "Navigate to homepage"
- Not searched yet? → "Find search functionality"
- Not collected cards? → "Find job cards"
- Not applied yet? → "Click apply buttons"

### ✅ INTERACTIVE & ITERATIVE

**User is asked for approval EVERY micro-plan:**
```
👉 Execute this micro-plan? [Y/n]:
```

If user says **n**, bot stops and asks for guidance.

If step fails, bot **creates NEW micro-plan** instead of giving up.

### ✅ SMALL, TESTABLE STEPS

**AI creates 3-5 steps max:**

```typescript
// New method: createMicroPlan()
{
  "steps": [
    {
      "step_number": 1,
      "action": "Find search input field",
      "selector": "input[placeholder*='job' i]",
      "test_criteria": "Input field is visible and enabled"  ← TESTABLE!
    }
  ]
}
```

Each step has:
- **Action** - What to do
- **Selector** - How to do it (if known)
- **Test** - How to verify it worked

---

## What Changed

### File: `src/core/deepseek_client.ts`

**Added 2 new methods:**

1. **`analyzeRawHTML()`** - Sends HTML to AI when analyzer fails
   ```typescript
   const aiAnalysis = await deepseek.analyzeRawHTML(html, goal, currentStep);
   // Returns: can_proceed, next_actions, selectors_found, warnings
   ```

2. **`createMicroPlan()`** - Creates small 3-5 step plans
   ```typescript
   const microPlan = await deepseek.createMicroPlan(goal, state, analysis, completed);
   // Returns: steps (3-5 max), estimated_time
   ```

### File: `src/generators/bot_generator.ts`

**Replaced `generateWorkflowPhase()` completely:**

**Before:**
- Generated 10 steps at once
- No user input during execution
- Failed → stopped

**After:**
- Generates 3-5 steps at a time (micro-plan)
- Shows TODO before each micro-plan
- Asks user to approve
- Executes steps
- Makes ANOTHER micro-plan
- Repeats 10-20 times until goal achieved

**Added `confirmMicroPlan()`:**
```typescript
👉 Execute this micro-plan? [Y/n]:
```

**Fixed `analyzeAndRecommend()`:**
- Now shows GOAL first
- Analyzes what's actually been done
- Recommends what's actually missing
- Much smarter!

---

## The Flow in Detail

### 1. Bot Starts

```
PHASE 0: INTENT ANALYSIS
🧠 Analyzing your intent...
💡 Understood goal: Find and apply to software engineering jobs
🎯 Confidence: high
```

### 2. Micro-Plan Loop Begins

```
╔═══════════════════════════════════════════════════════════════╗
║           ITERATIVE MICRO-PLAN EXECUTION                      ║
╚═══════════════════════════════════════════════════════════════╝

🎯 GOAL: Find and apply to jobs
📋 Strategy: Make small plans (3-5 steps), execute, repeat
```

### 3. Micro-Plan #1

```
═══════════════════════════════════════════════════════════
MICRO-PLAN #1
═══════════════════════════════════════════════════════════

🔍 Analyzing current page...
✅ Analysis complete: 63 buttons, 1 inputs

🤖 Creating micro-plan (3-5 steps)...

📝 TODO (this micro-plan):

   ☐ 1. Find and click Jobs link in navigation
      Selector: a[href*='jobs']
      Test: URL changes to /jobs

   ☐ 2. Wait for jobs page to load
      Test: Page title contains 'Jobs'

   ☐ 3. Verify job search form is visible
      Selector: form input[placeholder*='search']
      Test: Search input is visible

⏱️  Estimated time: 20 seconds

👉 Execute this micro-plan? [Y/n]: y
```

### 4. Execution

```
🔧 Executing: Find and click Jobs link in navigation...
🤖 DeepSeek: 450 tokens used
✅ Find and click Jobs link in navigation - SUCCESS

🔧 Executing: Wait for jobs page to load...
🤖 DeepSeek: 420 tokens used
✅ Wait for jobs page to load - SUCCESS

🔧 Executing: Verify job search form is visible...
🤖 DeepSeek: 400 tokens used
✅ Verify job search form is visible - SUCCESS
```

### 5. Micro-Plan #2

```
═══════════════════════════════════════════════════════════
MICRO-PLAN #2
═══════════════════════════════════════════════════════════

🔍 Analyzing current page...
✅ Analysis complete: 85 buttons, 15 inputs

🤖 Creating micro-plan (3-5 steps)...

📝 TODO (this micro-plan):

   ☐ 1. Enter search keywords into job search input
      Selector: input[name='keywords']
      Test: Input value is 'software engineer'

   ☐ 2. Enter location into location input
      Selector: input[name='location']
      Test: Input value is 'New York'

   ☐ 3. Click search submit button
      Selector: button[type='submit']
      Test: Job results page loads

⏱️  Estimated time: 25 seconds

👉 Execute this micro-plan? [Y/n]: y
```

### 6. Continue Until Goal Achieved

The system keeps making micro-plans and executing them until:
- Goal is achieved (jobs applied to)
- User says "no" to a micro-plan
- Max 20 micro-plans reached

---

## Key Benefits

### 🎯 Goal-Oriented
- Every micro-plan knows the goal: "Find and apply to jobs"
- Recommendations are smart and context-aware

### 📝 Transparent
- User sees TODO before each micro-plan
- Knows exactly what will happen next

### 🔄 Iterative
- Makes small plans (3-5 steps)
- Executes them
- Makes ANOTHER plan
- Adapts to failures

### 🤖 Interactive
- User approves each micro-plan
- Can say "no" and provide guidance

### 🧠 Intelligent Fallback
- If HTML analyzer fails → sends HTML to AI
- AI analyzes raw HTML and finds selectors

### ✅ Testable
- Every step has test criteria
- Verifies success before moving on

---

## Example Session

```bash
npm start

# Create new bot
URL: linkedin.com
Intent: find and apply to jobs

# Phase 0: Intent analysis
🧠 Analyzing intent...
✅ Understood goal: Find and apply to software engineering jobs

# Phase 1: Discovery (skipped if continuing)

# Phase 2: ITERATIVE MICRO-PLANS

═══════════════════════════════════════════════════════════
MICRO-PLAN #1
═══════════════════════════════════════════════════════════

📝 TODO:
   ☐ 1. Click Jobs link
   ☐ 2. Wait for page load
   ☐ 3. Verify search form

👉 Execute? [Y/n]: y

✅ All steps succeeded

═══════════════════════════════════════════════════════════
MICRO-PLAN #2
═══════════════════════════════════════════════════════════

📝 TODO:
   ☐ 1. Enter search keywords
   ☐ 2. Enter location
   ☐ 3. Submit search

👉 Execute? [Y/n]: y

✅ All steps succeeded

═══════════════════════════════════════════════════════════
MICRO-PLAN #3
═══════════════════════════════════════════════════════════

📝 TODO:
   ☐ 1. Find job cards on page
   ☐ 2. Click first job card
   ☐ 3. Verify job details loaded

👉 Execute? [Y/n]: y

... continues until jobs are applied to ...
```

---

## What This Fixes

### ✅ "it never made a todo"
→ NOW: Makes TODO for EVERY micro-plan

### ✅ "present todo at beginning of phase 2"
→ NOW: Shows TODO at start of EACH micro-plan

### ✅ "10 plans, 50 todo items"
→ NOW: Can make 20 micro-plans × 5 steps = 100 todos

### ✅ "i want the agent to be interactive"
→ NOW: Asks approval for EVERY micro-plan

### ✅ "ai analyzes html"
→ NOW: Uses analyzer + AI fallback for raw HTML

### ✅ "test the selectors"
→ NOW: Each step has test_criteria

### ✅ "write steps 1 by 1"
→ NOW: Executes steps one at a time, tests each

---

## Summary

**Before:** One big plan → execute all → fail → stop

**After:**
- Small plan (3-5 steps)
- Show TODO
- Get approval
- Execute & test
- Make ANOTHER plan
- Repeat until goal achieved

**Result:** A bot that is:
- **Transparent** - You see the plan
- **Interactive** - You approve each micro-plan
- **Adaptive** - Makes new plans when things change
- **Goal-oriented** - Always knows: "Find and apply to jobs"
- **Intelligent** - Falls back to AI when needed

This is what you asked for. 🎯
