import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithRedirect,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc, getFirestore, setDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Substitua pelos dados do seu projeto no Firebase Console.
const firebaseConfig = {
  apiKey: "AIzaSyARXIwsOUAAGgc_X-ADFs5fPMYd98LYj_g",
  authDomain: "qfinancas-fc5bc.firebaseapp.com",
  projectId: "qfinancas-fc5bc",
  storageBucket: "qfinancas-fc5bc.firebasestorage.app",
  messagingSenderId: "467970211607",
  appId: "1:467970211607:web:c6ca02f554ed4807e98152",
};

const hasFirebaseConfig = firebaseConfig.apiKey !== "COLE_AQUI";
const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = hasFirebaseConfig ? getAuth(firebaseApp) : null;
const db = hasFirebaseConfig ? getFirestore(firebaseApp) : null;

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

const defaultCategories = [
  "Alimenta\u00e7\u00e3o",
  "Transporte",
  "Sa\u00fade",
  "Lazer",
  "Moradia",
  "Educa\u00e7\u00e3o",
  "Vestu\u00e1rio",
  "Assinaturas",
];

const defaultCards = ["Nubank", "Ita\u00fa", "Santander"];

const categoryRules = [
  {
    category: "Alimenta\u00e7\u00e3o",
    terms: [
      "mercado", "supermercado", "restaurante", "ifood", "rappi", "padaria", "acougue", "hortifruti",
      "lanchonete", "pizzaria", "hamburgueria", "sorveteria", "cafeteria", "feira", "atacadao", "atacadista",
      "carrefour", "pao de acucar", "extra", "assai", "big", "delivery", "marmita", "lanche", "sushi",
    ],
  },
  {
    category: "Transporte",
    terms: [
      "uber", "99", "taxi", "combustivel", "gasolina", "etanol", "posto", "metro", "onibus", "estacionamento",
      "pedagio", "ipva", "oficina", "mecanico", "revisao", "seguro auto", "bilhete unico", "cabify", "blablacar",
      "patinete", "bicicleta", "moto taxi",
    ],
  },
  {
    category: "Sa\u00fade",
    terms: [
      "farmacia", "drogaria", "medico", "consulta", "exame", "plano de saude", "dentista", "psicologo",
      "psiquiatra", "hospital", "clinica", "laboratorio", "fisioterapia", "academia", "personal trainer",
      "nutricionista", "vacina", "oculos", "otica",
    ],
  },
  {
    category: "Lazer",
    terms: [
      "cinema", "bar", "show", "viagem", "restaurantes", "netflix", "ingresso", "balada", "parque",
      "teatro", "evento", "festa", "clube", "boliche", "jogo", "playstation", "xbox", "steam",
    ],
  },
  {
    category: "Moradia",
    terms: [
      "aluguel", "condominio", "luz", "energia", "agua", "internet", "iptu", "gas", "manutencao",
      "reforma", "moveis", "eletrodomestico", "faxina", "diarista", "seguro residencial", "porteiro",
    ],
  },
  {
    category: "Educa\u00e7\u00e3o",
    terms: ["curso", "faculdade", "livro", "escola", "mentoria", "material escolar", "pos graduacao", "idiomas", "workshop"],
  },
  {
    category: "Vestu\u00e1rio",
    terms: ["roupa", "calcado", "tenis", "camisa", "loja", "shopping", "calca", "vestido", "sapato", "bolsa", "acessorio"],
  },
  {
    category: "Assinaturas",
    terms: [
      "assinatura", "spotify", "streaming", "software", "mensalidade", "amazon prime", "disney",
      "hbo", "youtube premium", "icloud", "google one", "office 365", "chatgpt", "claude",
    ],
  },
];

const categoryIconLibrary = {
  food: '<path d="M7 3v6a2 2 0 0 0 4 0V3"/><path d="M9 9v12"/><path d="M17 3c-2.2 2-2.2 5.4 0 7.4V21"/>',
  transport:
    '<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="18.5" r="1.4"/><circle cx="16.5" cy="18.5" r="1.4"/>',
  health: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  leisure: '<rect x="3" y="8" width="18" height="9" rx="4"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="11" r="1"/><circle cx="18" cy="13" r="1"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
  education: '<path d="M12 3 1 9l11 6 9-4.9V15"/><path d="M5 11.5V17c0 1.5 3 3 7 3s7-1.5 7-3v-5.5"/>',
  clothing: '<path d="M9 3 5 6 3 9l3 2v10h12V11l3-2-2-3-4-3-1 2h-2Z"/>',
  subscription:
    '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  market:
    '<circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 3h2l2.4 12.2a2 2 0 0 0 2 1.8h8.6a2 2 0 0 0 2-1.6L21 8H6"/>',
  pets: '<circle cx="6" cy="9" r="1.3"/><circle cx="10" cy="5.5" r="1.3"/><circle cx="14" cy="5.5" r="1.3"/><circle cx="18" cy="9" r="1.3"/><path d="M8.5 15c0-2.2 1.8-4 3.5-4s3.5 1.8 3.5 4-1.6 4-3.5 4-3.5-1.8-3.5-4Z"/>',
  travel: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 8h18M12 8v13"/><path d="M7.5 8a2.5 2.5 0 1 1 0-5C10 3 12 8 12 8"/><path d="M16.5 8a2.5 2.5 0 1 0 0-5C14 3 12 8 12 8"/>',
  taxes:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  invest: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  outros: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
};

const categoryIconEmoji = {
  food: "\u{1F37D}\uFE0F",
  transport: "\u{1F697}",
  health: "\u{1FA7A}",
  leisure: "\u{1F3AE}",
  home: "\u{1F3E0}",
  education: "\u{1F393}",
  clothing: "\u{1F455}",
  subscription: "\u{1F501}",
  market: "\u{1F6D2}",
  pets: "\u{1F43E}",
  travel: "\u2708\uFE0F",
  gift: "\u{1F381}",
  taxes: "\u{1F4CB}",
  invest: "\u{1F4C8}",
  outros: "\u{1F5C2}\uFE0F",
};

const categoryIconKeyByName = {
  alimentacao: "food",
  transporte: "transport",
  saude: "health",
  lazer: "leisure",
  moradia: "home",
  educacao: "education",
  vestuario: "clothing",
  assinaturas: "subscription",
  mercado: "market",
  pets: "pets",
  viagem: "travel",
  presentes: "gift",
  impostos: "taxes",
  investimentos: "invest",
};

const iconKeyForCategory = (name) => {
  const stored = settings?.categoryIcons?.[name];
  if (stored && categoryIconLibrary[stored]) {
    return stored;
  }
  return categoryIconKeyByName[normalizeText(name).replace(/[^a-z0-9]/g, "")] || "outros";
};

