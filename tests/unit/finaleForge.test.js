import { describe,it,expect } from 'vitest';
import { createSchmiede } from '../../src/ui/hubPanelsA.js';
import { itemUses,weaponTag,reasonText } from '../../src/ui/hubKit.js';
import { WEAPON_ORDER,WEAPON_UPGRADES,weaponStats,FINALE_TRAITS } from '../../src/data/weapons.js';
import { defaultSave,ARMORY_MAX } from '../../src/meta/save.js';

const nodeClass=(html,key)=>html.match(new RegExp('<button class="([^"]*)" data-a="wnode" data-k="'+key+'">'))?.[1].split(' ')??[];
const panel=(save)=>createSchmiede({save,commit(){},toast(){}});
describe('final boss forge presentation',()=>{
  it('offers all four final choices and crafts the selected dragon, keeping only that node current',()=>{
    const save=defaultSave();save.weapons.gs={tier:6,branch:'x'};
    const cost=WEAPON_UPGRADES[7].f.cost;save.schrott=cost.schrott;save.box=Object.fromEntries(Object.entries(cost).filter(([k])=>k!=='schrott'));
    const forge=panel(save);let html=forge.render();
    for(const key of ['7p','7f','7i','7'])expect(nodeClass(html,key)).toContain('next');
    expect(nodeClass(html,'7f')).toContain('glow');expect(nodeClass(html,'7p')).not.toContain('glow');
    forge.click('wnode',{k:'7f'});html=forge.render();
    expect(html).toContain('Stumpf +12%');expect(html).toContain('Teilbruch +40%');
    expect(html.split(FINALE_TRAITS.f.desc).length-1).toBe(1);expect(html).toContain('<b>Weltenbruch</b>');
    forge.click('upg',{b:'f'});expect(save.weapons.gs).toEqual({tier:7,branch:'f'});
    html=forge.render();expect(nodeClass(html,'7f')).toContain('cur');expect(nodeClass(html,'7')).toContain('next');
    for(const key of ['7p','7i'])expect(nodeClass(html,key)).toContain('far');
    forge.click('wnode',{k:'7f'});expect(forge.render()).toContain('St.7 · Felsengroll');
  });
  it('keeps existing Ur equipment current instead of marking all final variants as owned',()=>{
    const save=defaultSave();save.weapons.gs={tier:7,branch:null};const html=panel(save).render();
    expect(nodeClass(html,'7')).toContain('cur');
    for(const key of ['7p','7f','7i']){expect(nodeClass(html,key)).toContain('far');expect(nodeClass(html,key)).not.toContain('cur');}
    expect(weaponTag(weaponStats('gs',7),7)).toContain('Ur-Konvergenz');
    expect(reasonText({reason:'armory_full'})).toContain(`(${ARMORY_MAX})`);
  });
  it('lists the real late-game recipes for materials instead of telling players to sell them',()=>{
    const uses=(id)=>itemUses(id).find(x=>x.label==='Waffen')?.names??[];
    for(const type of WEAPON_ORDER){
      expect(uses('pyrostur_rubin')).toContain(weaponStats(type,7,'p').name);
      expect(uses('felsengroll_kern')).toContain(weaponStats(type,7,'f').name);
      expect(uses('voltiris_kristall')).toContain(weaponStats(type,7,'i').name);
      expect(uses('ur_gockelei')).toContain(weaponStats(type,7).name);
      expect(uses('kroll_panzer')).toContain(weaponStats(type,5,'k').name);
      expect(uses('krachfaust_runenherz')).toContain(weaponStats(type,6,'x').name);
    }
  });
});
