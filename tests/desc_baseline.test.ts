import { describe, expect, it } from 'vitest';

import descBaseline from '../web/data/desc_baseline.json';
import { SKILL_DESCS } from '../web/heroes';

/**
 * 描述数值校验守卫 —— 对着「包内参数基准」检查官方描述。
 *
 * 基准 `web/data/desc_baseline.json` 的来源：
 *   客户端资源表的槽位参数（f12 成长系数 / f13 常量项）按量纲规则算出效果值：
 *     属性类（f0 ∈ 101-105 / 201-205）：占位符不带 % → ÷100（点数）；带 % → ÷1000000（百分比）
 *     其余（伤害率 / 恢复率等）      ：f13 + f12 × 0.4（属性基准 80 / 200）
 *   只收录「包内算出值 == 描述里的数值」的条目（213 个战法 / 312 处），
 *   生成脚本：`stzb_reverse/tools/gen_desc_baseline.py`（对拍工具 `render_and_check_v3.py`）。
 *
 * ⚠️ 本测试保护的是「描述的数值口径」：
 *   - 有人手改描述把数值改错 → 红
 *   - 战法参数过时、与描述脱节 → 红
 *   若**有依据地**修改了数值（例如官方改版），应同步重跑生成脚本刷新基准，
 *   而不是把断言放宽 —— 基准是包内实测值，不是「当前实现」的快照。
 */
describe('战法描述数值 ↔ 包内参数基准', () => {
  const baseline = descBaseline as Record<string, Record<string, number>>;

  it('基准非空且条目数量级合理（防误删）', () => {
    const ids = Object.keys(baseline);
    expect(ids.length).toBeGreaterThan(200);
    expect(ids.length).toBeLessThanOrEqual(400);
  });

  it('每个基准值都必须出现在对应战法的官方描述里', () => {
    const problems: string[] = [];
    for (const [skillId, slots] of Object.entries(baseline)) {
      const desc = SKILL_DESCS[skillId]?.desc ?? '';
      if (!desc) {
        problems.push(`${skillId}：描述缺失`);
        continue;
      }
      const nums = new Set([...desc.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])));
      for (const [slot, expected] of Object.entries(slots)) {
        if (!nums.has(expected)) {
          problems.push(`${skillId} 槽${slot}：期望 ${expected}，描述里找不到（描述：${desc.slice(0, 40)}…）`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('基准里的战法都在 SKILL_DESCS 里（防漂移）', () => {
    const missing = Object.keys(baseline).filter((id) => !(id in SKILL_DESCS));
    expect(missing).toEqual([]);
  });

  it('基准值都是有限正数', () => {
    for (const slots of Object.values(baseline)) {
      for (const v of Object.values(slots)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });
});
