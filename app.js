const STORAGE_KEY = "weave-pub-seat-map-v3";
const LEGACY_STORAGE_KEYS = ["weave-pub-seat-map-v2", "weave-pub-seat-map-v1"];
const BASE_TIME = 2 * 60 * 60 * 1000;
const EXTEND_TIME = 60 * 60 * 1000;

const els = {
  mainScreen: document.querySelector("#mainScreen"),
  editToggleButton: document.querySelector("#editToggleButton"),
  editToolbar: document.querySelector("#editToolbar"),
  addTableButton: document.querySelector("#addTableButton"),
  deleteTableButton: document.querySelector("#deleteTableButton"),
  seatBoard: document.querySelector("#seatBoard"),
  tableTemplate: document.querySelector("#tableTemplate"),
  tableCount: document.querySelector("#tableCount"),
  guestCount: document.querySelector("#guestCount"),
};

let state = loadState();
let isEditing = false;
let selectedTableId = state.tables[0]?.id ?? null;
let focusedTableId = null;
let dragState = null;

function createInitialTables() {
  return [
    createTable(25, 24),
    createTable(72, 24),
    createTable(25, 55),
    createTable(72, 55),
  ];
}

function createTable(x = 50, y = 50) {
  const now = Date.now();
  const id =
    window.crypto?.randomUUID?.() ?? `table-${now}-${Math.round(Math.random() * 1_000_000)}`;

  return {
    id,
    x,
    y,
    leader: "",
    guests: "",
    endAt: null,
  };
}

function loadState() {
  const currentState = readStoredState(STORAGE_KEY);
  const saved = currentState ?? LEGACY_STORAGE_KEYS.map(readStoredState).find((value) => value?.tables?.length);
  const shouldClearTimers = !currentState;

  if (saved?.tables?.length) {
    return {
      tables: saved.tables.map((table) => ({
        id: table.id ?? createTable().id,
        x: Number.isFinite(Number(table.x)) ? Number(table.x) : 50,
        y: Number.isFinite(Number(table.y)) ? Number(table.y) : 50,
        leader: table.leader ?? "",
        guests: table.guests ?? "",
        endAt: !shouldClearTimers && Number(table.endAt) > 0 ? Number(table.endAt) : null,
      })),
    };
  }

  return { tables: createInitialTables() };
}

function readStoredState(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  els.editToggleButton.textContent = isEditing ? "완료" : "수정";
  els.editToggleButton.setAttribute("aria-pressed", String(isEditing));
  els.editToolbar.hidden = !isEditing;
  els.seatBoard.classList.toggle("editing", isEditing);

  renderBoard();
  updateSummary();
}

function renderBoard() {
  els.seatBoard.replaceChildren();

  state.tables.forEach((table, index) => {
    const node = els.tableTemplate.content.firstElementChild.cloneNode(true);
    const face = node.querySelector(".table-face");
    const leaderInput = node.querySelector(".leader-input");
    const guestInput = node.querySelector(".guest-input");
    const timerText = node.querySelector(".timer-text");
    const startButton = node.querySelector(".start-button");
    const extendButton = node.querySelector(".extend-button");
    const resetButton = node.querySelector(".reset-button");

    node.dataset.id = table.id;
    node.style.setProperty("--seat-x", `${table.x}%`);
    node.style.setProperty("--seat-y", `${table.y}%`);
    node.classList.toggle("selected", isEditing && table.id === selectedTableId);
    node.classList.toggle("focused", isEditing && table.id === focusedTableId);

    face.textContent = tableFaceLabel(table, index);
    face.disabled = !isEditing;
    leaderInput.value = table.leader;
    guestInput.value = table.guests;
    timerText.textContent = formatRemaining(table.endAt);
    startButton.textContent = table.endAt ? "2시간 재시작" : "2시간 시작";
    extendButton.disabled = !table.endAt;

    if (isEditing) {
      face.addEventListener("pointerdown", (event) => startDrag(event, table.id));
      face.addEventListener("click", () => focusTable(table.id));
      leaderInput.addEventListener("input", (event) => updateTable(table.id, { leader: event.target.value }, false));
      guestInput.addEventListener("input", (event) => updateTable(table.id, { guests: event.target.value }, false));
      startButton.addEventListener("click", () => startTimer(table.id));
      extendButton.addEventListener("click", () => extendTimer(table.id));
      resetButton.addEventListener("click", () => resetTable(table.id));
    }

    els.seatBoard.append(node);
  });
}

function focusTable(id) {
  selectedTableId = id;
  focusedTableId = focusedTableId === id ? null : id;
  render();
}

