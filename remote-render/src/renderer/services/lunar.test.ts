import {describe, expect, test} from "vitest";

import {describeLunarDate} from "./lunar.js";

describe("lunar calendar", () => {
  test("maps well-known Spring Festivals to 正月初一/春节", () => {
    expect(describeLunarDate(2024, 2, 10)).toMatchObject({lunarDate: "正月初一", label: "春节"});
    expect(describeLunarDate(2025, 1, 29)).toMatchObject({lunarDate: "正月初一", label: "春节"});
    expect(describeLunarDate(2026, 2, 17)).toMatchObject({lunarDate: "正月初一", label: "春节"});
  });

  test("maps major lunar festivals", () => {
    expect(describeLunarDate(2026, 6, 19)).toMatchObject({lunarDate: "五月初五", label: "端午节"});
    expect(describeLunarDate(2026, 9, 25)).toMatchObject({lunarDate: "八月十五", label: "中秋节"});
    expect(describeLunarDate(2025, 10, 6)).toMatchObject({lunarDate: "八月十五", label: "中秋节"});
  });

  test("maps Gregorian public holidays", () => {
    expect(describeLunarDate(2026, 1, 1).label).toBe("元旦");
    expect(describeLunarDate(2026, 10, 1).label).toBe("国庆节");
    expect(describeLunarDate(2026, 5, 1).label).toBe("劳动节");
  });

  test("recognises solar terms", () => {
    expect(describeLunarDate(2026, 4, 5).label).toBe("清明");
    expect(describeLunarDate(2026, 6, 21).label).toBe("夏至");
    expect(describeLunarDate(2025, 12, 21).label).toBe("冬至");
  });

  test("formats an ordinary lunar day without a label", () => {
    const ordinary = describeLunarDate(2026, 6, 28);
    expect(ordinary.lunarDate).toMatch(/^[正二三四五六七八九十冬腊]月/);
    expect(ordinary.label).toBeUndefined();
  });
});
