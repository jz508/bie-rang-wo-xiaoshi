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

function renderWithSafeArea(children: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={safeAreaMetrics}>{children}</SafeAreaProvider>);
}

async function login() {
  await fireEvent.changeText(screen.getByLabelText("手机号"), "13900139000");
  await waitFor(() => {
    expect(screen.getByLabelText("手机号")).toHaveProp("value", "13900139000");
  });
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

describe("HomeScreen", () => {
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await AsyncStorage.clear();
  });

  it("starts from login and then shows the clean time setup screen", async () => {
    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" />);

    expect(screen.getByText("别让我消失")).toBeTruthy();
    expect(screen.getByLabelText("手机号")).toBeTruthy();
    expect(screen.queryByText("守护中")).toBeNull();

    await login();

    expect(screen.getByText("2 小时 15 分钟")).toBeTruthy();
    expect(screen.getByText("开始守护")).toBeTruthy();
    expect(screen.getByText("陈默、张三")).toBeTruthy();
  });

  it("keeps contacts and reserved messages inside the settings sheet", async () => {
    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" userId="user-1" />);
    await login();

    await openSettings();

    expect(screen.getByText("关闭")).toBeTruthy();
    expect(screen.getByText("自动")).toBeTruthy();
    expect(screen.getByText("开启")).toBeTruthy();
    expect(screen.getAllByText("联系人").length).toBeGreaterThan(0);
    expect(screen.getByText("失联预案")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("编辑联系人"));
    await waitFor(() => {
      expect(screen.getByLabelText("联系人1姓名")).toBeTruthy();
    });
    await fireEvent.changeText(screen.getByLabelText("联系人1姓名"), "周宁");
    await fireEvent.changeText(screen.getByLabelText("联系人1电话"), "13700137000");
    await fireEvent.changeText(screen.getByLabelText("联系人1邮箱"), "zhouning@example.com");
    await fireEvent.press(screen.getByLabelText("关闭联系人编辑"));
    await fireEvent.changeText(screen.getByLabelText("短备注"), "备用钥匙在物业");
    await fireEvent.press(screen.getByText("保存并返回"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://app.test/api/messages/review",
        expect.objectContaining({
          body: JSON.stringify({
            templateKey: "find_me",
            shortNote: "备用钥匙在物业",
          }),
          method: "POST",
        }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.test/api/contacts/invite",
      expect.objectContaining({
        body: expect.stringContaining('"displayName":"周宁"'),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.test/api/contacts/invite",
      expect.objectContaining({
        body: expect.stringContaining('"phone":"13700137000"'),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.test/api/contacts/invite",
      expect.objectContaining({
        body: expect.stringContaining('"email":"zhouning@example.com"'),
        method: "POST",
      }),
    );
  });

  it("requires the safety code before confirming and then shows the recessed green safe state", async () => {
    await renderWithSafeArea(<HomeScreen apiBaseUrl="https://app.test" userId="user-1" />);
    await login();

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