const categoryIconSvg = (key) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
    categoryIconLibrary[key] || categoryIconLibrary.outros
  }</svg>`;

const categoryEmoji = (name) => categoryIconEmoji[iconKeyForCategory(name)] || categoryIconEmoji.outros;

const categoryIconBadge = (name) => {
  const key = iconKeyForCategory(name);
  const color = colorFor("category", name, 0);
  return `<span class="category-icon-badge" style="background:color-mix(in srgb, ${color} 18%, transparent); color:${color}">${categoryIconSvg(
    key,
  )}</span>`;
};

const iconPickerMarkup = (fieldName, selectedKey) =>
  `<div class="icon-picker" role="radiogroup" aria-label="Escolher ícone">${Object.keys(categoryIconLibrary)
    .map(
      (key) => `
        <button type="button" class="${key === selectedKey ? "is-active" : ""}" data-icon-picker-option="${fieldName}" data-icon-key="${key}" aria-label="Ícone ${key}">
          ${categoryIconSvg(key)}
        </button>
      `,
    )
    .join("")}</div>`;

const palette = ["#4c1d95", "#0f8b8d", "#7c3aed", "#b4235a", "#c58a1d", "#5b6470", "#6d28d9", "#2c7a7b"];
const transactionsStorageKey = "personal-finance-dashboard-transactions-v9-local";
const settingsStorageKey = "personal-finance-dashboard-settings-v3";
const profileStorageKey = "personal-finance-dashboard-profile-v1";
const cardExpenseMemoryStorageKey = "personal-finance-dashboard-card-expense-memory-v1";
const cardExpenseMemoryTtl = 15 * 60 * 1000;

const defaultTransactions = [];
const defaultProfile = {
  displayName: "",
  photoDataUrl: "",
};

let selectedDate = new Date();
let currentView = "dashboard";
let selectedCard = defaultCards[0];
let currentUser = null;
let editingTransactionId = null;
let deletingTransactionId = null;
let previousView = "dashboard";

const select = (selector) => document.querySelector(selector);
const selectAll = (selector) => Array.from(document.querySelectorAll(selector));

const normalizeText = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const parseAmount = (value) => {
  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  return Number(normalized);
};

const defaultColorForIndex = (index) => palette[index % palette.length];

const buildColorMap = (items, existingColors = {}) =>
  items.reduce((colors, item, index) => {
    colors[item] = existingColors[item] || defaultColorForIndex(index);
    return colors;
  }, {});

const buildIconMap = (items, existingIcons = {}) =>
  items.reduce((icons, item) => {
    const guessed = categoryIconKeyByName[normalizeText(item).replace(/[^a-z0-9]/g, "")] || "outros";
    icons[item] = existingIcons[item] && categoryIconLibrary[existingIcons[item]] ? existingIcons[item] : guessed;
    return icons;
  }, {});

const normalizeSettings = (rawSettings = {}) => {
  const categories = rawSettings.categories?.length ? rawSettings.categories : [...defaultCategories];
  const cards = rawSettings.cards?.length ? rawSettings.cards : [...defaultCards];

  return {
    categories,
    cards,
    categoryColors: buildColorMap(categories, rawSettings.categoryColors),
    categoryIcons: buildIconMap(categories, rawSettings.categoryIcons),
    cardColors: buildColorMap(cards, rawSettings.cardColors),
    theme: rawSettings.theme === "dark" ? "dark" : "light",
  };
};

const colorFor = (type, name, index) => {
  const source = type === "card" ? settings.cardColors : settings.categoryColors;
  return source?.[name] || defaultColorForIndex(index);
};

const getMonthKey = (dateValue) => String(dateValue).slice(0, 7);

const selectedMonthKey = () => {
  const year = selectedDate.getFullYear();
  const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const addMonths = (dateValue, months) => {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
};

const classifyCategory = (description) => {
  const descriptionText = normalizeText(description);
  const match = categoryRules.find((rule) =>
    rule.terms.some((term) => descriptionText.includes(normalizeText(term))),
  );
  if (match && settings.categories.includes(match.category)) {
    return match.category;
  }
  return settings.categories[0] || "Alimenta\u00e7\u00e3o";
};

const buildInstallments = (transaction) => {
  if (transaction.kind !== "card") {
    return [];
  }

  const installmentValue = transaction.amount / transaction.installments;
  const firstInvoiceDate = transaction.invoiceDate || transaction.date;

  return Array.from({ length: transaction.installments }, (_, index) => ({
    ...transaction,
    statementDate: addMonths(firstInvoiceDate, index),
    statementMonth: getMonthKey(addMonths(firstInvoiceDate, index)),
    installmentNumber: index + 1,
    installmentAmount: installmentValue,
  }));
};

const userDoc = (name) => doc(db, "users", currentUser.uid, "appData", name);

const saveTransactions = async () => {
  if (!hasFirebaseConfig || !currentUser) {
    localStorage.setItem(transactionsStorageKey, JSON.stringify(transactions));
    return;
  }
  await setDoc(userDoc("transactions"), { items: transactions }, { merge: true });
};

const saveSettings = async () => {
  if (!hasFirebaseConfig || !currentUser) {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
    return;
  }
  await setDoc(userDoc("settings"), settings, { merge: true });
};

const saveProfile = async () => {
  if (!hasFirebaseConfig || !currentUser) {
    localStorage.setItem(profileStorageKey, JSON.stringify(profile));
    return;
  }
  await setDoc(userDoc("profile"), profile, { merge: true });
};

const normalizeProfile = (data = {}) => ({
  displayName: typeof data.displayName === "string" ? data.displayName : "",
  photoDataUrl: typeof data.photoDataUrl === "string" ? data.photoDataUrl : "",
});

const resetStateFromDefaults = () => {
  transactions = defaultTransactions.map((item) => ({ ...item }));
  settings = normalizeSettings();
  profile = normalizeProfile(defaultProfile);
  selectedCard = settings.cards[0] || "";
};

const loadUserState = async () => {
  if (!hasFirebaseConfig) {
    const localTransactions = localStorage.getItem(transactionsStorageKey);
    const localSettings = localStorage.getItem(settingsStorageKey);
    const localProfile = localStorage.getItem(profileStorageKey);
    transactions = localTransactions ? JSON.parse(localTransactions) : defaultTransactions.map((item) => ({ ...item }));
    const parsedSettings = localSettings ? JSON.parse(localSettings) : {};
    settings = normalizeSettings(parsedSettings);
    profile = normalizeProfile(localProfile ? JSON.parse(localProfile) : {});
    selectedCard = settings.cards[0] || "";
    return;
  }

  if (!currentUser) {
    resetStateFromDefaults();
    return;
  }

  const [transactionsDoc, settingsDoc, profileDoc] = await Promise.all([
    getDoc(userDoc("transactions")),
    getDoc(userDoc("settings")),
    getDoc(userDoc("profile")),
  ]);

  transactions = transactionsDoc.exists()
    ? transactionsDoc.data().items || []
    : defaultTransactions.map((item) => ({ ...item }));

  const loadedSettings = settingsDoc.exists() ? settingsDoc.data() : {};
  settings = normalizeSettings(loadedSettings);
  profile = normalizeProfile(profileDoc.exists() ? profileDoc.data() : {});

  if (!settings.cards.includes(selectedCard)) {
    selectedCard = settings.cards[0] || "";
  }
};

let transactions = [];
let settings = normalizeSettings();
let profile = normalizeProfile(defaultProfile);
resetStateFromDefaults();

const allInstallments = () => transactions.flatMap(buildInstallments);

const monthIncome = () =>
  transactions.filter((item) => item.kind === "income" && getMonthKey(item.date) === selectedMonthKey());

const monthCashExpenses = () =>
  transactions.filter((item) => item.kind === "cash" && getMonthKey(item.date) === selectedMonthKey());

const monthCardInstallments = () => allInstallments().filter((item) => item.statementMonth === selectedMonthKey());

const sum = (items, key) => items.reduce((total, item) => total + Number(item[key]), 0);

const groupByAmount = (items, groupKey, amountKey) => {
  const grouped = {};

  items.forEach((item) => {
    grouped[item[groupKey]] = (grouped[item[groupKey]] || 0) + Number(item[amountKey]);
  });

  return Object.entries(grouped)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

const fillCategorySelects = () => {
  selectAll("[data-category-select]").forEach((field) => {
    const currentValue = field.value;
    field.innerHTML = settings.categories
      .map((category) => `<option value="${category}">${category}</option>`)
      .join("");
    field.value = settings.categories.includes(currentValue) ? currentValue : settings.categories[0] || "";
  });
};

const fillCardSelects = () => {
  selectAll("[data-card-select]").forEach((field) => {
    const currentValue = field.value;
    field.innerHTML = settings.cards.map((card) => `<option>${card}</option>`).join("");
    field.value = settings.cards.includes(currentValue) ? currentValue : settings.cards[0] || "";
  });
};

const setDefaultDates = () => {
  const today = new Date().toISOString().slice(0, 10);
  selectAll('input[type="date"]').forEach((field) => {
    if (!field.value) {
      field.value = today;
    }
  });
};

const cardExpenseMemoryKey = () =>
  currentUser ? `${cardExpenseMemoryStorageKey}-${currentUser.uid}` : cardExpenseMemoryStorageKey;

const readCardExpenseMemory = () => {
  try {
    const raw = localStorage.getItem(cardExpenseMemoryKey());
    if (!raw) {
      return null;
    }
    const memory = JSON.parse(raw);
    if (!memory.savedAt || Date.now() - memory.savedAt > cardExpenseMemoryTtl) {
      localStorage.removeItem(cardExpenseMemoryKey());
      return null;
    }
    return memory;
  } catch {
    localStorage.removeItem(cardExpenseMemoryKey());
    return null;
  }
};

const saveCardExpenseMemory = () => {
  const form = select("#unifiedTransactionForm");
  if (!form || form.querySelector('#transactionKind')?.value !== 'card') {
    return;
  }
  const card = form.querySelector('select[name="card"]')?.value || "";
  const invoiceDate = form.querySelector('input[name="invoiceDate"]')?.value || "";
  if (!card && !invoiceDate) {
    return;
  }
  localStorage.setItem(
    cardExpenseMemoryKey(),
    JSON.stringify({
      card,
      invoiceDate,
      savedAt: Date.now(),
    }),
  );
};

const applyCardExpenseMemory = () => {
  const form = select("#unifiedTransactionForm");
  if (!form) {
    return;
  }
  const memory = readCardExpenseMemory();
  if (!memory) {
    return;
  }
  const cardField = form.querySelector('select[name="card"]');
  const invoiceDateField = form.querySelector('input[name="invoiceDate"]');
  if (cardField && memory.card && settings.cards.includes(memory.card)) {
    cardField.value = memory.card;
  }
  if (invoiceDateField && memory.invoiceDate) {
    invoiceDateField.value = memory.invoiceDate;
  }
};

const applyTheme = () => {
  const theme = settings.theme === "dark" ? "dark" : "light";
  document.body.setAttribute("data-theme", theme);
  const toggle = select("#themeToggle");
  if (toggle) {
    toggle.checked = theme === "dark";
  }
};

const syncColorPicker = (input) => {
  const control = input.closest(".color-picker-control");
  if (!control) {
    return;
  }

  const preview = control.querySelector(".color-picker-preview");
  const text = control.querySelector(".color-picker-text");
  if (preview) {
    preview.style.background = input.value;
  }
  if (text) {
    text.textContent = input.value;
  }
};

const initializeColorPickers = () => {
  selectAll(".color-picker-control input[type='color']").forEach((input) => {
    syncColorPicker(input);
    input.closest(".color-picker-control").addEventListener("click", (event) => {
      if (event.target !== input) {
        input.click();
      }
    });
    input.addEventListener("input", () => syncColorPicker(input));
  });
};

const renderDonut = (data) => {
  const total = data.reduce((totalValue, item) => totalValue + item.value, 0);
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const slices = data
    .map((item, index) => {
      const length = total ? (item.value / total) * circumference : 0;
      const slice = `
        <circle
          cx="105"
          cy="105"
          r="${radius}"
          fill="none"
          stroke="${colorFor("category", item.name, index)}"
          stroke-width="24"
          stroke-dasharray="${length} ${circumference - length}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 105 105)"
        />`;
      offset += length;
      return slice;
    })
    .join("");

  select("#categoryDonut").innerHTML = `
    <svg viewBox="0 0 210 210" aria-hidden="true">
      <circle cx="105" cy="105" r="${radius}" fill="none" stroke="#ececf0" stroke-width="24" />
      ${slices}
      <text x="105" y="98" text-anchor="middle" class="donut-label">Sa\u00eddas</text>
      <text x="105" y="120" text-anchor="middle" class="donut-value">${currency.format(total)}</text>
    </svg>
  `;
};

const renderLegend = (data, total) => {
  select("#categoryLegend").innerHTML = data.length
    ? data
        .map((item, index) => {
          const percent = total ? Math.round((item.value / total) * 100) : 0;
          return `
            <div class="legend-item">
              <span class="legend-dot" style="background:${colorFor("category", item.name, index)}"></span>
              <span class="legend-label">${item.name} · ${percent}%</span>
              <strong>${currency.format(item.value)}</strong>
            </div>
          `;
        })
        .join("")
    : `<p class="empty-state">Nenhuma sa\u00edda registrada neste m\u00eas.</p>`;
};

const renderBars = (selector, data, emptyMessage, colorType = "") => {
  const max = Math.max(...data.map((item) => item.value), 1);

  select(selector).innerHTML = data.length
    ? data
        .map((item, index) => {
          const width = Math.max((item.value / max) * 100, 3);
          const dotColor = colorType ? colorFor(colorType, item.name, index) : defaultColorForIndex(index);
          return `
            <div class="bar-item">
              <div class="bar-meta">
                <span><span class="bar-dot" style="background:${dotColor}; color:${dotColor}"></span>${item.name}</span>
                <strong>${currency.format(item.value)}</strong>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width:${width}%"></div>
              </div>
            </div>
          `;
        })
        .join("")
    : `<p class="empty-state">${emptyMessage}</p>`;
};

const renderCardBars = (data) => {
  renderBars("#cardBars", data, "Nenhuma despesa em cart\u00e3o neste m\u00eas.", "card");
};

const renderCashBars = (data) => {
  renderBars("#cashBars", data, "Nenhuma sa\u00edda \u00e0 vista neste m\u00eas.");
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  return `${parts[2]}/${parts[1]}`;
};

const transactionRow = (item, options = {}) => {
  const isIncome = item.kind === "income";
  const isCash = item.kind === "cash";
  const amount = isIncome || isCash ? item.amount : item.installmentAmount;
  const sign = isIncome ? "+" : "-";
  const dateDisplay = isIncome || isCash ? formatDateShort(item.date) : formatDateShort(item.statementDate || item.invoiceDate);
  const categoryDisplay = isIncome ? item.incomeType || "Entrada" : item.category || "";
  const subInfo = isIncome
    ? ""
    : isCash
      ? `${item.paymentMethod || ""}${item.occurrenceTotal ? ` · ${item.occurrenceNumber}/${item.occurrenceTotal}` : ""}`
      : `${item.card || ""} · ${item.installmentNumber}/${item.installments}${item.occurrenceTotal ? ` · Rec ${item.occurrenceNumber}/${item.occurrenceTotal}` : ""}`;
  const actionButtons = options.allowActions
    ? `
      <div class="transaction-actions">
        <button type="button" class="transaction-action edit" data-transaction-action="edit" data-transaction-id="${item.id}" aria-label="Editar transa\u00e7\u00e3o" title="Editar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
        </button>
        <button type="button" class="transaction-action delete" data-transaction-action="delete" data-transaction-id="${item.id}" aria-label="Excluir transa\u00e7\u00e3o" title="Excluir">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18"/>
            <path d="M8 6V4h8v2"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    `
    : "";

  return `
    <div class="ledger-row">
      <div class="ledger-cell date">${dateDisplay}</div>
      <div class="ledger-cell description">${item.description}${subInfo ? `<small>${subInfo}</small>` : ""}</div>
      <div class="ledger-cell category">${categoryDisplay}</div>
      <div class="ledger-cell value ${isIncome ? "income" : "expense"}">${sign} ${currency.format(amount)}</div>
      <div class="ledger-cell actions">${actionButtons}</div>
    </div>
  `;
};

const ledgerHeader = () => `
  <div class="ledger-header">
    <div class="ledger-cell">Data</div>
    <div class="ledger-cell">Descri\u00e7\u00e3o</div>
    <div class="ledger-cell">Categoria</div>
    <div class="ledger-cell value">Valor</div>
    <div class="ledger-cell"></div>
  </div>
