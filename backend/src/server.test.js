import test from 'node:test';import assert from 'node:assert/strict';
test('percentage calculation remains within expected arithmetic',()=>{const total=45+40,max=50+50;assert.equal(total/max*100,85)});
test('grade boundaries are deterministic',()=>{const grade=p=>p>=90?'A+':p>=80?'A':p>=70?'B':p>=60?'C':p>=50?'D':'F';assert.equal(grade(90),'A+');assert.equal(grade(79),'B');assert.equal(grade(49),'F')});
