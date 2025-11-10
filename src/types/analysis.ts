/**
 * Type definitions for HTML analysis and page intelligence
 */

export interface InteractiveElement {
  tagName: string;
  type?: string;
  text?: string;
  selector: string;
  selectors: SelectorChain;
  attributes: Record<string, string>;
  classes: string[];
  id?: string;
  role?: string;
  href?: string;
  index: number;
  hierarchyPath: string;
  purpose?: string;
  label?: string;
  isVisible: boolean;
  isEnabled: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SelectorChain {
  primary: string;
  fallbacks: string[];
  validation: {
    must_be_visible: boolean;
    must_be_enabled: boolean;
    expected_text?: string;
    screenshot_verification: boolean;
  };
  stability_score: number; // 0-100
}

export interface FormStructure {
  selector: string;
  action?: string;
  method?: string;
  inputs: InteractiveElement[];
  submit_button?: InteractiveElement;
}

export interface SemanticZone {
  selectors: string[];
  purpose: string;
  confidence: number;
  items?: InteractiveElement[];
}

export interface DataPattern {
  type: 'list' | 'table' | 'cards' | 'grid';
  container: string;
  items: string;
  repeat_pattern: boolean;
  count: number;
  fields?: Record<string, string>;
  headers?: string[];
}

export interface PageAnalysis {
  url: string;
  metadata: {
    title: string;
    description?: string;
    viewport: { width: number; height: number };
  };

  interactive_elements: {
    buttons: InteractiveElement[];
    inputs: InteractiveElement[];
    links: InteractiveElement[];
    selects: InteractiveElement[];
  };

  page_structure: {
    main_content_area: string;
    navigation: string;
    forms: FormStructure[];
  };

  semantic_zones: {
    header?: SemanticZone;
    navigation?: SemanticZone;
    main_content: SemanticZone;
    footer?: SemanticZone;
  };

  data_patterns: DataPattern[];

  element_visibility: {
    above_fold: InteractiveElement[];
    requires_scroll: InteractiveElement[];
    hidden_by_css: InteractiveElement[];
  };

  dynamic_content: {
    infinite_scroll: boolean;
    lazy_loaded_images: boolean;
    ajax_navigation: boolean;
    spa_detected: boolean;
  };

  anti_bot_signals: {
    captcha_present: boolean;
    rate_limiting_likely: boolean;
    requires_javascript: boolean;
    cloudflare_detected: boolean;
  };
}

export interface AnalyzerConfig {
  include_hidden_elements: boolean;
  max_elements_per_type: number;
  detect_data_patterns: boolean;
  capture_screenshots: boolean;
  viewport: { width: number; height: number };
}