`;

const renderStatement = (selector, items, emptyMessage, options = {}) => {
  select(selector).innerHTML = items.length
    ? items.map((item) => transactionRow(item, options)).join("")
    : `<p class="empty-state">${emptyMessage}</p>`;
};

let activeLedgerPill = "all";

const renderDashboardLedger = () => {
  const income = monthIncome();
  const cashExpenses = monthCashExpenses();
  const cardInstallments = monthCardInstallments();

  let items = [];
  if (activeLedgerPill === "all" || activeLedgerPill === "income") {
    items = items.concat(income.map((i) => ({ ...i, _sortDate: i.date })));
  }
  if (activeLedgerPill === "all" || activeLedgerPill === "cash") {
    items = items.concat(cashExpenses.map((i) => ({ ...i, _sortDate: i.date })));
  }
  if (activeLedgerPill === "all" || activeLedgerPill === "card") {
    items = items.concat(cardInstallments.map((i) => ({ ...i, _sortDate: i.statementDate || i.date })));
  }

  items.sort((a, b) => b._sortDate.localeCompare(a._sortDate));

  const totalIncome = sum(income, "amount");
  const totalCashExpense = sum(cashExpenses, "amount");
  const totalCardExpense = sum(cardInstallments, "installmentAmount");
  const netBalance = totalIncome - totalCashExpense - totalCardExpense;

  const ledgerTotalEl = select("#ledgerTotal");
  if (ledgerTotalEl) {
    ledgerTotalEl.textContent = currency.format(netBalance);
    ledgerTotalEl.style.color = netBalance >= 0 ? "var(--income)" : "var(--expense)";
  }

  const container = select("#dashboardLedgerContent");
  if (!container) return;
  container.innerHTML = items.length
    ? ledgerHeader() + items.map((item) => transactionRow(item, { allowActions: true })).join("")
    : `<p class="empty-state">Nenhum lan\u00e7amento neste m\u00eas.</p>`;

  // Sync pill active state
  selectAll("[data-ledger-pill]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.ledgerPill === activeLedgerPill);
  });
};

const renderDashboard = () => {
  const income = monthIncome();
  const cashExpenses = monthCashExpenses();
  const cardInstallments = monthCardInstallments();
  const totalIncome = sum(income, "amount");
  const totalCashExpense = sum(cashExpenses, "amount");
  const totalCardExpense = sum(cardInstallments, "installmentAmount");
  const totalExpense = totalCashExpense + totalCardExpense;
  const balance = totalIncome - totalExpense;
  const categoryData = [
    ...groupByAmount(cashExpenses, "category", "amount"),
    ...groupByAmount(cardInstallments, "category", "installmentAmount"),
  ].reduce((groups, item) => {
    groups[item.name] = (groups[item.name] || 0) + item.value;
    return groups;
  }, {});
  const categoryChartData = Object.entries(categoryData)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const cardData = groupByAmount(cardInstallments, "card", "installmentAmount");
  const cashData = groupByAmount(cashExpenses, "paymentMethod", "amount");

  select("#totalIncome").textContent = currency.format(totalIncome);
  select("#totalExpense").textContent = currency.format(totalExpense);
  select("#monthBalance").textContent = currency.format(balance);
  select("#balanceStatus").textContent =
    balance >= 0 ? "Saldo positivo no m\u00eas selecionado" : "Aten\u00e7\u00e3o: sa\u00eddas acima das entradas";
  select("#categoryTotal").textContent = currency.format(totalExpense);
  select("#cardTotal").textContent = currency.format(totalCardExpense);
  select("#cashTotal").textContent = currency.format(totalCashExpense);

  renderDonut(categoryChartData);
  renderLegend(categoryChartData, totalExpense);
  renderCardBars(cardData);
  renderCashBars(cashData);
  renderDashboardLedger();
};

const renderTransactionsView = () => {
};

const renderCardTabs = () => {
  if (!settings.cards.includes(selectedCard)) {
    selectedCard = settings.cards[0] || "";
  }

  select("#cardTabs").innerHTML = settings.cards
    .map(
      (card) => `
        <button type="button" class="${card === selectedCard ? "active" : ""}" data-card-tab="${card}">
          ${card}
        </button>
      `,
    )
    .join("");

  selectAll("[data-card-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCard = button.dataset.cardTab;
      renderCardsView();
    });
  });
};

const renderCardsView = () => {
  if (!settings.cards.length) {
    select("#selectedCardTotal").textContent = currency.format(0);
    select("#selectedCardName").textContent = "Nenhum cart\u00e3o cadastrado";
    select("#selectedCardCount").textContent = "0";
    select("#cardStatementTotal").textContent = currency.format(0);
    select("#cardTabs").innerHTML = "";
    select("#cardStatement").innerHTML = `<p class="empty-state">Cadastre um cart\u00e3o em Configura\u00e7\u00f5es.</p>`;
    return;
  }

  const cardInstallments = monthCardInstallments()
    .filter((item) => item.card === selectedCard)
    .sort((a, b) => b.statementDate.localeCompare(a.statementDate));
  const statementTotal = sum(cardInstallments, "installmentAmount");

  select("#selectedCardTotal").textContent = currency.format(statementTotal);
  select("#selectedCardName").textContent = selectedCard;
  select("#selectedCardCount").textContent = String(cardInstallments.length);
  select("#cardStatementTotal").textContent = currency.format(statementTotal);
  renderCardTabs();
  renderStatement("#cardStatement", cardInstallments, `Nenhuma parcela prevista para ${selectedCard} neste m\u00eas.`, { allowActions: true });
};

const settingsItem = (name, type, disabled, color) => `
  <div class="settings-item">
    ${
      type === "category"
        ? `<button type="button" class="category-icon-trigger" data-icon-trigger="${name}" aria-label="Alterar ícone de ${name}">${categoryIconBadge(name)}</button>`
        : `<span aria-hidden="true"></span>`
    }
    <span>${name}</span>
    <label class="settings-color" aria-label="Cor de ${name}">
      <input type="color" value="${color}" data-settings-color="${type}" data-settings-name="${name}" />
    </label>
    <button type="button" class="settings-delete" data-settings-delete="${type}" data-settings-name="${name}" ${disabled ? "disabled" : ""} aria-label="Excluir ${name}" title="Excluir">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18"/>
        <path d="M8 6V4h8v2"/>
        <path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6M14 11v6"/>
      </svg>
    </button>
    ${
      type === "category"
        ? `<div class="icon-popover" data-icon-popover="${name}" hidden>${iconPickerMarkup(name, iconKeyForCategory(name))}</div>`
        : ""
    }
  </div>
