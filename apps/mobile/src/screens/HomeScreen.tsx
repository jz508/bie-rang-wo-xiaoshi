import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import {
  isAutomaticNightModeActive,
  type NightModePreference,
} from "../theme/nightMode";
import { spacing, themes, typography, type ThemeName } from "../theme/tokens";

type ContactOption = {
  email: string;
  enabled: boolean;
  id: string;
  name: string;
  phone: string;
};

type TemplateOption = {
  key: string;
  text: string;
};

type HomeScreenProps = {
  apiBaseUrl?: string;
  nightModePreference?: NightModePreference;
  themeName?: ThemeName;
  userId?: string;
  onNightModePreferenceChange?: (preference: NightModePreference) => void;
  onThemeNameChange?: (themeName: ThemeName) => void;
};

const confirmCode = "1234";
const safetyReturnSeconds = 5;
const wheelItemHeight = 42;

const nightModeOptions: Array<{ label: string; value: NightModePreference }> = [
  { label: "关闭", value: "off" },
  { label: "自动", value: "auto" },
  { label: "开启", value: "on" },
];

const initialContacts: ContactOption[] = [
  {
    email: "chenmo@example.com",
    enabled: true,
    id: "chen-mo",
    name: "陈默",
    phone: "139 0013 9000",
  },
  {
    email: "zhangsan@example.com",
    enabled: true,
    id: "zhang-san",
    name: "张三",
    phone: "138 0013 9000",
  },
  {
    email: "lisi@example.com",
    enabled: false,
    id: "li-si",
    name: "李四",
    phone: "137 0013 9000",
  },
];

const templates: TemplateOption[] = [
  {
    key: "find_me",
    text: "请联系我，或者来找我。",
  },
  {
    key: "family_first",
    text: "如果联系不上我，请先联系我的家人。",
  },
  {
    key: "confirm_safety",
    text: "我可能遇到了一些情况，请帮我确认一下。",
  },
];

