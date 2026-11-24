import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSiksha, fetchSiksha, readMenuCache, writeMenuCache } from '../lib/siksha.ts';
import { sanitizeLocalData, sanitizeOverrides, summarizeRecords, canRecordMeal } from '../lib/meal-storage.ts';
import { isDateString } from '../lib/meal-utils.ts';

const date='2026-11-24';
const payload=(day=date)=>({result:[{date:day,br:[],dn:[],lu:[{id:1,name_kr:'학생회관',menus:[{id:45,name_kr:'우삼겹 쌀국수',score:4.5,review_cnt:12,price:6000}]}]}]});
const memory=()=>{let data={};return {getItem:key=>data[key]??null,setItem:(key,value)=>{data[key]=value;}};};

test('API results must match the selected date and malformed data is not a successful empty menu',()=>{
  assert.equal(parseSiksha(payload(),date)[0].menu[0].name,'우삼겹 쌀국수');
  assert.throws(()=>parseSiksha(payload('2026-11-23'),date),/날짜/);
  assert.throws(()=>parseSiksha({},date),/형식/);
  assert.throws(()=>parseSiksha({result:[{date,lu:{}}]},date));
  assert.deepEqual(parseSiksha({result:[]},date),[]);
});

test('menu cache cannot leak another date and retains at most seven fetches',()=>{
  const storage=memory();
  for(let i=1;i<=9;i++) {
    const day=`2026-11-${String(i).padStart(2,'0')}`;
    writeMenuCache(storage,day,payload(day),`${day}T03:00:00Z`);
  }
  assert.equal(readMenuCache(storage,'2026-11-01'),null);
  assert.equal(readMenuCache(storage,'2026-11-10'),null);
  assert.equal(readMenuCache(storage,'2026-11-09').meals[0].cafeteria,'학생회관');
  assert.equal(Object.keys(JSON.parse(storage.getItem('mysnu-menu-cache-v1'))).length,7);
});

test('corrupt or blocked public cache never interrupts browsing',()=>{
  assert.equal(readMenuCache({getItem:()=>'{bad'},date),null);
  assert.doesNotThrow(()=>writeMenuCache({getItem:()=>null,setItem:()=>{throw new Error('quota');}},date,payload(),new Date().toISOString()));
});

test('fetch propagates cancellation so superseded and timed-out requests can stop',async()=>{
  const controller=new AbortController();
  const pending=fetchSiksha(date,controller.signal,async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))));
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  await assert.rejects(fetchSiksha(date,new AbortController().signal,async()=>({ok:false,status:503})),/503/);
});

test('old example records are preserved but cannot count as meals eaten',()=>{
  const saved=sanitizeLocalData({version:1,recordsByDate:{[date]:[{id:'beef',name:'예시 된장찌개',cafeteria:'학생회관',kcal:185,confirmed:true},{id:'siksha-45',name:'실제 메뉴',cafeteria:'학생회관',kcal:700,confirmed:true}]}});
  assert.equal(saved.recordsByDate[date].length,2);
  assert.equal(saved.recordsByDate[date][0].example,true);
  assert.equal(saved.recordsByDate[date][0].confirmed,false);
  assert.equal(summarizeRecords(saved.recordsByDate[date]).total,700);
  assert.equal(canRecordMeal(date,date,'beef'),false);
  assert.equal(canRecordMeal('2026-11-25',date,'siksha-45'),false);
  assert.equal(canRecordMeal(date,date,'custom-123-0'),true);
});

test('record totals disclose unknown calories and retain user-entered historical values',()=>{
  const records=[{id:'siksha-1',name:'기존 식사',cafeteria:'식당',kcal:777,confirmed:true},{id:'siksha-2',name:'미확인 식사',cafeteria:'식당',kcal:null,confirmed:true},{id:'siksha-3',name:'옛 선택',cafeteria:'식당',kcal:500}];
  const saved=sanitizeLocalData({version:1,recordsByDate:{[date]:records}});
  assert.deepEqual(summarizeRecords(saved.recordsByDate[date]),{count:2,total:777,unknown:1});
});

test('damaged storage values and impossible dates are rejected safely',()=>{
  const saved=sanitizeLocalData({version:1,recordsByDate:{[date]:null,'2026-02-31':[],bad:[{}]},votes:[],uploads:[null,{id:45}],targetKcal:Infinity});
  assert.deepEqual(saved.recordsByDate,{});
  assert.deepEqual(saved.uploads,[]);
  assert.equal(saved.targetKcal,2000);
  assert.deepEqual(sanitizeOverrides(null),{});
  assert.deepEqual(sanitizeOverrides({[date+':siksha-1']:700,[date+':siksha-2']:-10,[date+':siksha-3']:'900'}),{[date+':siksha-1']:700});
  assert.equal(isDateString('2026-02-31'),false);
});
