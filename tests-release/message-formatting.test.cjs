'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const App = { register(){}, getRoomMentionTargetByUsername(){ return null; } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/chat/mentions.js'), 'utf8'), { ChatApp:App, URL });
App.getRoomMentionTargetByUsername = () => null;
test('nested Discord emphasis, escape markers and literal code', () => {
  for(const [source, html] of [
    ['**bold** and *italic*', '<strong>bold</strong> and <em>italic</em>'],
    ['**bold *italic***', '<strong>bold <em>italic</em></strong>'],
    ['*italic **bold***', '<em>italic <strong>bold</strong></em>'],
    ['***both***', '<strong><em>both</em></strong>'],
    ['__underline__ _italics_ ~~strike~~', '<u>underline</u> <em>italics</em> <s>strike</s>'],
    ['\\*literal\\* `**code**` user_name_here', '*literal* <code>**code**</code> user_name_here'],
    ['**unfinished', '**unfinished'],
    ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ]) assert.equal(App.formatMessageInline(source), html, source);
});
test('headings and subtext support inline emphasis; preview is safe noninteractive formatting', () => {
  const heading = App.formatTextWithMentions('# **Heading**\n-# *Small*');
  assert.match(heading, /message-heading-1"><strong>Heading<\/strong>/);
  assert.match(heading, /message-subtext"><em>Small<\/em>/);
  assert.equal(App.formatMessagePreview('# **Big**\n-# *small*'), '<strong>Big</strong> <em>small</em>');
  assert.equal(App.formatMessagePreview('||secret||'), '<span class="message-spoiler-preview">Spoiler</span>');
  assert.match(App.formatMessageInline('**https://example.com**'), /^<strong><a .*example\.com<\/a><\/strong>$/);
  assert.equal(App.formatMessagePreview('**https://example.com** @everyone'), '<strong>https://example.com</strong> @everyone');
  assert(!/<(?:a|button|script)\b/.test(App.formatMessagePreview('<script> **safe** @everyone https://example.com')));
});
test('long marker-heavy input has bounded parser nesting', () => {
  const value = '*_**__~~||'.repeat(10000);
  const started = performance.now();
  const html = App.formatMessageInline(value);
  assert(html.length > 0);
  assert(performance.now() - started < 1500);
});
