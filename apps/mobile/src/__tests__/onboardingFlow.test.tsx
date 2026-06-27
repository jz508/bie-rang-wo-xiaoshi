import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
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

describe("mobile app shell flow", () => {
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
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

    await fireEvent.press(view.getByText("开始守护"));

    expect(view.getByText("守护中")).toBeTruthy();
    expect(view.getByText("如果我没有回来确认")).toBeTruthy();
    expect(view.getByText("02:15:00")).toBeTruthy();
    expect(view.getByText("我还在")).toBeTruthy();
  });

  it("saves settings from the sheet and confirms safety through the code modal", async () => {
    const view = await renderShell();
    await login(view);

    await openSettings(view);
    await fireEvent.changeText(view.getByLabelText("短备注"), "备用钥匙在物业");
    await fireEvent.press(view.getByText("保存并返回"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://bie-rang-wo-xiaoshi-web.vercel.app/api/messages/review",
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