export function HomeScreen({
  apiBaseUrl = "http://localhost:3000",
  nightModePreference: controlledNightModePreference,
  onNightModePreferenceChange,
  onThemeNameChange,
  themeName = "light",
  userId = "demo-user",
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const [loggedIn, setLoggedIn] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [loginCodeInput, setLoginCodeInput] = useState("");
  const [hours, setHours] = useState(2);
  const [minutes, setMinutes] = useState(15);
  const [planStarted, setPlanStarted] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(135 * 60);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contactEditorOpen, setContactEditorOpen] = useState(false);
  const [contacts, setContacts] = useState(initialContacts);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(templates[0].key);
  const [note, setNote] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmCodeInput, setConfirmCodeInput] = useState("");
  const [confirmCodeError, setConfirmCodeError] = useState("");
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [returnCountdown, setReturnCountdown] = useState(safetyReturnSeconds);
  const [localNightModePreference, setLocalNightModePreference] = useState<NightModePreference>(
    themeName === "night" ? "on" : "off",
  );
  const [automaticNightModeActive, setAutomaticNightModeActive] = useState(() => isAutomaticNightModeActive());
  const homeEntrance = useRef(new Animated.Value(0)).current;
  const nightModePreference = controlledNightModePreference ?? localNightModePreference;

  const nightMode =
    nightModePreference === "on" ||
    (nightModePreference === "auto" && automaticNightModeActive) ||
    themeName === "night";
  const palette = nightMode ? palettes.night : palettes.light;
  const enabledContacts = contacts.filter((contact) => contact.enabled);
  const reachableContacts = enabledContacts.filter(
    (contact) => contact.name.trim() && (contact.phone.trim() || contact.email.trim()),
  );
  const selectedTemplate = templates.find((template) => template.key === selectedTemplateKey) ?? templates[0];
  const durationMinutes = hours * 60 + minutes;
  const canLogin = phoneInput.trim().length >= 5;
  const canStart = durationMinutes > 0 && reachableContacts.length > 0;
  const previewMessage = [selectedTemplate.text, note.trim()].filter(Boolean).join(" ");
  const contactDisplay = enabledContacts.map((contact) => contact.name.trim() || "未命名").join("、") || "未开启";

  useEffect(() => {
    if (!planStarted || safetyConfirmed) {
      return;
    }

    const intervalId = setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [planStarted, safetyConfirmed]);

  useEffect(() => {
    if (nightModePreference !== "auto") {
      return undefined;
    }

    const syncAutomaticNightMode = () => {
      setAutomaticNightModeActive(isAutomaticNightModeActive());
    };
    const intervalId = setInterval(syncAutomaticNightMode, 60 * 1000);

    syncAutomaticNightMode();

    return () => clearInterval(intervalId);
  }, [nightModePreference]);

  useEffect(() => {
    if (!safetyConfirmed) {
      return;
    }

    setReturnCountdown(safetyReturnSeconds);
    const intervalId = setInterval(() => {
      setReturnCountdown((seconds) => Math.max(seconds - 1, 0));
    }, 1000);
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      setPlanStarted(false);
      setSafetyConfirmed(false);
      setConfirmCodeInput("");
      setConfirmCodeError("");
      setReturnCountdown(safetyReturnSeconds);
    }, safetyReturnSeconds * 1000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [safetyConfirmed]);

  useEffect(() => {
    if (!loggedIn) {
      homeEntrance.setValue(0);
      return;
    }

    Animated.timing(homeEntrance, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [homeEntrance, loggedIn]);

  function handleLogin() {
    if (canLogin) {
      setLoggedIn(true);
    }
  }

  function handleStartPlan() {
    if (!canStart) {
      return;
    }

    setRemainingSeconds(durationMinutes * 60);
    setConfirmDialogOpen(false);
    setConfirmCodeInput("");
    setConfirmCodeError("");
    setSafetyConfirmed(false);
    setPlanStarted(true);
  }

  function toggleContact(contactId: string) {
    setContacts((current) =>
      current.map((contact) =>
        contact.id === contactId
          ? {
              ...contact,
              enabled: !contact.enabled,
            }
          : contact,
      ),
    );
  }

  function updateContactField(contactId: string, field: "email" | "name" | "phone", value: string) {
    setContacts((current) =>
      current.map((contact) =>
        contact.id === contactId
          ? {
              ...contact,
              [field]: value,
            }
          : contact,
      ),
    );
  }

  function handleNightModeChange(preference: NightModePreference) {
    setLocalNightModePreference(preference);
    onNightModePreferenceChange?.(preference);

    if (onNightModePreferenceChange) {
      return;
    }

    if (preference === "on") {
      onThemeNameChange?.("night");
    } else if (preference === "off") {
      onThemeNameChange?.("light");
    } else {
      onThemeNameChange?.(isAutomaticNightModeActive() ? "night" : "light");
    }
  }

  async function handleSaveSettings() {
    if (!canStart) {
      setSavedAt(null);
      return;
    }

    setSavedAt(formatClockTime(new Date()));
    setSettingsOpen(false);

    try {
      await postJson(apiBaseUrl, "/api/messages/review", {
        templateKey: selectedTemplate.key,
        shortNote: note.trim(),
      }, userId);
      await Promise.all(
        reachableContacts.map((contact) =>
          postJson(apiBaseUrl, "/api/contacts/invite", {
            phone: contact.phone.trim(),
            displayName: contact.name.trim(),
          }, userId),
        ),
      );
    } catch {
      // The prototype keeps local settings responsive even when the demo backend is unavailable.
    }
  }

  function openConfirmDialog() {
    if (!safetyConfirmed) {
      setConfirmDialogOpen(true);
      setConfirmCodeInput("");
      setConfirmCodeError("");
    }
  }

  async function handleConfirmCodeSubmit() {
    if (confirmCodeInput.trim() !== confirmCode) {
      setConfirmCodeError("确认码不正确");
      return;
    }

    setConfirmDialogOpen(false);
    setConfirmCodeInput("");
    setConfirmCodeError("");
    setRemainingSeconds(durationMinutes * 60);
    setSafetyConfirmed(true);

    try {
      await postJson(apiBaseUrl, "/api/countdown/confirm", { durationMinutes }, userId);
    } catch {
      // The local safety confirmation is intentionally not blocked by network state.
    }
  }

  if (!loggedIn) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
        <View style={styles.loginScreen}>
          <View style={styles.loginBrand}>
            <Text style={[styles.loginTitle, { color: palette.text }]}>别让我消失</Text>
          </View>

          <View style={styles.loginFields}>
            <FieldLabel label="手机号" palette={palette}>
              <TextInput
                accessibilityLabel="手机号"
                inputMode="tel"
                keyboardType="phone-pad"
                onChangeText={setPhoneInput}
                placeholder="输入手机号"
                placeholderTextColor={palette.placeholder}
                style={[styles.textInput, { borderColor: palette.hairline, color: palette.text }]}
                value={phoneInput}
              />
            </FieldLabel>
            <FieldLabel label="验证码" palette={palette}>
              <TextInput
                accessibilityLabel="验证码"
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={setLoginCodeInput}
                placeholder="选填"
                placeholderTextColor={palette.placeholder}
                style={[styles.textInput, { borderColor: palette.hairline, color: palette.text }]}
                value={loginCodeInput}
              />
            </FieldLabel>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!canLogin}
            onPress={handleLogin}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: palette.primaryButton,
                opacity: !canLogin ? 0.34 : pressed ? 0.82 : 1,
              },
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: palette.primaryButtonText }]}>登录</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <Animated.View
        style={[
          styles.appFrame,
          {
            opacity: homeEntrance,
            transform: [
              {
                translateY: homeEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          },
        ]}
      >
        <TopBar onOpenSettings={() => setSettingsOpen(true)} palette={palette} />

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {!planStarted ? (
            <View style={styles.setupBlock}>
              <View style={styles.setupHead}>
                <Text style={[styles.sectionLabel, { color: palette.mutedText }]}>失联时间</Text>
                <Text style={[styles.sectionValue, { color: palette.text }]}>{formatDuration(durationMinutes)}</Text>
              </View>

              <View
                accessibilityLabel="时间选择器"
                style={[
                  styles.timePicker,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.hairline,
                  },
                ]}
              >
                <View pointerEvents="none" style={[styles.pickerSelection, { borderColor: palette.hairline }]} />
                <View style={styles.wheelPair}>
                  <WheelColumn max={99} min={0} onChange={setHours} palette={palette} value={hours} />
                  <Text style={[styles.wheelUnit, { color: palette.mutedText }]}>小时</Text>
                </View>
                <View style={styles.wheelPair}>
                  <WheelColumn max={59} min={0} onChange={setMinutes} palette={palette} value={minutes} />
                  <Text style={[styles.wheelUnit, { color: palette.mutedText }]}>分钟</Text>
                </View>
              </View>

              <PlanSummary
                contactDisplay={contactDisplay}
                durationLabel={`${durationMinutes} 分钟`}
                onPress={() => setSettingsOpen(true)}
                palette={palette}
                planStatus={`${reachableContacts.length} 位`}
              />
            </View>
          ) : (
            <View style={styles.guardBlock}>
              <View style={styles.statusLine}>
                <BreathingDot color={palette.safeGreen} />
                <Text style={[styles.statusText, { color: palette.mutedText }]}>守护中</Text>
              </View>
              <Text style={[styles.guardHint, { color: palette.mutedText }]}>如果我没有回来确认</Text>
              <Text accessibilityLabel={`失联倒计时 ${formatSeconds(remainingSeconds)}`} style={[styles.timer, { color: palette.text }]}>
                {formatSeconds(remainingSeconds)}
              </Text>
              <Text style={[styles.timerCaption, { color: palette.mutedText }]}>
                {durationMinutes} 分钟未确认后提醒
              </Text>

              <PlanSummary
                contactDisplay={contactDisplay}
                durationLabel={`${durationMinutes} 分钟`}
                onPress={() => setSettingsOpen(true)}
                palette={palette}
                planStatus={`${reachableContacts.length} 位`}
              />
              <Text style={[styles.savedLine, { color: palette.mutedText }]}>{savedAt ? `${savedAt} 已保存` : ""}</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.bottomBar, { backgroundColor: palette.background }]}>
          {planStarted ? (
            <Pressable
              accessibilityRole="button"
              disabled={safetyConfirmed}
              onPress={openConfirmDialog}
              style={({ pressed }) => [
                styles.primaryButton,
                safetyConfirmed
                  ? {
                      backgroundColor: palette.safeButton,
                      borderColor: palette.safeButtonBorder,
                      borderWidth: 1,
                      shadowOpacity: 0,
                    }
                  : {
                      backgroundColor: palette.primaryButton,
                      opacity: pressed ? 0.82 : 1,
                    },
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  {
                    color: safetyConfirmed ? palette.safeButtonText : palette.primaryButtonText,
                  },
                ]}
              >
                {safetyConfirmed ? `已确认安全，${returnCountdown}s 后回到首页` : "我还在"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={!canStart}
              onPress={handleStartPlan}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: palette.primaryButton,
                  opacity: !canStart ? 0.34 : pressed ? 0.82 : 1,
                },
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: palette.primaryButtonText }]}>开始守护</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      <SettingsSheet
        bottomInset={insets.bottom}
        contactEditorOpen={contactEditorOpen}
        contacts={contacts}
        nightModePreference={nightModePreference}
        note={note}
        onClose={() => setSettingsOpen(false)}
        onCloseContactEditor={() => setContactEditorOpen(false)}
        onNightModeChange={handleNightModeChange}
        onNoteChange={setNote}
        onOpenContactEditor={() => setContactEditorOpen(true)}
        onSave={handleSaveSettings}
        onSelectTemplate={setSelectedTemplateKey}
        onToggleContact={toggleContact}
        onUpdateContactField={updateContactField}
        palette={palette}
        previewMessage={previewMessage}
        reachableCount={reachableContacts.length}
        selectedTemplateKey={selectedTemplateKey}
        templates={templates}
        visible={settingsOpen}
      />

      <ConfirmCodeDialog
        code={confirmCodeInput}
        error={confirmCodeError}
        onChangeCode={(value) => {
          setConfirmCodeInput(value);
          setConfirmCodeError("");
        }}
        onClose={() => setConfirmDialogOpen(false)}
        onSubmit={handleConfirmCodeSubmit}
        palette={palette}
        visible={confirmDialogOpen}
      />
    </SafeAreaView>
  );
}

