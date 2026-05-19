const state = {
  maxuscore: [],
  calendar: [],
  members: new Map(),
  results: [],
  filter: "issues",
  search: "",
};

const issueLabels = {
  matched: "一致",
  missing: "未反映",
  time: "日時ズレ",
  member: "担当者違い",
};

const issueClasses = {
  matched: "status-matched",
  missing: "status-missing",
  time: "status-time",
  member: "status-member",
};

const headerAliases = {
  customer: ["顧客名", "お客様名", "氏名", "名前", "customer", "name", "client"],
  appointmentAt: ["査定予約日時", "査定予定日時", "査定予約日", "査定予定日", "予約日時", "予約日", "アポイント日時", "アポ日時", "アポイント日", "アポ日", "訪問日時", "訪問日", "出張日時", "出張日", "作業日時", "作業日", "予定日時", "予定日", "開始日時", "execution date"],
  appointmentStart: ["査定予約時刻", "査定予定時刻", "査定予約時間", "査定予定時間", "予約時刻", "予約時間", "アポイント時刻", "アポ時刻", "アポイント時間", "アポ時間", "訪問時刻", "訪問時間", "出張時刻", "出張時間", "作業時刻", "作業時間", "予定時刻", "予定時間"],
  appointmentEndAt: ["査定終了日時", "予約終了日時", "アポイント終了日時", "アポ終了日時", "訪問終了日時", "出張終了日時", "作業終了日時", "終了予定日時", "終了日時"],
  date: ["日付", "予約日", "アポ日", "開始日", "date", "start date"],
  start: ["開始時刻", "開始時間", "開始", "start", "start time"],
  end: ["終了時刻", "終了時間", "終了", "end", "end time"],
  member: ["査定担当者", "査定担当", "予約担当者", "予約担当", "案件担当者", "案件担当", "受付担当者", "受付担当", "訪問担当者", "訪問担当", "出張担当者", "出張担当", "作業担当者", "作業担当", "契約担当者", "契約担当", "営業担当者", "営業担当", "担当者", "担当", "スタッフ", "メンバー", "member", "staff", "owner"],
  status: ["ステータス", "状態", "status"],
  title: ["タイトル", "件名", "予定", "summary", "subject", "title"],
};

const elements = {
  maxuscoreFile: document.querySelector("#maxuscoreFile"),
  calendarFile: document.querySelector("#calendarFile"),
  memberFile: document.querySelector("#memberFile"),
  runCheckButton: document.querySelector("#runCheckButton"),
  loadDemoButton: document.querySelector("#loadDemoButton"),
  exportButton: document.querySelector("#exportButton"),
  toleranceInput: document.querySelector("#toleranceInput"),
  titleMatchSelect: document.querySelector("#titleMatchSelect"),
  ignoreDoneInput: document.querySelector("#ignoreDoneInput"),
  searchInput: document.querySelector("#searchInput"),
  dataStatus: document.querySelector("#dataStatus"),
  resultList: document.querySelector("#resultList"),
  emptyState: document.querySelector("#emptyState"),
  resultTemplate: document.querySelector("#resultTemplate"),
  maxuscoreCount: document.querySelector("#maxuscoreCount"),
  calendarCount: document.querySelector("#calendarCount"),
  issueCount: document.querySelector("#issueCount"),
  matchedCount: document.querySelector("#matchedCount"),
  missingCount: document.querySelector("#missingCount"),
  timeMismatchCount: document.querySelector("#timeMismatchCount"),
  memberMismatchCount: document.querySelector("#memberMismatchCount"),
};

elements.maxuscoreFile.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const rows = parseCsv(await file.text());
  state.maxuscore = normalizeMaxuscoreRows(rows);
  setLoaded(event.target);
  updateDataStatus();
  runCheck();
});

elements.calendarFile.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const calendarEvents = [];
  for (const file of files) {
    const content = await file.text();
    const sourceName = getSourceName(file.name);
    const events = file.name.toLowerCase().endsWith(".ics")
      ? parseIcs(content, sourceName)
      : normalizeCalendarRows(parseCsv(content), sourceName);
    calendarEvents.push(...events);
  }
  state.calendar = calendarEvents;
  setLoaded(event.target);
  updateDataStatus();
  runCheck();
});

elements.memberFile.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  state.members = parseMembers(parseCsv(await file.text()));
  setLoaded(event.target);
  updateDataStatus();
  runCheck();
});

elements.runCheckButton.addEventListener("click", runCheck);

