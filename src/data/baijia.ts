/**
 * 百家副将 · 五件套全红。
 * 数值来自 tb_cfg_skill_detail（效果 = f13 + f12×属性/200），不读培养曲线。
 * 哨兵槽（f2=999999）和攻城（105）不进战斗。
 */
import type { CommandSkill, EffectTag, PassiveSkill, Skill, SkillOutput, TroopType } from '../engine/types';

/** 百分点效果：rate 为小数，growthRate 为每点属性的百分点（减伤/增减伤口径）。 */
function pct(f12: number, f13: number): { rate: number; growthRate: number } {
  return { rate: (f13 + 0.4 * f12) / 100, growthRate: f12 / 200 };
}

/** 恢复率：rate 为百分点。 */
function healOf(f12: number, f13: number): { rate: number; growthRate: number } {
  return { rate: f13 + 0.4 * f12, growthRate: f12 / 200 };
}

/**
 * 属性下降点数。槽位按百分之一点存储（缓师 f13=2000 → 20 点）。
 * @param f12 受属性系数
 * @param f13 常量项
 */
function attrDown(f12: number, f13: number): { amount: number; growthRate: number } {
  return { amount: -((f13 + 0.4 * f12) / 100), growthRate: f12 / 100 / 200 };
}

/** @param s 一类指挥本体（type/phase/发动率固定） */
function prep(s: Omit<CommandSkill, 'type' | 'phase' | 'triggerRate'>): CommandSkill {
  return { type: 'command', phase: 'prep', triggerRate: 1, ...s };
}

const dmg = (rate: number, extra: Partial<Extract<SkillOutput, { kind: 'physical_damage' }>> = {}): SkillOutput =>
  ({ kind: 'physical_damage', rate, ...extra });

const reduce = (
  f12: number,
  f13: number,
  duration: number,
  extra: Record<string, unknown> = {}
): SkillOutput => {
  const e = pct(f12, f13);
  return {
    kind: 'inflict_status',
    status: {
      type: 'damage_reduce',
      rate: e.rate,
      growthRate: e.growthRate,
      strategyScaled: true,
      duration,
      ...extra,
    },
  } as SkillOutput;
};

