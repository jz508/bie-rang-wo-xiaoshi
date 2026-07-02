import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import IndexRoute from "../../app/index";
import { ThemeProvider } from "../theme/ThemeProvider";

type RenderResult = Awaited<ReturnType<typeof render>>;
const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 24 },
};

function renderShell() {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <ThemeProvider>
        <IndexRoute />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

async function login(view: RenderResult) {
  await fireEvent.changeText(view.getByLabelText("手机号"), "13900139000");
  await waitFor(() => {
    expect(view.getByLabelText("手机号")).toHaveProp("value", "13900139000");
  });
  await fireEvent.changeText(view.getByLabelText("测试码"), "1234");
  await fireEvent.press(view.getByText("登录"));
  await waitFor(() => {
    expect(view.getByText("失联时间")).toBeTruthy();
  });
}

async function openSettings(view: RenderResult) {
  await fireEvent.press(view.getByLabelText("设置"));
  await waitFor(() => {
    expect(view.getByText("夜间模式")).toBeTruthy();
  });
}

async function addConfirmedContact(view: RenderResult) {
  await fireEvent.press(view.getByLabelText("添加联系人"));
  await waitFor(() => {
    expect(view.getByText("添加联系人")).toBeTruthy();
  });
  await fireEvent.changeText(view.getByLabelText("联系人姓名"), "周宁");
  await fireEvent.changeText(view.getByLabelText("联系人电话"), "13700137000");
  await fireEvent.changeText(view.getByLabelText("联系人邮箱"), "zhouning@example.com");
  await fireEvent.press(view.getByText("发送邀请"));
  await waitFor(() => {
    expect(view.getByText("联系人已确认")).toBeTruthy();
  });
  await fireEvent.press(view.getByText("返回设置"));
  await waitFor(() => {
    expect(view.getAllByText("周宁").length).toBeGreaterThan(0);
  });
}

describe("mobile app shell flow", () => {
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "https://brwxs.com/api/contacts" && options?.method === "GET") {
        return {
          json: async () => ({ contacts: [] }),
          ok: true,
          status: 200,
        };
      }
      if (url === "https://brwxs.com/api/contacts/invite") {
        return {
          json: async () => ({
            contact: {
              displayName: "周宁",
              email: "zhouning@example.com",
              id: "contact-1",
              phone: "13700137000",
              status: "confirmed",
            },
          }),
          ok: true,
          status: 200,
        };
      }
      return {
        json: async () => ({}),
        ok: true,
        status: 200,
      };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await AsyncStorage.clear();
  });

  it("matches the web prototype order: login, time setup, then guard screen", async () => {
    const view = await renderShell();

    expect(view.getByText("别让我消失")).toBeTruthy();
    expect(view.getByText("登录")).toBeTruthy();

    await login(view);

    expect(view.getByText("2 小时 15 分钟")).toBeTruthy();
    expect(view.getByText("联系人")).toBeTruthy();
    expect(view.getByText("预案")).toBeTruthy();
    expect(view.getByText("添加并确认联系人后可开始")).toBeTruthy();

    await openSettings(view);
    await addConfirmedContact(view);
    await fireEvent.press(view.getByText("保存并返回"));

    await fireEvent.press(view.getByText("开始守护"));

    expect(view.getByText("守护中")).toBeTruthy();
    expect(view.getByText("如果我没有回来确认")).toBeTruthy();
    expect(view.getByText("02:15:00")).toBeTruthy();
    expect(view.getByText("我还在")).toBeTruthy();
  });

  it("shows a shareable confirmation link when SMS delivery is unavailable", async () => {
    const confirmationUrl = "https://brwxs.com/c/manual-token";
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "https://brwxs.com/api/contacts" && options?.method === "GET") {
        return {
          json: async () => ({ contacts: [] }),
          ok: true,
          status: 200,
        };
      }
      if (url === "https://brwxs.com/api/contacts/invite") {
        return {
          json: async () => ({
            confirmationUrl,
            contact: {
              displayName: "周宁",
              email: "zhouning@example.com",
              id: "contact-1",
              phone: "13700137000",
              status: "pending",
            },
          }),
          ok: true,
          status: 200,
        };
      }
      return {
        json: async () => ({}),
        ok: true,
        status: 200,
      };
    });

    const view = await renderShell();
    await login(view);
    await openSettings(view);

    await fireEvent.press(view.getByLabelText("添加联系人"));
    await fireEvent.changeText(view.getByLabelText("联系人姓名"), "周宁");
    await fireEvent.changeText(view.getByLabelText("联系人电话"), "13700137000");
    await fireEvent.changeText(view.getByLabelText("联系人邮箱"), "zhouning@example.com");
    await fireEvent.press(view.getByText("发送邀请"));

    await waitFor(() => {
      expect(view.getByText("等待周宁确认")).toBeTruthy();
      expect(view.getByText(confirmationUrl)).toBeTruthy();
    });

    await fireEvent.press(view.getByText("分享确认链接"));

    expect(shareSpy).toHaveBeenCalledWith({
      message: `周宁，请打开这个链接确认成为我的紧急联系人：${confirmationUrl}`,
      title: "确认紧急联系人",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://brwxs.com/api/contacts/invite",
      expect.objectContaining({
        body: JSON.stringify({
          deliveryMode: "manual",
          displayName: "周宁",
          email: "zhouning@example.com",
          phone: "13700137000",
        }),
      }),
    );
  });

  it("saves settings from the sheet and confirms safety through the code modal", async () => {
    const view = await renderShell();
    await login(view);

    await openSettings(view);
    await addConfirmedContact(view);
    await fireEvent.changeText(view.getByLabelText("短备注"), "备用钥匙在物业");
    await fireEvent.press(view.getByText("保存并返回"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://brwxs.com/api/messages/review",
        expect.objectContaining({
          body: JSON.stringify({
            templateKey: "find_me",
            shortNote: "备用钥匙在物业",
          }),
        }),
      );
    });

    await fireEvent.press(view.getByText("开始守护"));
    await fireEvent.press(view.getByText("我还在"));
    await fireEvent.changeText(view.getByLabelText("确认码"), "1234");
    await fireEvent.press(view.getByText("确认"));

    await waitFor(() => {
      expect(view.getByText(/已确认安全，\d+s 后回到首页/)).toBeTruthy();
    });
  });

  it("keeps night mode as a three-segment control in the main settings sheet", async () => {
    const view = await renderShell();
    await login(view);

    await openSettings(view);

    expect(view.getByText("关闭")).toBeTruthy();
    expect(view.getByText("自动")).toBeTruthy();
    expect(view.getByText("开启")).toBeTruthy();

    await fireEvent.press(view.getByText("开启"));

    await waitFor(() => {
      expect(view.getByText("别让我消失")).toHaveStyle({
        color: "#F2F4F3",
      });
    });
  });

  it("uses stored automatic night mode by local time", async () => {
    const getHoursSpy = jest.spyOn(Date.prototype, "getHours").mockReturnValue(22);

    await AsyncStorage.setItem("bie-rang-wo-xiaoshi:night-mode", "auto");
    const view = await renderShell();

    await waitFor(() => {
      expect(view.getByText("别让我消失")).toHaveStyle({
        color: "#F2F4F3",
      });
    });

    getHoursSpy.mockRestore();
  });

  it("persists automatic night mode from the settings sheet", async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, "setItem");
    const view = await renderShell();
    await login(view);

    await openSettings(view);
    await fireEvent.press(view.getByText("自动"));

    expect(setItemSpy).toHaveBeenCalledWith("bie-rang-wo-xiaoshi:night-mode", "auto");
  });
});