elements.loadDemoButton.addEventListener("click", () => {
  state.maxuscore = normalizeMaxuscoreRows(parseCsv(demoMaxuscoreCsv));
  state.calendar = normalizeCalendarRows(parseCsv(demoCalendarCsv));
  state.members = parseMembers(parseCsv(demoMembersCsv));
  document.querySelectorAll(".upload-box").forEach((box) => box.classList.add("is-loaded"));
  updateDataStatus();
  runCheck();
});

elements.exportButton.addEventListener("click", () => {
  const rows = getVisibleResults().map((result) => ({
    種別: issueLabels[result.type],
    顧客名: result.customer,
    担当者: result.member,
    マクサスコア日時: result.maxuscore ? formatDateTimeRange(result.maxuscore.start, result.maxuscore.end) : "",
    カレンダー日時: result.calendar ? formatDateTimeRange(result.calendar.start, result.calendar.end) : "",
    詳細: result.note,
  }));
  downloadText("calendar-check-results.csv", toCsv(rows));
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderResults();
});

elements.toleranceInput.addEventListener("change", runCheck);
elements.titleMatchSelect.addEventListener("change", runCheck);
elements.ignoreDoneInput.addEventListener("change", runCheck);

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".tab-button").forEach((tab) => {
      const isActive = tab === button;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
    renderResults();
  });
});

renderSummary();
renderResults();

function runCheck() {
  const toleranceMinutes = Number(elements.toleranceInput.value || 0);
  const filteredCalendar = elements.ignoreDoneInput.checked
    ? state.calendar.filter((event) => !looksCanceled(event.title))
    : state.calendar;
  const results = [];

  state.maxuscore.forEach((appointment) => {
    const candidates = filteredCalendar
      .map((event) => ({
        event,
        score: scoreCandidate(appointment, event, toleranceMinutes),
      }))
      .filter((candidate) => candidate.score.relevant)
      .sort((a, b) => b.score.total - a.score.total);

    const best = candidates[0];
    if (!best) {
      results.push(createResult("missing", appointment, null, "対応するカレンダー予定が見つかりません。"));
      return;
    }

    if (best.score.timeMismatch) {
      results.push(createResult("time", appointment, best.event, "日時が許容範囲を超えてずれています。"));
      return;
    }

    if (best.score.memberMismatch) {
      results.push(createResult("member", appointment, best.event, "担当者とカレンダー所有者の対応が違う可能性があります。"));
      return;
    }

    if (best.score.matched) {
      results.push(createResult("matched", appointment, best.event, "マクサスコアとカレンダーが一致しています。"));
      return;
    }

    results.push(createResult("missing", appointment, null, "同じ担当者の予定はありますが、日時または顧客名が一致しません。"));
  });

  state.results = results.sort(sortResults);
  renderSummary();
  renderResults();
}

function scoreCandidate(appointment, event, toleranceMinutes) {
  const timeDiff = Math.abs(appointment.start.getTime() - event.start.getTime()) / 60000;
  const timeClose = timeDiff <= toleranceMinutes;
  const sameDay = toDateKey(appointment.start) === toDateKey(event.start);
  const memberMatch = isMemberMatch(appointment.member, event);
  const titleMatch = isTitleMatch(appointment.customer, event.title);
  const titleMatchRequired = elements.titleMatchSelect.value !== "off";
  const relevant = timeClose || sameDay || memberMatch || titleMatch;
  const matched = timeClose && (titleMatch || !titleMatchRequired) && (memberMatch || !appointment.member);
  const total = (timeClose ? 50 : sameDay ? 18 : 0) + (memberMatch ? 30 : 0) + (titleMatch ? 30 : 0);

  return {
    total,
    relevant,
    matched,
    timeClose,
    titleMatch,
    memberMatch,
    timeMismatch: sameDay && !timeClose && (memberMatch || titleMatch),
    memberMismatch: timeClose && titleMatchRequired && titleMatch && !memberMatch,
  };
}

function isTitleMatch(customer, title) {
  if (elements.titleMatchSelect.value === "off") return true;
  if (!customer || !title) return false;
  const customerKey = normalizeNameForMatch(customer);
  const titleKey = normalizeNameForMatch(title);
  if (!customerKey || !titleKey) return false;
  if (titleKey.includes(customerKey) || customerKey.includes(titleKey)) return true;
  return similarity(customerKey, titleKey) >= 0.72;
}

function createResult(type, maxuscore, calendar, note) {
  return {
    id: crypto.randomUUID(),
    type,
    customer: maxuscore?.customer || extractCustomerFromTitle(calendar?.title || "") || "不明",
    member: displayMemberName(maxuscore?.member || calendar?.member) || "不明",
    maxuscore,
    calendar,
    note,
  };
}