`;

const renderSettingsView = () => {
  select("#categorySettingsList").innerHTML = settings.categories
    .map((category, index) => settingsItem(category, "category", settings.categories.length <= 1, colorFor("category", category, index)))
    .join("");
  select("#cardSettingsList").innerHTML = settings.cards
    .map((card, index) => settingsItem(card, "card", settings.cards.length <= 1, colorFor("card", card, index)))
    .join("");
  applyTheme();

  selectAll("[data-settings-color]").forEach((field) => {
    field.addEventListener("change", () => {
      const name = field.dataset.settingsName;
      const colorType = field.dataset.settingsColor;

      if (colorType === "category") {
        settings.categoryColors[name] = field.value;
      } else {
        settings.cardColors[name] = field.value;
      }

      saveSettings();
      renderView();
    });
  });

  selectAll("[data-settings-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.settingsName;

      if (button.dataset.settingsDelete === "category") {
        settings.categories = settings.categories.filter((category) => category !== name);
        delete settings.categoryColors[name];
        delete settings.categoryIcons[name];
      } else {
        settings.cards = settings.cards.filter((card) => card !== name);
        delete settings.cardColors[name];
      }

      saveSettings();
      fillCategorySelects();
      fillCardSelects();
      renderView();
    });
  });
};

const renderPeriod = () => {
  const label = monthFormatter.format(selectedDate);
  select("#currentPeriod").textContent = label.charAt(0).toUpperCase() + label.slice(1);
};

const renderView = () => {
  const enteredTransactions = currentView === "transactions" && previousView !== "transactions";

  renderPeriod();

  const periodControl = select(".period-control");
  if (periodControl) {
    periodControl.style.display = (currentView === "settings" || currentView === "transactions") ? "none" : "";
  }

  select("#dashboardView").classList.toggle("active-view", currentView === "dashboard");
  select("#transactionsView").classList.toggle("active-view", currentView === "transactions");
  select("#cardsView").classList.toggle("active-view", currentView === "cards");
  select("#settingsView").classList.toggle("active-view", currentView === "settings");
  selectAll("[data-view-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === currentView);
  });

  if (enteredTransactions) {
    setTransactionPanelsCollapsed(true);
  }

  renderDashboard();
  renderTransactionsView();
  renderCardsView();
  renderSettingsView();

  previousView = currentView;
};

const closeMenu = () => {
  const sidebar = select("#appSidebar");
  const overlay = select("#sidebarOverlay");
  if (sidebar) sidebar.classList.remove("is-open");
  if (overlay) overlay.classList.remove("is-active");
  const toggle = select("#menuToggle");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
};

const toggleMenu = () => {
  const sidebar = select("#appSidebar");
  const overlay = select("#sidebarOverlay");
  let isOpen = false;
  if (sidebar) {
    isOpen = sidebar.classList.toggle("is-open");
  }
  if (overlay) {
    overlay.classList.toggle("is-active", isOpen);
  }
  const toggle = select("#menuToggle");
  if (toggle) toggle.setAttribute("aria-expanded", String(isOpen));
};

const addTransaction = (transaction) => {
  transactions.push({ id: `${transaction.kind}-${Date.now()}`, ...transaction });
  saveTransactions();
  renderView();
};

const addTransactions = (newTransactions) => {
  const batchId = Date.now();
  newTransactions.forEach((transaction, index) => {
    transactions.push({ id: `${transaction.kind}-${batchId}-${index}`, ...transaction });
  });
  saveTransactions();
  renderView();
};

const deleteTransactionById = (transactionId) => {
  transactions = transactions.filter((transaction) => transaction.id !== transactionId);
  saveTransactions();
  renderView();
};

const openDeleteDialog = (transactionId) => {
  deletingTransactionId = transactionId;
  const dialog = select("#deleteTransactionDialog");
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "true");
  }
};

const closeDeleteDialog = () => {
  deletingTransactionId = null;
  const dialog = select("#deleteTransactionDialog");
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
};

const setTransactionPanelsCollapsed = (collapsed) => {
  selectAll("#transactionsView .transaction-collapsible").forEach((panel) => {
    panel.classList.toggle("is-collapsed", collapsed);
  });

  selectAll("#transactionsView [data-collapse-target]").forEach((button) => {
    button.setAttribute("aria-expanded", String(!collapsed));
  });
};

const editTransactionById = (transactionId) => {
  const transaction = transactions.find((item) => item.id === transactionId);
  if (!transaction) {
    return;
  }
  openEditDialog(transaction);
};

const setEditKindVisibility = (kind) => {
  select("#editIncomeFields").classList.toggle("open", kind === "income");
  select("#editCashFields").classList.toggle("open", kind === "cash");
  select("#editCardFields").classList.toggle("open", kind === "card");
  select("#editCategoryLabel").hidden = kind === "income";
  select("#editCategory").required = kind !== "income";
};

const openEditDialog = (transaction) => {
  editingTransactionId = transaction.id;
  select("#editDescription").value = transaction.description || "";
  select("#editDate").value = transaction.date || "";
  select("#editAmount").value = String(transaction.amount || 0).replace(".", ",");

  const categoryField = select("#editCategory");
  categoryField.innerHTML = settings.categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");
  categoryField.value = settings.categories.includes(transaction.category) ? transaction.category : settings.categories[0] || "";

  select("#editIncomeType").value = transaction.incomeType || "";
  select("#editPaymentMethod").value = transaction.paymentMethod || "Pix";

  const cardField = select("#editCard");
  cardField.innerHTML = settings.cards.map((card) => `<option>${card}</option>`).join("");
  cardField.value = settings.cards.includes(transaction.card) ? transaction.card : settings.cards[0] || "";

  select("#editInvoiceDate").value = transaction.invoiceDate || transaction.date || "";
  select("#editInstallments").value = String(transaction.installments || 1);
  select("#editNotes").value = transaction.notes || "";

  setEditKindVisibility(transaction.kind);
  const dialog = select("#editTransactionDialog");
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "true");
  }
};

const closeEditDialog = () => {
  editingTransactionId = null;
  const dialog = select("#editTransactionDialog");
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
};

const updateUnifiedFormVisibility = () => {
  const form = select("#unifiedTransactionForm");
  if (!form) return;
  
  const kind = form.querySelector("#transactionKind").value;
  
  const isIncome = kind === "income";
  const isCash = kind === "cash";
  const isCard = kind === "card";
  const isExpense = isCash || isCard;

  const formTitle = select("#unifiedFormTitle");
  const formIcon = select("#unifiedFormIcon");
  if (formTitle) {
    formTitle.textContent = isIncome ? "Registrar Entrada" : (isCash ? "Saída à Vista" : "Saída no Cartão");
  }
  if (formIcon) {
    formIcon.className = `panel-icon ${isIncome ? 'income' : (isCash ? 'expense' : 'balance')}`;
    formIcon.innerHTML = isIncome 
      ? '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>'
      : (isCash 
        ? '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7" /></svg>' 
        : '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>');
  }
  const submitBtn = select("#unifiedSubmitBtn");
  if (submitBtn) {
    submitBtn.textContent = isIncome ? "Registrar entrada" : (isCash ? "Registrar saída à vista" : "Registrar saída no cartão");
  }

  const toggleRequired = (el, isRequired) => {
    el.style.display = isRequired ? "" : "none";
    el.querySelectorAll("input, select").forEach(input => {
      if (!["notes", "category", "isRecurring", "recurrenceCount"].includes(input.name)) {
        input.required = isRequired;
      }
    });
  };

  selectAll(".only-income").forEach(el => toggleRequired(el, isIncome));
  selectAll(".only-cash").forEach(el => toggleRequired(el, isCash));
  selectAll(".only-card").forEach(el => toggleRequired(el, isCard));
  
  selectAll(".only-expense").forEach(el => {
    el.style.display = isExpense ? "" : "none";
  });
  
  syncRecurringControls();
};

select("#transactionKind")?.addEventListener("change", updateUnifiedFormVisibility);

select("#unifiedTransactionForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const kind = form.get("kind");
  const amount = parseAmount(form.get("amount"));
  const description = form.get("description").trim();

  if (!description || !Number.isFinite(amount) || amount <= 0) {
    return;
  }

  if (kind === "income") {
    addTransaction({
      kind: "income",
      date: form.get("date"),
      description,
      incomeType: form.get("incomeType"),
      amount,
    });
  } else if (kind === "cash") {
    const isRecurring = form.get("isRecurring") === "on";
    const recurrenceCount = isRecurring ? Number(form.get("recurrenceCount")) : 1;
    if (!Number.isFinite(recurrenceCount) || recurrenceCount < 1) return;

    const recurringGroup = isRecurring ? `cash-recurring-${Date.now()}` : "";
    const cashTransactions = Array.from({ length: recurrenceCount }, (_, index) => ({
      kind: "cash",
      date: addMonths(form.get("date"), index),
      description,
      category: form.get("category") || classifyCategory(description),
      paymentMethod: form.get("paymentMethod"),
      amount,
      recurringGroup,
      occurrenceNumber: isRecurring ? index + 1 : 0,
      occurrenceTotal: isRecurring ? recurrenceCount : 0,
    }));
    addTransactions(cashTransactions);
  } else if (kind === "card") {
    const isRecurring = form.get("isRecurring") === "on";
    const recurrenceCount = isRecurring ? Number(form.get("recurrenceCount")) : 1;
    const installments = isRecurring ? 1 : Number(form.get("installments"));
    const invoiceDate = form.get("invoiceDate");

    if (!invoiceDate || !Number.isFinite(installments) || installments < 1 || !Number.isFinite(recurrenceCount) || recurrenceCount < 1) {
      return;
    }

    const recurringGroup = isRecurring ? `card-recurring-${Date.now()}` : "";
    const cardTransactions = Array.from({ length: recurrenceCount }, (_, index) => ({
      kind: "card",
      date: addMonths(form.get("date"), index),
      invoiceDate: addMonths(invoiceDate, index),
      description,
      category: form.get("category") || classifyCategory(description),
      card: form.get("card"),
      amount,
      installments,
      notes: form.get("notes").trim(),
      recurringGroup,
      occurrenceNumber: isRecurring ? index + 1 : 0,
      occurrenceTotal: isRecurring ? recurrenceCount : 0,
    }));
    addTransactions(cardTransactions);
    saveCardExpenseMemory();
  }

  event.currentTarget.reset();
  setTimeout(updateUnifiedFormVisibility, 0); 
  setDefaultDates();
  applyCardExpenseMemory();
});

select("#categoryIconPicker").innerHTML = iconPickerMarkup("categoryIcon", "outros");

select("#categorySettingsForm").addEventListener("click", (event) => {
  const optionButton = event.target.closest('[data-icon-picker-option="categoryIcon"]');
  if (!optionButton) {
    return;
  }
  const hiddenInput = select('#categorySettingsForm input[name="categoryIcon"]');
  hiddenInput.value = optionButton.dataset.iconKey;
  selectAll("#categoryIconPicker button").forEach((btn) => btn.classList.toggle("is-active", btn === optionButton));
});

select("#categorySettingsList").addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-icon-trigger]");
  if (trigger) {
    const item = trigger.closest(".settings-item");
    const popover = item?.querySelector(".icon-popover");
    if (!popover) {
      return;
    }
    const wasHidden = popover.hasAttribute("hidden");
    selectAll("#categorySettingsList .icon-popover").forEach((p) => p.setAttribute("hidden", ""));
    if (wasHidden) {
      popover.removeAttribute("hidden");
    }
    return;
  }

  const optionButton = event.target.closest("[data-icon-key]");
  const popoverParent = optionButton?.closest("[data-icon-popover]");
  if (optionButton && popoverParent) {
    const categoryName = popoverParent.dataset.iconPopover;
    settings.categoryIcons[categoryName] = optionButton.dataset.iconKey;
    saveSettings();
    renderView();
  }
});

select("#categorySettingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const categoryName = form.get("categoryName").trim();
  const exists = settings.categories.some((category) => normalizeText(category) === normalizeText(categoryName));

  if (!categoryName || exists) {
    return;
  }

  settings.categories.push(categoryName);
  settings.categoryColors[categoryName] = form.get("categoryColor") || defaultColorForIndex(settings.categories.length - 1);
  settings.categoryIcons[categoryName] = categoryIconLibrary[form.get("categoryIcon")] ? form.get("categoryIcon") : "outros";
  saveSettings();
  event.currentTarget.reset();
  event.currentTarget.querySelectorAll("input[type='color']").forEach(syncColorPicker);
  selectAll("#categoryIconPicker button").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.iconKey === "outros"));
  event.currentTarget.closest(".settings-create-panel")?.classList.add("is-collapsed");
  event.currentTarget.closest(".settings-create-panel")?.querySelector("[data-collapse-target]")?.setAttribute("aria-expanded", "false");
  fillCategorySelects();
  renderView();
});

select("#cardSettingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const cardName = form.get("cardName").trim();
  const exists = settings.cards.some((card) => normalizeText(card) === normalizeText(cardName));

  if (!cardName || exists) {
    return;
  }

  settings.cards.push(cardName);
  settings.cardColors[cardName] = form.get("cardColor") || defaultColorForIndex(settings.cards.length - 1);
  saveSettings();
  event.currentTarget.reset();
  event.currentTarget.querySelectorAll("input[type='color']").forEach(syncColorPicker);
  event.currentTarget.closest(".settings-create-panel")?.classList.add("is-collapsed");
  event.currentTarget.closest(".settings-create-panel")?.querySelector("[data-collapse-target]")?.setAttribute("aria-expanded", "false");
  fillCardSelects();
  renderView();
});

select("#themeToggle").addEventListener("change", (event) => {
  settings.theme = event.currentTarget.checked ? "dark" : "light";
  applyTheme();
  saveSettings();
});

select("#editTransactionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editingTransactionId) {
    return;
  }

  const transaction = transactions.find((item) => item.id === editingTransactionId);
  if (!transaction) {
    closeEditDialog();
    return;
  }

  const form = new FormData(event.currentTarget);
  const description = String(form.get("description") || "").trim();
  const date = String(form.get("date") || "").trim();
  const category = String(form.get("category") || "").trim();
  const amount = parseAmount(form.get("amount"));

  if (!description || !date || (transaction.kind !== "income" && !category) || !Number.isFinite(amount) || amount <= 0) {
    return;
  }

  transaction.description = description;
  transaction.date = date;
  transaction.amount = amount;
  if (transaction.kind !== "income") {
    transaction.category = category;
  } else {
    delete transaction.category;
  }

  if (transaction.kind === "income") {
    const incomeType = String(form.get("incomeType") || "").trim();
    if (!incomeType) {
      return;
    }
    transaction.incomeType = incomeType;
  }

  if (transaction.kind === "cash") {
    const paymentMethod = String(form.get("paymentMethod") || "").trim();
    if (!paymentMethod) {
      return;
    }
    transaction.paymentMethod = paymentMethod;
  }

  if (transaction.kind === "card") {
    const invoiceDate = String(form.get("invoiceDate") || "").trim();
    const card = String(form.get("card") || "").trim();
    const installments = Number(form.get("installments"));
    const notes = String(form.get("notes") || "").trim();

    if (!invoiceDate || !card || !Number.isFinite(installments) || installments < 1) {
      return;
    }

    transaction.invoiceDate = invoiceDate;
    transaction.card = card;
    transaction.installments = installments;
    transaction.notes = notes;
  }

  saveTransactions();
  closeEditDialog();
  renderView();
});

select("#editTransactionClose").addEventListener("click", closeEditDialog);
select("#editTransactionCancel").addEventListener("click", closeEditDialog);
select("#deleteTransactionClose").addEventListener("click", closeDeleteDialog);
select("#deleteTransactionCancel").addEventListener("click", closeDeleteDialog);
select("#deleteTransactionConfirm").addEventListener("click", () => {
  if (!deletingTransactionId) {
    closeDeleteDialog();
    return;
  }
  deleteTransactionById(deletingTransactionId);
  closeDeleteDialog();
});

selectAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => {
    currentView = button.dataset.viewTarget;
    closeMenu();
    renderView();
  });
});

document.addEventListener("click", (event) => {
  const ledgerPill = event.target.closest("[data-ledger-pill]");
  if (ledgerPill) {
    activeLedgerPill = ledgerPill.dataset.ledgerPill;
    renderDashboardLedger();
    return;
  }
});

select("#menuToggle").addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMenu();
});

select("#brandHome").addEventListener("click", () => {
  currentView = "dashboard";
  closeMenu();
  renderView();
});

const brandHomeMobile = select("#brandHomeMobile");
if (brandHomeMobile) {
  brandHomeMobile.addEventListener("click", () => {
    currentView = "dashboard";
    closeMenu();
    renderView();
  });
}

const toggleCollapsiblePanel = (collapseButton) => {
  const targetId = collapseButton.dataset.collapseTarget;
  const target = select(`#${targetId}`);
  const panel = collapseButton.closest(".transaction-collapsible, .dashboard-statement-panel, .dashboard-chart-panel, .settings-create-panel");
  if (!target || !panel) {
    return false;
  }

  const willCollapse = !panel.classList.contains("is-collapsed");
  panel.classList.toggle("is-collapsed", willCollapse);
  collapseButton.setAttribute("aria-expanded", String(!willCollapse));
  return true;
};