type Palette = Record<keyof (typeof palettes)["light"], string>;
type IconProps = {
  color: string;
  size?: number;
};

function MenuIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 18 18" width={size}>
      <Path d="M3 6.2H15M3 11.8H15" stroke={color} strokeLinecap="round" strokeWidth={1.6} />
    </Svg>
  );
}

function SettingsIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 18 18" width={size}>
      <Path d="M9 11.6A2.6 2.6 0 1 0 9 6.4a2.6 2.6 0 0 0 0 5.2Z" stroke={color} strokeWidth={1.4} />
      <Path
        d="M14.2 9c0-.4-.04-.76-.12-1.12l1.2-.92-1.4-2.42-1.42.58a5.8 5.8 0 0 0-1.94-1.12L10.3 2.5H7.7L7.48 4a5.8 5.8 0 0 0-1.94 1.12l-1.42-.58-1.4 2.42 1.2.92A5.3 5.3 0 0 0 3.8 9c0 .38.04.76.12 1.12l-1.2.92 1.4 2.42 1.42-.58c.56.48 1.22.86 1.94 1.12l.22 1.5h2.6l.22-1.5a5.8 5.8 0 0 0 1.94-1.12l1.42.58 1.4-2.42-1.2-.92c.08-.36.12-.74.12-1.12Z"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.1}
      />
    </Svg>
  );
}

function CloseIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 18 18" width={size}>
      <Path d="M4.8 4.8 13.2 13.2M13.2 4.8 4.8 13.2" stroke={color} strokeLinecap="round" strokeWidth={1.6} />
    </Svg>
  );
}

function PencilIcon({ color, size = 17 }: IconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 17 17" width={size}>
      <Path
        d="M9.9 3.1 13.9 7M3.9 13.1l1.2-4.2 6.7-6.8a1.5 1.5 0 0 1 2.1 0l1 1a1.5 1.5 0 0 1 0 2.1l-6.7 6.7-4.3 1.2Z"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.55}
      />
    </Svg>
  );
}

function ChevronIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 16 16" width={size}>
      <Path d="m6.4 3.7 4 4.3-4 4.3" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} />
    </Svg>
  );
}

function TopBar({ onOpenSettings, palette }: { onOpenSettings: () => void; palette: Palette }) {
  return (
    <View style={styles.header}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.iconButton}
      >
        <MenuIcon color={palette.text} />
      </View>
      <Text style={[styles.title, { color: palette.text }]}>别让我消失</Text>
      <Pressable accessibilityLabel="设置" accessibilityRole="button" hitSlop={12} onPress={onOpenSettings} style={styles.iconButton}>
        <SettingsIcon color={palette.text} />
      </Pressable>
    </View>
  );
}

function WheelColumn({
  max,
  min,
  onChange,
  palette,
  value,
}: {
  max: number;
  min: number;
  onChange: (value: number) => void;
  palette: Palette;
  value: number;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const pendingSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOffsetYRef = useRef((value - min) * wheelItemHeight);
  const skipNextValueSyncRef = useRef(false);
  const items = useMemo(() => Array.from({ length: max - min + 1 }, (_, index) => min + index), [max, min]);

  function clearPendingSettle() {
    if (pendingSettleRef.current) {
      clearTimeout(pendingSettleRef.current);
      pendingSettleRef.current = null;
    }
  }

  useEffect(() => () => clearPendingSettle(), []);

  useEffect(() => {
    if (skipNextValueSyncRef.current) {
      skipNextValueSyncRef.current = false;
      return;
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ animated: false, y: (value - min) * wheelItemHeight });
    });
  }, [min, value]);

  function settle(offsetY: number) {
    const nextValue = Math.max(min, Math.min(max, min + Math.round(offsetY / wheelItemHeight)));
    const targetY = (nextValue - min) * wheelItemHeight;

    if (nextValue !== value) {
      skipNextValueSyncRef.current = true;
      onChange(nextValue);
    }

    if (Math.abs(offsetY - targetY) > 1) {
      scrollRef.current?.scrollTo({ animated: false, y: targetY });
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      bounces={false}
      decelerationRate="normal"
      nestedScrollEnabled
      onMomentumScrollBegin={clearPendingSettle}
      onMomentumScrollEnd={(event) => {
        clearPendingSettle();
        settle(event.nativeEvent.contentOffset.y);
      }}
      onScroll={(event) => {
        latestOffsetYRef.current = event.nativeEvent.contentOffset.y;
      }}
      onScrollEndDrag={() => {
        clearPendingSettle();
        pendingSettleRef.current = setTimeout(() => {
          settle(latestOffsetYRef.current);
        }, 120);
      }}
      overScrollMode="never"
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={wheelItemHeight}
      style={styles.wheelColumn}
      contentContainerStyle={styles.wheelContent}
    >
      {items.map((item) => {
        const selected = item === value;

        return (
          <Text
            accessibilityLabel={`${item}`}
            key={item}
            style={[
              styles.wheelItem,
              {
                color: selected ? palette.text : palette.placeholder,
                fontSize: selected ? 30 : 20,
                fontWeight: selected ? "800" : "700",
              },
            ]}
          >
            {String(item).padStart(2, "0")}
          </Text>
        );
      })}
    </ScrollView>
  );
}

