import test from 'node:test';
import assert from 'node:assert/strict';
import {versionTapGate} from '../plugin-packages/multi-platform-notify/ui/tools-shell.js';

import {testPayload} from '../plugin-packages/multi-platform-notify/ui/diagnostics.js';

test('activation matches host and resets after a long gap',()=>{
 const gate=versionTapGate();
 for(let i=0;i<4;i++)assert.equal(gate.tap(i*100),false);
 assert.equal(gate.tap(3401),false);
 for(let i=1;i<4;i++)assert.equal(gate.tap(3401+i*100),false);
 assert.equal(gate.tap(3901),true);
 assert.equal(gate.tap(4000),false);
 gate.reset();
 for(let i=0;i<4;i++)assert.equal(gate.tap(4100+i*100),false);
 assert.equal(gate.tap(4500),true);
});
test('host policy and separate activation counters are respected',()=>{
 const one=versionTapGate({activationTaps:3,resetAfterMillis:20}),two=versionTapGate();
 assert.equal(one.tap(0),false);assert.equal(one.tap(20),false);assert.equal(two.tap(0),false);assert.equal(one.tap(40),true);
});
test('test sends require explicit target and bounded content',()=>{
 assert.deepEqual(testPayload('two',' 测试 🔔 ','一行\n二行'),{targetId:'two',title:'测试 🔔',body:'一行\n二行'});
 for(const args of [['','title','body'],['id','','body'],['id','a'.repeat(121),'body'],['id','title',' '],['id','title','a'.repeat(2001)]])assert.throws(()=>testPayload(...args));
});