document.addEventListener("click", (event) => {
  const collapseButton = event.target.closest("[data-collapse-target]");
  if (collapseButton) {
    toggleCollapsiblePanel(collapseButton);
    return;
  }

  const collapseHeader = event.target.closest(".transaction-collapsible .panel-header, .dashboard-statement-panel .panel-header, .dashboard-chart-panel .panel-header");
  if (collapseHeader) {
    const headerButton = collapseHeader.querySelector(".panel-collapse-toggle[data-collapse-target]");
    if (headerButton) {
      toggleCollapsiblePanel(headerButton);
    }
    return;
  }

  const actionButton = event.target.closest("[data-transaction-action]");
  if (actionButton) {
    const transactionId = actionButton.dataset.transactionId;
    if (!transactionId) {
      return;
    }

    if (actionButton.dataset.transactionAction === "delete") {
      openDeleteDialog(transactionId);
      return;
    }

    if (actionButton.dataset.transactionAction === "edit") {
      editTransactionById(transactionId);
      return;
    }
  }

  if (select("#appSidebar") && !select("#appSidebar").contains(event.target) && !select("#menuToggle").contains(event.target)) {
    closeMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    closeEditDialog();
    closeDeleteDialog();
  }
});

select("#previousMonth").addEventListener("click", () => {
  selectedDate.setMonth(selectedDate.getMonth() - 1);
  renderView();
});

