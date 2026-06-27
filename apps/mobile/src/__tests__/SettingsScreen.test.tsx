import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import SettingsRoute from "../../app/settings";
import { ThemeProvider } from "../theme/ThemeProvider";
import { themes } from "../theme/tokens";

const NIGHT_MODE_KEY = "bie-rang-wo-xiaoshi:night-mode";

function renderSettingsRoute() {
  return render(
    <ThemeProvider>
      <SettingsRoute />
    </ThemeProvider>,
  );
}

describe("SettingsScreen", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("renders night mode off by default with light theme content", async () => {
    const view = await renderSettingsRoute();

    expect(view.getByText("夜间模式")).toBeTruthy();
    expect(view.getByText("打开后使用深色背景，降低夜间查看时的刺眼感。")).toBeTruthy();
    expect(view.getByRole("switch", { name: "夜间模式" })).toHaveProp("value", false);
    expect(view.getByTestId("settings-screen")).toHaveStyle({
      backgroundColor: themes.light.background,
    });
  });

  it("switches to night theme when night mode is toggled", async () => {
    const view = await renderSettingsRoute();

    await fireEvent(view.getByRole("switch", { name: "夜间模式" }), "onValueChange", true);

    expect(view.getByRole("switch", { name: "夜间模式" })).toHaveProp("value", true);
    expect(view.getByTestId("settings-screen")).toHaveStyle({
      backgroundColor: themes.night.background,
    });
  });

  it("loads stored night mode", async () => {
    await AsyncStorage.setItem(NIGHT_MODE_KEY, "night");

    const view = await renderSettingsRoute();

    await waitFor(() => {
      expect(view.getByRole("switch", { name: "夜间模式" })).toHaveProp("value", true);
      expect(view.getByTestId("settings-screen")).toHaveStyle({
        backgroundColor: themes.night.background,
      });
    });
  });

  it("falls back to light mode for invalid stored values", async () => {
    await AsyncStorage.setItem(NIGHT_MODE_KEY, "invalid");

    const view = await renderSettingsRoute();

    await waitFor(() => {
      expect(view.getByRole("switch", { name: "夜间模式" })).toHaveProp("value", false);
      expect(view.getByTestId("settings-screen")).toHaveStyle({
        backgroundColor: themes.light.background,
      });
    });
  });

  it("persists settings changes through shared theme state", async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, "setItem");

    const view = await renderSettingsRoute();

    await fireEvent(view.getByRole("switch", { name: "夜间模式" }), "onValueChange", true);

    expect(setItemSpy).toHaveBeenCalledWith(NIGHT_MODE_KEY, "on");
  });

  it("keeps selected state when saving the setting fails", async () => {
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("save failed"));

    const view = await renderSettingsRoute();

    await fireEvent(view.getByRole("switch", { name: "夜间模式" }), "onValueChange", true);

    expect(view.getByRole("switch", { name: "夜间模式" })).toHaveProp("value", true);
    expect(view.getByTestId("settings-screen")).toHaveStyle({
      backgroundColor: themes.night.background,
    });
  });
});
