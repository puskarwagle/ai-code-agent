/**
 * HTML Intelligence Layer
 * Analyzes page structure, extracts interactive elements, detects patterns
 */

import { chromium, Page, Browser, Locator } from 'playwright';
import * as cheerio from 'cheerio';
import type {
  PageAnalysis,
  InteractiveElement,
  SelectorChain,
  FormStructure,
  DataPattern,
  SemanticZone,
  AnalyzerConfig
} from '../types/analysis.js';

export class HTMLAnalyzer {
  private browser: Browser | null = null;
  private config: AnalyzerConfig;

  constructor(config?: Partial<AnalyzerConfig>) {
    this.config = {
      include_hidden_elements: false,
      max_elements_per_type: 100,
      detect_data_patterns: true,
      capture_screenshots: false,
      viewport: { width: 1920, height: 1080 },
      ...config
    };
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
  }

  async analyze(url: string, existingPage?: Page): Promise<PageAnalysis> {
    let page: Page;
    let shouldClosePage = false;

    if (existingPage) {
      // Use existing page (preserves login state)
      page = existingPage;
      console.log(`🔍 Analyzing current page state...`);
    } else {
      // Create new page
      if (!this.browser) await this.initialize();
      page = await this.browser!.newPage({
        viewport: this.config.viewport
      });
      shouldClosePage = true;

      console.log(`🔍 Analyzing: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Wait for dynamic content to load
      await page.waitForTimeout(2000);
    }

    try {
      const html = await page.content();
      const $ = cheerio.load(html);

      const analysis: PageAnalysis = {
        url,
        metadata: await this.extractMetadata(page, $),
        interactive_elements: await this.extractInteractiveElements(page, $),
        page_structure: await this.analyzePageStructure(page, $),
        semantic_zones: await this.identifySemanticZones(page, $),
        data_patterns: this.config.detect_data_patterns
          ? await this.detectDataPatterns(page, $)
          : [],
        element_visibility: await this.classifyElementVisibility(page),
        dynamic_content: await this.detectDynamicContent(page, $),
        anti_bot_signals: await this.detectAntiBotSignals(page, $)
      };

      console.log(`✅ Analysis complete: ${analysis.interactive_elements.buttons.length} buttons, ${analysis.interactive_elements.inputs.length} inputs`);

      return analysis;
    } finally {
      // Only close page if we created it (not if using existing page from sandbox)
      if (shouldClosePage) {
        await page.close();
      }
    }
  }

  private async extractMetadata(page: Page, $: cheerio.CheerioAPI): Promise<PageAnalysis['metadata']> {
    const title = await page.title();
    const description = $('meta[name="description"]').attr('content');
    const viewport = page.viewportSize() || this.config.viewport;

    return { title, description, viewport };
  }

  private async extractInteractiveElements(
    page: Page,
    $: cheerio.CheerioAPI
  ): Promise<PageAnalysis['interactive_elements']> {
    const buttons: InteractiveElement[] = [];
    const inputs: InteractiveElement[] = [];
    const links: InteractiveElement[] = [];
    const selects: InteractiveElement[] = [];

    // Extract buttons
    const buttonElements = await page.locator('button, input[type="button"], input[type="submit"], [role="button"]').all();
    for (let i = 0; i < Math.min(buttonElements.length, this.config.max_elements_per_type); i++) {
      const element = await this.extractElementData(buttonElements[i], 'button', i);
      if (element) buttons.push(element);
    }

    // Extract inputs
    const inputElements = await page.locator('input:not([type="button"]):not([type="submit"]), textarea').all();
    for (let i = 0; i < Math.min(inputElements.length, this.config.max_elements_per_type); i++) {
      const element = await this.extractElementData(inputElements[i], 'input', i);
      if (element) inputs.push(element);
    }

    // Extract links
    const linkElements = await page.locator('a[href]').all();
    for (let i = 0; i < Math.min(linkElements.length, this.config.max_elements_per_type); i++) {
      const element = await this.extractElementData(linkElements[i], 'link', i);
      if (element) links.push(element);
    }

    // Extract selects
    const selectElements = await page.locator('select').all();
    for (let i = 0; i < Math.min(selectElements.length, this.config.max_elements_per_type); i++) {
      const element = await this.extractElementData(selectElements[i], 'select', i);
      if (element) selects.push(element);
    }

    return { buttons, inputs, links, selects };
  }

  private async extractElementData(
    locator: Locator,
    elementType: string,
    index: number
  ): Promise<InteractiveElement | null> {
    try {
      const isVisible = await locator.isVisible().catch(() => false);
      if (!isVisible && !this.config.include_hidden_elements) return null;

      const tagName = await locator.evaluate(el => el.tagName.toLowerCase());
      const text = await locator.innerText().catch(() => '');
      const attributes: Record<string, string> = await locator.evaluate(el => {
        const attrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        return attrs;
      });

      const classes = attributes.class ? attributes.class.split(' ').filter(Boolean) : [];
      const id = attributes.id;
      const role = attributes.role;
      const href = attributes.href;
      const type = attributes.type;

      const isEnabled = await locator.isEnabled().catch(() => false);
      const boundingBox = await locator.boundingBox().catch(() => null);

      // Generate selector chain
      const selectors = await this.generateSelectorChain(locator, {
        tagName,
        text,
        attributes,
        classes,
        id,
        role
      });

      // Generate hierarchy path
      const hierarchyPath = await locator.evaluate(el => {
        const parts: string[] = [];
        let current: Element | null = el;
        while (current && parts.length < 5) {
          let selector = current.tagName.toLowerCase();
          if (current.id) selector += `#${current.id}`;
          else if (current.className) {
            const stableClasses = current.className.split(' ')
              .filter(c => c && !c.match(/^(css-|_)[a-z0-9]+$/i))
              .slice(0, 2);
            if (stableClasses.length) selector += `.${stableClasses.join('.')}`;
          }
          parts.unshift(selector);
          current = current.parentElement;
        }
        return parts.join(' > ');
      });

