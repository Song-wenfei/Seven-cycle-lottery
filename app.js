const CYCLE_LENGTH = 7;
const STORAGE_KEY = "seven-cycle-state-v1";

const DEFAULT_CHOICES = [
  "Movie night",
  "Cook something new",
  "Mini adventure",
  "Music break",
  "Call someone kind",
  "Tiny room reset",
  "Treat yourself"
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric"
});

const elements = {
  todayLabel: document.querySelector("#todayLabel"),
  cycleSummary: document.querySelector("#cycleSummary"),
  cycleTrack: document.querySelector("#cycleTrack"),
  resultLabel: document.querySelector("#resultLabel"),
  choiceResult: document.querySelector("#choiceResult"),
  resultNote: document.querySelector("#resultNote"),
  playButton: document.querySelector("#playButton"),
  resetCycleButton: document.querySelector("#resetCycleButton"),
  choicesForm: document.querySelector("#choicesForm"),
  saveStatus: document.querySelector("#saveStatus"),
  remainingPill: document.querySelector("#remainingPill"),
  historyList: document.querySelector("#historyList"),
  choiceInputs: Array.from(document.querySelectorAll(".choice-field input"))
};

let state = loadState();

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.choices)) {
      return createInitialState();
    }

    return {
      choices: normalizeChoices(stored.choices),
      cycleStart: typeof stored.cycleStart === "string" ? stored.cycleStart : null,
      playedDates: stored.playedDates && typeof stored.playedDates === "object" ? stored.playedDates : {},
      usedSlots: Array.isArray(stored.usedSlots) ? stored.usedSlots.filter(isChoiceSlot) : [],
      history: Array.isArray(stored.history) ? stored.history.filter(isHistoryItem) : []
    };
  } catch {
    return createInitialState();
  }
}

function createInitialState() {
  return {
    choices: [...DEFAULT_CHOICES],
    cycleStart: null,
    playedDates: {},
    usedSlots: [],
    history: []
  };
}

function normalizeChoices(choices) {
  const safeChoices = [...choices, ...DEFAULT_CHOICES].slice(0, CYCLE_LENGTH);
  return safeChoices.map((choice, index) => {
    const value = typeof choice === "string" ? choice.trim() : "";
    return value || DEFAULT_CHOICES[index];
  });
}

function isChoiceSlot(value) {
  return Number.isInteger(value) && value >= 0 && value < CYCLE_LENGTH;
}

function isHistoryItem(item) {
  return (
    item &&
    typeof item.date === "string" &&
    typeof item.cycleStart === "string" &&
    isChoiceSlot(item.slot) &&
    typeof item.choice === "string"
  );
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key, amount) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function dateKeyToUtcTime(key) {
  const date = parseDateKey(key);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(startKey, endKey) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((dateKeyToUtcTime(endKey) - dateKeyToUtcTime(startKey)) / dayMs);
}

function formatDateKey(key) {
  return dateFormatter.format(parseDateKey(key));
}

function hasPlayedOn(dateKey) {
  return Object.prototype.hasOwnProperty.call(state.playedDates, dateKey);
}

function getPlayedSlot(dateKey) {
  return hasPlayedOn(dateKey) ? state.playedDates[dateKey] : null;
}

function findHistory(dateKey) {
  return state.history.find((item) => item.date === dateKey && item.cycleStart === state.cycleStart);
}

function startCycle(startKey) {
  state.cycleStart = startKey;
  state.playedDates = {};
  state.usedSlots = [];
  state.history = [];
  saveState();
}

function ensureCurrentCycle() {
  if (!state.cycleStart) {
    return;
  }

  const today = localDateKey();
  if (daysBetween(state.cycleStart, today) >= CYCLE_LENGTH) {
    startCycle(today);
  }
}

function getCycleDay() {
  if (!state.cycleStart) {
    return 1;
  }

  return Math.min(CYCLE_LENGTH, Math.max(1, daysBetween(state.cycleStart, localDateKey()) + 1));
}

function getAvailableSlots() {
  const used = new Set(state.usedSlots);
  return Array.from({ length: CYCLE_LENGTH }, (_, index) => index).filter((slot) => !used.has(slot));
}

function randomIndex(max) {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % max;
  }

  return Math.floor(Math.random() * max);
}

function playToday() {
  ensureCurrentCycle();

  const today = localDateKey();
  if (!state.cycleStart) {
    startCycle(today);
  }

  if (hasPlayedOn(today)) {
    render("Already played today.");
    return;
  }

  const availableSlots = getAvailableSlots();
  if (!availableSlots.length) {
    render("Cycle complete.");
    return;
  }

  const slot = availableSlots[randomIndex(availableSlots.length)];
  const choice = state.choices[slot];

  state.playedDates[today] = slot;
  state.usedSlots.push(slot);
  state.history.push({
    date: today,
    cycleStart: state.cycleStart,
    slot,
    choice
  });
  saveState();
  render("Choice unlocked.");
}

