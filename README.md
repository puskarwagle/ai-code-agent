# AI Web Agent 🤖

**Natural language-powered web automation** - Tell the AI what to do, and it figures out how to do it.

## Vision

Instead of manually writing Selenium scripts to interact with websites, you just tell the AI what you want:

```
"Go to LinkedIn and apply to all software engineer jobs in San Francisco"
"Check my Gmail and reply to any emails from recruiters"
"Monitor this e-commerce site and notify me when the price drops below $50"
```

The AI will:
1. Fetch the webpage HTML (using wget/requests)
2. Analyze the page structure
3. Identify interactive elements (buttons, forms, links)
4. Generate Selenium commands to interact with them
5. Execute the automation
6. Handle errors and adapt in real-time

## Architecture

### Core Components

**1. Web Fetcher**
- Downloads HTML from target URLs
- Renders JavaScript if needed (headless browser)
- Extracts clean, parseable HTML

**2. AI Vision Layer (DeepSeek API)**
- Analyzes HTML structure
- Identifies interactive elements
- Understands page semantics (login forms, job listings, etc.)
- Generates action plans

**3. Element Identifier**
- Finds optimal CSS selectors/XPath
- Handles dynamic content
- Validates element existence

**4. Action Executor (Selenium)**
- Translates AI commands to Selenium actions
- Handles clicks, typing, form submissions
- Manages navigation and waiting
- Takes screenshots for AI feedback

**5. Feedback Loop**
- AI verifies actions succeeded
- Adapts if page structure changes
- Handles errors intelligently

## Tech Stack

- **Python** - Main automation logic
- **Selenium** - Browser control
- **DeepSeek API** - AI decision making
- **BeautifulSoup/lxml** - HTML parsing
- **Playwright/Puppeteer** (optional) - Alternative to Selenium

## Getting Started

```bash
# Install dependencies
pip install selenium beautifulsoup4 requests openai

# Set up DeepSeek API key
cp .env.example .env
# Add your DEEPSEEK_API_KEY

# Run example automation
python examples/linkedin_job_search.py
```

## Example Use Cases

1. **Job Application Bot**
   - Search LinkedIn/Indeed
   - Filter by criteria
   - Auto-fill applications
   - Track submissions

2. **Email Assistant**
   - Monitor inbox
   - Categorize emails
   - Draft responses
   - Schedule sends

3. **Price Monitor**
   - Track product prices
   - Alert on price drops
   - Auto-purchase when conditions met

4. **Social Media Manager**
   - Schedule posts
   - Reply to comments
   - Analyze engagement
   - Cross-post content

## How It Works

```python
agent = AIWebAgent(deepseek_api_key="...")

# Natural language instruction
agent.execute("""
    Go to linkedin.com/jobs
    Search for 'software engineer' in 'San Francisco'
    Apply to the first 5 jobs that match:
    - Remote or hybrid
    - Posted in last 7 days
    - Use my resume from ./resume.pdf
""")
```

Behind the scenes:
1. AI breaks down the task into steps
2. Opens browser and navigates to LinkedIn
3. Finds search inputs and enters criteria
4. Parses job listings
5. Filters by requirements
6. Clicks "Apply" and fills forms
7. Attaches resume
8. Submits applications

## Safety & Ethics

⚠️ **Important Guidelines:**
- Respect robots.txt and rate limits
- Don't spam or abuse services
- Use for legitimate automation only
- Handle credentials securely
- Follow terms of service

## Development Roadmap

- [x] Project setup
- [ ] Web fetcher module
- [ ] DeepSeek integration
- [ ] Element identification system
- [ ] Selenium executor
- [ ] Basic feedback loop
- [ ] LinkedIn job search example
- [ ] Error handling & retry logic
- [ ] Session management
- [ ] Multi-page workflows

---

Built with determination and coffee ☕