function renderSummary() {
  const issueResults = state.results.filter((result) => result.type !== "matched");
  elements.maxuscoreCount.textContent = String(state.maxuscore.length);
  elements.calendarCount.textContent = String(state.calendar.length);
  elements.issueCount.textContent = String(issueResults.length);
  elements.matchedCount.textContent = String(state.results.filter((result) => result.type === "matched").length);
  elements.missingCount.textContent = String(state.results.filter((result) => result.type === "missing").length);
  elements.timeMismatchCount.textContent = String(state.results.filter((result) => result.type === "time").length);
  elements.memberMismatchCount.textContent = String(state.results.filter((result) => result.type === "member").length);
}

function renderResults() {
  const results = getVisibleResults();
  elements.resultList.replaceChildren();
  elements.emptyState.hidden = results.length > 0;

  results.forEach((result) => {
    const node = elements.resultTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add(issueClasses[result.type]);
    node.querySelector("h3").textContent = result.customer;
    node.querySelector(".result-type").textContent = issueLabels[result.type];
    node.querySelector(".result-detail").innerHTML = `
      <div class="detail-cell"><span>担当者</span><strong>${escapeHtml(result.member)}</strong></div>
      <div class="detail-cell"><span>マクサスコア</span><strong>${escapeHtml(result.maxuscore ? formatDateTimeRange(result.maxuscore.start, result.maxuscore.end) : "なし")}</strong></div>
      <div class="detail-cell"><span>カレンダー</span><strong>${escapeHtml(result.calendar ? formatDateTimeRange(result.calendar.start, result.calendar.end) : "なし")}</strong></div>
      <div class="detail-cell"><span>詳細</span><strong>${escapeHtml(result.note)}</strong></div>
    `;
    elements.resultList.append(node);
  });
}

function getVisibleResults() {
  const query = normalizeText(state.search);
  return state.results
    .filter((result) => {
      if (state.filter === "issues") return result.type !== "matched";
      if (state.filter === "matched") return result.type === "matched";
      return true;
    })
    .filter((result) => {
      if (!query) return true;
      return normalizeText([result.customer, result.member, result.note].join(" ")).includes(query);
    });
}

function normalizeMaxuscoreRows(rows) {
  return rows
    .map((row, index) => {
      const customer = pick(row, "customer") || pick(row, "title");
      const member = normalizeMemberName(pick(row, "member") || pickByHeaderIncludes(row, "member"));
      const status = pick(row, "status");
      const startDate = parseMaxuscoreStartDate(row);
      const endDate = parseMaxuscoreEndDate(row, startDate);
      if (!customer || !startDate || looksCanceled(status)) return null;
      return {
        id: `maxuscore-${index}`,
        customer,
        member,
        status,
        start: startDate,
        end: endDate,
      };
    })
    .filter(Boolean);
}

function parseMaxuscoreStartDate(row) {
  const appointmentAt = pick(row, "appointmentAt") || pickByHeaderIncludes(row, "appointmentAt");
  const labeledDate = extractLabeledDateTime(appointmentAt, headerAliases.appointmentAt);
  if (labeledDate) return labeledDate;

  const appointmentStart = pick(row, "appointmentStart") || pickByHeaderIncludes(row, "appointmentStart") || pick(row, "start");
  const appointmentDate = parseLastDateTime(appointmentAt) || parseDateTime(appointmentAt, appointmentStart);
  if (appointmentDate) return appointmentDate;

  return parseDateTime(pick(row, "date"), pick(row, "start"));
}

function parseMaxuscoreEndDate(row, startDate) {
  const appointmentEndAt = pick(row, "appointmentEndAt") || pickByHeaderIncludes(row, "appointmentEndAt");
  const labeledDate = extractLabeledDateTime(appointmentEndAt, headerAliases.appointmentEndAt);
  return labeledDate || parseLastDateTime(appointmentEndAt) || parseDateTime(appointmentEndAt, pick(row, "end")) || parseDateTime(pick(row, "date"), pick(row, "end")) || addMinutes(startDate, 60);
}

function normalizeCalendarRows(rows, sourceName = "") {
  return rows
    .map((row, index) => {
      const title = pick(row, "title") || pick(row, "customer");
      const date = pick(row, "date");
      const start = pick(row, "start");
      const end = pick(row, "end");
      const member = pick(row, "member") || pick(row, "calendar") || sourceName;
      const startDate = parseDateTime(date, start);
      const endDate = parseDateTime(date, end) || addMinutes(startDate, 60);
      if (!title || !startDate) return null;
      return {
        id: `calendar-${index}`,
        title,
        member,
        start: startDate,
        end: endDate,
      };
    })
    .filter(Boolean);
}

