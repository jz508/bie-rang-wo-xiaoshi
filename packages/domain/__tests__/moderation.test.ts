import { describe, expect, it } from "vitest";
import { messageTemplates } from "../src/messageTemplates";
import { reviewShortNote } from "../src/moderation";

describe("messageTemplates", () => {
  it("exports the fixed Phase 0 templates", () => {
    expect(messageTemplates).toEqual([
      {
        key: "contact_or_find_me",
        text: "请联系我，或者来找我。",
      },
      {
        key: "contact_family_first",
        text: "如果联系不上我，请先联系我的家人。",
      },
      {
        key: "help_confirm_situation",
        text: "我可能遇到了一些情况，请帮我确认一下。",
      },
    ]);
  });
});

describe("reviewShortNote", () => {
  it("accepts an empty note", () => {
    expect(reviewShortNote("").status).toBe("approved");
  });

  it("accepts a normal human short note", () => {
    expect(reviewShortNote("备用钥匙在物业，请先联系我妈妈。").status).toBe("approved");
  });

  it("rejects notes longer than 50 characters", () => {
    expect(reviewShortNote("备".repeat(51)).status).toBe("rejected");
  });

  it("rejects URL links", () => {
    expect(reviewShortNote("打开 https://example.com 看详情").status).toBe("rejected");
  });

  it("rejects www links", () => {
    expect(reviewShortNote("打开 www.example.com 看详情").status).toBe("rejected");
  });

  it("rejects long digit phone-like content", () => {
    expect(reviewShortNote("请打 13800138000 找我").status).toBe("rejected");
  });

  it.each(["WeChat", "wechat", "微信", "VX", "QQ"])(
    "rejects contact channel term: %s",
    (note) => {
      expect(reviewShortNote(note).status).toBe("rejected");
    },
  );

  it.each(["jobs", "loan", "gambling", "lottery", "discount"])(
    "rejects English abuse category term: %s",
    (term) => {
      expect(reviewShortNote(`This note mentions ${term}`).status).toBe("rejected");
    },
  );

  it.each(["彩票中奖", "赌博平台", "QR码进群", "扫码入群"])(
    "rejects QR group and gambling-like content: %s",
    (note) => {
      expect(reviewShortNote(note).status).toBe("rejected");
    },
  );

  it.each([
    "邮箱",
    "二维码",
    "群号",
    "加群",
    "优惠",
    "折扣",
    "代理",
    "返现",
    "招聘",
    "兼职",
    "贷款",
    "博彩",
  ])("rejects disallowed term %s", (term) => {
    expect(reviewShortNote(`这里包含${term}`).status).toBe("rejected");
  });
});
