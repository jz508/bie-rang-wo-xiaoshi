import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import IndexRoute from "../../app/index";
import { HomeScreen } from "../screens/HomeScreen";
import { ThemeProvider } from "../theme/ThemeProvider";

const NIGHT_MODE_KEY = "bie-rang-wo-xiaoshi:night-mode";
const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 24 },
};

jest.setTimeout(30000);

function renderWithSafeArea(children: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={safeAreaMetrics}>{children}</SafeAreaProvider>);
}

async function login() {
  await fireEvent.changeText(screen.getByLabelText("手机号"), "13900139000");
  await waitFor(() => {
    expect(screen.getByLabelText("手机号")).toHaveProp("value", "13900139000");
  });
  await fireEvent.changeText(screen.getByLabelText("测试码"), "1234");
  await fireEvent.press(screen.getByText("登录"));
  await waitFor(() => {
    expect(screen.getByText("失联时间")).toBeTruthy();
  });
}

async function openSettings() {
  await fireEvent.press(screen.getByLabelText("设置"));
  await waitFor(() => {
    expect(screen.getByText("夜间模式")).toBeTruthy();
  });
}

async function addContact({
  email = "zhouning@example.com",
  name = "周宁",
  phone = "13700137000",
}: {
  email?: string;
  name?: string;
  phone?: string;
} = {}) {
  await fireEvent.press(screen.getByLabelText("添加联系人"));
  await waitFor(() => {
    expect(screen.getByText("添加联系人")).toBeTruthy();
  });
  await fireEvent.changeText(screen.getByLabelText("联系人姓名"), name);
  await fireEvent.changeText(screen.getByLabelText("联系人电话"), phone);
  await fireEvent.changeText(screen.getByLabelText("联系人邮箱"), email);
  await fireEvent.press(screen.getByText("发送邀请"));
}