function PlanSummary({
  contactDisplay,
  durationLabel,
  onPress,
  palette,
  planStatus,
}: {
  contactDisplay: string;
  durationLabel: string;
  onPress: () => void;
  palette: Palette;
  planStatus: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.planSummary,
        {
          backgroundColor: palette.surface,
          borderColor: palette.hairline,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.planStateRow}>
        <View style={styles.planStateLeft}>
          <View style={[styles.planStateDot, { backgroundColor: palette.safeGreen }]} />
          <Text style={[styles.planStateText, { color: palette.mutedText }]}>已启用</Text>
        </View>
        <ChevronIcon color={palette.mutedText} />
      </View>
      <View style={styles.summaryRows}>
        <SummaryRow label="联系人" palette={palette} value={contactDisplay} />
        <SummaryRow label="阈值" palette={palette} value={durationLabel} />
        <SummaryRow label="预案" palette={palette} value={planStatus} />
      </View>
    </Pressable>
  );
}

function SummaryRow({ label, palette, value }: { label: string; palette: Palette; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: palette.mutedText }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.summaryValue, { color: palette.text }]}>
        {value}
      </Text>
    </View>
  );
}

function BreathingDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 1350,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 950,
          easing: Easing.inOut(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={styles.dotShell}>
      <Animated.View
        style={[
          styles.dotHalo,
          {
            backgroundColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.02] }),
            transform: [
              {
                scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.25] }),
              },
            ],
          },
        ]}
      />
      <View style={[styles.breathingDot, { backgroundColor: color }]} />
    </View>
  );
}