function parseMembers(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const maxuscoreName = pick(row, "member") || Object.values(row)[0];
    const calendarName = pick(row, "calendar") || pick(row, "title") || Object.values(row)[1];
    if (maxuscoreName && calendarName) {
      map.set(normalizeText(maxuscoreName), calendarName.trim());
    }
  });
  return map;
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }

  const [headers = [], ...body] = rows.filter((line) => line.some((cell) => cell.trim()));
  return body.map((line) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header.trim()] = (line[index] || "").trim();
    });
    return item;
  });
}

function parseIcs(text, sourceName = "") {
  const events = [];
  const headerLines = unfoldIcs(text.split("BEGIN:VEVENT")[0] || "");
  const calendarName = getIcsValue(headerLines, "X-WR-CALNAME") || getIcsValue(headerLines, "NAME") || sourceName;
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  blocks.forEach((block, index) => {
    const lines = unfoldIcs(block.split("END:VEVENT")[0]);
    const summary = getIcsValue(lines, "SUMMARY");
    const start = parseIcsDate(getIcsValue(lines, "DTSTART"));
    const end = parseIcsDate(getIcsValue(lines, "DTEND")) || addMinutes(start, 60);
    const organizer = getIcsValue(lines, "ORGANIZER");
    if (!summary || !start) return;
    events.push({
      id: `ics-${index}`,
      title: summary,
      member: calendarName || organizer.replace(/^mailto:/i, ""),
      start,
      end,
    });
  });
  return events;
}

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function getIcsValue(lines, key) {
  const line = lines.find((item) => item.startsWith(`${key}:`) || item.startsWith(`${key};`));
  if (!line) return "";
  return line.slice(line.indexOf(":") + 1).replaceAll("\\,", ",").replaceAll("\\n", " ").trim();
}

function getSourceName(fileName) {
  return fileName.replace(/\.(csv|ics)$/i, "").trim();
}

function parseIcsDate(value) {
  if (!value) return null;
  const isUtc = value.endsWith("Z");
  const clean = value.replace("Z", "");
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00"] = match;
  if (isUtc) {
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  }
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

function pick(row, key) {
  const aliases = headerAliases[key] || [key];
  const foundKey = Object.keys(row).find((header) =>
    aliases.some((alias) => normalizeText(header) === normalizeText(alias))
  );
  return foundKey ? row[foundKey].trim() : "";
}

function pickByHeaderIncludes(row, key) {
  const aliases = headerAliases[key] || [key];
  const foundKey = Object.keys(row).find((header) =>
    aliases.some((alias) => normalizeText(header).includes(normalizeText(alias)))
  );
  return foundKey ? row[foundKey].trim() : "";
}

function extractLabeledDateTime(value, labels) {
  const text = String(value || "").replace(/\s+/g, " ");
  if (!text) return null;

  for (const label of labels) {
    const index = text.indexOf(label);
    if (index === -1) continue;
    const date = parseFirstDateTime(text.slice(index + label.length));
    if (date) return date;
  }

  return null;
}

function parseFirstDateTime(value) {
  const match = String(value || "").normalize("NFKC").match(/\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2}日?(?:\s*[（(][^）)]*[）)])?\s*\d{1,2}(?::\d{2}|時(?:\d{1,2}分?)?)/);
  return match ? parseDateTime(match[0], "") : null;
}

function parseLastDateTime(value) {
  const matches = String(value || "").normalize("NFKC").match(/\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2}日?(?:\s*[（(][^）)]*[）)])?\s*\d{1,2}(?::\d{2}|時(?:\d{1,2}分?)?)/g);
  return matches?.length ? parseDateTime(matches[matches.length - 1], "") : null;
}

