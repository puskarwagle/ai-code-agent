/**
 * Template Manager
 * Handles initialization of bot files from templates
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { writeFile } from '../utils/file_helpers.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TemplateManager {
  private templatesDir: string;

  constructor() {
    // Templates are in src/templates
    this.templatesDir = path.join(__dirname, '../templates');
  }

  /**
   * Initialize a new bot from templates
   * Creates all necessary files with placeholders replaced
   */
  async initializeBotFromTemplate(
    botName: string,
    url: string,
    intent: string,
    outputDir: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    console.log(`📋 Using template system to initialize bot...`);

    // Read all template files
    const templates = await this.loadTemplates();

    // Define placeholder replacements
    const replacements = {
      '{{BOT_NAME}}': botName,
      '{{TARGET_URL}}': url,
      '{{USER_INTENT}}': intent,
      '{{TIMESTAMP}}': timestamp,
      '{{INTENT}}': intent
    };

    // Replace placeholders in each template
    const implContent = this.replacePlaceholders(templates.impl, replacements);
    const yamlContent = this.replacePlaceholders(templates.yaml, replacements);
    const configContent = this.replacePlaceholders(templates.config, replacements);
    const selectorsContent = this.replacePlaceholders(templates.selectors, replacements);

    // Write files to output directory
    await writeFile(`${outputDir}/${botName}_impl.ts`, implContent);
    await writeFile(`${outputDir}/${botName}_steps.yaml`, yamlContent);
    await writeFile(`${outputDir}/${botName}_config.json`, configContent);
    await writeFile(`${outputDir}/${botName}_selectors.json`, selectorsContent);

    console.log(`✅ Template files created:`);
    console.log(`   • ${botName}_impl.ts (with step_0 and step_1)`);
    console.log(`   • ${botName}_steps.yaml (workflow configuration)`);
    console.log(`   • ${botName}_config.json (bot configuration)`);
    console.log(`   • ${botName}_selectors.json (selector storage)`);
    console.log('');
  }

  /**
   * Load all template files from the templates directory
   */
  private async loadTemplates(): Promise<{
    impl: string;
    yaml: string;
    config: string;
    selectors: string;
  }> {
    try {
      const [impl, yaml, config, selectors] = await Promise.all([
        fs.readFile(path.join(this.templatesDir, 'bot_template_impl.ts'), 'utf8'),
        fs.readFile(path.join(this.templatesDir, 'bot_template_steps.yaml'), 'utf8'),
        fs.readFile(path.join(this.templatesDir, 'bot_template_config.json'), 'utf8'),
        fs.readFile(path.join(this.templatesDir, 'bot_template_selectors.json'), 'utf8')
      ]);

      return { impl, yaml, config, selectors };
    } catch (error: any) {
      throw new Error(`Failed to load templates: ${error.message}`);
    }
  }

  /**
   * Replace all placeholders in a template string
   */
  private replacePlaceholders(
    template: string,
    replacements: Record<string, string>
  ): string {
    let result = template;

    // Replace all placeholders
    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.replaceAll(placeholder, value);
    }

    return result;
  }

  /**
   * Check if templates exist and are valid
   */
  async validateTemplates(): Promise<boolean> {
    const requiredTemplates = [
      'bot_template_impl.ts',
      'bot_template_steps.yaml',
      'bot_template_config.json',
      'bot_template_selectors.json'
    ];

    try {
      for (const template of requiredTemplates) {
        const templatePath = path.join(this.templatesDir, template);
        await fs.access(templatePath);
      }
      return true;
    } catch (error) {
      console.error('❌ Template validation failed - templates may be missing');
      return false;
    }
  }

  /**
   * Get the marker line for appending AI-generated code
   */
  getAppendMarker(): {
    typescript: string;
    yaml: string;
  } {
    return {
      typescript: '// AI-GENERATED STEPS WILL BE APPENDED BELOW THIS LINE',
      yaml: '# AI-GENERATED STEPS WILL BE APPENDED BELOW'
    };
  }
}
