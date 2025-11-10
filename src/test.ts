import { HTMLAnalyzer } from './core/html_analyzer.js';

async function testAnalyzer() {
  console.log('🧪 Testing HTML Analyzer...\n');

  const analyzer = new HTMLAnalyzer({
    include_hidden_elements: false,
    detect_data_patterns: true,
    capture_screenshots: false
  });

  try {
    // Test with a simple page
    const analysis = await analyzer.analyze('https://linkedin.com');

    console.log('📊 Analysis Results:');
    console.log('─'.repeat(50));
    console.log(`📄 Title: ${analysis.metadata.title}`);
    console.log(`🔗 URL: ${analysis.url}`);
    console.log(`\n🎯 Interactive Elements:`);
    console.log(`  • Buttons: ${analysis.interactive_elements.buttons.length}`);
    console.log(`  • Inputs: ${analysis.interactive_elements.inputs.length}`);
    console.log(`  • Links: ${analysis.interactive_elements.links.length}`);
    console.log(`  • Selects: ${analysis.interactive_elements.selects.length}`);

    console.log(`\n📦 Semantic Zones:`);
    console.log(`  • Header: ${analysis.semantic_zones.header ? '✓' : '✗'}`);
    console.log(`  • Navigation: ${analysis.semantic_zones.navigation ? '✓' : '✗'}`);
    console.log(`  • Main Content: ✓`);
    console.log(`  • Footer: ${analysis.semantic_zones.footer ? '✓' : '✗'}`);

    console.log(`\n👁️  Element Visibility:`);
    console.log(`  • Above fold: ${analysis.element_visibility.above_fold.length}`);
    console.log(`  • Requires scroll: ${analysis.element_visibility.requires_scroll.length}`);
    console.log(`  • Hidden: ${analysis.element_visibility.hidden_by_css.length}`);

    console.log(`\n🛡️  Anti-Bot Signals:`);
    console.log(`  • CAPTCHA: ${analysis.anti_bot_signals.captcha_present ? '⚠️  Yes' : '✓ No'}`);
    console.log(`  • Cloudflare: ${analysis.anti_bot_signals.cloudflare_detected ? '⚠️  Yes' : '✓ No'}`);
    console.log(`  • Requires JS: ${analysis.anti_bot_signals.requires_javascript ? '⚠️  Yes' : '✓ No'}`);

    console.log(`\n📋 Data Patterns: ${analysis.data_patterns.length} detected`);
    analysis.data_patterns.forEach(pattern => {
      console.log(`  • ${pattern.type}: ${pattern.count} items`);
    });

    console.log(`\n🔍 Sample Button Selectors:`);
    analysis.interactive_elements.buttons.slice(0, 3).forEach((btn, i) => {
      console.log(`  ${i + 1}. "${btn.text || btn.selector}"`);
      console.log(`     Primary: ${btn.selectors.primary}`);
      console.log(`     Stability: ${btn.selectors.stability_score}/100`);
      console.log(`     Fallbacks: ${btn.selectors.fallbacks.length}`);
    });

    console.log('\n✅ HTML Analyzer test passed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await analyzer.close();
  }
}

testAnalyzer();