/** 五件套技能。键 = 战法 id。 */
export const BAIJIA_SKILLS: Record<string, Skill> = {
  bj_550002: prep({
    id: 'bj_550002',
    name: '慈悲',
    range: 2,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['heal'],
    output: [{
      kind: 'inflict_status',
      status: { type: 'rest', ...healOf(175, 50), duration: 999, startRound: 4, strategyScaled: true },
    }],
  }),
  bj_550003: {
    id: 'bj_550003',
    name: '调伏',
    type: 'passive',
    timing: 'battle_start',
    range: 2,
    triggerRate: 1,
    targetMode: 'all',
    tags: ['heal'] as EffectTag[],
    output: [],
    onHurt: {
      victim: 'ally',
      applyTo: 'victim',
      rate: 0.5,
      startRound: 4,
      onlyIfActed: true,
      output: [{ kind: 'heal', ...healOf(225, 20), strategyScaled: true }],
    },
  } satisfies PassiveSkill,
  bj_550004: prep({
    id: 'bj_550004',
    name: '般若',
    range: 2,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['heal'],
    output: [],
    afterAllyCast: { kinds: ['active'], startRound: 4, output: [{ kind: 'heal', ...healOf(325, 40), strategyScaled: true }] },
  }),
  bj_550005: prep({
    id: 'bj_550005',
    name: '禅悟',
    range: 2,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['heal'],
    output: [],
    afterAllyCast: { kinds: ['pursuit'], startRound: 4, output: [{ kind: 'heal', ...healOf(225, 50), strategyScaled: true }] },
  }),
  bj_550006: prep({
    id: 'bj_550006',
    name: '清净',
    range: 2,
    targetMode: 'group',
    groupCount: 2,
    targetSide: 'ally',
    tags: ['damage_reduce'],
    output: [],
    delayedOutputs: [{ atRound: 4, output: [reduce(60, 10, 999)] }],
  }),
  bj_550008: prep({
    id: 'bj_550008',
    name: '靖边·镇静',
    range: 5,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['immunity'],
    castChance: 0.45,
    output: [{ kind: 'remove_debuffs' }],
  }),
  bj_550009: prep({
    id: 'bj_550009',
    name: '靖边·奋击',
    range: 5,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['damage_boost'],
    /** f9=2 为可用次数；f3=1 未采用。 */
    output: [{
      kind: 'inflict_status',
      status: { type: 'damage_boost', rate: 0.8, duration: 999, direction: 'caused', damageType: 'physical', charges: 2 },
    }],
  }),
  bj_550010: prep({
    id: 'bj_550010',
    name: '挫锐·破防',
    range: 5,
    targetMode: 'single',
    tags: ['defense_buff', 'speed_buff'],
    output: (['defense_buff', 'speed_buff'] as const).map((type) => ({
      kind: 'inflict_status' as const,
      status: { type, ...attrDown(5000, 1000), attackScaled: true, duration: 1 },
    })),
  }),
  bj_550011: prep({
    id: 'bj_550011',
    name: '挫锐·连击',
    range: 4,
    targetMode: 'single',
    tags: ['damage'],
    output: [dmg(80, { targetMode: 'single', repeats: [2, 4] })],
  }),
  bj_550012: prep({
    id: 'bj_550012',
    name: '选锋·破甲',
    range: 5,
    targetMode: 'group',
    groupCount: 2,
    tags: ['damage_boost'],
    output: [{
      kind: 'inflict_status',
      status: { type: 'damage_boost', ...pct(25, 5), duration: 1, direction: 'taken', damageType: 'physical', attackScaled: true, growthRate: pct(25, 5).growthRate },
    }],
  }),
  bj_550013: prep({
    id: 'bj_550013',
    name: '选锋·突击',
    range: 5,
    targetMode: 'group',
    groupCount: 2,
    tags: ['damage'],
    output: [dmg(120, { targetMode: 'group', groupCount: 2 })],
  }),
  bj_550014: prep({
    id: 'bj_550014',
    name: '振旅·压阵',
    range: 5,
    targetMode: 'group',
    groupCount: 2,
    tags: ['damage_boost'],
    output: [{
      kind: 'inflict_status',
      status: {
        type: 'damage_boost',
        rate: -pct(25, 5).rate,
        growthRate: pct(25, 5).growthRate,
        duration: 1,
        direction: 'caused',
        attackScaled: true,
      },
    }],
  }),
  bj_550015: prep({
    id: 'bj_550015',
    name: '振旅·破军',
    range: 5,
    targetMode: 'single',
    tags: ['damage'],
    output: [dmg(150, { targetPick: 'lowest_defense' })],
  }),
  bj_550016: prep({
    id: 'bj_550016',
    name: '坚壁·固守',
    range: 5,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['damage_reduce'],
    output: [{
      kind: 'inflict_status',
      status: { type: 'damage_reduce', ...pct(40, 4), duration: 1, attackScaled: true },
    }],
  }),
  bj_550017: prep({
    id: 'bj_550017',
    name: '坚壁·反击',
    range: 5,
    targetMode: 'single',
    tags: ['damage'],
    output: [dmg(180)],
  }),
  bj_550021: prep({
    id: 'bj_550021',
    name: '汪汪汪',
    range: 5,
    targetMode: 'self',
    tags: ['split'],
    output: [],
    /** 全红取概率区间上界 70%（f14=30, f15=70）。 */
    onActSegments: [{ rate: 0.7, output: [{ kind: 'inflict_status', target: 'self', status: { type: 'split', rate: 60, duration: 1 } }] }],
  }),
  bj_550022: prep({
    id: 'bj_550022',
    name: '嗷呜',
    range: 4,
    targetMode: 'single',
    tags: ['damage'],
    output: [],
    onActSegments: [{ rate: 0.4, output: [dmg(80, { targetMode: 'single', range: 4 })] }],
  }),
  bj_550028: prep({
    id: 'bj_550028',
    name: '鹿鸣',
    range: 2,
    targetMode: 'group',
    groupCount: 2,
    targetSide: 'ally',
    tags: ['evasion'],
    /** 槽位与战法行概率都是 100，全红按必发。 */
    output: [{ kind: 'inflict_status', status: { type: 'evasion', stacks: 1 } }],
  }),
  bj_550029: prep({
    id: 'bj_550029',
    name: '鹿踪',
    range: 2,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['heal'],
    output: [{ kind: 'heal', ...healOf(160, 16), strategyScaled: true }],
  }),
  bj_550030: prep({
    id: 'bj_550030',
    name: '鹿影',
    range: 2,
    targetMode: 'group',
    groupCount: 2,
    targetSide: 'ally',
    tags: ['damage_reduce'],
    /** 文案有持续回合，槽位无 f28。先挂到战斗结束。 */
    output: [reduce(70, 7, 999)],
  }),
  bj_550032: prep({
    id: 'bj_550032',
    name: '息交·守御',
    range: 2,
    targetMode: 'group',
    groupCount: 2,
    targetSide: 'ally',
    tags: ['damage_reduce'],
    output: [],
    initialOutput: [reduce(50, 20, 3, { damageType: 'physical' })],
  }),
  bj_550033: prep({
    id: 'bj_550033',
    name: '息交·避策',
    range: 2,
    targetMode: 'group',
    groupCount: 2,
    targetSide: 'ally',
    tags: ['damage_reduce'],
    output: [],
    /** 子技能 f13=9000 = 大幅降低，沿用本引擎 90% 减伤下限口径；次数 f3=f9=2。 */
    onActSegments: [{
      startRound: 1,
      endRound: 3,
      rate: 0.45,
      output: [{
        kind: 'inflict_status',
        targetSide: 'ally',
        targetMode: 'group',
        groupCount: 2,
        status: { type: 'damage_reduce', rate: 0.9, duration: 1, damageType: 'strategy', charges: 2 },
      }],
    }],
  }),
  bj_550034: prep({
    id: 'bj_550034',
    name: '守拙·援护',
    range: 2,
    targetMode: 'self',
    tags: ['immunity'],
    output: [],
    onActSegments: [{
      startRound: 1,
      endRound: 3,
      rate: 0.45,
      output: [{ kind: 'inflict_status', target: 'self', status: { type: 'cover', duration: 1 } }],
    }],
  }),
  bj_550035: prep({
    id: 'bj_550035',
    name: '守拙·规避',
    range: 2,
    targetMode: 'self',
    tags: ['evasion'],
    output: [{
      kind: 'inflict_status',
      target: 'self',
      status: { type: 'evade_chance', rate: 0.4, charges: 8, duration: 3 },
    }],
  }),
  bj_550036: prep({
    id: 'bj_550036',
    name: '晏如',
    range: 2,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['damage_reduce'],
    output: [reduce(50, 20, 4, { skillTypes: ['active'] })],
  }),
  bj_550037: prep({
    id: 'bj_550037',
    name: '结庐',
    range: 2,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['damage_reduce'],
    output: [reduce(50, 20, 4, { damageSource: 'basic' })],
  }),
  bj_550038: prep({
    id: 'bj_550038',
    name: '挂印',
    range: 2,
    targetMode: 'all',
    targetSide: 'ally',
    tags: ['damage_reduce'],
    output: [reduce(50, 20, 4, { skillTypes: ['command'] })],
  }),
};

