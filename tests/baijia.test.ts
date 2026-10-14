/**
 * 百家副将五件套：任命约束、五靖边进战斗、属性百分比缺省不改面板。
 */
import { describe, expect, it } from 'vitest';
import { BAIJIA_HEROES, BAIJIA_SKILLS } from '../src/data/baijia';
import { applyBaijia } from '../src/engine/baijia';
import { runBattle } from '../src/engine/combat';
import type { General } from '../src/engine/types';

function host(patch: Partial<General> = {}): General {
  return {
    id: 'host',
    name: '夏侯渊',
    rarity: '5星',
    cost: 4,
    faction: '魏',
    tags: [],
    mutualExclusionGroup: null,
    troopType: 'cavalry',
    position: '大营',
    attack: 100,
    defense: 80,
    strategy: 80,
    speed: 90,
    attackRange: 3,
    maxTroops: 9000,
    mainSkillName: '',
    skillDesc: '',
    activeSkillIds: [],
    passiveSkillIds: [],
    commandSkillIds: [],
    pursuitSkillIds: [],
    morale: 100,
    ...patch,
  };
}

describe('百家副将', () => {
  it('五靖边挂镇静和 80% 攻击增伤，不带挫锐', () => {
    const g = applyBaijia(host({ baijia: { heroId: '140002', setId: 'jingbian' } }));
    expect(g.commandSkillIds).toEqual(['bj_550008', 'bj_550009']);
    expect(g.attack).toBe(100);
    const boost = BAIJIA_SKILLS.bj_550009;
    expect(boost.type).toBe('command');
    if (boost.type !== 'command') return;
    const status = boost.output[0];
    expect(status.kind).toBe('inflict_status');
    if (status.kind !== 'inflict_status') return;
    expect(status.status).toMatchObject({ type: 'damage_boost', rate: 0.8, charges: 2 });
    expect(BAIJIA_SKILLS.bj_550008.type === 'command' && BAIJIA_SKILLS.bj_550008.castChance).toBe(0.45);
  });

  it('战斗准备阶段会挂上奋击', () => {
    const report = runBattle({
      myTeam: [host({ baijia: { heroId: '140002', setId: 'jingbian' } })],
      enemyTeam: [host({ id: 'foe', name: '张辽', faction: '魏', position: '大营' })],
      seed: 1,
      maxRounds: 1,
    });
    const hit = report.events.some(
      (e) => e.type === 'status_inflicted' && e.detail.includes('80%')
    );
    expect(hit).toBe(true);
  });

  it('阵营、兵种、同名不能任命', () => {
    expect(() => applyBaijia(host({ faction: '蜀', baijia: { heroId: '140002', setId: 'jingbian' } }))).toThrow(/阵营/);
    expect(() => applyBaijia(host({ troopType: 'infantry', baijia: { heroId: '140002', setId: 'jingbian' } }))).toThrow(/兵种/);
    expect(() => applyBaijia(host({ name: '张恭', baijia: { heroId: '140002', setId: 'jingbian' } }))).toThrow(/副将/);
  });

  it('给出百分比才混合原基础属性', () => {
    const g = applyBaijia(host({
      baijia: { heroId: '140002', setId: 'jingbian', mainStatPct: 80, deputyStatPct: 20 },
    }));
    expect(g.attack).toBe(100 * 0.8 + 18 * 0.2);
    expect(g.speed).toBe(90 * 0.8 + 9 * 0.2);
  });

  it('每条五件套技能都在表里，汪没有攻城效果', () => {
    for (const hero of Object.values(BAIJIA_HEROES)) {
      for (const set of hero.sets) {
        for (const id of set.skillIds) expect(BAIJIA_SKILLS[id]).toBeTruthy();
      }
    }
    expect(BAIJIA_HEROES['140003'].sets.find((s) => s.id === 'wang')!.skillIds).toEqual([]);
    const rest = BAIJIA_SKILLS.bj_550002;
    expect(rest.type).toBe('command');
    if (rest.type !== 'command') return;
    const out = rest.output[0];
    expect(out.kind).toBe('inflict_status');
    if (out.kind !== 'inflict_status') return;
    expect(out.status).toMatchObject({ type: 'rest', rate: 120, growthRate: 0.875, startRound: 4 });
  });
});