      return {
        tagName,
        type,
        text: text.trim().substring(0, 100),
        selector: selectors.primary,
        selectors,
        attributes,
        classes,
        id,
        role,
        href,
        index,
        hierarchyPath,
        isVisible,
        isEnabled,
        boundingBox: boundingBox || undefined
      };
    } catch (error) {
      console.warn(`Failed to extract element ${elementType}[${index}]:`, error);
      return null;
    }
  }

  private async generateSelectorChain(
    locator: Locator,
    elementData: {
      tagName: string;
      text: string;
      attributes: Record<string, string>;
      classes: string[];
      id?: string;
      role?: string;
    }
  ): Promise<SelectorChain> {
    const fallbacks: string[] = [];
    let primary = '';
    let stability_score = 0;

    // 1. Test attributes (most stable)
    if (elementData.attributes['data-testid']) {
      primary = `[data-testid="${elementData.attributes['data-testid']}"]`;
      stability_score = 95;
    } else if (elementData.attributes['data-qa']) {
      primary = `[data-qa="${elementData.attributes['data-qa']}"]`;
      stability_score = 90;
    } else if (elementData.attributes['data-cy']) {
      primary = `[data-cy="${elementData.attributes['data-cy']}"]`;
      stability_score = 90;
    }
    // 2. Aria labels (very stable)
    else if (elementData.attributes['aria-label']) {
      primary = `[aria-label="${elementData.attributes['aria-label']}"]`;
      stability_score = 85;
      fallbacks.push(`${elementData.tagName}[aria-label="${elementData.attributes['aria-label']}"]`);
    }
    // 3. ID (if not dynamic)
    else if (elementData.id && !this.isDynamicId(elementData.id)) {
      primary = `#${elementData.id}`;
      stability_score = 80;
    }
    // 4. Name attribute
    else if (elementData.attributes['name']) {
      primary = `[name="${elementData.attributes['name']}"]`;
      stability_score = 75;
      fallbacks.push(`${elementData.tagName}[name="${elementData.attributes['name']}"]`);
    }
    // 5. Stable classes
    else if (elementData.classes.length > 0) {
      const stableClasses = elementData.classes.filter(c => !this.isHashedClass(c));
      if (stableClasses.length > 0) {
        primary = `.${stableClasses.slice(0, 2).join('.')}`;
        stability_score = 60;
      } else {
        primary = elementData.tagName;
        stability_score = 30;
      }
    }
    // 6. Fallback to tag name
    else {
      primary = elementData.tagName;
      stability_score = 30;
    }

    // Add text-based selector as fallback
    if (elementData.text && elementData.text.length > 0 && elementData.text.length < 50) {
      const escapedText = elementData.text.replace(/"/g, '\\"').substring(0, 30);
      fallbacks.push(`${elementData.tagName}:has-text("${escapedText}")`);
    }

    // Add role-based selector
    if (elementData.role) {
      fallbacks.push(`[role="${elementData.role}"]`);
    }

    return {
      primary,
      fallbacks,
      validation: {
        must_be_visible: true,
        must_be_enabled: elementData.tagName === 'button' || elementData.tagName === 'input',
        expected_text: elementData.text.substring(0, 20),
        screenshot_verification: this.config.capture_screenshots
      },
      stability_score
    };
  }

  private isDynamicId(id: string): boolean {
    // Check if ID looks auto-generated
    return /^(mui-|radix-|headlessui-)\d+$/.test(id) ||
           /^[a-z0-9]{8,}$/.test(id) ||
           /\d{10,}/.test(id);
  }

  private isHashedClass(className: string): boolean {
    // Check if class looks like a CSS-in-JS hash
    return /^(css-|_)[a-z0-9]+$/i.test(className) ||
           /^[a-z]+-[a-z0-9]{5,}$/i.test(className);
  }

  private async analyzePageStructure(
    page: Page,
    $: cheerio.CheerioAPI
  ): Promise<PageAnalysis['page_structure']> {
    // Find main content area
    const main_content_area =
      $('main').first().attr('id') ||
      $('[role="main"]').first().attr('id') ||
      $('#content').attr('id') ||
      '.main-content';

    // Find navigation
    const navigation =
      $('nav').first().attr('id') ||
      $('[role="navigation"]').first().attr('id') ||
      '.navigation, .nav, header nav';

    // Extract forms
    const forms: FormStructure[] = [];
    const formElements = await page.locator('form').all();

    for (let i = 0; i < Math.min(formElements.length, 10); i++) {
      const form = formElements[i];
      const action = await form.getAttribute('action');
      const method = await form.getAttribute('method');

      const inputs = await form.locator('input, textarea, select').all();
      const inputElements: InteractiveElement[] = [];

      for (let j = 0; j < inputs.length; j++) {
        const input = await this.extractElementData(inputs[j], 'input', j);
        if (input) inputElements.push(input);
      }

      const submitButton = await form.locator('[type="submit"], button[type="submit"]').first();
      const submitElement = submitButton ? await this.extractElementData(submitButton, 'button', 0) : undefined;

      forms.push({
        selector: `form:nth-of-type(${i + 1})`,
        action: action || undefined,
        method: method || undefined,
        inputs: inputElements,
        submit_button: submitElement
      });
    }

    return { main_content_area, navigation, forms };
  }

  private async identifySemanticZones(
    page: Page,
    $: cheerio.CheerioAPI
  ): Promise<PageAnalysis['semantic_zones']> {
    const zones: PageAnalysis['semantic_zones'] = {
      main_content: { selectors: [], purpose: 'main', confidence: 0 }
    };

    // Header detection
    const headerSelectors = ['header', '[role="banner"]', '.header', '.site-header'];
    for (const selector of headerSelectors) {
      if ($(selector).length > 0) {
        zones.header = {
          selectors: [selector],
          purpose: 'site_header',
          confidence: 90
        };
        break;
      }
    }

    // Navigation detection
    const navSelectors = ['nav', '[role="navigation"]', '.navigation', '.nav-menu'];
    for (const selector of navSelectors) {
      if ($(selector).length > 0) {
        zones.navigation = {
          selectors: [selector],
          purpose: 'navigation',
          confidence: 90
        };
        break;
      }
    }

    // Main content detection
    const mainSelectors = ['main', '[role="main"]', '#content', '.main-content', 'article'];
    for (const selector of mainSelectors) {
      if ($(selector).length > 0) {
        zones.main_content = {
          selectors: [selector],
          purpose: 'main_content',
          confidence: 85
        };
        break;
      }
    }

    // Footer detection
    const footerSelectors = ['footer', '[role="contentinfo"]', '.footer', '.site-footer'];
    for (const selector of footerSelectors) {
      if ($(selector).length > 0) {
        zones.footer = {
          selectors: [selector],
          purpose: 'site_footer',
          confidence: 90
        };
        break;
      }
    }

    return zones;
  }

  private async detectDataPatterns(
    page: Page,
    $: cheerio.CheerioAPI
  ): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];

    // Detect lists (ul, ol with repeated items)
    $('ul, ol').each((i, list) => {
      const items = $(list).children('li');
      if (items.length >= 3) {
        patterns.push({
          type: 'list',
          container: `${list.tagName}:nth-of-type(${i + 1})`,
          items: 'li',
          repeat_pattern: true,
          count: items.length
        });
      }
    });

    // Detect tables
    $('table').each((i, table) => {
      const headers = $(table).find('th').map((_, th) => $(th).text().trim()).get();
      patterns.push({
        type: 'table',
        container: `table:nth-of-type(${i + 1})`,
        items: 'tr',
        repeat_pattern: true,
        count: $(table).find('tbody tr').length,
        headers
      });
    });

    // Detect card patterns (common class patterns)
    const cardSelectors = ['.card', '[class*="card-"]', '.product', '.item', '[class*="item-"]'];
    for (const selector of cardSelectors) {
      const cards = $(selector);
      if (cards.length >= 3) {
        patterns.push({
          type: 'cards',
          container: selector,
          items: selector,
          repeat_pattern: true,
          count: cards.length
        });
        break;
      }
    }

    return patterns;
  }

  private async classifyElementVisibility(
    page: Page
  ): Promise<PageAnalysis['element_visibility']> {
    const viewport = page.viewportSize() || this.config.viewport;
    const above_fold: InteractiveElement[] = [];
    const requires_scroll: InteractiveElement[] = [];
    const hidden_by_css: InteractiveElement[] = [];

    // Get all interactive elements with their positions
    const allElements = await page.locator('button, input, a, select').all();

    for (let i = 0; i < Math.min(allElements.length, 50); i++) {
      const element = allElements[i];
      const isVisible = await element.isVisible().catch(() => false);
      const box = await element.boundingBox().catch(() => null);

      if (!isVisible) {
        const elementData = await this.extractElementData(element, 'unknown', i);
        if (elementData) hidden_by_css.push(elementData);
        continue;
      }

      if (box) {
        const elementData = await this.extractElementData(element, 'unknown', i);
        if (!elementData) continue;

        if (box.y < viewport.height) {
          above_fold.push(elementData);
        } else {
          requires_scroll.push(elementData);
        }
      }
    }

    return { above_fold, requires_scroll, hidden_by_css };
  }

  private async detectDynamicContent(
    page: Page,
    $: cheerio.CheerioAPI
  ): Promise<PageAnalysis['dynamic_content']> {
    // Detect infinite scroll
    const infinite_scroll =
      $('[class*="infinite"]').length > 0 ||
      $('[data-infinite]').length > 0;

    // Detect lazy loading
    const lazy_loaded_images =
      $('img[loading="lazy"]').length > 0 ||
      $('img[data-src]').length > 0;

    // Detect AJAX navigation
    const ajax_navigation =
      $('[data-ajax]').length > 0 ||
      $('[data-pjax]').length > 0;

    // Detect SPA frameworks
    const spa_detected =
      $('[data-reactroot], [data-react-helmet], #__next, #root').length > 0 ||
      $('script[src*="react"], script[src*="vue"], script[src*="angular"]').length > 0;

    return {
      infinite_scroll,
      lazy_loaded_images,
      ajax_navigation,
      spa_detected
    };
  }

  private async detectAntiBotSignals(
    page: Page,
    $: cheerio.CheerioAPI
  ): Promise<PageAnalysis['anti_bot_signals']> {
    // Detect CAPTCHA
    const captcha_present =
      $('[class*="captcha"], [id*="captcha"], [class*="recaptcha"]').length > 0 ||
      await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]').count() > 0;

    // Detect Cloudflare
    const cloudflare_detected =
      $('script[src*="cloudflare"]').length > 0 ||
      await page.locator('text=Checking your browser').count() > 0;

    // Check if page requires JavaScript
    const noscript = $('noscript').text();
    const requires_javascript = noscript.toLowerCase().includes('javascript') ||
                                noscript.toLowerCase().includes('enable');

    // Rate limiting is detected at runtime, not from static HTML
    const rate_limiting_likely = false;

    return {
      captcha_present,
      rate_limiting_likely,
      requires_javascript,
      cloudflare_detected
    };
  }

  /**
   * Enhanced pattern detection using AI-powered analysis
   * This method uses semantic understanding to detect repeating patterns
   */
  async detectPatternWithAI(
    page: Page,
    pattern_type: 'job_card' | 'product_card' | 'search_result' | 'generic'
  ): Promise<{
    selector: string;
    confidence: number;
    count: number;
    sample_data?: any;
  } | null> {
    console.log(`🤖 AI-powered detection for: ${pattern_type}`);

    try {
      // Strategy 1: Detect repeating article/div/li patterns with similar structure
      const potentialPatterns = await page.evaluate(() => {
        const candidates: Array<{ selector: string; count: number; sample: any }> = [];

        // Look for repeating patterns
        const commonContainers = ['article', 'li', 'div[class*="card"]', 'div[class*="item"]', 'div[class*="result"]'];

        for (const containerType of commonContainers) {
          const elements = Array.from(document.querySelectorAll(containerType));

          if (elements.length < 3) continue; // Need at least 3 for a pattern

          // Group by parent
          const grouped = new Map<Element, Element[]>();
          elements.forEach(el => {
            const parent = el.parentElement;
            if (parent) {
              if (!grouped.has(parent)) grouped.set(parent, []);
              grouped.get(parent)!.push(el);
            }
          });

          // Find groups with 3+ children
          grouped.forEach((children, parent) => {
            if (children.length >= 3) {
              // Check if children have similar structure
              const firstChild = children[0];
              const firstChildHtml = firstChild.innerHTML;
              const structureSimilarity = children.filter(child => {
                const html = child.innerHTML;
                // Basic structure similarity: same number of nested elements
                const firstCount = (firstChildHtml.match(/<[^>]+>/g) || []).length;
                const childCount = (html.match(/<[^>]+>/g) || []).length;
                return Math.abs(firstCount - childCount) < firstCount * 0.3; // 30% tolerance
              }).length;

              const similarity = structureSimilarity / children.length;

              if (similarity > 0.7) { // 70% similar
                // Generate selector
                const tagName = firstChild.tagName.toLowerCase();
                let selector = tagName;

                // Try to find common class
                const firstClasses = Array.from(firstChild.classList);
                const commonClasses = firstClasses.filter(cls =>
                  children.every(child => child.classList.contains(cls))
                );

                if (commonClasses.length > 0) {
                  selector = `${tagName}.${commonClasses[0]}`;
                }

                // Sample data
                const sample = {
                  text: firstChild.textContent?.trim().substring(0, 100),
                  classes: Array.from(firstChild.classList),
                  attributes: Array.from(firstChild.attributes).map(attr => ({
                    name: attr.name,
                    value: attr.value
                  }))
                };

                candidates.push({
                  selector,
                  count: children.length,
                  sample
                });
              }
            }
          });
        }

        return candidates.sort((a, b) => b.count - a.count);
      });

      if (potentialPatterns.length > 0) {
        const best = potentialPatterns[0];
        console.log(`✅ Found pattern: ${best.selector} (${best.count} instances)`);

        return {
          selector: best.selector,
          confidence: best.count >= 5 ? 90 : best.count >= 3 ? 70 : 50,
          count: best.count,
          sample_data: best.sample
        };
      }

      console.log('⚠️  No repeating patterns found');
      return null;

    } catch (error) {
      console.error('Pattern detection error:', error);
      return null;
    }
  }

  /**
   * Job-specific pattern analysis
   * Detects job cards, apply buttons, and other job-related elements
   */
  async analyzeJobSite(page: Page): Promise<{
    job_cards: Array<{ selector: string; count: number }>;
    apply_buttons: Array<{ selector: string; type: 'quick' | 'regular'; context: string }>;
    search_form: { selector: string; found: boolean };
    filters: Array<{ type: string; selector: string }>;
  }> {
    console.log('🎯 Analyzing as job site...');

    const analysis = await page.evaluate(() => {
      const result: any = {
        job_cards: [],
        apply_buttons: [],
        search_form: { selector: '', found: false },
        filters: []
      };

      // Detect job cards using multiple strategies
      const jobCardSelectors = [
        'article[data-testid*="job"]',
        '[data-automation*="job-card"]',
        '[class*="job-card"]',
        '[class*="jobCard"]',
        'li[class*="job"]',
        'div[class*="search-result"]'
      ];

      for (const selector of jobCardSelectors) {
        const cards = document.querySelectorAll(selector);
        if (cards.length > 0) {
          result.job_cards.push({ selector, count: cards.length });
        }
      }

      // Detect apply buttons
      const allButtons = Array.from(document.querySelectorAll('button, a[role="button"]'));
      allButtons.forEach((btn, idx) => {
        const text = btn.textContent?.toLowerCase() || '';

        if (text.includes('quick') && text.includes('apply')) {
          result.apply_buttons.push({
            selector: `button:nth-of-type(${idx})`,
            type: 'quick',
            context: btn.closest('article, li, div[class*="card"]')?.className || 'unknown'
          });
        } else if (text.includes('apply') && !text.includes('applied')) {
          result.apply_buttons.push({
            selector: `button:nth-of-type(${idx})`,
            type: 'regular',
            context: btn.closest('article, li, div[class*="card"]')?.className || 'unknown'
          });
        }
      });

      // Detect search form
      const searchInputs = document.querySelectorAll('input[placeholder*="job" i], input[placeholder*="search" i], input[name*="keyword" i]');
      if (searchInputs.length > 0) {
        const form = searchInputs[0].closest('form');
        result.search_form.selector = form ? 'form:has(input[placeholder*="job" i])' : 'input[placeholder*="job" i]';
        result.search_form.found = true;
      }

      // Detect filters
      const filterSelectors = ['select[name*="type"]', 'select[name*="location"]', '[data-testid*="filter"]'];
      filterSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          result.filters.push({
            type: selector.includes('type') ? 'job_type' : selector.includes('location') ? 'location' : 'generic',
            selector
          });
        }
      });

      return result;
    });

    console.log(`✅ Found ${analysis.job_cards.length} job card patterns, ${analysis.apply_buttons.length} apply buttons`);

    return analysis;
  }

  /**
   * Detect interaction states (modals, dropdowns, tabs, etc.)
   */
  async detectInteractionStates(page: Page): Promise<{
    modals: Array<{ selector: string; visible: boolean }>;
    dropdowns: Array<{ selector: string; expanded: boolean }>;
    tabs: Array<{ selector: string; active: boolean }>;
  }> {
    console.log('🔍 Detecting interaction states...');

    const states = await page.evaluate(() => {
      const result: any = {
        modals: [],
        dropdowns: [],
        tabs: []
      };

      // Detect modals
      const modalSelectors = [
        '[role="dialog"]',
        '[class*="modal"]',
        '[class*="Modal"]',
        '[aria-modal="true"]'
      ];

      modalSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const visible = (el as HTMLElement).offsetParent !== null;
          result.modals.push({ selector, visible });
        });
      });

      // Detect dropdowns
      const dropdownSelectors = [
        '[role="listbox"]',
        '[class*="dropdown"]',
        'select',
        '[aria-haspopup="true"]'
      ];

      dropdownSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const expanded = el.getAttribute('aria-expanded') === 'true';
          result.dropdowns.push({ selector, expanded });
        });
      });

      // Detect tabs
      const tabSelectors = ['[role="tab"]', '[class*="tab"][aria-selected]'];

      tabSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const active = el.getAttribute('aria-selected') === 'true' ||
                         el.classList.contains('active') ||
                         el.classList.contains('selected');
          result.tabs.push({ selector, active });
        });
      });

      return result;
    });

    console.log(`✅ Found ${states.modals.length} modals, ${states.dropdowns.length} dropdowns, ${states.tabs.length} tabs`);

    return states;
  }

  /**
   * Smarter card detection using visual and structural analysis
   */
  async detectRepeatingPattern(page: Page): Promise<{
    pattern_selector: string;
    count: number;
    confidence: number;
    sample_element: any;
  } | null> {
    console.log('🔍 Detecting repeating visual patterns...');

    // Use AI-powered detection first
    const aiResult = await this.detectPatternWithAI(page, 'generic');

    if (aiResult && aiResult.confidence > 70) {
      return {
        pattern_selector: aiResult.selector,
        count: aiResult.count,
        confidence: aiResult.confidence,
        sample_element: aiResult.sample_data
      };
    }

    // Fallback to basic detection
    return null;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