describe("HomeScreen", () => {
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();
    fetchMock.mockResolvedValue({
      json: async () => ({ contacts: [] }),
      ok: true,
      status: 200,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await AsyncStorage.clear();
  });

  it("starts from login and then shows the clean time setup screen", async () => {
    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" />);

    expect(screen.getByText("别让我消失")).toBeTruthy();
    expect(screen.getByLabelText("手机号")).toBeTruthy();
    expect(screen.getByLabelText("测试码")).toBeTruthy();
    expect(screen.queryByText("守护中")).toBeNull();

    await login();

    expect(screen.getByText("2 小时 15 分钟")).toBeTruthy();
    expect(screen.getByText("添加并确认联系人后可开始")).toBeTruthy();
    expect(screen.getByText("未添加")).toBeTruthy();
    expect(screen.queryByText("陈默")).toBeNull();
  });

  it("keeps the transition login local and rejects a wrong test code", async () => {
    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" />);

    await fireEvent.changeText(screen.getByLabelText("手机号"), "13900139000");
    await fireEvent.changeText(screen.getByLabelText("测试码"), "0000");
    await fireEvent.press(screen.getByText("登录"));

    expect(screen.getByText("测试码不正确")).toBeTruthy();
    expect(screen.queryByText("失联时间")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts with empty contacts and shows the waiting confirmation screen after adding one", async () => {
    let refreshShouldConfirm = false;
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "https://app.test/api/contacts/invite") {
        return {
          json: async () => ({
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
      if (url === "https://app.test/api/contacts" && options?.method === "GET") {
        return {
          json: async () => ({
            contacts: refreshShouldConfirm
              ? [
                  {
                    displayName: "周宁",
                    email: "zhouning@example.com",
                    id: "contact-1",
                    phone: "13700137000",
                    status: "confirmed",
                  },
                ]
              : [],
          }),
          ok: true,
          status: 200,
        };
      }

      return {
        json: async () => ({ contacts: [] }),
        ok: true,
        status: 200,
      };
    });

    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" userId="user-1" />);
    await login();

    await openSettings();

    expect(screen.getByText("关闭")).toBeTruthy();
    expect(screen.getByText("自动")).toBeTruthy();
    expect(screen.getByText("开启")).toBeTruthy();
    expect(screen.getAllByText("联系人").length).toBeGreaterThan(0);
    expect(screen.getByText("还没有联系人")).toBeTruthy();
    expect(screen.getByText("失联预案")).toBeTruthy();

    await addContact();

    await waitFor(() => {
      expect(screen.getByText("等待周宁确认")).toBeTruthy();
    });
    expect(screen.getByText("邀请已发送")).toBeTruthy();
    expect(screen.getByText("确认后才能用于失联提醒")).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://app.test/api/contacts/invite",
        expect.objectContaining({
          body: JSON.stringify({
            deliveryMode: "manual",
            displayName: "周宁",
            email: "zhouning@example.com",
            phone: "13700137000",
          }),
          method: "POST",
        }),
      );
    });

    refreshShouldConfirm = true;
    await fireEvent.press(screen.getByText("刷新状态"));
    await waitFor(() => {
      expect(screen.getByText("联系人已确认")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("返回设置"));
    expect(screen.getByText("周宁")).toBeTruthy();
    expect(screen.getByText("已确认")).toBeTruthy();
  });

  it("does not show a waiting confirmation screen when the invite fails", async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "https://app.test/api/contacts" && options?.method === "GET") {
        return {
          json: async () => ({ contacts: [] }),
          ok: true,
          status: 200,
        };
      }
      if (url === "https://app.test/api/contacts/invite") {
        return {
          json: async () => ({ error: "SMS provider is not configured" }),
          ok: false,
          status: 503,
        };
      }

      return {
        json: async () => ({}),
        ok: true,
        status: 200,
      };
    });

    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" userId="user-1" />);
    await login();
    await openSettings();
    await addContact();

    await waitFor(() => {
      expect(screen.getByText("邀请没有发送成功，请稍后再试。")).toBeTruthy();
    });
    expect(screen.queryByText("等待周宁确认")).toBeNull();
    expect(screen.queryByText("邀请已发送")).toBeNull();
  });

  it("does not show a waiting confirmation screen when the invite response is missing a contact", async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "https://app.test/api/contacts" && options?.method === "GET") {
        return {
          json: async () => ({ contacts: [] }),
          ok: true,
          status: 200,
        };
      }
      if (url === "https://app.test/api/contacts/invite") {
        return {
          json: async () => ({}),
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

    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" userId="user-1" />);
    await login();
    await openSettings();
    await addContact();

    await waitFor(() => {
      expect(screen.getByText("邀请没有发送成功，请稍后再试。")).toBeTruthy();
    });
    expect(screen.queryByText("等待周宁确认")).toBeNull();
    expect(screen.queryByText("邀请已发送")).toBeNull();
  });

  it("requires a phone number before sending a contact invite", async () => {
    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" userId="user-1" />);
    await login();
    await openSettings();
    await fireEvent.press(screen.getByLabelText("添加联系人"));
    await waitFor(() => {
      expect(screen.getByText("添加联系人")).toBeTruthy();
    });
    await fireEvent.changeText(screen.getByLabelText("联系人姓名"), "周宁");
    await fireEvent.changeText(screen.getByLabelText("联系人邮箱"), "zhouning@example.com");
    await fireEvent.press(screen.getByText("发送邀请"));

    expect(screen.getByText("请填写姓名和手机号")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://app.test/api/contacts/invite",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("requires the safety code before confirming and then shows the recessed green safe state", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "https://app.test/api/contacts/invite") {
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
        json: async () => ({ contacts: [] }),
        ok: true,
        status: 200,
      };
    });
    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" userId="user-1" />);
    await login();
    await openSettings();
    await addContact();
    await waitFor(() => {
      expect(screen.getByText("联系人已确认")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("返回设置"));
    await fireEvent.changeText(screen.getByLabelText("短备注"), "备用钥匙在物业");
    await fireEvent.press(screen.getByText("保存并返回"));

    await fireEvent.press(screen.getByText("开始守护"));

    expect(screen.getByText("守护中")).toBeTruthy();
    expect(screen.getByText("如果我没有回来确认")).toBeTruthy();
    expect(screen.getByText("02:15:00")).toBeTruthy();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://app.test/api/countdown/confirm",
        expect.objectContaining({
          body: JSON.stringify({
            durationMinutes: 135,
          }),
          method: "POST",
        }),
      );
    });

    await fireEvent.press(screen.getByText("我还在"));
    expect(screen.getByText("确认安全")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("确认码"), "0000");
    await fireEvent.press(screen.getByText("确认"));
    expect(screen.getByText("确认码不正确")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("确认码"), "1234");
    await fireEvent.press(screen.getByText("确认"));

    await waitFor(() => {
      expect(screen.getByText(/已确认安全，\d+s 后回到首页/)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.test/api/countdown/pause",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
      }),
    );
  });

  it("moves to a triggered state when the countdown reaches zero", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "https://app.test/api/contacts/invite") {
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
        json: async () => ({ contacts: [] }),
        ok: true,
        status: 200,
      };
    });

    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" initialRemainingSeconds={1} userId="user-1" />);
    await login();
    await openSettings();
    await addContact();
    await waitFor(() => {
      expect(screen.getByText("联系人已确认")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("返回设置"));
    await fireEvent.press(screen.getByText("保存并返回"));
    await fireEvent.press(screen.getByText("开始守护"));

    await waitFor(
      () => {
        expect(screen.getByText("我可能已经失联")).toBeTruthy();
      },
      { timeout: 3000 },
    );
    expect(screen.getByText("正在通知已确认联系人")).toBeTruthy();
    expect(screen.getByText("已触发失联提醒")).toBeTruthy();
  });

  it("applies stored night mode to the app shell home route", async () => {
    await AsyncStorage.setItem(NIGHT_MODE_KEY, "night");

    await renderWithSafeArea(
      <ThemeProvider>
        <IndexRoute />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("别让我消失")).toHaveStyle({
        color: "#F2F4F3",
      });
    });
  });
});