select("#nextMonth").addEventListener("click", () => {
  selectedDate.setMonth(selectedDate.getMonth() + 1);
  renderView();
});

selectAll('input[name="description"]').forEach((field) => {
  field.addEventListener("input", () => {
    const form = field.closest("form");
    const categoryField = form.querySelector("[data-category-select]");
    if (!categoryField || categoryField.dataset.userTouched === "true") {
      return;
    }
    categoryField.value = classifyCategory(field.value);
  });
});

selectAll("[data-category-select]").forEach((field) => {
  field.addEventListener("change", () => {
    field.dataset.userTouched = "true";
  });
  const form = field.closest("form");
  form?.addEventListener("reset", () => {
    delete field.dataset.userTouched;
  });
});

const syncRecurringFormControls = (formSelector, options = {}) => {
  const recurringCheckbox = select(`${formSelector} input[name="isRecurring"]`);
  const recurrenceField = select(`${formSelector} input[name="recurrenceCount"]`);
  const installmentsField = options.installmentsName
    ? select(`${formSelector} input[name="${options.installmentsName}"]`)
    : null;

  if (!recurringCheckbox || !recurrenceField) {
    return;
  }

  recurrenceField.disabled = !recurringCheckbox.checked;
  if (!recurringCheckbox.checked) {
    recurrenceField.value = "1";
  }
  if (installmentsField) {
    installmentsField.disabled = recurringCheckbox.checked;
    if (recurringCheckbox.checked) {
      installmentsField.value = "1";
    }
  }
};