function SettingsSheet({
  bottomInset,
  contactEditorOpen,
  contacts,
  nightModePreference,
  note,
  onClose,
  onCloseContactEditor,
  onNightModeChange,
  onNoteChange,
  onOpenContactEditor,
  onSave,
  onSelectTemplate,
  onToggleContact,
  onUpdateContactField,
  palette,
  previewMessage,
  reachableCount,
  selectedTemplateKey,
  templates,
  visible,
}: {
  bottomInset: number;
  contactEditorOpen: boolean;
  contacts: ContactOption[];
  nightModePreference: NightModePreference;
  note: string;
  onClose: () => void;
  onCloseContactEditor: () => void;
  onNightModeChange: (preference: NightModePreference) => void;
  onNoteChange: (note: string) => void;
  onOpenContactEditor: () => void;
  onSave: () => void;
  onSelectTemplate: (templateKey: string) => void;
  onToggleContact: (contactId: string) => void;
  onUpdateContactField: (contactId: string, field: "email" | "name" | "phone", value: string) => void;
  palette: Palette;
  previewMessage: string;
  reachableCount: number;
  selectedTemplateKey: string;
  templates: TemplateOption[];
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="关闭设置遮罩" onPress={onClose} style={styles.modalBackdrop} />
        <View style={[styles.settingsSheet, { backgroundColor: palette.surface }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.sheetTitle, { color: palette.text }]}>设置</Text>
            <Pressable accessibilityLabel="关闭设置" accessibilityRole="button" hitSlop={12} onPress={onClose} style={styles.closeButton}>
              <CloseIcon color={palette.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <View style={styles.settingRow}>
              <View style={styles.settingCopy}>
                <Text style={[styles.settingTitle, { color: palette.text }]}>夜间模式</Text>
                <Text style={[styles.settingHint, { color: palette.mutedText }]}>关闭、按时间自动或手动开启。</Text>
              </View>
              <View style={[styles.segmented, { borderColor: palette.hairline }]}>
                {nightModeOptions.map((option) => {
                  const selected = nightModePreference === option.value;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={option.value}
                      onPress={() => onNightModeChange(option.value)}
                      style={[styles.segmentOption, selected ? { backgroundColor: palette.segmentActive } : null]}
                    >
                      <Text style={[styles.segmentText, { color: selected ? palette.text : palette.mutedText }]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.sheetSectionHead}>
              <Text style={[styles.sheetSectionTitle, { color: palette.text }]}>联系人</Text>
              <Pressable accessibilityLabel="编辑联系人" accessibilityRole="button" hitSlop={12} onPress={onOpenContactEditor} style={styles.editIconButton}>
                <PencilIcon color={palette.mutedText} />
              </Pressable>
            </View>

            <View style={[styles.contactList, { borderColor: palette.hairline }]}>
              {contacts.map((contact, index) => (
                <View
                  key={contact.id}
                  style={[
                    styles.contactSwitchRow,
                    index > 0 ? { borderTopColor: palette.hairline, borderTopWidth: StyleSheet.hairlineWidth } : null,
                  ]}
                >
                  <Text style={[styles.contactSwitchName, { color: palette.text }]}>{contact.name}</Text>
                  <Switch
                    accessibilityLabel={`${contact.name}接收提醒`}
                    onValueChange={() => onToggleContact(contact.id)}
                    thumbColor="#FFFFFF"
                    trackColor={{ false: palette.switchOff, true: palette.safeGreen }}
                    value={contact.enabled}
                  />
                </View>
              ))}
            </View>

            <Text style={[styles.sheetSectionTitle, { color: palette.text }]}>失联预案</Text>
            <View style={styles.templateGroup}>
              {templates.map((template) => {
                const selected = selectedTemplateKey === template.key;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={template.key}
                    onPress={() => onSelectTemplate(template.key)}
                    style={[
                      styles.templateRow,
                      {
                        backgroundColor: selected ? palette.safeWash : palette.surface,
                        borderColor: selected ? palette.safeBorder : palette.hairline,
                      },
                    ]}
                  >
                    <View style={[styles.radioMark, { borderColor: selected ? palette.safeGreen : palette.hairline }]}>
                      {selected ? <View style={[styles.radioCore, { backgroundColor: palette.safeGreen }]} /> : null}
                    </View>
                    <Text style={[styles.templateText, { color: palette.text }]}>{template.text}</Text>
                  </Pressable>
                );
              })}
            </View>

            <FieldLabel label="短备注" palette={palette}>
              <TextInput
                accessibilityLabel="短备注"
                maxLength={50}
                multiline
                onChangeText={onNoteChange}
                placeholder="选填，最多 50 字"
                placeholderTextColor={palette.placeholder}
                style={[
                  styles.noteInput,
                  {
                    borderColor: palette.hairline,
                    color: palette.text,
                  },
                ]}
                value={note}
              />
            </FieldLabel>

            <View style={[styles.messagePreview, { backgroundColor: palette.preview, borderColor: palette.hairline }]}>
              <Text style={[styles.previewLabel, { color: palette.mutedText }]}>到点后发送</Text>
              <Text style={[styles.previewText, { color: palette.text }]}>{previewMessage}</Text>
            </View>

            <Text style={[styles.settingsStatus, { color: palette.mutedText }]}>
              {reachableCount > 0 ? `${reachableCount} 位联系人会接收提醒。` : "请补全已开启联系人的姓名和联系方式。"}
            </Text>
          </ScrollView>

          <View
            style={[
              styles.sheetFooter,
              {
                borderTopColor: palette.hairline,
                paddingBottom: Math.max(spacing.lg, bottomInset + spacing.md),
              },
            ]}
          >
            <Pressable accessibilityRole="button" disabled={reachableCount === 0} onPress={onSave} style={[styles.saveButton, { opacity: reachableCount === 0 ? 0.36 : 1 }]}>
              <Text style={styles.saveButtonText}>保存并返回</Text>
            </Pressable>
          </View>

          <ContactEditor
            contacts={contacts}
            onClose={onCloseContactEditor}
            onUpdateContactField={onUpdateContactField}
            palette={palette}
            visible={contactEditorOpen}
          />
        </View>
      </View>
    </Modal>
  );
}

function ContactEditor({
  contacts,
  onClose,
  onUpdateContactField,
  palette,
  visible,
}: {
  contacts: ContactOption[];
  onClose: () => void;
  onUpdateContactField: (contactId: string, field: "email" | "name" | "phone", value: string) => void;
  palette: Palette;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.editorRoot}>
        <Pressable accessibilityLabel="关闭联系人编辑遮罩" onPress={onClose} style={styles.editorBackdrop} />
        <View style={[styles.editorPanel, { backgroundColor: palette.surface }]}>
          <View style={styles.editorHeader}>
            <Text style={[styles.sheetTitle, { color: palette.text }]}>联系人</Text>
            <Pressable accessibilityLabel="关闭联系人编辑" accessibilityRole="button" hitSlop={12} onPress={onClose} style={styles.closeButton}>
              <CloseIcon color={palette.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.editorBody} showsVerticalScrollIndicator={false}>
            {contacts.map((contact, index) => (
              <View key={contact.id} style={[styles.contactEditBlock, { borderColor: palette.hairline }]}>
                <View style={styles.contactEditHead}>
                  <Text style={[styles.contactEditTitle, { color: palette.text }]}>{contact.name || `联系人 ${index + 1}`}</Text>
                  <Text style={[styles.contactEditState, { color: palette.mutedText }]}>{contact.enabled ? "已开启" : "未开启"}</Text>
                </View>
                <FieldLabel label="姓名" palette={palette}>
                  <TextInput
                    accessibilityLabel={`联系人${index + 1}姓名`}
                    onChangeText={(value) => onUpdateContactField(contact.id, "name", value)}
                    style={[styles.textInput, { borderColor: palette.hairline, color: palette.text }]}
                    value={contact.name}
                  />
                </FieldLabel>
                <FieldLabel label="电话" palette={palette}>
                  <TextInput
                    accessibilityLabel={`联系人${index + 1}电话`}
                    inputMode="tel"
                    keyboardType="phone-pad"
                    onChangeText={(value) => onUpdateContactField(contact.id, "phone", value)}
                    style={[styles.textInput, { borderColor: palette.hairline, color: palette.text }]}
                    value={contact.phone}
                  />
                </FieldLabel>
                <FieldLabel label="邮箱" palette={palette}>
                  <TextInput
                    accessibilityLabel={`联系人${index + 1}邮箱`}
                    inputMode="email"
                    keyboardType="email-address"
                    onChangeText={(value) => onUpdateContactField(contact.id, "email", value)}
                    placeholder="选填"
                    placeholderTextColor={palette.placeholder}
                    style={[styles.textInput, { borderColor: palette.hairline, color: palette.text }]}
                    value={contact.email}
                  />
                </FieldLabel>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ConfirmCodeDialog({
  code,
  error,
  onChangeCode,
  onClose,
  onSubmit,
  palette,
  visible,
}: {
  code: string;
  error: string;
  onChangeCode: (code: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  palette: Palette;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.confirmRoot}>
        <Pressable accessibilityLabel="关闭安全确认遮罩" onPress={onClose} style={styles.confirmBackdrop} />
        <View style={[styles.confirmPanel, { backgroundColor: palette.surface }]}>
          <View style={styles.confirmHeader}>
            <Text style={[styles.sheetTitle, { color: palette.text }]}>确认安全</Text>
            <Pressable accessibilityLabel="关闭安全确认" accessibilityRole="button" hitSlop={12} onPress={onClose} style={styles.closeButton}>
              <CloseIcon color={palette.text} />
            </Pressable>
          </View>
          <FieldLabel label="确认码" palette={palette}>
            <TextInput
              accessibilityLabel="确认码"
              autoFocus
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={onChangeCode}
              placeholder="输入确认码"
              placeholderTextColor={palette.placeholder}
              secureTextEntry
              style={[styles.textInput, { borderColor: palette.hairline, color: palette.text }]}
              value={code}
            />
          </FieldLabel>
          <Text style={[styles.confirmError, { color: palette.danger }]}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={onSubmit} style={[styles.confirmSubmitButton, { backgroundColor: palette.primaryButton }]}>
            <Text style={[styles.primaryButtonText, { color: palette.primaryButtonText }]}>确认</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FieldLabel({
  children,
  label,
  palette,
}: {
  children: React.ReactNode;
  label: string;
  palette: Palette;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: palette.mutedText }]}>{label}</Text>
      {children}
    </View>
  );
}

async function postJson(
  apiBaseUrl: string,
  path: string,
  body: Record<string, unknown>,
  userId: string,
): Promise<void> {
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-demo-user-id": userId,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
}

function formatSeconds(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((unit) => String(unit).padStart(2, "0")).join(":");
}

function formatDuration(totalMinutes: number) {
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;

  if (nextHours === 0) {
    return `${nextMinutes} 分钟`;
  }

  if (nextMinutes === 0) {
    return `${nextHours} 小时`;
  }

  return `${nextHours} 小时 ${nextMinutes} 分钟`;
}

function formatClockTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const palettes = {
  light: {
    background: "#F6F8FA",
    danger: "#9C3D3A",
    hairline: "#DFE5EA",
    mutedText: "#69747E",
    placeholder: "#9CA6AE",
    preview: "#F8FAF9",
    primaryButton: "#171A1B",
    primaryButtonText: "#FFFFFF",
    safeBorder: "rgba(55, 143, 93, 0.22)",
    safeButton: "rgba(70, 156, 101, 0.14)",
    safeButtonBorder: "rgba(70, 156, 101, 0.24)",
    safeButtonText: "#2F7B4D",
    safeGreen: "#36A66A",
    safeWash: "rgba(54, 166, 106, 0.08)",
    segmentActive: "#F0F3F4",
    surface: "#FFFFFF",
    switchOff: "#D3D8DD",
    text: "#171A1B",
  },
  night: {
    background: "#0D0F10",
    danger: "#E37C78",
    hairline: "#2B3034",
    mutedText: "#9BA3AA",
    placeholder: "#687078",
    preview: "#111416",
    primaryButton: "#F1F4F2",
    primaryButtonText: "#111416",
    safeBorder: "rgba(91, 191, 123, 0.28)",
    safeButton: "rgba(91, 191, 123, 0.16)",
    safeButtonBorder: "rgba(91, 191, 123, 0.26)",
    safeButtonText: "#9BE0B0",
    safeGreen: "#59BF7B",
    safeWash: "rgba(91, 191, 123, 0.12)",
    segmentActive: "#22272B",
    surface: "#15191C",
    switchOff: "#41484F",
    text: "#F2F4F3",
  },
} as const;

const styles = StyleSheet.create({
  appFrame: {
    flex: 1,
  },
  breathingDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  bottomBar: {
    bottom: 0,
    left: 0,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    position: "absolute",
    right: 0,
  },
  closeButton: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  confirmBackdrop: StyleSheet.absoluteFill,
  confirmError: {
    fontSize: 13,
    fontWeight: "600",
    minHeight: 20,
  },
  confirmHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  confirmPanel: {
    borderRadius: 18,
    gap: spacing.md,
    padding: spacing.lg,
    width: "88%",
  },
  confirmRoot: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.32)",
    flex: 1,
    justifyContent: "center",
  },
  confirmSubmitButton: {
    alignItems: "center",
    borderRadius: 10,
    minHeight: 52,
    justifyContent: "center",
  },
  contactEditBlock: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.md,
  },
  contactEditHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  contactEditState: {
    fontSize: 12,
    fontWeight: "700",
  },
  contactEditTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  contactList: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  contactSwitchName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
  },
  contactSwitchRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  content: {
    paddingBottom: 112,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  dotHalo: {
    borderRadius: 15,
    height: 30,
    position: "absolute",
    width: 30,
  },
  dotShell: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  editIconButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  editorBackdrop: StyleSheet.absoluteFill,
  editorBody: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  editorHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  editorPanel: {
    borderRadius: 18,
    maxHeight: "84%",
    padding: spacing.lg,
    width: "90%",
  },
  editorRoot: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.34)",
    flex: 1,
    justifyContent: "center",
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  guardBlock: {
    alignItems: "center",
    gap: spacing.lg,
  },
  guardHint: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: spacing.xl,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  iconButton: {
    alignItems: "center",
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  loginBrand: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxl,
  },
  loginFields: {
    gap: spacing.md,
    marginBottom: spacing.md,
    width: "100%",
  },
  loginScreen: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0,
  },
  messagePreview: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    padding: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
  },
  modalRoot: {
    backgroundColor: "rgba(0,0,0,0.30)",
    flex: 1,
    justifyContent: "flex-end",
  },
  noteInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    minHeight: 92,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    textAlignVertical: "top",
  },
  pickerSelection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: wheelItemHeight,
    left: spacing.md,
    position: "absolute",
    right: spacing.md,
    top: wheelItemHeight * 2,
  },
  planStateDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  planStateLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  planStateRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  planStateText: {
    fontSize: 13,
    fontWeight: "800",
  },
  planSummary: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.md,
    width: "100%",
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  previewText: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 58,
    width: "100%",
  },
  primaryButtonText: {
    fontSize: typography.button,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 24,
  },
  radioCore: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  radioMark: {
    alignItems: "center",
    borderRadius: 9,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  safeArea: {
    flex: 1,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#171A1B",
    borderRadius: 10,
    minHeight: 56,
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  savedLine: {
    fontSize: 12,
    fontWeight: "700",
    minHeight: 18,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  sectionValue: {
    fontSize: 17,
    fontWeight: "800",
  },
  segmented: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    overflow: "hidden",
  },
  segmentOption: {
    minWidth: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  settingCopy: {
    flex: 1,
    gap: 3,
  },
  settingHint: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  settingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  settingsSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    minHeight: "70%",
    overflow: "hidden",
  },
  settingsStatus: {
    fontSize: 13,
    fontWeight: "700",
    minHeight: 18,
  },
  setupBlock: {
    gap: spacing.lg,
  },
  setupHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sheetContent: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  sheetHeader: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 62,
    paddingHorizontal: spacing.lg,
  },
  sheetSectionHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sheetSectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  statusLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
  },
  statusText: {
    fontSize: 15,
    fontWeight: "800",
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  summaryRow: {
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  summaryRows: {
    flexDirection: "row",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "800",
    maxWidth: "100%",
  },
  templateGroup: {
    gap: spacing.sm,
  },
  templateRow: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  templateText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 18,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  timePicker: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: wheelItemHeight * 5,
    justifyContent: "center",
    overflow: "hidden",
  },
  timer: {
    fontSize: 66,
    fontVariant: ["tabular-nums"],
    fontWeight: "400",
    includeFontPadding: false,
    letterSpacing: 0,
    lineHeight: 74,
  },
  timerCaption: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: -spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 24,
  },
  wheelColumn: {
    height: wheelItemHeight * 5,
    width: 92,
    zIndex: 1,
  },
  wheelContent: {
    paddingVertical: wheelItemHeight * 2,
  },
  wheelItem: {
    height: wheelItemHeight,
    lineHeight: wheelItemHeight,
    textAlign: "center",
  },
  wheelPair: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    minWidth: 0,
  },
  wheelUnit: {
    fontSize: 14,
    fontWeight: "800",
    marginLeft: -2,
    textAlign: "center",
    width: 38,
    zIndex: 2,
  },
});
