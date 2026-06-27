export const messageTemplates = [
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
] as const;

export type MessageTemplate = (typeof messageTemplates)[number];
export type MessageTemplateKey = MessageTemplate["key"];