const syncRecurringControls = () => {
  const form = select("#unifiedTransactionForm");
  if (!form) return;
  const kind = form.querySelector("#transactionKind")?.value;
  if (kind === "cash") {
    syncRecurringFormControls("#unifiedTransactionForm");
  } else if (kind === "card") {
    syncRecurringFormControls("#unifiedTransactionForm", { installmentsName: "installments" });
  }
};

select('#unifiedTransactionForm input[name="isRecurring"]')?.addEventListener("change", syncRecurringControls);
select('#unifiedTransactionForm select[name="card"]')?.addEventListener("change", saveCardExpenseMemory);
select('#unifiedTransactionForm input[name="invoiceDate"]')?.addEventListener("change", saveCardExpenseMemory);

const profileDisplayName = (user) => {
  if (!user) {
    return "Usuario";
  }
  return profile.displayName || user.displayName || user.email?.split("@")[0] || "Usuario";
};

const initialsAvatar = (name) => {
  const initials =
    String(name || "Usuario")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .replace(/[^A-Za-z0-9\u00c0-\u00ff]/g, "")
      .slice(0, 2)
      .toUpperCase() || "U";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#7c3aed"/>
          <stop offset="1" stop-color="#0f8b8d"/>
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="48" fill="url(#g)"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="Arial, sans-serif" font-size="34" font-weight="800">${initials}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const profileAvatarUrl = (user) => profile.photoDataUrl || user?.photoURL || initialsAvatar(profileDisplayName(user));

const profilePhotoToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve(profile.photoDataUrl);
      return;
    }

    if (!file.type.startsWith("image/")) {
      reject(new Error("Selecione uma imagem valida."));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      reject(new Error("Escolha uma imagem de ate 5 MB."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Nao foi possivel carregar a imagem."));
      image.onload = () => {
        const size = 320;
        const sourceSize = Math.min(image.width, image.height);
        const sourceX = (image.width - sourceSize) / 2;
        const sourceY = (image.height - sourceSize) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

const setAuthUi = () => {
  const authToggle = select("#authToggle");
  const authToggleText = select("#authToggleText");
  const authAvatar = select("#authAvatar");
  const profileMenuAvatar = select("#profileMenuAvatar");
  const profileMenuName = select("#profileMenuName");
  const profileMenuEmail = select("#profileMenuEmail");
  const profileNameInput = select("#profileDisplayName");
  const profilePhotoInput = select("#profilePhotoFile");
  const profileEditStatus = select("#profileEditStatus");
  const authStatusText = select("#authStatusText");
  const profileMenu = select("#profileMenu");

  if (currentUser) {
    const displayName = profileDisplayName(currentUser);
    const avatarUrl = profileAvatarUrl(currentUser);
    const fallbackAvatarUrl = initialsAvatar(displayName);
    authToggle.classList.add("user-ready");
    authToggleText.textContent = displayName;
    authAvatar.onerror = () => {
      authAvatar.onerror = null;
      authAvatar.src = fallbackAvatarUrl;
    };
    profileMenuAvatar.onerror = () => {
      profileMenuAvatar.onerror = null;
      profileMenuAvatar.src = fallbackAvatarUrl;
    };
    authAvatar.src = avatarUrl;
    profileMenuAvatar.src = avatarUrl;
    profileMenuName.textContent = displayName;
    profileMenuEmail.textContent = currentUser.email || "";
    profileNameInput.value = displayName;
    profilePhotoInput.value = "";
    profileEditStatus.textContent = "";
    authStatusText.textContent = `Conectado como ${currentUser.email}.`;
    profileMenu.classList.remove("open");
    authToggle.setAttribute("aria-expanded", "false");
  } else {
    authToggle.classList.remove("user-ready");
    authToggleText.textContent = "Entrar";
    authStatusText.textContent = "Entre com seu e-mail para acessar seus dados.";
    authAvatar.removeAttribute("src");
    profileNameInput.value = "";
    profilePhotoInput.value = "";
    profileEditStatus.textContent = "";
    profileMenu.classList.remove("open");
    authToggle.setAttribute("aria-expanded", "false");
  }
};

const openAuthDialog = () => {
  const dialog = select("#authDialog");
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "true");
  }
};

const closeAuthDialog = () => {
  const dialog = select("#authDialog");
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
};

const openSignupDialog = (emailSelector = "", passwordSelector = "") => {
  select("#signupStatusText").textContent = "Preencha seus dados para criar seu espaço no QFinanças.";
  select("#signupName").value = "";
  select("#signupEmail").value = emailSelector ? select(emailSelector).value.trim() : "";
  select("#signupPassword").value = passwordSelector ? select(passwordSelector).value : "";
  const dialog = select("#signupDialog");
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "true");
  }
  select("#signupName").focus();
};

const closeSignupDialog = () => {
  const dialog = select("#signupDialog");
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
};

const setFormsEnabled = (enabled) => {
  const forms = selectAll("#transactionsView form, #settingsView form");
  forms.forEach((form) => {
    Array.from(form.querySelectorAll("input, select, button")).forEach((field) => {
      field.disabled = !enabled;
    });
  });
};

