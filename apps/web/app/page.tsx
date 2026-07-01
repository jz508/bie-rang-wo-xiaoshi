"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent, type WheelEvent } from "react";

type TemplateOption = {
  key: string;
  text: string;
};

type NightModePreference = "off" | "auto" | "on";

type ContactOption = {
  email: string;
  enabled: boolean;
  id: string;
  name: string;
  phone: string;
};

const nightModeOptions: Array<{ label: string; value: NightModePreference }> = [
  { label: "关闭", value: "off" },
  { label: "自动", value: "auto" },
  { label: "开启", value: "on" },
];

const wheelItemHeight = 38;
const wheelDecelerationRate = 0.994;
const wheelMaxVelocity = 1.15;
const wheelStopVelocity = 0.035;
const wheelSettleMs = 340;
const settingsSheetCloseMs = 260;
const safetyConfirmCode = "1234";
const safetyReturnSeconds = 5;

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
    enabled: false,
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

export default function HomePage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [pickerHours, setPickerHours] = useState(2);
  const [pickerMinutes, setPickerMinutes] = useState(15);
  const [contacts, setContacts] = useState<ContactOption[]>(initialContacts);
  const [contactEditorOpen, setContactEditorOpen] = useState(false);
  const [note, setNote] = useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(templates[0]?.key ?? "find_me");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [nightModePreference, setNightModePreference] = useState<NightModePreference>("off");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [planStarted, setPlanStarted] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(135 * 60);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmCodeInput, setConfirmCodeInput] = useState("");
  const [confirmCodeError, setConfirmCodeError] = useState("");
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [returnCountdown, setReturnCountdown] = useState(safetyReturnSeconds);
  const settingsCloseTimerRef = useRef<number | null>(null);

  const selectedTemplate = templates.find((template) => template.key === selectedTemplateKey) ?? templates[0];
  const pickerTotalMinutes = pickerHours * 60 + pickerMinutes;
  const activeDurationMinutes = pickerTotalMinutes;
  const displayTime = formatSeconds(remainingSeconds);
  const nightMode = nightModePreference === "on" || (nightModePreference === "auto" && systemPrefersDark);
  const enabledContacts = contacts.filter((contact) => contact.enabled);
  const reachableContacts = enabledContacts.filter(
    (contact) => contact.name.trim().length > 0 && (contact.phone.trim().length > 0 || contact.email.trim().length > 0),
  );
  const canSave = reachableContacts.length > 0;
  const canLogin = phoneInput.trim().length >= 5;
  const canStart = canSave && pickerTotalMinutes > 0;
  const previewMessage = [selectedTemplate?.text, note.trim()].filter(Boolean).join(" ");
  const contactDisplay = enabledContacts.map((contact) => contact.name.trim() || "未命名").join("、") || "未开启";
  const durationLabel = `${activeDurationMinutes} 分钟`;
  const pickerDurationLabel = formatPickerDuration(pickerTotalMinutes);
  const planState = canSave ? "已启用" : "待补全";
  const planStatus = canSave ? `${reachableContacts.length} 人` : "待补全";

  useEffect(() => {
    if (!loggedIn || !planStarted) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [loggedIn, planStarted]);

  useEffect(() => {
    return () => {
      clearSettingsCloseTimer();
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function syncSystemTheme() {
      setSystemPrefersDark(mediaQuery.matches);
    }

    syncSystemTheme();
    mediaQuery.addEventListener("change", syncSystemTheme);

    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, []);

  useEffect(() => {
    if (!safetyConfirmed) {
      return;
    }

    setReturnCountdown(safetyReturnSeconds);
    const intervalId = window.setInterval(() => {
      setReturnCountdown((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setPlanStarted(false);
      setSafetyConfirmed(false);
      setConfirmedAt(null);
      setConfirmCodeInput("");
      setConfirmCodeError("");
      setReturnCountdown(safetyReturnSeconds);
    }, safetyReturnSeconds * 1000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [safetyConfirmed]);

  function clearSettingsCloseTimer() {
    if (settingsCloseTimerRef.current === null) {
      return;
    }

    window.clearTimeout(settingsCloseTimerRef.current);
    settingsCloseTimerRef.current = null;
  }

  function openSettings() {
    clearSettingsCloseTimer();
    setSettingsClosing(false);
    setSettingsOpen(true);
  }

  function closeSettings() {
    if (!settingsOpen || settingsClosing) {
      return;
    }

    clearSettingsCloseTimer();
    setSettingsClosing(true);
    settingsCloseTimerRef.current = window.setTimeout(() => {
      setSettingsOpen(false);
      setSettingsClosing(false);
      settingsCloseTimerRef.current = null;
    }, settingsSheetCloseMs);
  }

  function handleLogin() {
    if (!canLogin) {
      return;
    }

    setLoggedIn(true);
  }

  function handleStartPlan() {
    if (!canStart) {
      return;
    }

    setRemainingSeconds(pickerTotalMinutes * 60);
    setConfirmedAt(null);
    setConfirmDialogOpen(false);
    setConfirmCodeInput("");
    setConfirmCodeError("");
    setSafetyConfirmed(false);
    setReturnCountdown(safetyReturnSeconds);
    setPlanStarted(true);
  }

  function toggleContact(contactId: string) {
    setContacts((currentContacts) =>
      currentContacts.map((contact) =>
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
    setContacts((currentContacts) =>
      currentContacts.map((contact) =>
        contact.id === contactId
          ? {
              ...contact,
              [field]: value,
            }
          : contact,
      ),
    );
  }

  function handleSaveSettings() {
    if (!canSave) {
      setSavedAt(null);
      return;
    }

    setSavedAt(formatNow());
    closeSettings();
  }

  function openConfirmDialog() {
    if (safetyConfirmed) {
      return;
    }

    setConfirmDialogOpen(true);
    setConfirmCodeInput("");
    setConfirmCodeError("");
  }

  function closeConfirmDialog() {
    setConfirmDialogOpen(false);
    setConfirmCodeInput("");
    setConfirmCodeError("");
  }

  function handleConfirmCodeSubmit() {
    if (confirmCodeInput.trim() !== safetyConfirmCode) {
      setConfirmCodeError("确认码不正确");
      return;
    }

    setConfirmedAt(formatNow());
    setRemainingSeconds(activeDurationMinutes * 60);
    setConfirmDialogOpen(false);
    setConfirmCodeInput("");
    setConfirmCodeError("");
    setSafetyConfirmed(true);
  }

  return (
    <main className={nightMode ? "page pageNight" : "page"}>
      <section className="appShell" aria-label="别让我消失">
        {!loggedIn ? (
          <section className="loginScreen" aria-label="登录">
            <div className="loginBrand">
              <h1>别让我消失</h1>
            </div>

            <div className="loginForm">
              <label className="field">
                <span>手机号</span>
                <input
                  inputMode="tel"
                  onChange={(event) => setPhoneInput(event.target.value)}
                  placeholder="输入手机号"
                  type="tel"
                  value={phoneInput}
                />
              </label>
              <label className="field">
                <span>测试码</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setCodeInput(event.target.value)}
                  placeholder="输入测试码"
                  type="text"
                  value={codeInput}
                />
              </label>
              <button className="primaryButton loginButton" disabled={!canLogin} onClick={handleLogin} type="button">
                登录
              </button>
            </div>
          </section>
        ) : (
          <>
            <header className="topBar">
              <button aria-label="菜单" className="iconButton" type="button">
                <MenuIcon />
              </button>
              <h1>别让我消失</h1>
              <button
                aria-expanded={settingsOpen && !settingsClosing}
                aria-label="设置"
                className="iconButton"
                onClick={openSettings}
                type="button"
              >
                <SettingsIcon />
              </button>
            </header>

            {!planStarted ? (
              <section className="setupBlock" aria-label="设置失联时间">
                <div className="setupHead">
                  <span>失联时间</span>
                  <strong>{pickerDurationLabel}</strong>
                </div>

                <div className="timePicker" aria-label="时间选择器">
                  <span className="pickerSelection" aria-hidden="true" />
                  <WheelPickerColumn ariaLabel="小时" max={99} min={0} onChange={setPickerHours} value={pickerHours} />
                  <span className="wheelUnit">小时</span>
                  <WheelPickerColumn ariaLabel="分钟" max={59} min={0} onChange={setPickerMinutes} value={pickerMinutes} />
                  <span className="wheelUnit">分钟</span>
                </div>

                <button className="systemPlan setupPlan" onClick={openSettings} type="button">
                  <span className="systemPlanHead">
                    <span className="systemState">
                      <span className={canSave ? "systemStateDot" : "systemStateDot systemStateDotMuted"} />
                      <span>{planState}</span>
                    </span>
                    <ChevronIcon />
                  </span>
                  <span className="systemRows">
                    <span className="systemRow">
                      <span>联系人</span>
                      <strong>{contactDisplay}</strong>
                    </span>
                    <span className="systemRow">
                      <span>预案</span>
                      <strong>{planStatus}</strong>
                    </span>
                  </span>
                </button>
              </section>
            ) : (
              <>
                <section className="statusBlock" aria-label="当前状态">
                  <div className="statusLine">
                    <span className="statusDot" />
                    <span>守护中</span>
                  </div>
                  <div className="timer" aria-label={`失联倒计时 ${displayTime}`}>
                    {displayTime}
                  </div>
                  <p className="timerCaption">
                    <strong>{activeDurationMinutes}</strong> 分钟未确认后提醒
                  </p>
                </section>

                <section
                  className="visualSummary"
                  aria-label={`当前预案：联系人 ${contactDisplay}，阈值 ${durationLabel}，状态 ${planStatus}`}
                >
                  <button className="systemPlan" onClick={openSettings} type="button">
                    <span className="systemPlanHead">
                      <span className="systemState">
                        <span className={canSave ? "systemStateDot" : "systemStateDot systemStateDotMuted"} />
                        <span>{planState}</span>
                      </span>
                      <ChevronIcon />
                    </span>
                    <span className="systemRows">
                      <span className="systemRow">
                        <span>联系人</span>
                        <strong>{contactDisplay}</strong>
                      </span>
                      <span className="systemRow">
                        <span>阈值</span>
                        <strong>{durationLabel}</strong>
                      </span>
                      <span className="systemRow">
                        <span>预案</span>
                        <strong>{planStatus}</strong>
                      </span>
                    </span>
                  </button>
                </section>

                <p className="quietLine" aria-live="polite">
                  {savedAt ? `${savedAt} 已保存` : ""}
                </p>
              </>
            )}

            <div className="bottomAction" key={planStarted ? "confirm-action" : "start-action"}>
              {planStarted ? (
                <>
                  <button
                    className={safetyConfirmed ? "primaryButton safetyConfirmedButton" : "primaryButton"}
                    disabled={safetyConfirmed}
                    onClick={openConfirmDialog}
                    type="button"
                  >
                    {safetyConfirmed ? `已确认安全，${returnCountdown}s 后回到首页` : "我还在"}
                  </button>
                  {safetyConfirmed ? null : (
                    <p className="inlineStatus" aria-live="polite">
                      {confirmedAt ? `${confirmedAt} 已确认` : ""}
                    </p>
                  )}
                </>
              ) : (
                <button className="primaryButton" disabled={!canStart} onClick={handleStartPlan} type="button">
                  开始守护
                </button>
              )}
            </div>

            {settingsOpen ? (
              <>
            <button
              aria-label="关闭设置遮罩"
              className={settingsClosing ? "settingsBackdrop settingsBackdropClosing" : "settingsBackdrop"}
              onClick={closeSettings}
              type="button"
            />
            <aside
              aria-labelledby="settings-title"
              aria-modal="true"
              className={settingsClosing ? "settingsSheet settingsSheetClosing" : "settingsSheet"}
              role="dialog"
            >
              <div className="sheetHeader">
                <div>
                  <h2 id="settings-title">设置</h2>
                </div>
                <button aria-label="关闭设置" className="iconButton" onClick={closeSettings} type="button">
                  <CloseIcon />
                </button>
              </div>

              <div className="settingsRow">
                <div>
                  <h3>夜间模式</h3>
                  <p>关闭、自动跟随系统或手动开启。</p>
                </div>
                <div className="themeSegmented" role="radiogroup" aria-label="夜间模式">
                  {nightModeOptions.map((option) => {
                    const selected = nightModePreference === option.value;

                    return (
                      <button
                        aria-checked={selected}
                        className={selected ? "themeSegmentedOption themeSegmentedOptionSelected" : "themeSegmentedOption"}
                        key={option.value}
                        onClick={() => setNightModePreference(option.value)}
                        role="radio"
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <section className="planEditor" aria-label="设置失联预案">
                <div className="sheetSectionHead">
                  <h3 id="contacts-title">联系人</h3>
                  <button
                    aria-label="编辑联系人"
                    className="sectionIconButton"
                    onClick={() => setContactEditorOpen(true)}
                    type="button"
                  >
                    <PencilIcon />
                  </button>
                </div>

                <div className="contactList" role="group" aria-labelledby="contacts-title">
                  {contacts.map((contact) => (
                    <label
                      className={contact.enabled ? "contactSwitchRow contactSwitchRowEnabled" : "contactSwitchRow"}
                      data-contact-id={contact.id}
                      key={contact.id}
                    >
                      <span className="contactSwitchName">{contact.name}</span>
                      <input
                        aria-label={`${contact.name}接收提醒`}
                        checked={contact.enabled}
                        className="switchInput"
                        onChange={() => toggleContact(contact.id)}
                        type="checkbox"
                      />
                      <span className="switchTrack" aria-hidden="true">
                        <span className="switchThumb" />
                      </span>
                    </label>
                  ))}
                </div>

                <div className="sheetSectionHead messageSectionHead">
                  <h3 id="plan-title">失联预案</h3>
                </div>

                <div className="templateGroup" role="radiogroup" aria-label="预留消息模板">
                  {templates.map((template) => {
                    const selected = selectedTemplateKey === template.key;

                    return (
                      <button
                        aria-checked={selected}
                        className={selected ? "templateRow templateRowSelected" : "templateRow"}
                        key={template.key}
                        onClick={() => setSelectedTemplateKey(template.key)}
                        role="radio"
                        type="button"
                      >
                        <span className="radioMark" />
                        <span>{template.text}</span>
                      </button>
                    );
                  })}
                </div>

                <label className="field">
                  <span>短备注</span>
                  <textarea
                    maxLength={50}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="选填，最多 50 字"
                    value={note}
                  />
                </label>

                <div className="messagePreview">
                  <span>到点后发送</span>
                  <p>{previewMessage}</p>
                </div>

                <p className="settingsStatus" aria-live="polite">
                  {canSave ? `${reachableContacts.length} 位联系人会接收提醒。` : "请补全已开启联系人的姓名和联系方式。"}
                </p>
              </section>

              <div className="sheetFooter">
                <button className="saveButton" disabled={!canSave} onClick={handleSaveSettings} type="button">
                  保存并返回
                </button>
              </div>

              {contactEditorOpen ? (
                <>
                  <button
                    aria-label="关闭联系人编辑"
                    className="contactEditorBackdrop"
                    onClick={() => setContactEditorOpen(false)}
                    type="button"
                  />
                  <section
                    aria-labelledby="contact-editor-title"
                    aria-modal="true"
                    className="contactEditorPanel"
                    role="dialog"
                  >
                    <div className="contactEditorHeader">
                      <h2 id="contact-editor-title">联系人</h2>
                      <button
                        aria-label="关闭联系人编辑"
                        className="iconButton"
                        onClick={() => setContactEditorOpen(false)}
                        type="button"
                      >
                        <CloseIcon />
                      </button>
                    </div>

                    <div className="contactEditorBody">
                      {contacts.map((contact, index) => (
                        <section className="contactEditorBlock" data-contact-id={contact.id} key={contact.id}>
                          <div className="contactEditorBlockHead">
                            <strong>{contact.name.trim() || `联系人 ${index + 1}`}</strong>
                            <span>{contact.enabled ? "已开启" : "未开启"}</span>
                          </div>

                          <label className="field contactEditField">
                            <span>姓名</span>
                            <input
                              onChange={(event) => updateContactField(contact.id, "name", event.target.value)}
                              type="text"
                              value={contact.name}
                            />
                          </label>
                          <label className="field contactEditField">
                            <span>电话</span>
                            <input
                              inputMode="tel"
                              onChange={(event) => updateContactField(contact.id, "phone", event.target.value)}
                              type="tel"
                              value={contact.phone}
                            />
                          </label>
                          <label className="field contactEditField">
                            <span>邮箱</span>
                            <input
                              inputMode="email"
                              onChange={(event) => updateContactField(contact.id, "email", event.target.value)}
                              placeholder="选填"
                              type="email"
                              value={contact.email}
                            />
                          </label>
                        </section>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}
            </aside>
          </>
              ) : null}
            {confirmDialogOpen ? (
              <>
                <button
                  aria-label="关闭安全确认"
                  className="confirmBackdrop"
                  onClick={closeConfirmDialog}
                  type="button"
                />
                <section
                  aria-labelledby="confirm-title"
                  aria-modal="true"
                  className="confirmPanel"
                  role="dialog"
                >
                  <div className="confirmPanelHeader">
                    <h2 id="confirm-title">确认安全</h2>
                    <button aria-label="关闭安全确认" className="iconButton" onClick={closeConfirmDialog} type="button">
                      <CloseIcon />
                    </button>
                  </div>

                  <label className="field confirmCodeField">
                    <span>确认码</span>
                    <input
                      autoFocus
                      inputMode="numeric"
                      onChange={(event) => {
                        setConfirmCodeInput(event.target.value);
                        setConfirmCodeError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleConfirmCodeSubmit();
                        }
                      }}
                      placeholder="输入确认码"
                      type="password"
                      value={confirmCodeInput}
                    />
                  </label>

                  <p className="confirmError" aria-live="polite">
                    {confirmCodeError}
                  </p>

                  <button className="confirmSubmitButton" onClick={handleConfirmCodeSubmit} type="button">
                    确认
                  </button>
                </section>
              </>
            ) : null}
          </>
        )}
      </section>

      <style>{styles}</style>
    </main>
  );
}

type WheelPickerColumnProps = {
  ariaLabel: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
};

function WheelPickerColumn({ ariaLabel, max, min, onChange, value }: WheelPickerColumnProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const valueRef = useRef(value);
  const momentumFrameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const dragRef = useRef({
    dragging: false,
    lastTime: 0,
    lastY: 0,
    moved: false,
    offset: 0,
    pointerId: null as number | null,
    startY: 0,
    velocity: 0,
  });

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      clearInertia();
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
      window.removeEventListener("pointerup", handleWindowPointerEnd);
    };
  }, []);

  const items = getWheelItems(value, min, max);

  function clearInertia() {
    if (momentumFrameRef.current !== null) {
      window.cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = null;
    }

    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    setIsSettling(false);
  }

  function applyDelta(delta: number) {
    if (delta === 0) {
      return;
    }

    const nextValue = wrapValue(valueRef.current + delta, min, max);
    valueRef.current = nextValue;
    onChange(nextValue);
  }

  function normalizeOffset(offset: number) {
    let nextOffset = offset;

    while (nextOffset <= -wheelItemHeight) {
      applyDelta(1);
      nextOffset += wheelItemHeight;
    }

    while (nextOffset >= wheelItemHeight) {
      applyDelta(-1);
      nextOffset -= wheelItemHeight;
    }

    return nextOffset;
  }

  function startDrag(clientY: number, timeStamp: number, pointerId: number | null) {
    clearInertia();
    dragRef.current = {
      dragging: true,
      lastTime: timeStamp,
      lastY: clientY,
      moved: false,
      offset: 0,
      pointerId,
      startY: clientY,
      velocity: 0,
    };
    setDragOffset(0);
    setIsDragging(true);
  }

  function moveDrag(clientY: number, timeStamp: number) {
    const drag = dragRef.current;
    if (!drag.dragging) {
      return;
    }

    const deltaY = clientY - drag.lastY;
    const deltaTime = Math.max(timeStamp - drag.lastTime, 1);
    const instantVelocity = deltaY / deltaTime;
    const nextOffset = normalizeOffset(drag.offset + deltaY);

    if (Math.abs(clientY - drag.startY) > 3) {
      drag.moved = true;
    }

    drag.offset = nextOffset;
    drag.velocity = drag.velocity === 0 ? instantVelocity : drag.velocity * 0.62 + instantVelocity * 0.38;
    drag.lastY = clientY;
    drag.lastTime = timeStamp;
    setDragOffset(nextOffset);
  }

  function endDrag() {
    const drag = dragRef.current;
    if (!drag.dragging) {
      return;
    }

    const releaseOffset = drag.offset;
    const releaseVelocity = clamp(drag.velocity, -wheelMaxVelocity, wheelMaxVelocity);
    drag.dragging = false;
    drag.pointerId = null;
    setIsDragging(false);

    startMomentum(releaseOffset, releaseVelocity);
  }

  function startMomentum(initialOffset: number, initialVelocity: number) {
    let offset = initialOffset;
    let velocity = initialVelocity;
    let lastTime = window.performance.now();

    setIsSettling(false);

    const finishMomentum = () => {
      momentumFrameRef.current = null;
      offset = normalizeOffset(offset);

      if (offset <= -wheelItemHeight / 2) {
        applyDelta(1);
        offset += wheelItemHeight;
      } else if (offset >= wheelItemHeight / 2) {
        applyDelta(-1);
        offset -= wheelItemHeight;
      }

      setIsSettling(true);
      setDragOffset(offset);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setDragOffset(0);
        });
      });

      settleTimerRef.current = window.setTimeout(() => {
        setIsSettling(false);
        settleTimerRef.current = null;
      }, wheelSettleMs + 80);
    };

    if (Math.abs(velocity) < wheelStopVelocity) {
      finishMomentum();
      return;
    }

    const step = (time: number) => {
      const deltaTime = Math.min(time - lastTime, 34);
      lastTime = time;
      offset = normalizeOffset(offset + velocity * deltaTime);
      velocity *= Math.pow(wheelDecelerationRate, deltaTime);
      setDragOffset(offset);

      if (Math.abs(velocity) <= wheelStopVelocity) {
        finishMomentum();
        return;
      }

      momentumFrameRef.current = window.requestAnimationFrame(step);
    };

    momentumFrameRef.current = window.requestAnimationFrame(step);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    startDrag(event.clientY, event.timeStamp, event.pointerId);
    window.addEventListener("pointercancel", handleWindowPointerEnd);
    window.addEventListener("pointerup", handleWindowPointerEnd);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) {
      return;
    }

    event.preventDefault();
    moveDrag(event.clientY, event.timeStamp);
  }

  function finishPointerDrag(event: PointerEvent<HTMLDivElement>) {
    const pointerId = dragRef.current.pointerId;
    if (pointerId !== null && event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }

    window.removeEventListener("pointercancel", handleWindowPointerEnd);
    window.removeEventListener("pointerup", handleWindowPointerEnd);
    endDrag();
  }

  function handleWindowPointerEnd(event: globalThis.PointerEvent) {
    moveDrag(event.clientY, event.timeStamp);
    window.removeEventListener("pointercancel", handleWindowPointerEnd);
    window.removeEventListener("pointerup", handleWindowPointerEnd);
    endDrag();
  }

  function handleWindowMouseMove(event: globalThis.MouseEvent) {
    event.preventDefault();
    moveDrag(event.clientY, event.timeStamp);
  }

  function handleWindowMouseUp(event: globalThis.MouseEvent) {
    moveDrag(event.clientY, event.timeStamp);
    window.removeEventListener("mousemove", handleWindowMouseMove);
    window.removeEventListener("mouseup", handleWindowMouseUp);
    endDrag();
  }

  function handleMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (dragRef.current.dragging) {
      return;
    }

    startDrag(event.clientY, event.timeStamp, null);
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    clearInertia();
    applyDelta(Math.sign(event.deltaY));
  }

  function handleColumnClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const itemIndex = clamp(Math.floor((event.clientY - rect.top) / wheelItemHeight), 0, 4);
    const offset = itemIndex - 2;
    const nextValue = wrapValue(valueRef.current + offset, min, max);
    clearInertia();
    valueRef.current = nextValue;
    onChange(nextValue);
  }

  function handleItemClick(event: ReactMouseEvent<HTMLButtonElement>, nextValue: number) {
    if (dragRef.current.moved) {
      event.preventDefault();
      dragRef.current.moved = false;
      return;
    }

    clearInertia();
    valueRef.current = nextValue;
    onChange(nextValue);
  }

  return (
    <div
      aria-label={ariaLabel}
      className={isDragging ? "wheelColumn wheelColumnDragging" : "wheelColumn"}
      onClick={handleColumnClick}
      onMouseDown={handleMouseDown}
      onPointerCancel={finishPointerDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onWheel={handleWheel}
      role="group"
    >
      <div
        className={isSettling ? "wheelColumnTrack wheelColumnTrackSettling" : "wheelColumnTrack"}
        style={{ transform: `translateY(${dragOffset}px)` }}
      >
        {items.map((item) => (
          <button
            className={item.offset === 0 ? "wheelItem wheelItemSelected" : "wheelItem"}
            key={`${ariaLabel}-${item.offset}-${item.value}`}
            onClick={(event) => handleItemClick(event, item.value)}
            tabIndex={item.offset === 0 ? 0 : -1}
            type="button"
          >
            {String(item.value).padStart(2, "0")}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(totalSeconds, 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPickerDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes} 分钟`;
  }

  if (minutes === 0) {
    return `${hours} 小时`;
  }

  return `${hours} 小时 ${minutes} 分钟`;
}

function getWheelItems(value: number, min: number, max: number) {
  return [-2, -1, 0, 1, 2].map((offset) => ({
    offset,
    value: wrapValue(value + offset, min, max),
  }));
}

function wrapValue(value: number, min: number, max: number): number {
  const range = max - min + 1;
  return ((((value - min) % range) + range) % range) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatNow(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18">
      <path d="M3 6.2H15M3 11.8H15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18">
      <path
        d="M9 11.6A2.6 2.6 0 1 0 9 6.4a2.6 2.6 0 0 0 0 5.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M14.2 9c0-.4-.04-.76-.12-1.12l1.2-.92-1.4-2.42-1.42.58a5.8 5.8 0 0 0-1.94-1.12L10.3 2.5H7.7L7.48 4a5.8 5.8 0 0 0-1.94 1.12l-1.42-.58-1.4 2.42 1.2.92A5.3 5.3 0 0 0 3.8 9c0 .38.04.76.12 1.12l-1.2.92 1.4 2.42 1.42-.58c.56.48 1.22.86 1.94 1.12l.22 1.5h2.6l.22-1.5a5.8 5.8 0 0 0 1.94-1.12l1.42.58 1.4-2.42-1.2-.92c.08-.36.12-.74.12-1.12Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18">
      <path d="M4.8 4.8 13.2 13.2M13.2 4.8 4.8 13.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 17 17" width="17">
      <path
        d="M9.9 3.1 13.9 7M3.9 13.1l1.2-4.2 6.7-6.8a1.5 1.5 0 0 1 2.1 0l1 1a1.5 1.5 0 0 1 0 2.1l-6.7 6.7-4.3 1.2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.55"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" className="chevronIcon" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="m6.4 3.7 4 4.3-4 4.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

const styles = `
  :root {
    color-scheme: light;
  }

  html,
  body {
    margin: 0;
    min-height: 100%;
  }

  body {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Microsoft YaHei", sans-serif;
    text-rendering: geometricPrecision;
  }

  button,
  input,
  textarea {
    font: inherit;
  }

  .page {
    --bg: #f4f6f8;
    --surface: #ffffff;
    --surface-soft: #f8fafb;
    --text: #151718;
    --muted: #6c757d;
    --faint: #96a0a8;
    --line: #dde4ea;
    --line-strong: #cbd4dc;
    --accent: #19b86a;
    --safe: #19b86a;
    --button: #151718;
    --buttonText: #ffffff;
    --danger-soft: #f0fbf6;
    --scrim: rgba(15, 18, 20, 0.22);
    --shadow: 0 24px 80px rgba(22, 28, 34, 0.08);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  .pageNight {
    color-scheme: dark;
    --bg: #0c0d0f;
    --surface: #15171a;
    --surface-soft: #1b1e22;
    --text: #f2f3f4;
    --muted: #8d949b;
    --faint: #6e757c;
    --line: #2a2e33;
    --line-strong: #3a4046;
    --accent: #35d183;
    --safe: #35d183;
    --button: #f2f3f4;
    --buttonText: #111315;
    --danger-soft: #11251c;
    --scrim: rgba(0, 0, 0, 0.46);
    --shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
  }

  .appShell {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, var(--bg)) 0%, var(--surface) 30%),
      var(--surface);
    border-left: 1px solid var(--line);
    border-right: 1px solid var(--line);
    box-shadow: var(--shadow);
    box-sizing: border-box;
    margin: 0 auto;
    max-width: 430px;
    min-height: 100vh;
    padding: 18px 22px 118px;
    position: relative;
  }

  @keyframes iosScreenEnter {
    from {
      opacity: 0;
      transform: translateX(18px) scale(0.992);
    }

    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  @keyframes iosNavEnter {
    from {
      opacity: 0;
      transform: translateY(-7px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes iosActionEnter {
    from {
      opacity: 0;
      transform: translate(-50%, 16px);
    }

    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @keyframes iosScrimEnter {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes iosScrimExit {
    from {
      opacity: 1;
    }

    to {
      opacity: 0;
    }
  }

  @keyframes iosSheetEnter {
    from {
      opacity: 0.96;
      transform: translate(-50%, 28px) scale(0.985);
    }

    to {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  @keyframes iosSheetExit {
    from {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }

    to {
      opacity: 0;
      transform: translate(-50%, 26px) scale(0.985);
    }
  }

  @keyframes contactEditorEnter {
    from {
      opacity: 0.98;
      transform: translate(-50%, 16px);
    }

    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @keyframes confirmPanelEnter {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 12px)) scale(0.985);
    }

    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .topBar {
    align-items: center;
    animation: iosNavEnter 240ms cubic-bezier(0.32, 0.72, 0, 1) both;
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    min-height: 44px;
    position: relative;
  }

  .loginScreen {
    animation: iosScreenEnter 320ms cubic-bezier(0.32, 0.72, 0, 1) both;
    backface-visibility: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: calc(100vh - 136px);
    padding-bottom: 54px;
    will-change: opacity, transform;
  }

  .loginBrand {
    text-align: center;
  }

  .loginBrand h1 {
    font-size: 27px;
    font-weight: 800;
    line-height: 36px;
  }

  .loginForm {
    display: grid;
    gap: 14px;
    margin-top: 42px;
  }

  .loginButton {
    margin-top: 8px;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    font-size: 18px;
    font-weight: 760;
    letter-spacing: 0;
    line-height: 24px;
    text-align: center;
  }

  h2 {
    font-size: 18px;
    font-weight: 780;
    letter-spacing: 0;
    line-height: 24px;
  }

  h3 {
    font-size: 15px;
    font-weight: 760;
    letter-spacing: 0;
    line-height: 22px;
  }

  .iconButton {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
    display: inline-flex;
    height: 40px;
    justify-content: center;
    padding: 0;
    width: 40px;
  }

  .iconButton:hover {
    background: var(--surface-soft);
  }

  .statusBlock {
    animation: iosScreenEnter 320ms cubic-bezier(0.32, 0.72, 0, 1) both;
    backface-visibility: hidden;
    padding: 42px 0 26px;
    text-align: center;
    will-change: opacity, transform;
  }

  .statusLine {
    align-items: center;
    color: var(--muted);
    display: inline-flex;
    font-size: 13px;
    font-weight: 720;
    gap: 8px;
    line-height: 18px;
  }

  .statusDot {
    animation: statusBreath 2.3s ease-in-out infinite;
    background: var(--safe);
    border-radius: 999px;
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--safe) 12%, transparent),
      0 0 12px color-mix(in srgb, var(--safe) 18%, transparent);
    flex: 0 0 auto;
    height: 8px;
    transform-origin: center;
    width: 8px;
  }

  @keyframes statusBreath {
    0%,
    100% {
      box-shadow:
        0 0 0 4px color-mix(in srgb, var(--safe) 10%, transparent),
        0 0 8px color-mix(in srgb, var(--safe) 12%, transparent);
      opacity: 0.9;
      transform: scale(0.96);
    }

    50% {
      box-shadow:
        0 0 0 7px color-mix(in srgb, var(--safe) 18%, transparent),
        0 0 18px color-mix(in srgb, var(--safe) 28%, transparent);
      opacity: 1;
      transform: scale(1.08);
    }
  }

  .timer {
    color: var(--text);
    font-size: clamp(56px, 14vw, 68px);
    font-variant-numeric: tabular-nums;
    font-weight: 780;
    letter-spacing: 0;
    line-height: 1;
    margin-top: 18px;
  }

  .timerCaption {
    color: var(--muted);
    font-size: 13px;
    font-weight: 560;
    line-height: 22px;
    margin: 18px auto 0;
    max-width: 282px;
  }

  .timerCaption strong {
    color: var(--text);
    font-weight: 780;
  }

  .primaryButton {
    background: var(--button);
    border: 0;
    border-radius: 8px;
    color: var(--buttonText);
    cursor: pointer;
    font-size: 17px;
    font-weight: 780;
    height: 52px;
    width: 100%;
  }

  .primaryButton:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  .safetyConfirmedButton,
  .safetyConfirmedButton:disabled {
    background:
      radial-gradient(ellipse at 50% 48%, rgba(52, 199, 89, 0.13) 0%, rgba(52, 199, 89, 0.1) 58%, rgba(42, 178, 82, 0.16) 100%);
    border: 1px solid rgba(52, 199, 89, 0.26);
    box-shadow:
      inset 0 2px 5px rgba(27, 111, 48, 0.14),
      inset 0 -1px 2px rgba(255, 255, 255, 0.76),
      inset 0 0 0 1px rgba(255, 255, 255, 0.4);
    color: #1f7a3a;
    cursor: default;
    opacity: 1;
  }

  .pageNight .safetyConfirmedButton,
  .pageNight .safetyConfirmedButton:disabled {
    background:
      radial-gradient(ellipse at 50% 48%, rgba(52, 199, 89, 0.24) 0%, rgba(52, 199, 89, 0.18) 58%, rgba(31, 150, 67, 0.28) 100%);
    border-color: rgba(52, 199, 89, 0.24);
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.32),
      inset 0 -1px 1px rgba(186, 255, 197, 0.1),
      inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    color: #b9f6c3;
  }

  .primaryButton:active,
  .systemPlan:active,
  .saveButton:active {
    transform: translateY(1px);
  }

  .inlineStatus,
  .quietLine,
  .settingsStatus {
    color: var(--muted);
    font-size: 12px;
    font-weight: 620;
    line-height: 18px;
    min-height: 18px;
  }

  .inlineStatus {
    margin-top: 10px;
    text-align: center;
  }

  .setupBlock {
    animation: iosScreenEnter 320ms cubic-bezier(0.32, 0.72, 0, 1) both;
    backface-visibility: hidden;
    padding: 42px 0 28px;
    will-change: opacity, transform;
  }

  .setupHead {
    align-items: flex-end;
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .setupHead span {
    color: var(--muted);
    font-size: 13px;
    font-weight: 720;
    line-height: 18px;
  }

  .setupHead strong {
    color: var(--text);
    font-size: 20px;
    font-weight: 760;
    line-height: 26px;
  }

  .timePicker {
    align-items: center;
    background: color-mix(in srgb, var(--surface-soft) 88%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
    border-radius: 8px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
    height: 224px;
    overflow: hidden;
    padding: 15px 14px;
    position: relative;
  }

  .pickerSelection {
    background: color-mix(in srgb, var(--surface) 74%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
    border-top: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
    height: 46px;
    left: 14px;
    pointer-events: none;
    position: absolute;
    right: 14px;
    top: calc(50% - 23px);
  }

  .wheelColumn {
    cursor: grab;
    height: 190px;
    min-width: 0;
    overflow: hidden;
    position: relative;
    touch-action: none;
    user-select: none;
    z-index: 1;
  }

  .wheelColumnDragging {
    cursor: grabbing;
  }

  .wheelColumnTrack {
    display: grid;
    grid-template-rows: repeat(5, 38px);
    will-change: transform;
  }

  .wheelColumnTrackSettling {
    transition: transform 340ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .wheelItem {
    background: transparent;
    border: 0;
    color: var(--faint);
    cursor: pointer;
    font-size: 24px;
    font-variant-numeric: tabular-nums;
    font-weight: 620;
    height: 38px;
    line-height: 38px;
    padding: 0;
    pointer-events: none;
    text-align: center;
    touch-action: none;
    user-select: none;
  }

  .wheelItemSelected {
    color: var(--text);
    font-size: 34px;
    font-weight: 780;
  }

  .wheelUnit {
    color: var(--muted);
    font-size: 15px;
    font-weight: 680;
    line-height: 20px;
    padding: 0 12px 0 4px;
    position: relative;
    z-index: 1;
  }

  .setupPlan {
    margin-top: 18px;
  }

  .visualSummary {
    animation: iosScreenEnter 340ms cubic-bezier(0.32, 0.72, 0, 1) 40ms both;
    backface-visibility: hidden;
    margin-top: 6px;
    will-change: opacity, transform;
  }

  .systemPlan {
    appearance: none;
    background: color-mix(in srgb, var(--surface-soft) 88%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
    border-radius: 8px;
    box-sizing: border-box;
    color: var(--text);
    cursor: pointer;
    display: block;
    overflow: hidden;
    padding: 0;
    text-align: left;
    width: 100%;
  }

  .systemPlan:hover {
    background: color-mix(in srgb, var(--surface-soft) 94%, var(--surface));
  }

  .systemPlanHead {
    align-items: center;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
    box-sizing: border-box;
    display: flex;
    height: 46px;
    justify-content: space-between;
    min-width: 0;
    padding: 0 13px 0 14px;
  }

  .systemState {
    align-items: center;
    color: var(--muted);
    display: inline-flex;
    font-size: 13px;
    font-weight: 680;
    gap: 8px;
    line-height: 18px;
    min-width: 0;
  }

  .systemStateDot {
    background: var(--accent);
    border-radius: 999px;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 11%, transparent);
    flex: 0 0 auto;
    height: 7px;
    width: 7px;
  }

  .systemStateDotMuted {
    background: var(--faint);
    box-shadow: none;
  }

  .chevronIcon {
    color: var(--faint);
    flex: 0 0 auto;
  }

  .systemRows {
    display: block;
    padding-bottom: 4px;
  }

  .systemRow {
    align-items: center;
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    margin-left: 14px;
    min-height: 44px;
    min-width: 0;
    padding: 0 14px 0 0;
  }

  .systemRow + .systemRow {
    border-top: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  }

  .systemRow > span {
    color: var(--muted);
    font-size: 14px;
    font-weight: 560;
    line-height: 20px;
  }

  .systemRow strong {
    color: color-mix(in srgb, var(--text) 90%, var(--muted));
    font-size: 15px;
    font-weight: 640;
    line-height: 20px;
    margin-left: 18px;
    max-width: 100%;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quietLine {
    animation: iosScreenEnter 340ms cubic-bezier(0.32, 0.72, 0, 1) 70ms both;
    margin-top: 10px;
    text-align: center;
  }

  .bottomAction {
    animation: iosActionEnter 280ms cubic-bezier(0.32, 0.72, 0, 1) both;
    background: var(--surface);
    bottom: 0;
    box-shadow: 0 -18px 30px color-mix(in srgb, var(--surface) 78%, transparent);
    box-sizing: border-box;
    left: 50%;
    max-width: 430px;
    padding: 18px 22px calc(22px + env(safe-area-inset-bottom));
    position: fixed;
    transform: translateX(-50%);
    width: 100%;
    will-change: opacity, transform;
    z-index: 10;
  }

  .confirmBackdrop {
    animation: iosScrimEnter 180ms ease-out both;
    background: var(--scrim);
    border: 0;
    inset: 0;
    padding: 0;
    position: fixed;
    z-index: 50;
  }

  .confirmPanel {
    animation: confirmPanelEnter 240ms cubic-bezier(0.32, 0.72, 0, 1) both;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
    box-sizing: border-box;
    color: var(--text);
    left: 50%;
    max-width: 360px;
    padding: 0 18px 18px;
    position: fixed;
    top: 50%;
    transform: translate(-50%, -50%);
    width: calc(100% - 44px);
    z-index: 55;
  }

  .confirmPanelHeader {
    align-items: center;
    display: flex;
    height: 56px;
    justify-content: space-between;
  }

  .confirmPanelHeader .iconButton {
    margin-right: -8px;
  }

  .confirmCodeField {
    margin-top: 2px;
  }

  .confirmError {
    color: var(--accent);
    font-size: 12px;
    font-weight: 720;
    line-height: 18px;
    min-height: 18px;
    padding-top: 8px;
  }

  .confirmSubmitButton {
    background: var(--button);
    border: 0;
    border-radius: 8px;
    color: var(--buttonText);
    cursor: pointer;
    font-size: 16px;
    font-weight: 780;
    height: 48px;
    margin-top: 8px;
    width: 100%;
  }

  .settingsBackdrop {
    animation: iosScrimEnter 240ms ease-out both;
    background: var(--scrim);
    border: 0;
    cursor: default;
    inset: 0;
    padding: 0;
    position: fixed;
    z-index: 20;
  }

  .settingsBackdropClosing {
    animation: iosScrimExit 220ms ease-in both;
  }

  .settingsSheet {
    --sheet-pad-x: 22px;
    animation: iosSheetEnter 300ms cubic-bezier(0.32, 0.72, 0, 1) both;
    background: var(--surface);
    border-left: 1px solid var(--line);
    border-right: 1px solid var(--line);
    bottom: 0;
    box-shadow: 0 28px 90px rgba(0, 0, 0, 0.22);
    box-sizing: border-box;
    color: var(--text);
    left: 50%;
    max-width: 430px;
    overflow-y: auto;
    padding: 0 var(--sheet-pad-x);
    position: fixed;
    top: 0;
    transform: translateX(-50%);
    width: 100%;
    will-change: opacity, transform;
    z-index: 30;
  }

  .settingsSheetClosing {
    animation: iosSheetExit 240ms cubic-bezier(0.5, 0, 0.75, 0) both;
  }

  .sheetHeader {
    align-items: center;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    box-sizing: border-box;
    display: flex;
    height: 56px;
    justify-content: space-between;
    margin-left: calc(-1 * var(--sheet-pad-x));
    margin-right: calc(-1 * var(--sheet-pad-x));
    padding: 0 14px 0 var(--sheet-pad-x);
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .sheetHeader > div {
    min-width: 0;
  }

  .sheetHeader .iconButton {
    flex: 0 0 auto;
    margin-right: -4px;
  }

  .settingsRow p {
    color: var(--muted);
    font-size: 12px;
    font-weight: 620;
    line-height: 18px;
    margin-top: 3px;
  }

  .settingsRow {
    align-items: center;
    border-bottom: 1px solid var(--line);
    border-top: 0;
    display: flex;
    justify-content: space-between;
    margin-top: 0;
    min-height: 76px;
    padding: 14px 0;
  }

  .themeSegmented {
    align-items: center;
    background: var(--surface-soft);
    border: 1px solid var(--line);
    border-radius: 9px;
    box-sizing: border-box;
    display: grid;
    flex: 0 0 auto;
    gap: 2px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 2px;
    width: 174px;
  }

  .themeSegmentedOption {
    background: transparent;
    border: 0;
    border-radius: 7px;
    color: var(--muted);
    cursor: pointer;
    font-size: 13px;
    font-weight: 720;
    height: 30px;
    letter-spacing: 0;
    min-width: 0;
    padding: 0 8px;
    transition:
      background 160ms ease,
      box-shadow 160ms ease,
      color 160ms ease,
      transform 120ms ease;
  }

  .themeSegmentedOption:active {
    transform: scale(0.98);
  }

  .themeSegmentedOptionSelected {
    background: color-mix(in srgb, var(--surface) 92%, var(--text) 4%);
    box-shadow: 0 1px 6px color-mix(in srgb, var(--text) 9%, transparent);
    color: var(--text);
  }

  .planEditor {
    padding-top: 22px;
  }

  .sheetSectionHead {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .sectionIconButton {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    height: 32px;
    justify-content: center;
    margin-right: -6px;
    padding: 0;
    width: 32px;
  }

  .sectionIconButton:hover {
    background: var(--surface-soft);
    color: var(--text);
  }

  .sheetSectionHead span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 720;
    line-height: 16px;
  }

  .messageSectionHead {
    margin-bottom: 10px;
    margin-top: 18px;
  }

  .field {
    display: grid;
    gap: 8px;
    margin-top: 14px;
  }

  .field > span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 720;
    line-height: 16px;
  }

  input,
  textarea {
    background: var(--surface-soft);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-sizing: border-box;
    color: var(--text);
    outline: none;
    width: 100%;
  }

  input {
    height: 44px;
    padding: 0 12px;
  }

  textarea {
    min-height: 74px;
    padding: 12px;
    resize: vertical;
  }

  input:focus,
  textarea:focus {
    border-color: var(--line-strong);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--line-strong) 26%, transparent);
  }

  .contactList {
    background: var(--surface-soft);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }

  .contactSwitchRow {
    align-items: center;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    gap: 16px;
    justify-content: space-between;
    min-height: 54px;
    padding: 0 12px 0 14px;
    position: relative;
    user-select: none;
  }

  .contactSwitchRow + .contactSwitchRow {
    border-top: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
  }

  .contactSwitchRow:focus-within .switchTrack {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .contactSwitchName {
    color: var(--text);
    font-size: 15px;
    font-weight: 650;
    line-height: 22px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .switchInput {
    appearance: none;
    height: 1px;
    opacity: 0;
    pointer-events: none;
    position: absolute;
    width: 1px;
  }

  .switchTrack {
    background: color-mix(in srgb, var(--faint) 28%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--line-strong) 74%, transparent);
    border-radius: 999px;
    box-sizing: border-box;
    flex: 0 0 auto;
    height: 30px;
    padding: 2px;
    transition:
      background 180ms ease,
      border-color 180ms ease;
    width: 50px;
  }

  .switchThumb {
    background: #ffffff;
    border-radius: 999px;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.2);
    display: block;
    height: 24px;
    transform: translateX(0);
    transition: transform 180ms cubic-bezier(0.32, 0.72, 0, 1);
    width: 24px;
  }

  .contactSwitchRowEnabled .switchTrack {
    background: var(--accent);
    border-color: var(--accent);
  }

  .contactSwitchRowEnabled .switchThumb {
    transform: translateX(20px);
  }

  .contactEditorBackdrop {
    background: color-mix(in srgb, var(--scrim) 74%, transparent);
    border: 0;
    inset: 0;
    padding: 0;
    position: fixed;
    z-index: 40;
  }

  .contactEditorPanel {
    animation: contactEditorEnter 280ms cubic-bezier(0.32, 0.72, 0, 1) both;
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 0;
    bottom: 0;
    box-shadow: 0 -18px 54px rgba(0, 0, 0, 0.18);
    box-sizing: border-box;
    color: var(--text);
    left: 50%;
    max-height: none;
    max-width: 430px;
    overflow-y: auto;
    position: fixed;
    top: 56px;
    transform: translateX(-50%);
    width: 100%;
    z-index: 45;
  }

  .contactEditorHeader {
    align-items: center;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    box-sizing: border-box;
    display: flex;
    height: 56px;
    justify-content: space-between;
    padding: 0 14px 0 22px;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .contactEditorHeader .iconButton {
    margin-right: -4px;
  }

  .contactEditorBody {
    display: grid;
    gap: 12px;
    padding: 14px 22px calc(22px + env(safe-area-inset-bottom));
  }

  .contactEditorBlock {
    background: var(--surface-soft);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
  }

  .contactEditorBlockHead {
    align-items: center;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 10px;
  }

  .contactEditorBlockHead strong {
    color: var(--text);
    font-size: 15px;
    font-weight: 720;
    line-height: 22px;
  }

  .contactEditorBlockHead span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 720;
    line-height: 16px;
  }

  .contactEditField {
    margin-top: 10px;
  }

  .templateGroup {
    display: grid;
    gap: 8px;
    margin-top: 16px;
  }

  .templateRow {
    align-items: center;
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
    display: grid;
    font-size: 14px;
    font-weight: 650;
    gap: 10px;
    grid-template-columns: 16px 1fr;
    min-height: 44px;
    padding: 10px 12px;
    text-align: left;
  }

  .templateRowSelected {
    background: color-mix(in srgb, var(--accent) 9%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
  }

  .radioMark {
    border: 1.5px solid var(--line-strong);
    border-radius: 999px;
    box-sizing: border-box;
    height: 14px;
    width: 14px;
  }

  .templateRowSelected .radioMark {
    border: 4px solid var(--accent);
  }

  .messagePreview {
    background: var(--surface-soft);
    border-left: 2px solid var(--accent);
    border-radius: 0 8px 8px 0;
    margin-top: 16px;
    padding: 12px 14px;
  }

  .messagePreview span {
    color: var(--muted);
    display: block;
    font-size: 12px;
    font-weight: 720;
    line-height: 16px;
    margin-bottom: 5px;
  }

  .messagePreview p {
    color: var(--text);
    font-size: 14px;
    font-weight: 650;
    line-height: 22px;
  }

  .settingsStatus {
    margin-top: 12px;
  }

  .sheetFooter {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--surface) 0%, transparent) 0%, var(--surface) 26%),
      var(--surface);
    bottom: 0;
    margin-top: 16px;
    padding: 18px 0 22px;
    position: sticky;
  }

  .saveButton {
    background: var(--button);
    border: 0;
    border-radius: 8px;
    color: var(--buttonText);
    cursor: pointer;
    font-size: 16px;
    font-weight: 780;
    height: 50px;
    width: 100%;
  }

  .saveButton:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  @media (max-width: 520px) {
    .appShell {
      border: 0;
      box-shadow: none;
      max-width: none;
      padding: 14px 18px 118px;
    }

    .statusBlock {
      padding-top: 54px;
    }

    .timer {
      font-size: clamp(52px, 16vw, 66px);
    }

    .settingsSheet {
      --sheet-pad-x: 18px;
      border: 0;
      padding: 0 var(--sheet-pad-x);
    }

    .bottomAction {
      padding-left: 18px;
      padding-right: 18px;
    }

  }
`;