function parseDateTime(dateValue, timeValue) {
  if (!dateValue && !timeValue) return null;
  const combined = timeValue ? `${dateValue} ${timeValue}` : dateValue;
  const normalized = String(combined)
    .normalize("NFKC")
    .replaceAll("/", "-")
    .replace(/[年月]/g, "-")
    .replace("日", "")
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace("時", ":")
    .replace("分", "")
    .trim();
  const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:.*?(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const [, year, month, day, hour = "00", minute = "00"] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }

  const direct = new Date(normalized);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

function isMemberMatch(member, event) {
  const tokens = getMemberTokens(resolveMember(member));
  if (!tokens.length) return false;
  const targets = [event.member, event.title].map(normalizeText);
  return tokens.some((token) => targets.some((target) => target.includes(token)));
}

function resolveMember(member) {
  return state.members.get(normalizeText(member)) || member || "";
}

function normalizeMemberName(value) {
  const raw = String(value || "")
    .replace(/mailto:/i, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[|｜/／,，、;；].*$/, "")
    .trim();
  if (!raw) return "";
  const firstPart = raw.split(/[\s　]+/).find(Boolean) || raw;
  return guessSurname(firstPart);
}

function displayMemberName(value) {
  return normalizeMemberName(value);
}

function getMemberTokens(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const normalizedRaw = normalizeText(raw);
  const surname = normalizeText(normalizeMemberName(raw));
  const tokens = [surname, normalizedRaw];
  if (normalizedRaw.length >= 2) tokens.push(normalizedRaw.slice(0, 2));
  if (normalizedRaw.length >= 3) tokens.push(normalizedRaw.slice(0, 3));
  return [...new Set(tokens.filter((token) => token.length >= 2))];
}

function guessSurname(value) {
  const compact = String(value || "").replace(/\s+/g, "");
  const threeCharSurnames = ["入戸野", "佐々木", "長谷川", "小野寺", "久保田", "大久保", "五十嵐", "宇佐美"];
  const matched = threeCharSurnames.find((surname) => compact.startsWith(surname));
  if (matched) return matched;
  if (compact.length >= 4 && /[\u3040-\u30ff\u3400-\u9fff]/.test(compact)) return compact.slice(0, 2);
  return compact;
}

function extractCustomerFromTitle(title) {
  return title.split(/[【】\[\]（）()]/).find((part) => part.trim().length > 1)?.trim() || title;
}

function looksCanceled(value) {
  return /キャンセル|取消|中止|失注|cancel/i.test(String(value || ""));
}

function sortResults(a, b) {
  const order = { missing: 0, time: 1, member: 2, matched: 3 };
  const aTime = (a.maxuscore || a.calendar)?.start?.getTime() || 0;
  const bTime = (b.maxuscore || b.calendar)?.start?.getTime() || 0;
  return order[a.type] - order[b.type] || aTime - bTime;
}

function updateDataStatus() {
  const parts = [
    `M ${state.maxuscore.length}`,
    `G ${state.calendar.length}`,
    `対応 ${state.members.size}`,
  ];
  elements.dataStatus.textContent = parts.join(" / ");
  renderSummary();
}

function setLoaded(input) {
  input.closest(".upload-box").classList.add("is-loaded");
}

function formatDateTimeRange(start, end) {
  return `${formatDateTime(start)}-${formatTime(end)}`;
}

function formatDateTime(date) {
  if (!date) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${formatTime(date)}`;
}

function formatTime(date) {
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function addMinutes(date, minutes) {
  if (!date) return null;
  return new Date(date.getTime() + minutes * 60000);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s　・:：\-ー_【】\[\]（）()]/g, "");
}

function normalizeNameForMatch(value) {
  return normalizeText(
    String(value || "")
      .replace(/様|さま|さん|殿|氏/g, "")
      .replace(/株式会社|有限会社|合同会社|買取|査定|予約|訪問|出張|案件|予定|カレンダー/g, "")
  );
}

function similarity(a, b) {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (!shorter || !longer) return 0;
  let best = 0;
  for (let index = 0; index <= longer.length - shorter.length; index += 1) {
    const slice = longer.slice(index, index + shorter.length);
    best = Math.max(best, 1 - levenshtein(shorter, slice) / Math.max(shorter.length, slice.length));
  }
  return best;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const demoMaxuscoreCsv = `顧客名,日付,開始時刻,終了時刻,担当者,ステータス
山田太郎,2026-05-18,10:00,11:00,佐藤,確定
鈴木花子,2026-05-18,14:00,15:00,田中,確定
株式会社サンプル,2026-05-19,16:00,17:00,佐藤,確定`;

const demoCalendarCsv = `タイトル,日付,開始時刻,終了時刻,担当者
山田太郎 初回商談,2026-05-18,10:00,11:00,sato@example.com
鈴木花子 初回商談,2026-05-18,14:30,15:30,tanaka@example.com
別件ミーティング,2026-05-20,12:00,13:00,sato@example.com`;

const demoMembersCsv = `担当者,カレンダー
佐藤,sato@example.com
田中,tanaka@example.com`;