/** 一名百家武将。属性是原基础值（未成长）。 */
export interface BaijiaHero {
  id: string;
  name: string;
  faction: string;
  troopType: TroopType;
  cost: number;
  attack: number;
  defense: number;
  strategy: number;
  speed: number;
  sets: { id: string; name: string; skillIds: string[] }[];
}

/** 五名百家。汪只有攻城，战斗侧为空。 */
export const BAIJIA_HEROES: Record<string, BaijiaHero> = {
  '140001': {
    id: '140001', name: '朱士行', faction: '魏', troopType: 'infantry', cost: 25,
    attack: 5, defense: 12, strategy: 13, speed: 6,
    sets: [
      { id: 'cibei', name: '慈悲', skillIds: ['bj_550002'] },
      { id: 'tiaofu', name: '调伏', skillIds: ['bj_550003'] },
      { id: 'bore', name: '般若', skillIds: ['bj_550004'] },
      { id: 'chanwu', name: '禅悟', skillIds: ['bj_550005'] },
      { id: 'qingjing', name: '清净', skillIds: ['bj_550006'] },
    ],
  },
  '140002': {
    id: '140002', name: '张恭', faction: '魏', troopType: 'cavalry', cost: 30,
    attack: 18, defense: 12, strategy: 8, speed: 9,
    sets: [
      { id: 'jingbian', name: '靖边', skillIds: ['bj_550008', 'bj_550009'] },
      { id: 'cuorui', name: '挫锐', skillIds: ['bj_550010', 'bj_550011'] },
      { id: 'xuanfeng', name: '选锋', skillIds: ['bj_550012', 'bj_550013'] },
      { id: 'zhenlv', name: '振旅', skillIds: ['bj_550014', 'bj_550015'] },
      { id: 'jianbi', name: '坚壁', skillIds: ['bj_550016', 'bj_550017'] },
    ],
  },
  '140003': {
    id: '140003', name: '麦子', faction: '汉', troopType: 'cavalry', cost: 20,
    attack: 18, defense: 11, strategy: 5, speed: 23,
    sets: [
      { id: 'wang', name: '汪', skillIds: [] },
      { id: 'wangwang', name: '汪汪汪', skillIds: ['bj_550021'] },
      { id: 'aowu', name: '嗷呜', skillIds: ['bj_550022'] },
    ],
  },
  '140004': {
    id: '140004', name: '九色鹿', faction: '群', troopType: 'cavalry', cost: 25,
    attack: 9, defense: 21, strategy: 24, speed: 30,
    sets: [
      { id: 'luming', name: '鹿鸣', skillIds: ['bj_550028'] },
      { id: 'luzong', name: '鹿踪', skillIds: ['bj_550029'] },
      { id: 'luying', name: '鹿影', skillIds: ['bj_550030'] },
    ],
  },
  '140005': {
    id: '140005', name: '陶渊明', faction: '晋', troopType: 'archer', cost: 30,
    attack: 7, defense: 14, strategy: 15, speed: 11,
    sets: [
      { id: 'xijiao', name: '息交', skillIds: ['bj_550032', 'bj_550033'] },
      { id: 'shouzhuo', name: '守拙', skillIds: ['bj_550034', 'bj_550035'] },
      { id: 'yanru', name: '晏如', skillIds: ['bj_550036'] },
      { id: 'jielu', name: '结庐', skillIds: ['bj_550037'] },
      { id: 'guayin', name: '挂印', skillIds: ['bj_550038'] },
    ],
  },
};