const setAuthLayout = (loggedIn) => {
  const guestHome = select("#guestHome");
  const appContent = select("#appContent");
  if (!guestHome || !appContent) {
    return;
  }
  guestHome.style.display = loggedIn ? "none" : "grid";
  appContent.style.display = loggedIn ? "block" : "none";
};

const setStatusTexts = (text) => {
  const modalStatus = select("#authStatusText");
  const guestStatus = select("#guestAuthStatusText");
  if (modalStatus) {
    modalStatus.textContent = text;
  }
  if (guestStatus) {
    guestStatus.textContent = text;
  }
};

const handleAuthAction = async (fn, emailSelector, passwordSelector, closeModalOnSuccess = false) => {
  const email = select(emailSelector).value.trim();
  const password = select(passwordSelector).value;
  if (!email || !password) {
    setStatusTexts("Preencha e-mail e senha.");
    return;
  }
  try {
    await fn(auth, email, password);
    if (closeModalOnSuccess) {
      closeAuthDialog();
    }
  } catch (error) {
    setStatusTexts(error.message);
  }
};

const handleSignup = async () => {
  const displayName = select("#signupName").value.trim();
  const email = select("#signupEmail").value.trim();
  const password = select("#signupPassword").value;
  const signupStatus = select("#signupStatusText");

  if (!displayName || !email || !password) {
    signupStatus.textContent = "Preencha nome, e-mail e senha.";
    return;
  }

  signupStatus.textContent = "Criando sua conta...";
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    currentUser = credential.user;
    await updateProfile(currentUser, { displayName });
    profile = { displayName, photoDataUrl: "" };
    await saveProfile();
    closeSignupDialog();
    closeAuthDialog();
    setStatusTexts("Conta criada com sucesso.");
  } catch (error) {
    signupStatus.textContent = error.message;
  }
};

const handleGoogleSignIn = async () => {
  const provider = new GoogleAuthProvider();
  setStatusTexts("Abrindo login com Google...");
  try {
    await signInWithPopup(auth, provider);
    closeAuthDialog();
  } catch (error) {
    if (error?.code === "auth/popup-blocked" || error?.code === "auth/popup-closed-by-user") {
      setStatusTexts("Popup bloqueado. Redirecionando para login com Google...");
      await signInWithRedirect(auth, provider);
      return;
    }
    if (error?.code === "auth/unauthorized-domain") {
      select("#authStatusText").textContent =
        "Dom\u00ednio n\u00e3o autorizado no Firebase Auth. Adicione seu dom\u00ednio em Authentication > Settings > Authorized domains.";
      return;
    }
    setStatusTexts(error.message);
  }
};

select("#authToggle").addEventListener("click", () => {
  if (currentUser) {
    const menu = select("#profileMenu");
    const nextState = !menu.classList.contains("open");
    menu.classList.toggle("open", nextState);
    select("#authToggle").setAttribute("aria-expanded", String(nextState));
    return;
  }

  if (!hasFirebaseConfig) {
    select("#authStatusText").textContent = "Configure o firebaseConfig no script.js para ativar perfis de usu\u00e1rio.";
  }
  openAuthDialog();
});

select("#authClose").addEventListener("click", () => {
  closeAuthDialog();
});

select("#signupClose").addEventListener("click", () => {
  closeSignupDialog();
});

select("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!hasFirebaseConfig) {
    select("#signupStatusText").textContent = "Configure o firebaseConfig no script.js para ativar cadastro.";
    return;
  }
  await handleSignup();
});

select("#authLogin").addEventListener("click", async () => {
  if (!hasFirebaseConfig) {
    return;
  }
  await handleAuthAction(signInWithEmailAndPassword, "#authEmail", "#authPassword", true);
});

select("#authSignup").addEventListener("click", async () => {
  if (!hasFirebaseConfig) {
    setStatusTexts("Configure o firebaseConfig no script.js para ativar cadastro.");
    return;
  }
  openSignupDialog("#authEmail", "#authPassword");
});

select("#authGoogle").addEventListener("click", async () => {
  if (!hasFirebaseConfig) {
    return;
  }
  await handleGoogleSignIn();
});


select("#guestAuthLogin").addEventListener("click", async () => {
  if (!hasFirebaseConfig) {
    return;
  }
  await handleAuthAction(signInWithEmailAndPassword, "#guestAuthEmail", "#guestAuthPassword");
});

select("#guestAuthSignup").addEventListener("click", async () => {
  if (!hasFirebaseConfig) {
    setStatusTexts("Configure o firebaseConfig no script.js para ativar cadastro.");
    return;
  }
  openSignupDialog("#guestAuthEmail", "#guestAuthPassword");
});

select("#guestAuthGoogle").addEventListener("click", async () => {
  if (!hasFirebaseConfig) {
    return;
  }
  await handleGoogleSignIn();
});

select("#profileEditToggle").addEventListener("click", (event) => {
  event.stopPropagation();
  const form = select("#profileEditForm");
  const willOpen = form.classList.contains("is-collapsed");
  form.classList.toggle("is-collapsed", !willOpen);
  select("#profileEditToggle").setAttribute("aria-expanded", String(willOpen));
});

select("#profilePhotoFile").addEventListener("change", (event) => {
  const file = event.currentTarget.files?.[0];
  select("#profileEditStatus").textContent = file ? "Foto selecionada." : "";
});

select("#profileEditForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!hasFirebaseConfig || !currentUser) {
    return;
  }

  const profileEditStatus = select("#profileEditStatus");
  const displayName = select("#profileDisplayName").value.trim() || currentUser.email?.split("@")[0] || "Usuario";
  const photoFile = select("#profilePhotoFile").files?.[0];

  profileEditStatus.textContent = "Salvando perfil...";
  try {
    const photoDataUrl = await profilePhotoToDataUrl(photoFile);
    profile = {
      displayName,
      photoDataUrl: photoDataUrl || profile.photoDataUrl,
    };
    await updateProfile(currentUser, {
      displayName,
    });
    await saveProfile();
    await currentUser.reload();
    currentUser = auth.currentUser;
    setAuthUi();
    select("#profileMenu").classList.add("open");
    select("#authToggle").setAttribute("aria-expanded", "true");
    select("#profileEditForm").classList.add("is-collapsed");
    select("#profileEditToggle").setAttribute("aria-expanded", "false");
    select("#profileEditStatus").textContent = "Perfil atualizado.";
  } catch (error) {
    profileEditStatus.textContent = error.message;
  }
});

select("#profileLogout").addEventListener("click", async () => {
  if (!hasFirebaseConfig) {
    return;
  }
  await signOut(auth);
  select("#profileMenu").classList.remove("open");
  select("#authToggle").setAttribute("aria-expanded", "false");
});

document.addEventListener("click", (event) => {
  const profileMenu = select("#profileMenu");
  const authToggle = select("#authToggle");
  if (!profileMenu || !authToggle || !currentUser) {
    return;
  }

  if (!profileMenu.contains(event.target) && !authToggle.contains(event.target)) {
    profileMenu.classList.remove("open");
    authToggle.setAttribute("aria-expanded", "false");
  }
});

if (hasFirebaseConfig) {
  getRedirectResult(auth).catch((error) => {
    setStatusTexts(error.message);
  });

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    setFormsEnabled(Boolean(user));
    setAuthLayout(Boolean(user));
    await loadUserState();
    fillCategorySelects();
    fillCardSelects();
    setDefaultDates();
    applyCardExpenseMemory();
    syncRecurringControls();
    applyTheme();
    setAuthUi();
    renderView();
  });
} else {
  setFormsEnabled(true);
  setAuthLayout(false);
  loadUserState().then(() => {
    fillCategorySelects();
    fillCardSelects();
    setDefaultDates();
    applyCardExpenseMemory();
    syncRecurringControls();
    applyTheme();
    setAuthUi();
    renderView();
  });
}

fillCategorySelects();
fillCardSelects();
setDefaultDates();
applyCardExpenseMemory();
syncRecurringControls();
initializeColorPickers();
applyTheme();
setAuthUi();
setAuthLayout(Boolean(currentUser));
updateUnifiedFormVisibility();