function tableFaceLabel(table, index) {
  const name = table.leader.trim() || `테이블 ${index + 1}`;
  const guests = Number(table.guests) > 0 ? `${table.guests}명` : "0명";

  return `${name}\n${guests}\n${formatRemaining(table.endAt)}`;
}

function updateSummary() {
  const guests = state.tables.reduce((sum, table) => sum + (Number(table.guests) || 0), 0);
  els.tableCount.textContent = `${state.tables.length} 테이블`;
  els.guestCount.textContent = `${guests}명`;
}

function updateTable(id, patch, shouldRender = true) {
  state.tables = state.tables.map((table) => (table.id === id ? { ...table, ...patch } : table));
  saveState();
  updateSummary();
  updateTimers();
  if (shouldRender) render();
}

function startTimer(id) {
  updateTable(id, { endAt: Date.now() + BASE_TIME });
}

function resetTable(id) {
  updateTable(id, {
    leader: "",
    guests: "",
    endAt: null,
  });
}

function extendTimer(id) {
  const table = state.tables.find((item) => item.id === id);
  if (!table?.endAt) return;

  updateTable(id, {
    endAt: Math.max(table.endAt, Date.now()) + EXTEND_TIME,
  });
}

function addTable() {
  const count = state.tables.length;
  const x = 24 + ((count * 23) % 52);
  const y = 24 + ((count * 17) % 52);
  const table = createTable(x, y);

  state.tables = [...state.tables, table];
  selectedTableId = table.id;
  focusedTableId = table.id;
  saveState();
  render();
}

function deleteSelectedTable() {
  if (!selectedTableId) return;

  state.tables = state.tables.filter((table) => table.id !== selectedTableId);
  selectedTableId = state.tables[0]?.id ?? null;
  focusedTableId = focusedTableId === selectedTableId ? focusedTableId : null;
  saveState();
  render();
}

function toggleEditMode() {
  isEditing = !isEditing;
  focusedTableId = isEditing ? selectedTableId : null;
  dragState = null;
  render();
}

function startDrag(event, id) {
  if (!isEditing) return;

  const boardRect = els.seatBoard.getBoundingClientRect();
  const table = state.tables.find((item) => item.id === id);
  if (!table) return;

  selectedTableId = id;
  focusedTableId = id;
  dragState = {
    id,
    boardRect,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    hasMoved: false,
  };

  event.currentTarget.setPointerCapture(event.pointerId);
}

function moveTable(clientX, clientY) {
  if (!dragState) return;

  const x = clamp(((clientX - dragState.boardRect.left) / dragState.boardRect.width) * 100, 13, 87);
  const y = clamp(((clientY - dragState.boardRect.top) / dragState.boardRect.height) * 100, 10, 90);

  state.tables = state.tables.map((table) => (table.id === dragState.id ? { ...table, x, y } : table));
  saveState();

  const node = els.seatBoard.querySelector(`[data-id="${dragState.id}"]`);
  node?.style.setProperty("--seat-x", `${x}%`);
  node?.style.setProperty("--seat-y", `${y}%`);
}

function stopDrag() {
  dragState = null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatRemaining(endAt) {
  if (!endAt) return "대기";

  const remaining = Math.max(0, endAt - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function updateTimers() {
  document.querySelectorAll(".table-seat").forEach((node) => {
    const table = state.tables.find((item) => item.id === node.dataset.id);
    if (!table) return;

    const index = state.tables.findIndex((item) => item.id === table.id);
    const face = node.querySelector(".table-face");
    const timer = node.querySelector(".timer-text");
    const startButton = node.querySelector(".start-button");
    const extendButton = node.querySelector(".extend-button");

    if (face) face.textContent = tableFaceLabel(table, index);
    if (timer) timer.textContent = formatRemaining(table.endAt);
    if (startButton) startButton.textContent = table.endAt ? "2시간 재시작" : "2시간 시작";
    if (extendButton) extendButton.disabled = !table.endAt;
  });
}

els.editToggleButton.addEventListener("click", toggleEditMode);
els.addTableButton.addEventListener("click", addTable);
els.deleteTableButton.addEventListener("click", deleteSelectedTable);

window.addEventListener("pointermove", (event) => {
  if (!dragState) return;
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (!dragState.hasMoved && distance < 8) return;

  dragState.hasMoved = true;
  event.preventDefault();
  moveTable(event.clientX, event.clientY);
});
window.addEventListener("pointerup", stopDrag);
window.addEventListener("pointercancel", stopDrag);

setInterval(updateTimers, 1000);
render();