function saveChoices(event) {
  event.preventDefault();

  const choices = elements.choiceInputs.map((input) => input.value.trim());
  const firstEmpty = choices.findIndex((choice) => !choice);

  elements.choiceInputs.forEach((input, index) => {
    input.setAttribute("aria-invalid", choices[index] ? "false" : "true");
  });

  if (firstEmpty >= 0) {
    elements.choiceInputs[firstEmpty].focus();
    setSaveStatus("Add all seven choices.", "error");
    return;
  }

  state.choices = choices;
  saveState();
  setSaveStatus("Saved.", "good");
  render();
}

function setSaveStatus(message = "", tone = "") {
  elements.saveStatus.textContent = message;
  elements.saveStatus.classList.toggle("is-error", tone === "error");
  elements.saveStatus.classList.toggle("is-good", tone === "good");
}

function resetCycle() {
  const confirmed = window.confirm("Start a fresh 7-day cycle today?");
  if (!confirmed) {
    return;
  }

  startCycle(localDateKey());
  render("Fresh cycle ready.");
}

function render(message) {
  ensureCurrentCycle();

  const today = localDateKey();
  const cycleStart = state.cycleStart || today;
  const cycleDay = getCycleDay();
  const availableSlots = getAvailableSlots();
  const playedToday = hasPlayedOn(today);
  const todaySlot = getPlayedSlot(today);
  const todayHistory = findHistory(today);
  const hiddenCount = availableSlots.length;

  elements.todayLabel.textContent = formatDateKey(today);
  elements.cycleSummary.textContent = `Day ${cycleDay} of ${CYCLE_LENGTH}`;
  elements.remainingPill.textContent = `${hiddenCount} hidden`;

  renderCycleTrack(cycleStart, today);
  renderHistory(cycleStart, today);
  renderChoiceInputs();

  if (playedToday && todaySlot !== null) {
    elements.resultLabel.textContent = "Today's choice";
    elements.choiceResult.textContent = todayHistory?.choice || state.choices[todaySlot];
    elements.resultNote.textContent = message || "Come back tomorrow for the next draw.";
    elements.playButton.disabled = true;
    elements.playButton.querySelector("span:last-child").textContent = "Played Today";
    return;
  }

  if (!hiddenCount) {
    elements.resultLabel.textContent = "Cycle complete";
    elements.choiceResult.textContent = "Done";
    elements.resultNote.textContent = message || "A new cycle starts after day 7.";
    elements.playButton.disabled = true;
    elements.playButton.querySelector("span:last-child").textContent = "Play";
    return;
  }

  elements.resultLabel.textContent = "Ready";
  elements.choiceResult.textContent = "Tap Play";
  elements.resultNote.textContent = message || `${hiddenCount} choices still hidden this cycle.`;
  elements.playButton.disabled = false;
  elements.playButton.querySelector("span:last-child").textContent = "Play";
}

function renderCycleTrack(cycleStart, today) {
  elements.cycleTrack.replaceChildren();

  for (let index = 0; index < CYCLE_LENGTH; index += 1) {
    const dateKey = addDays(cycleStart, index);
    const dot = document.createElement("div");
    dot.className = "cycle-dot";
    dot.textContent = String(index + 1);

    const isPlayed = hasPlayedOn(dateKey);
    const isToday = dateKey === today;
    const isPast = daysBetween(dateKey, today) > 0;

    if (isPlayed) {
      dot.classList.add("is-played");
    } else if (isToday) {
      dot.classList.add("is-today");
    } else if (isPast) {
      dot.classList.add("is-missed");
    } else {
      dot.classList.add("is-future");
    }

    elements.cycleTrack.append(dot);
  }
}

function renderHistory(cycleStart, today) {
  elements.historyList.replaceChildren();

  for (let index = 0; index < CYCLE_LENGTH; index += 1) {
    const dateKey = addDays(cycleStart, index);
    const item = document.createElement("li");
    const stateName = getDateStateName(dateKey, today);
    const history = findHistory(dateKey);

    item.className = `history-item is-${stateName.toLowerCase()}`;
    item.innerHTML = `
      <span class="history-date"></span>
      <span class="history-choice"></span>
      <span class="history-state"></span>
    `;

    item.querySelector(".history-date").textContent = formatDateKey(dateKey);
    item.querySelector(".history-choice").textContent = history?.choice || getPlaceholderText(dateKey, today);
    item.querySelector(".history-state").textContent = stateName;
    elements.historyList.append(item);
  }
}

function getDateStateName(dateKey, today) {
  if (hasPlayedOn(dateKey)) {
    return "Played";
  }

  if (dateKey === today) {
    return "Today";
  }

  if (daysBetween(dateKey, today) > 0) {
    return "Missed";
  }

  return "Future";
}

function getPlaceholderText(dateKey, today) {
  if (dateKey === today) {
    return "Waiting";
  }

  if (daysBetween(dateKey, today) > 0) {
    return "No draw";
  }

  return "Hidden";
}

function renderChoiceInputs() {
  elements.choiceInputs.forEach((input, index) => {
    if (input.value !== state.choices[index]) {
      input.value = state.choices[index];
    }
  });
}

elements.playButton.addEventListener("click", playToday);
elements.resetCycleButton.addEventListener("click", resetCycle);
elements.choicesForm.addEventListener("submit", saveChoices);
elements.choiceInputs.forEach((input) => {
  input.addEventListener("input", () => {
    input.setAttribute("aria-invalid", "false");
    setSaveStatus();
  });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}

render();
