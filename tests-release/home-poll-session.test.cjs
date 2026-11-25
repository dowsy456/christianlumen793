'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../js/chat/send.js'), 'utf8');
function setup() {
  let releaseMembership, writes = 0, beforeTransaction = () => {};
  const message = { userCode: 'AUTHOR', text: '', poll: { question: 'Ready?', options: [{ id: 'yes', text: 'Yes' }], endsAt: Date.now() + 60000 } };
  const App = { register() {}, currentUser: { code: 'ONE', username: 'One' }, accountSessionGeneration: 1,
    db: { ref: key => key.startsWith('memberships/') ? { once: () => new Promise(resolve => { releaseMembership = () => resolve({ val: () => true }); }) } : {
      transaction: async callback => { beforeTransaction(); const next = callback(message); if (next) writes++; return { committed: !!next, snapshot: { val: () => next } }; }
    } }
  };
  vm.runInNewContext(code, { ChatApp: App, Date, Set, Map, console });
  return { App, release: () => releaseMembership(), writes: () => writes, before: fn => { beforeTransaction = fn; } };
}
test('Home vote cannot write the previous account after membership lookup or transaction retry', async () => {
  for (const duringTransaction of [false, true]) {
    const h = setup();
    const vote = h.App.voteInPoll('room', 'poll', ['yes']);
    const switchAccount = () => { h.App.currentUser = { code: 'TWO' }; h.App.accountSessionGeneration++; };
    if (duringTransaction) h.before(switchAccount); else switchAccount();
    h.release();
    await assert.rejects(vote, /session changed/);
    assert.equal(h.writes(), 0);
  }
});
test('unchanged account can still save its valid poll vote', async () => {
  const h = setup(), vote = h.App.voteInPoll('room', 'poll', ['yes']);
  h.release(); assert.equal(await vote, true); assert.equal(h.writes(), 1);
});
