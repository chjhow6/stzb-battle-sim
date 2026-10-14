/**
 * 解包 effect「攻击伤害降低 / 策略攻击伤害降低」是造成侧，不是受到侧。
 * 挂反时：damage_reduce 或 damage_boost direction taken 会让敌方受到的伤害变低。
 */
import { describe, it, expect } from 'vitest';
import { SKILL_REGISTRY } from '../src/data/skills';
import type { CreateStatus, SkillOutput } from '../src/engine/types';

function statusesOf(outputs: SkillOutput[]): CreateStatus[] {
  const out: CreateStatus[] = [];
  for (const o of outputs) {
    if (o.kind !== 'inflict_status') continue;
    const st = o.status;
    if (Array.isArray(st)) out.push(...st);
    else out.push(st);
  }
  return out;
}

describe('造成伤害降低不要挂成受到伤害降低', () => {
  it('密谋定蜀：敌军造成伤害降低，自身只加策略攻击伤害', () => {
    const skill = SKILL_REGISTRY.mimou_dingshu;
    expect(skill.type).toBe('active');
    if (skill.type !== 'active') return;
    const sts = statusesOf(skill.output);
    expect(sts.some((s) => s.type === 'damage_reduce')).toBe(false);
    const debuff = sts.find((s) => s.type === 'damage_boost' && s.rate < 0);
    expect(debuff).toMatchObject({ type: 'damage_boost', rate: -0.3, direction: 'caused' });
    const self = sts.find((s) => s.type === 'damage_boost' && s.rate > 0);
    expect(self).toMatchObject({ direction: 'caused', damageType: 'strategy', rate: 0.05 });
  });

  it('人公将军：带妖术的敌军造成的攻击伤害降低', () => {
    const skill = SKILL_REGISTRY.rengong_jiangjun;
    expect(skill.type).toBe('command');
    if (skill.type !== 'command') return;
    const sts = statusesOf(skill.output);
    expect(sts.some((s) => s.type === 'damage_reduce')).toBe(false);
    const debuff = sts.find((s) => s.type === 'damage_boost' && s.rate < 0);
    expect(debuff).toMatchObject({
      type: 'damage_boost',
      rate: -0.2,
      direction: 'caused',
      damageType: 'physical',
      requireSelfStatus: 'sorcery',
    });
  });

  it('始计：敌方下一次攻击造成的伤害降低', () => {
    const skill = SKILL_REGISTRY.shiji;
    expect(skill.type).toBe('command');
    if (skill.type !== 'command') return;
    const sts = statusesOf(skill.onActSegments?.[0]?.output ?? []);
    const debuff = sts.find((s) => s.type === 'damage_boost' && s.rate < 0);
    expect(debuff).toMatchObject({ rate: -0.3, direction: 'caused', charges: 1 });
  });
});
