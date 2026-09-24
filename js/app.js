const SUPABASE_URL = "https://krzttskzpbajyprowdqd.supabase.co";
const SUPABASE_KEY = "sb_publishable_s760LsBrsEmoPrRJjSoC7w_cVeud0bg";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);

const money = n =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(n) || 0);

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthISO = () => todayISO().slice(0, 7);

const esc = s =>
  String(s ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );

const state = {
  user: null,
  transactions: [],
  categories: [],
  budgets: [],
  goals: [],
  recurring: [],
  settings: null,
  authMode: "login",
  charts: {},
  reportMonth: monthISO(),
  deferredInstall: null
};

let authBusy = false;


/* =========================
   TOAST / ERROR
========================= */

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    $("toast").classList.remove("show");
  }, 3500);
}

function fail(error) {
  console.error("FINOVA ERROR:", error);

  const code = error?.code || "";
  const status = error?.status || "";
  const message = error?.message || "";

  if (status === 429 || code === "over_request_rate_limit") {
    toast("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.");
    return;
  }

  if (
    code === "email_not_confirmed" ||
    message.toLowerCase().includes("email not confirmed")
  ) {
    toast("Email belum diverifikasi. Cek email dari Supabase.");
    return;
  }

  if (
    code === "invalid_credentials" ||
    message.toLowerCase().includes("invalid login credentials")
  ) {
    toast("Email atau password salah.");
    return;
  }

  if (
    message.toLowerCase().includes("failed to fetch") ||
    message.toLowerCase().includes("network")
  ) {
    toast("Koneksi ke Supabase gagal. Periksa internet lalu coba lagi.");
    return;
  }

  if (code === "user_already_exists") {
    toast("Email tersebut sudah terdaftar. Silakan Masuk.");
    return;
  }

  toast(message || "Terjadi kesalahan. Coba lagi.");
}


/* =========================
   LOGIN / REGISTER
========================= */

document.querySelectorAll("[data-auth]").forEach(button => {
  button.onclick = () => {
    state.authMode = button.dataset.auth;

    document
      .querySelectorAll(".tab")
      .forEach(tab =>
        tab.classList.toggle("active", tab === button)
      );

    $("authSubmit").textContent =
      state.authMode === "login" ? "Masuk" : "Daftar";

    $("authPassword").value = "";

    $("authHint").textContent =
      state.authMode === "login"
        ? "Belum punya akun? Pilih Daftar."
        : "Sudah punya akun? Pilih Masuk.";
  };
});


$("authForm").onsubmit = async event => {
  event.preventDefault();

  if (authBusy) return;

  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;

  if (!email || !password) {
    toast("Email dan password wajib diisi.");
    return;
  }

  if (password.length < 6) {
    toast("Password minimal 6 karakter.");
    return;
  }

  authBusy = true;

  const button = $("authSubmit");
  const originalText = button.textContent;

  button.disabled = true;

  button.textContent =
    state.authMode === "login"
      ? "Memproses..."
      : "Mendaftarkan...";

  try {

    if (state.authMode === "login") {

      const { data, error } =
        await db.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      if (!data?.session) {
        toast("Login belum menghasilkan session. Coba lagi.");
        return;
      }

      state.user = data.user;

      toast("Login berhasil. Memuat Finova...");

      await showApp(data.session);

    } else {

      const { data, error } =
        await db.auth.signUp({
          email,
          password
        });

      if (error) throw error;

      if (data?.session) {

        state.user = data.user;

        toast("Akun berhasil dibuat.");

        await showApp(data.session);

      } else {

        toast(
          "Akun berhasil dibuat. Cek email untuk verifikasi terlebih dahulu."
        );

        state.authMode = "login";

        document
          .querySelectorAll(".tab")
          .forEach(tab =>
            tab.classList.toggle(
              "active",
              tab.dataset.auth === "login"
            )
          );

        $("authSubmit").textContent = "Masuk";
      }
    }

  } catch (error) {

    fail(error);

  } finally {

    authBusy = false;

    button.disabled = false;

    button.textContent =
      state.authMode === "login"
        ? "Masuk"
        : "Daftar";
  }
};


/* =========================
   AUTH SESSION
========================= */

function showAuth() {
  $("authView").classList.remove("hidden");
  $("appView").classList.add("hidden");
}

async function showApp(session) {

  if (!session?.user) {
    showAuth();
    return;
  }

  state.user = session.user;

  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  try {

    await loadAll();

  } catch (error) {

    console.error("LOAD APP ERROR:", error);

    $("authView").classList.remove("hidden");
    $("appView").classList.add("hidden");

    fail(error);
  }
}


async function initAuth() {

  try {

    const {
      data: { session },
      error
    } = await db.auth.getSession();

    if (error) throw error;

    if (session?.user) {
      await showApp(session);
    } else {
      showAuth();
    }

  } catch (error) {

    console.error("AUTH INIT ERROR:", error);

    showAuth();

    fail(error);
  }
}


db.auth.onAuthStateChange(async (event, session) => {

  console.log(
    "AUTH EVENT:",
    event,
    session?.user?.email || "tidak ada session"
  );

  if (event === "SIGNED_IN" && session?.user) {

    state.user = session.user;

    if ($("appView").classList.contains("hidden")) {
      await showApp(session);
    }
  }

  if (event === "SIGNED_OUT") {

    state.user = null;

    showAuth();
  }
});


/* =========================
   NAVIGASI
========================= */

document.querySelectorAll("[data-page]").forEach(b => {
  b.onclick = () => showPage(b.dataset.page);
});

function showPage(p) {

  document
    .querySelectorAll(".page")
    .forEach(x =>
      x.classList.toggle(
        "active",
        x.id === "page-" + p
      )
    );

  document
    .querySelectorAll(".nav")
    .forEach(x =>
      x.classList.toggle(
        "active",
        x.dataset.page === p
      )
    );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (p === "reports") {
    renderReports();
  }
}


/* =========================
   LOGOUT / THEME
========================= */

$("logoutBtn").onclick = async () => {

  try {

    const { error } = await db.auth.signOut();

    if (error) throw error;

    toast("Berhasil keluar.");

  } catch (error) {

    fail(error);
  }
};


$("themeBtn").onclick = async () => {

  document.body.classList.toggle("light");

  await saveSettings({
    theme: document.body.classList.contains("light")
      ? "light"
      : "dark"
  });
};


/* =========================
   LOAD DATA
========================= */

async function loadAll() {

  const uid = state.user.id;

  const results = await Promise.all([

    db
      .from("transactions")
      .select("*")
      .eq("user_id", uid)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }),

    db
      .from("categories")
      .select("*")
      .eq("user_id", uid)
      .order("name"),

    db
      .from("budgets")
      .select("*, categories(name,icon)")
      .eq("user_id", uid)
      .order("month", { ascending: false }),

    db
      .from("savings_goals")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false }),

    db
      .from("recurring_transactions")
      .select("*, categories(name,icon)")
      .eq("user_id", uid)
      .order("next_date"),

    db
      .from("app_settings")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle()

  ]);

  const names = [
    "transactions",
    "categories",
    "budgets",
    "goals",
    "recurring",
    "settings"
  ];

  results.forEach((r, i) => {

    if (r.error) throw r.error;

    state[names[i]] = r.data || null;
  });

  if (!state.settings) {

    await saveSettings({
      currency: "IDR",
      theme: "dark",
      notifications: true
    });

    state.settings = {
      theme: "dark"
    };
  }

  if (!state.categories.length) {
    await seedCategories();
  }

  applyTheme();

  renderAll();
}


async function seedCategories() {

  const base = [

    ["🍔", "Makanan", "expense"],
    ["🚌", "Transportasi", "expense"],
    ["🎮", "Hiburan", "expense"],
    ["📚", "Pendidikan", "expense"],
    ["🛍️", "Belanja", "expense"],
    ["💡", "Tagihan", "expense"],
    ["🏠", "Rumah", "expense"],
    ["📦", "Lainnya", "expense"],

    ["💼", "Gaji", "income"],
    ["💻", "Freelance", "income"],
    ["🎁", "Bonus", "income"],
    ["💰", "Lainnya", "income"]

  ];

  const { error } =
    await db
      .from("categories")
      .insert(
        base.map(([icon, name, type]) => ({
          user_id: state.user.id,
          icon,
          name,
          type
        }))
      );

  if (error) throw error;

  const { data } =
    await db
      .from("categories")
      .select("*")
      .eq("user_id", state.user.id)
      .order("name");

  state.categories = data || [];
}


async function saveSettings(patch) {

  await db
    .from("app_settings")
    .upsert({
      user_id: state.user.id,
      ...patch,
      updated_at: new Date().toISOString()
    });
}


function applyTheme() {

  document.body.classList.toggle(
    "light",
    state.settings?.theme === "light"
  );
}


/* =========================
   RENDER ALL
========================= */

function renderAll() {

  renderDashboard();
  renderFilters();
  renderTransactions();
  renderBudgets();
  renderGoals();
  renderHealth();
}


function monthTx(m = monthISO()) {

  return state.transactions.filter(
    t =>
      String(t.transaction_date).startsWith(m)
  );
}


/* =========================
   DASHBOARD
========================= */

function renderDashboard() {

  const tx = monthTx();

  const income =
    tx
      .filter(t => t.type === "income")
      .reduce((a, t) => a + Number(t.amount), 0);

  const expense =
    tx
      .filter(t => t.type === "expense")
      .reduce((a, t) => a + Number(t.amount), 0);

  const allIncome =
    state.transactions
      .filter(t => t.type === "income")
      .reduce((a, t) => a + Number(t.amount), 0);

  const allExpense =
    state.transactions
      .filter(t => t.type === "expense")
      .reduce((a, t) => a + Number(t.amount), 0);

  $("balance").textContent =
    money(allIncome - allExpense);

  $("incomeTotal").textContent =
    money(income);

  $("expenseTotal").textContent =
    money(expense);

  $("savingRate").textContent =
    income
      ? Math.round(
          ((income - expense) / income) * 100
        ) + "%"
      : "0%";

  $("txCount").textContent =
    tx.length;

  $("greeting").textContent =
    "Halo, " +
    (state.user.email?.split("@")[0] || "Finova") +
    " 👋";

  renderCashflowChart();
  renderBudgetPreview();
  renderGoalPreview();
  renderHealth();
}


/* =========================
   CHART
========================= */

function destroyChart(k) {

  if (state.charts[k]) {
    state.charts[k].destroy();
  }
}


function renderCashflowChart() {

  destroyChart("cash");

  const labels = [];
  const inc = [];
  const exp = [];

  for (let i = 5; i >= 0; i--) {

    const d = new Date();

    d.setMonth(d.getMonth() - i);

    const m =
      d.toISOString().slice(0, 7);

    labels.push(
      d.toLocaleDateString(
        "id-ID",
        { month: "short" }
      )
    );

    const tx = monthTx(m);

    inc.push(
      tx
        .filter(t => t.type === "income")
        .reduce(
          (a, t) => a + Number(t.amount),
          0
        )
    );

    exp.push(
      tx
        .filter(t => t.type === "expense")
        .reduce(
          (a, t) => a + Number(t.amount),
          0
        )
    );
  }

  state.charts.cash =
    new Chart(
      $("cashflowChart"),
      {
        type: "line",

        data: {
          labels,

          datasets: [
            {
              label: "Masuk",
              data: inc,
              tension: 0.35,
              borderWidth: 2
            },
            {
              label: "Keluar",
              data: exp,
              tension: 0.35,
              borderWidth: 2
            }
          ]
        },

        options: {

          responsive: true,

          maintainAspectRatio: true,

          aspectRatio: 1.6,

          animation: false,

          plugins: {
            legend: {
              labels: {
                color:
                  getComputedStyle(document.body)
                    .getPropertyValue("--text")
              }
            }
          },

          scales: {

            y: {
              ticks: {
                callback: v => money(v),
                color: "#8e94a7"
              },

              grid: {
                color: "#242837"
              }
            },

            x: {
              ticks: {
                color: "#8e94a7"
              },

              grid: {
                display: false
              }
            }
          }
        }
      }
    );
}


/* =========================
   BUDGET PREVIEW
========================= */

function renderBudgetPreview() {

  const m = monthISO();

  const bud =
    state.budgets.filter(
      b => String(b.month).startsWith(m)
    );

  $("budgetPreview").innerHTML =
    bud.length
      ? bud
          .slice(0, 4)
          .map(b => budgetHTML(b))
          .join("")
      : `<div class="muted">
           Belum ada anggaran bulan ini.
         </div>`;
}


/*
  CATATAN:
  transactions TIDAK mempunyai category_id.
  Jadi budget dicocokkan menggunakan nama kategori.
*/

function spentForBudget(b) {

  const budgetCategory =
    b.categories?.name;

  return monthTx(
    String(b.month).slice(0, 7)
  )
    .filter(
      t =>
        t.type === "expense" &&
        t.category === budgetCategory
    )
    .reduce(
      (a, t) => a + Number(t.amount),
      0
    );
}


function budgetHTML(b) {

  const spent =
    spentForBudget(b);

  const pct =
    Number(b.amount) > 0
      ? Math.min(
          100,
          Math.round(
            (spent / Number(b.amount)) * 100
          )
        )
      : 0;

  return `
    <div class="budget-item">

      <div class="budget-top">

        <b>
          ${esc(b.categories?.icon || "📦")}
          ${esc(b.categories?.name || "Kategori")}
        </b>

        <span>
          ${money(spent)}
          /
          ${money(b.amount)}
        </span>

      </div>

      <div class="progress">
        <i style="width:${pct}%"></i>
      </div>

      <small class="${pct >= 90 ? "expense" : ""}">
        ${pct}% terpakai
      </small>

    </div>
  `;
}


function renderBudgetList() {

  const html =
    state.budgets
      .filter(
        b =>
          String(b.month)
            .startsWith(monthISO())
      )
      .map(
        b =>
          budgetHTML(b) +
          `
          <div>
            <button
              class="link-btn"
              onclick="editBudget('${b.id}')">
              Edit
            </button>

            <button
              class="link-btn danger-text"
              onclick="deleteBudget('${b.id}')">
              Hapus
            </button>
          </div>
          `
      )
      .join("");

  $("budgetList").innerHTML =
    html ||
    `<div class="muted">
      Belum ada anggaran.
    </div>`;
}


function renderBudgets() {

  renderBudgetList();
}


/* =========================
   GOALS
========================= */

function renderGoalPreview() {

  $("goalPreview").innerHTML =
    state.goals
      .slice(0, 3)
      .map(goalHTML)
      .join("") ||
    `<div class="muted">
      Belum ada target tabungan.
    </div>`;
}


function goalHTML(g) {

  const pct =
    Number(g.target_amount) > 0
      ? Math.min(
          100,
          Math.round(
            (Number(g.current_amount) /
              Number(g.target_amount)) *
              100
          )
        )
      : 0;

  return `
    <div class="goal-card">

      <div class="goal-top">

        <span class="goal-icon">
          ${esc(g.icon)}
        </span>

        <div>
          <b>${esc(g.name)}</b>

          <div class="muted small">
            ${money(g.current_amount)}
            /
            ${money(g.target_amount)}
          </div>
        </div>

        <span>${pct}%</span>

      </div>

      <div class="progress">
        <i style="width:${pct}%"></i>
      </div>

      ${
        g.deadline
          ? `<small class="muted">
               Target
               ${new Date(g.deadline)
                 .toLocaleDateString("id-ID")}
             </small>`
          : ""
      }

    </div>
  `;
}


function renderGoals() {

  $("goalList").innerHTML =
    state.goals
      .map(
        g =>
          goalHTML(g) +
          `
          <div>

            <button
              class="link-btn"
              onclick="editGoal('${g.id}')">
              Edit
            </button>

            <button
              class="link-btn danger-text"
              onclick="deleteGoal('${g.id}')">
              Hapus
            </button>

          </div>
          `
      )
      .join("") ||
    `<div class="muted">
      Belum ada target.
    </div>`;
}


/* =========================
   FILTER
========================= */

function renderFilters() {

  $("filterCategory").innerHTML =
    `<option value="">
      Semua kategori
    </option>` +

    state.categories
      .map(
        c =>
          `<option value="${c.id}">
            ${esc(c.icon)}
            ${esc(c.name)}
          </option>`
      )
      .join("");
}


function renderTransactions() {

  const q =
    $("searchTx").value.toLowerCase();

  const type =
    $("filterType").value;

  const cat =
    $("filterCategory").value;

  const m =
    $("filterMonth").value;

  const selectedCategory =
    state.categories.find(
      c => c.id === cat
    );

  const selectedCategoryName =
    selectedCategory?.name || "";

  const tx =
    state.transactions.filter(
      t =>

        (
          !q ||
          `${t.name}
            ${t.note || ""}
            ${t.category || ""}`
            .toLowerCase()
            .includes(q)
        )

        &&

        (!type || t.type === type)

        &&

        (
          !cat ||
          t.category === selectedCategoryName
        )

        &&

        (
          !m ||
          String(t.transaction_date)
            .startsWith(m)
        )
    );

  $("transactionList").innerHTML =
    tx
      .map(t => {

        const c =
          state.categories.find(
            x =>
              x.name === t.category &&
              x.type === t.type
          );

        return `
          <div class="tx-item">

            <div class="tx-icon">
              ${esc(c?.icon || "📦")}
            </div>

            <div>

              <div class="tx-name">
                ${esc(t.name)}
              </div>

              <div class="tx-meta">
                ${esc(
                  c?.name ||
                  t.category ||
                  "Tanpa kategori"
                )}
                ·
                ${new Date(
                  t.transaction_date
                ).toLocaleDateString("id-ID")}
              </div>

            </div>

            <div style="text-align:right">

              <b class="${t.type}">
                ${t.type === "income" ? "+" : "-"}
                ${money(t.amount)}
              </b>

              <div>

                <button
                  class="link-btn small"
                  onclick="editTransaction('${t.id}')">
                  Edit
                </button>

                <button
                  class="link-btn small danger-text"
                  onclick="deleteTransaction('${t.id}')">
                  Hapus
                </button>

              </div>

            </div>

          </div>
        `;
      })
      .join("") ||

    `<div class="muted">
      Tidak ada transaksi.
    </div>`;
}


["searchTx", "filterType", "filterCategory", "filterMonth"]
  .forEach(id =>
    $(id).addEventListener(
      "input",
      renderTransactions
    )
  );


/* =========================
   MODAL
========================= */

function openModal(title, html) {

  $("modalTitle").textContent = title;

  $("modalBody").innerHTML = html;

  $("modal").classList.remove("hidden");
}


function closeModal() {

  $("modal").classList.add("hidden");
}


$("closeModal").onclick = closeModal;

document
  .querySelector(".modal-backdrop")
  .onclick = closeModal;


/* =========================
   CATEGORY OPTIONS
========================= */

function categoryOptions(
  type,
  selected = ""
) {

  return state.categories
    .filter(c => c.type === type)
    .map(
      c =>
        `<option
          value="${c.id}"
          ${c.id === selected ? "selected" : ""}>
          ${esc(c.icon)}
          ${esc(c.name)}
        </option>`
    )
    .join("");
}


/* =========================
   TRANSACTION FORM
========================= */

function txForm(t = {}) {

  const type =
    t.type || "expense";

  const selectedId =
    state.categories.find(
      c =>
        c.name === t.category &&
        c.type === type
    )?.id || "";

  return `
    <form id="txForm">

      <div class="form-grid">

        <div>

          <label>Jenis</label>

          <select id="fType">

            <option
              value="expense"
              ${type === "expense" ? "selected" : ""}>
              Pengeluaran
            </option>

            <option
              value="income"
              ${type === "income" ? "selected" : ""}>
              Pemasukan
            </option>

          </select>

        </div>

        <div>

          <label>Jumlah</label>

          <input
            id="fAmount"
            type="number"
            min="1"
            value="${t.amount || ""}"
            required>

        </div>

        <div class="full-col">

          <label>Nama</label>

          <input
            id="fName"
            value="${esc(t.name || "")}"
            placeholder="Contoh: Makan siang"
            required>

        </div>

        <div>

          <label>Kategori</label>

          <select id="fCategory">
            ${categoryOptions(type, selectedId)}
          </select>

        </div>

        <div>

          <label>Tanggal</label>

          <input
            id="fDate"
            type="date"
            value="${t.transaction_date || todayISO()}"
            required>

        </div>

        <div class="full-col">

          <label>Catatan</label>

          <input
            id="fNote"
            value="${esc(t.note || "")}"
            placeholder="Opsional">

        </div>

      </div>

      <div class="form-actions">

        <button
          type="submit"
          class="primary">
          Simpan
        </button>

        <button
          type="button"
          class="secondary"
          id="cancelForm">
          Batal
        </button>

      </div>

    </form>
  `;
}


function openTx(t) {

  openModal(
    t
      ? "Edit transaksi"
      : "Tambah transaksi",
    txForm(t)
  );

  $("fType").onchange = () => {

    $("fCategory").innerHTML =
      categoryOptions(
        $("fType").value
      );
  };

  $("cancelForm").onclick =
    closeModal;

  $("txForm").onsubmit =
    async e => {

      e.preventDefault();

      const type =
        $("fType").value;

      const cid =
        $("fCategory").value;

      const c =
        state.categories.find(
          x => x.id === cid
        );

      /*
        PENTING:
        transactions milik database kamu
        TIDAK punya category_id,
        jadi kita simpan category
        sebagai TEXT.
      */

      const payload = {

        name:
          $("fName").value.trim(),

        amount:
          Number($("fAmount").value),

        type,

        category:
          c?.name || null,

        transaction_date:
          $("fDate").value

      };

      try {

        let r;

        if (t) {

          r =
            await db
              .from("transactions")
              .update(payload)
              .eq("id", t.id)
              .eq("user_id", state.user.id);

        } else {

          r =
            await db
              .from("transactions")
              .insert({
                ...payload,
                user_id: state.user.id
              });
        }

        if (r.error) throw r.error;

        closeModal();

        await refreshTransactions();

        toast("Transaksi tersimpan.");

      } catch (err) {

        fail(err);
      }
    };
}


$("addTxBtn").onclick =
  () => openTx();

$("quickAdd").onclick =
  () => openTx();


async function refreshTransactions() {

  const r =
    await db
      .from("transactions")
      .select("*")
      .eq("user_id", state.user.id)
      .order(
        "transaction_date",
        { ascending: false }
      )
      .order(
        "created_at",
        { ascending: false }
      );

  if (r.error) throw r.error;

  state.transactions =
    r.data || [];

  renderAll();
}


window.editTransaction =
  id =>
    openTx(
      state.transactions.find(
        t => t.id === id
      )
    );


window.deleteTransaction =
  async id => {

    if (
      !confirm(
        "Hapus transaksi ini?"
      )
    ) return;

    const r =
      await db
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq(
          "user_id",
          state.user.id
        );

    if (r.error) {

      fail(r.error);

    } else {

      await refreshTransactions();

      toast("Transaksi dihapus.");
    }
  };


/* =========================
   BUDGET
========================= */

function budgetForm(b = {}) {

  const m = b.month
    ? String(b.month).slice(0, 7)
    : monthISO();

  return `
    <form id="budgetForm">

      <label>Kategori</label>

      <select id="bCat">
        ${categoryOptions("expense", b.category_id)}
      </select>

      <label>Anggaran</label>

      <input
        id="bAmount"
        type="number"
        min="1"
        value="${b.amount || ""}"
        required>

      <label>Bulan</label>

      <input
        id="bMonth"
        type="month"
        value="${m}"
        required>

      <div class="form-actions">

        <button
          class="primary"
          type="submit">
          Simpan
        </button>

        <button
          type="button"
          class="secondary"
          id="cancelBudget">
          Batal
        </button>

      </div>

    </form>
  `;
}


function openBudget(b) {

  openModal(
    b
      ? "Edit anggaran"
      : "Tambah anggaran",
    budgetForm(b)
  );

  $("cancelBudget").onclick =
    closeModal;

  $("budgetForm").onsubmit =
    async e => {

      e.preventDefault();

      const payload = {

        user_id:
          state.user.id,

        category_id:
          $("bCat").value,

        amount:
          Number($("bAmount").value),

        month:
          $("bMonth").value + "-01"
      };

      try {

        const r = b

          ? await db
              .from("budgets")
              .update(payload)
              .eq("id", b.id)
              .eq(
                "user_id",
                state.user.id
              )

          : await db
              .from("budgets")
              .insert(payload);

        if (r.error) throw r.error;

        closeModal();

        await refreshBudgets();

        toast("Anggaran tersimpan.");

      } catch (err) {

        fail(err);
      }
    };
}


$("addBudgetBtn").onclick =
  () => openBudget();


window.editBudget =
  id =>
    openBudget(
      state.budgets.find(
        x => x.id === id
      )
    );


window.deleteBudget =
  async id => {

    if (!confirm("Hapus anggaran?"))
      return;

    const r =
      await db
        .from("budgets")
        .delete()
        .eq("id", id)
        .eq(
          "user_id",
          state.user.id
        );

    if (r.error) {

      fail(r.error);

    } else {

      await refreshBudgets();

      toast("Anggaran dihapus.");
    }
  };


async function refreshBudgets() {

  const r =
    await db
      .from("budgets")
      .select("*, categories(name,icon)")
      .eq(
        "user_id",
        state.user.id
      )
      .order(
        "month",
        { ascending: false }
      );

  if (r.error) throw r.error;

  state.budgets =
    r.data || [];

  renderAll();
}


/* =========================
   TARGET TABUNGAN
========================= */

function goalForm(g = {}) {

  return `
    <form id="goalForm">

      <div class="form-grid">

        <div>

          <label>Ikon</label>

          <input
            id="gIcon"
            value="${esc(
              g.icon || "🎯"
            )}">

        </div>

        <div>

          <label>Nama target</label>

          <input
            id="gName"
            value="${esc(
              g.name || ""
            )}"
            required>

        </div>

        <div>

          <label>Target nominal</label>

          <input
            id="gTarget"
            type="number"
            min="1"
            value="${g.target_amount || ""}"
            required>

        </div>

        <div>

          <label>Sudah terkumpul</label>

          <input
            id="gCurrent"
            type="number"
            min="0"
            value="${g.current_amount || 0}">

        </div>

        <div class="full-col">

          <label>Deadline</label>

          <input
            id="gDeadline"
            type="date"
            value="${g.deadline || ""}">

        </div>

      </div>

      <div class="form-actions">

        <button
          class="primary"
          type="submit">
          Simpan
        </button>

        <button
          type="button"
          class="secondary"
          id="cancelGoal">
          Batal
        </button>

      </div>

    </form>
  `;
}


function openGoal(g) {

  openModal(
    g
      ? "Edit target"
      : "Tambah target",
    goalForm(g)
  );

  $("cancelGoal").onclick =
    closeModal;

  $("goalForm").onsubmit =
    async e => {

      e.preventDefault();

      const payload = {

        user_id:
          state.user.id,

        name:
          $("gName").value.trim(),

        icon:
          $("gIcon").value || "🎯",

        target_amount:
          Number(
            $("gTarget").value
          ),

        current_amount:
          Number(
            $("gCurrent").value || 0
          ),

        deadline:
          $("gDeadline").value || null,

        updated_at:
          new Date().toISOString()
      };

      try {

        const r = g

          ? await db
              .from("savings_goals")
              .update(payload)
              .eq("id", g.id)
              .eq(
                "user_id",
                state.user.id
              )

          : await db
              .from("savings_goals")
              .insert(payload);

        if (r.error) throw r.error;

        closeModal();

        await refreshGoals();

        toast("Target tersimpan.");

      } catch (err) {

        fail(err);
      }
    };
}


$("addGoalBtn").onclick =
  () => openGoal();


window.editGoal =
  id =>
    openGoal(
      state.goals.find(
        x => x.id === id
      )
    );


window.deleteGoal =
  async id => {

    if (!confirm("Hapus target?"))
      return;

    const r =
      await db
        .from("savings_goals")
        .delete()
        .eq("id", id)
        .eq(
          "user_id",
          state.user.id
        );

    if (r.error) {

      fail(r.error);

    } else {

      await refreshGoals();

      toast("Target dihapus.");
    }
  };


async function refreshGoals() {

  const r =
    await db
      .from("savings_goals")
      .select("*")
      .eq(
        "user_id",
        state.user.id
      )
      .order(
        "created_at",
        { ascending: false }
      );

  if (r.error) throw r.error;

  state.goals =
    r.data || [];

  renderAll();
}


/* =========================
   FINANCIAL HEALTH
========================= */

function renderHealth() {

  const tx = monthTx();

  const income =
    tx
      .filter(
        t => t.type === "income"
      )
      .reduce(
        (a, t) =>
          a + Number(t.amount),
        0
      );

  const expense =
    tx
      .filter(
        t => t.type === "expense"
      )
      .reduce(
        (a, t) =>
          a + Number(t.amount),
        0
      );

  const saving =
    income > 0
      ? Math.max(
          0,
          (income - expense) / income
        )
      : 0;

  const budgets =
    state.budgets.filter(
      b =>
        String(b.month)
          .startsWith(monthISO())
    );

  let budgetScore = 1;

  if (budgets.length) {

    const totalRatio =
      budgets.reduce(
        (sum, b) => {

          const amount =
            Number(b.amount) || 1;

          const spent =
            spentForBudget(b);

          return (
            sum +
            Math.min(
              1,
              spent / amount
            )
          );

        },
        0
      );

    budgetScore =
      1 -
      totalRatio / budgets.length;
  }

  let goalScore = 0;

  if (state.goals.length) {

    goalScore =
      state.goals.reduce(
        (sum, g) => {

          const target =
            Number(
              g.target_amount
            ) || 1;

          const current =
            Number(
              g.current_amount
            ) || 0;

          return (
            sum +
            Math.min(
              1,
              current / target
            )
          );

        },
        0
      ) / state.goals.length;
  }

  let score =
    saving * 45 +
    budgetScore * 30 +
    goalScore * 15 +
    (state.transactions.length
      ? 10
      : 0);

  score =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(score)
      )
    );

  const badge =
    $("healthBadge");

  if (badge) {
    badge.textContent =
      `Health ${score}/100`;
  }

  if ($("healthMeter")) {

    $("healthMeter").style.width =
      score + "%";
  }

  if ($("healthText")) {

    $("healthText").textContent =
      score + "/100";
  }

  if ($("healthExplanation")) {

    $("healthExplanation").textContent =
      score >= 75
        ? "Keuanganmu terlihat cukup terkontrol."
        : score >= 50
        ? "Ada beberapa area yang bisa diperbaiki bulan ini."
        : "Coba fokus pada cash flow, anggaran, dan target tabungan.";
  }
}


/* =========================
   REPORT / STATISTICS
========================= */

function renderReports() {

  const input =
    $("reportMonth");

  const m =
    input?.value ||
    state.reportMonth ||
    monthISO();

  state.reportMonth = m;

  const tx =
    monthTx(m);

  const income =
    tx
      .filter(
        t => t.type === "income"
      )
      .reduce(
        (a, t) =>
          a + Number(t.amount),
        0
      );

  const expense =
    tx
      .filter(
        t => t.type === "expense"
      )
      .reduce(
        (a, t) =>
          a + Number(t.amount),
        0
      );

  if ($("reportSummary")) {

    $("reportSummary").innerHTML = [

      [
        "Pemasukan",
        money(income)
      ],

      [
        "Pengeluaran",
        money(expense)
      ],

      [
        "Net Cash Flow",
        money(
          income - expense
        )
      ],

      [
        "Saving Rate",
        income
          ? Math.round(
              ((income - expense) /
                income) *
                100
            ) + "%"
          : "0%"
      ]

    ]
      .map(
        x =>
          `
          <div class="stat glass">

            <span>
              ${x[0]}
            </span>

            <strong>
              ${x[1]}
            </strong>

          </div>
          `
      )
      .join("");
  }


  /* =========================
     DONUT KATEGORI
     ========================= */

  const cats = {};

  tx
    .filter(
      t => t.type === "expense"
    )
    .forEach(t => {

      const name =
        t.category ||
        "Lainnya";

      cats[name] =
        (cats[name] || 0) +
        Number(t.amount);
    });


  if ($("categoryChart")) {

    destroyChart("cat");

    state.charts.cat =
      new Chart(
        $("categoryChart"),
        {
          type: "doughnut",

          data: {

            labels:
              Object.keys(cats),

            datasets: [
              {
                data:
                  Object.values(cats)
              }
            ]
          },

          options: {

            responsive: true,

            maintainAspectRatio: true,

            aspectRatio: 1.6,

            animation: false,

            plugins: {

              legend: {

                labels: {

                  color:
                    getComputedStyle(
                      document.body
                    )
                    .getPropertyValue(
                      "--text"
                    )
                }
              }
            }
          }
        }
      );
  }


  /* =========================
     TREND 6 BULAN
     ========================= */

  const labels = [];
  const data = [];

  for (
    let i = 5;
    i >= 0;
    i--
  ) {

    const d =
      new Date(
        m + "-01"
      );

    d.setMonth(
      d.getMonth() - i
    );

    const mm =
      d.toISOString()
        .slice(0, 7);

    labels.push(
      d.toLocaleDateString(
        "id-ID",
        {
          month: "short"
        }
      )
    );

    const monthData =
      monthTx(mm);

    data.push(
      monthData
        .filter(
          t =>
            t.type === "expense"
        )
        .reduce(
          (a, t) =>
            a + Number(t.amount),
          0
        )
    );
  }


  if ($("trendChart")) {

    destroyChart("trend");

    state.charts.trend =
      new Chart(
        $("trendChart"),
        {
          type: "bar",

          data: {

            labels,

            datasets: [
              {
                label:
                  "Pengeluaran",

                data
              }
            ]
          },

          options: {

            responsive: true,

            maintainAspectRatio: true,

            aspectRatio: 1.6,

            animation: false,

            plugins: {

              legend: {
                display: false
              }
            },

            scales: {

              y: {

                ticks: {

                  callback:
                    v =>
                      money(v),

                  color:
                    "#8e94a7"
                },

                grid: {
                  color:
                    "#242837"
                }
              },

              x: {

                ticks: {
                  color:
                    "#8e94a7"
                }
              }
            }
          }
        }
      );
  }


  /* =========================
     INSIGHT
     ========================= */

  const insights = [];

  insights.push(
    `📊 Bulan ini pengeluaran ${money(expense)}.`
  );


  const prev =
    new Date(
      m + "-01"
    );

  prev.setMonth(
    prev.getMonth() - 1
  );

  const previousMonth =
    prev
      .toISOString()
      .slice(0, 7);

  const previousExpense =
    monthTx(previousMonth)
      .filter(
        t =>
          t.type === "expense"
      )
      .reduce(
        (a, t) =>
          a + Number(t.amount),
        0
      );


  if (previousExpense > 0) {

    const difference =
      expense -
      previousExpense;

    const percent =
      Math.round(
        Math.abs(difference) /
        previousExpense *
        100
      );

    if (difference > 0) {

      insights.push(
        `⚠️ Pengeluaran naik ${percent}% dibanding bulan lalu.`
      );

    } else if (difference < 0) {

      insights.push(
        `✅ Pengeluaran turun ${percent}% dibanding bulan lalu.`
      );

    } else {

      insights.push(
        `ℹ️ Pengeluaran sama seperti bulan lalu.`
      );
    }
  }


  const largest =
    Object.entries(cats)
      .sort(
        (a, b) =>
          b[1] - a[1]
      )[0];

  if (largest) {

    insights.push(
      `💡 Kategori terbesar: ${largest[0]} (${money(largest[1])}).`
    );
  }


  if ($("insightList")) {

    $("insightList").innerHTML =
      insights
        .map(
          x =>
            `<div class="insight">
              ${x}
            </div>`
        )
        .join("");
  }
}


if ($("reportMonth")) {

  $("reportMonth").value =
    monthISO();

  $("reportMonth").onchange =
    renderReports;
}


if ($("reportRefresh")) {

  $("reportRefresh").onclick =
    renderReports;
}


/* =========================================================
   PART 3/3 — RECURRING TRANSACTION 🔁
   ========================================================= */

/* ---------- Helper tanggal ---------- */

function localISODate(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function addRecurringPeriod(date, frequency) {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);

  if (frequency === "daily") {
    d.setDate(d.getDate() + 1);
  }

  else if (frequency === "weekly") {
    d.setDate(d.getDate() + 7);
  }

  else if (frequency === "monthly") {
    const originalDay = d.getDate();

    const nextMonth = new Date(
      d.getFullYear(),
      d.getMonth() + 1,
      1
    );

    const lastDay = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth() + 1,
      0
    ).getDate();

    d.setFullYear(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      Math.min(originalDay, lastDay)
    );
  }

  else if (frequency === "yearly") {
    const originalMonth = d.getMonth();
    const originalDay = d.getDate();

    d.setFullYear(d.getFullYear() + 1);

    // Handle 29 Februari
    if (
      originalMonth === 1 &&
      originalDay === 29 &&
      d.getMonth() !== 1
    ) {
      d.setMonth(1, 28);
    }
  }

  return localISODate(d);
}

function recurringFrequencyLabel(freq) {
  const labels = {
    daily: "Harian",
    weekly: "Mingguan",
    monthly: "Bulanan",
    yearly: "Tahunan"
  };

  return labels[freq] || freq;
}


/* =========================================================
   LOAD RECURRING
   ========================================================= */

async function refreshRecurring() {
  if (!state.user) return;

  const { data, error } = await db
    .from("recurring_transactions")
    .select("*, categories(name,icon)")
    .eq("user_id", state.user.id)
    .order("next_date", { ascending: true });

  if (error) {
    console.error("Gagal load recurring:", error);
    toast("Gagal memuat recurring transaction");
    return;
  }

  state.recurring = data || [];
}


/* =========================================================
   PROCESS RECURRING OTOMATIS
   ========================================================= */

async function processRecurring() {
  if (!state.user || !state.recurring?.length) return;

  const today = todayISO();
  let insertedSomething = false;

  for (const r of state.recurring) {

    if (!r.active || !r.next_date) continue;

    if (
      !["daily", "weekly", "monthly", "yearly"]
        .includes(r.frequency)
    ) {
      continue;
    }

    let next = String(r.next_date).slice(0, 10);
    let guard = 0;

    /*
      Guard supaya kalau ada data aneh,
      loop tidak berjalan selamanya.
    */
    while (next <= today && guard < 120) {

      /* -----------------------------------------
         CEK DUPLIKAT TRANSAKSI
         ----------------------------------------- */

      let duplicateQuery = db
        .from("transactions")
        .select("id")
        .eq("user_id", state.user.id)
        .eq("name", r.name)
        .eq("amount", Number(r.amount))
        .eq("type", r.type)
        .eq("transaction_date", next)
        .limit(1);

      if (r.category) {
        duplicateQuery = duplicateQuery.eq(
          "category",
          r.category
        );
      } else {
        duplicateQuery = duplicateQuery.is(
          "category",
          null
        );
      }

      const {
        data: duplicate,
        error: duplicateError
      } = await duplicateQuery;

      if (duplicateError) {
        console.error(
          "Gagal cek duplicate recurring:",
          duplicateError
        );
        break;
      }

      /* -----------------------------------------
         BUAT TRANSAKSI NORMAL
         ----------------------------------------- */

      if (!duplicate?.length) {

        const transactionPayload = {
          user_id: state.user.id,
          name: r.name,
          amount: Number(r.amount),
          type: r.type,
          category: r.category || null,
          transaction_date: next
        };

        const {
          data: inserted,
          error: insertError
        } = await db
          .from("transactions")
          .insert(transactionPayload)
          .select()
          .single();

        if (insertError) {
          console.error(
            "Gagal membuat transaksi recurring:",
            insertError
          );
          break;
        }

        if (inserted) {
          state.transactions.unshift(inserted);
        }

        insertedSomething = true;
      }

      /* -----------------------------------------
         MAJUKAN NEXT DATE
         ----------------------------------------- */

      const newNext = addRecurringPeriod(
        next,
        r.frequency
      );

      const {
        error: updateError
      } = await db
        .from("recurring_transactions")
        .update({
          next_date: newNext
        })
        .eq("id", r.id)
        .eq("user_id", state.user.id);

      if (updateError) {
        console.error(
          "Gagal update next_date:",
          updateError
        );
        break;
      }

      // Update state lokal juga
      r.next_date = newNext;

      next = newNext;
      guard++;
    }
  }

  if (insertedSomething) {
    toast("Recurring transaction otomatis diproses 🔁");
  }
}


/* =========================================================
   RENDER RECURRING LIST
   ========================================================= */

function renderRecurringList() {

  const container = $("recurringList");

  if (!container) return;

  if (!state.recurring?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:32px;">🔁</div>
        <p>Belum ada recurring transaction.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.recurring.map(r => {

    const categoryName =
      r.categories?.name ||
      r.category ||
      "Tanpa kategori";

    const icon =
      r.categories?.icon ||
      "🔁";

    const status =
      r.active
        ? `<span class="badge success">Aktif</span>`
        : `<span class="badge">Nonaktif</span>`;

    const amount =
      Number(r.amount || 0).toLocaleString(
        "id-ID"
      );

    return `
      <div class="transaction-item"
           style="margin-bottom:10px;">

        <div style="
          display:flex;
          align-items:center;
          gap:12px;
        ">

          <div style="
            width:42px;
            height:42px;
            border-radius:12px;
            display:flex;
            align-items:center;
            justify-content:center;
            background:var(--card);
            font-size:20px;
          ">
            ${icon}
          </div>

          <div style="flex:1;">

            <div style="
              font-weight:600;
              margin-bottom:4px;
            ">
              ${escapeHTML(r.name)}
            </div>

            <div style="
              font-size:12px;
              opacity:.7;
            ">
              ${categoryName}
              •
              ${recurringFrequencyLabel(r.frequency)}
            </div>

            <div style="
              font-size:12px;
              opacity:.7;
              margin-top:3px;
            ">
              Berikutnya:
              ${formatDate(r.next_date)}
            </div>

          </div>

          <div style="
            text-align:right;
          ">

            <div style="
              font-weight:700;
              margin-bottom:5px;
            ">
              Rp ${amount}
            </div>

            ${status}

          </div>

        </div>

        ${
          r.note
            ? `
              <div style="
                font-size:12px;
                opacity:.7;
                margin-top:8px;
                padding-left:54px;
              ">
                📝 ${escapeHTML(r.note)}
              </div>
            `
            : ""
        }

        <div style="
          display:flex;
          gap:8px;
          margin-top:10px;
          padding-left:54px;
        ">

          <button
            class="btn btn-sm"
            onclick="editRecurring('${r.id}')">
            ✏️ Edit
          </button>

          <button
            class="btn btn-sm"
            onclick="toggleRecurring('${r.id}')">
            ${r.active ? "⏸️ Nonaktifkan" : "▶️ Aktifkan"}
          </button>

          <button
            class="btn btn-sm danger"
            onclick="deleteRecurring('${r.id}')">
            🗑️
          </button>

        </div>

      </div>
    `;

  }).join("");
}


/* =========================================================
   OPEN RECURRING MODAL
   ========================================================= */

function openRecurringModal(editing = null) {

  const title = editing
    ? "Edit Recurring Transaction"
    : "Recurring Transaction 🔁";

  openModal(title);

  const modalBody =
    $("modalBody") ||
    $("modalContent") ||
    $("modal-body");

  if (!modalBody) {
    console.error("Modal body tidak ditemukan");
    return;
  }

  const selectedType =
    editing?.type || "expense";

  modalBody.innerHTML = `

    <form id="recurringForm">

      <div class="form-group">

        <label>Nama</label>

        <input
          id="rName"
          type="text"
          placeholder="Contoh: Gaji bulanan"
          value="${escapeHTML(editing?.name || "")}"
          required
        >

      </div>


      <div class="form-group">

        <label>Jumlah</label>

        <input
          id="rAmount"
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value="${editing?.amount ?? ""}"
          required
        >

      </div>


      <div class="form-group">

        <label>Jenis</label>

        <select id="rType">

          <option
            value="expense"
            ${selectedType === "expense" ? "selected" : ""}>
            Pengeluaran
          </option>

          <option
            value="income"
            ${selectedType === "income" ? "selected" : ""}>
            Pemasukan
          </option>

        </select>

      </div>


      <div class="form-group">

        <label>Kategori</label>

        <select id="rCategory">

          ${categoryOptions(
            selectedType,
            editing?.category_id || ""
          )}

        </select>

      </div>


      <div class="form-group">

        <label>Frekuensi</label>

        <select id="rFrequency">

          <option
            value="daily"
            ${editing?.frequency === "daily" ? "selected" : ""}>
            Harian
          </option>

          <option
            value="weekly"
            ${editing?.frequency === "weekly" ? "selected" : ""}>
            Mingguan
          </option>

          <option
            value="monthly"
            ${editing?.frequency === "monthly" || !editing ? "selected" : ""}>
            Bulanan
          </option>

          <option
            value="yearly"
            ${editing?.frequency === "yearly" ? "selected" : ""}>
            Tahunan
          </option>

        </select>

      </div>


      <div class="form-group">

        <label>Tanggal berikutnya</label>

        <input
          id="rDate"
          type="date"
          value="${editing?.next_date || todayISO()}"
          required
        >

      </div>


      <div class="form-group">

        <label>Catatan</label>

        <textarea
          id="rNote"
          rows="3"
          placeholder="Opsional"
        >${escapeHTML(editing?.note || "")}</textarea>

      </div>


      <div class="form-group">

        <label style="
          display:flex;
          align-items:center;
          gap:8px;
        ">

          <input
            id="rActive"
            type="checkbox"
            ${editing?.active !== false ? "checked" : ""}
          >

          Aktif

        </label>

      </div>


      <div style="
        display:flex;
        gap:10px;
        margin-top:16px;
      ">

        <button
          type="submit"
          class="btn btn-primary"
          style="flex:1;">

          ${editing ? "💾 Simpan Perubahan" : "➕ Tambah"}

        </button>

        <button
          type="button"
          class="btn"
          onclick="closeModal()">

          Batal

        </button>

      </div>

    </form>


    ${
      editing
        ? ""
        : `
          <hr style="
            margin:22px 0;
            opacity:.15;
          ">

          <h3 style="margin-bottom:12px;">
            Daftar Recurring
          </h3>

          <div id="recurringList"></div>
        `
    }

  `;


  /* -----------------------------------------
     TYPE → CATEGORY
     ----------------------------------------- */

  $("rType").addEventListener("change", () => {

    const currentCategory =
      $("rCategory").value;

    $("rCategory").innerHTML =
      categoryOptions(
        $("rType").value,
        currentCategory
      );

  });


  /* -----------------------------------------
     SUBMIT
     ----------------------------------------- */

  $("recurringForm").addEventListener(
    "submit",
    async e => {

      e.preventDefault();

      if (!state.user) {
        toast("Silakan login terlebih dahulu");
        return;
      }

      const categoryId =
        $("rCategory").value || null;

      const category =
        state.categories.find(
          c => String(c.id) === String(categoryId)
        );

      /*
        PENTING:
        recurring_transactions membutuhkan
        category_id DAN category
      */

      const payload = {

        user_id: state.user.id,

        name:
          $("rName").value.trim(),

        amount:
          Number($("rAmount").value),

        type:
          $("rType").value,

        category_id:
          category?.id || null,

        category:
          category?.name || null,

        frequency:
          $("rFrequency").value,

        next_date:
          $("rDate").value,

        note:
          $("rNote").value.trim() || null,

        active:
          $("rActive").checked

      };


      if (!payload.name) {
        toast("Nama recurring wajib diisi");
        return;
      }

      if (!payload.amount || payload.amount < 0) {
        toast("Jumlah transaksi tidak valid");
        return;
      }

      if (!payload.next_date) {
        toast("Tanggal wajib diisi");
        return;
      }


      let result;

      if (editing) {

        result = await db
          .from("recurring_transactions")
          .update(payload)
          .eq("id", editing.id)
          .eq("user_id", state.user.id);

      } else {

        result = await db
          .from("recurring_transactions")
          .insert(payload);

      }


      if (result.error) {

        console.error(
          "Recurring save error:",
          result.error
        );

        toast(
          "Gagal menyimpan recurring: " +
          result.error.message
        );

        return;
      }


      toast(
        editing
          ? "Recurring berhasil diperbarui ✅"
          : "Recurring berhasil ditambahkan ✅"
      );


      await refreshRecurring();

      closeModal();

      renderAll();

    }
  );


  /* -----------------------------------------
     LIST
     ----------------------------------------- */

  if (!editing) {
    renderRecurringList();
  }

}


/* =========================================================
   EDIT RECURRING
   ========================================================= */

window.editRecurring = async function(id) {

  const recurring =
    state.recurring.find(
      r => String(r.id) === String(id)
    );

  if (!recurring) {
    toast("Recurring tidak ditemukan");
    return;
  }

  openRecurringModal(recurring);
};


/* =========================================================
   DELETE RECURRING
   ========================================================= */

window.deleteRecurring = async function(id) {

  const recurring =
    state.recurring.find(
      r => String(r.id) === String(id)
    );

  if (!recurring) return;

  const ok = confirm(
    `Hapus recurring "${recurring.name}"?`
  );

  if (!ok) return;


  const { error } = await db
    .from("recurring_transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", state.user.id);


  if (error) {

    console.error(error);

    toast(
      "Gagal menghapus recurring"
    );

    return;
  }


  state.recurring =
    state.recurring.filter(
      r => String(r.id) !== String(id)
    );

  toast("Recurring dihapus 🗑️");

  openRecurringModal();

  renderAll();

};


/* =========================================================
   TOGGLE ACTIVE / NONACTIVE
   ========================================================= */

window.toggleRecurring = async function(id) {

  const recurring =
    state.recurring.find(
      r => String(r.id) === String(id)
    );

  if (!recurring) return;


  const newStatus =
    !recurring.active;


  const { error } = await db
    .from("recurring_transactions")
    .update({
      active: newStatus
    })
    .eq("id", id)
    .eq("user_id", state.user.id);


  if (error) {

    console.error(error);

    toast(
      "Gagal mengubah status recurring"
    );

    return;
  }


  recurring.active = newStatus;

  toast(
    newStatus
      ? "Recurring diaktifkan ▶️"
      : "Recurring dinonaktifkan ⏸️"
  );

  openRecurringModal();

  renderAll();

};


/* =========================================================
   TOMBOL "LAINNYA"
   ========================================================= */

if ($("recurringBtn")) {

  $("recurringBtn").onclick = () => {
    openRecurringModal();
  };

}


if ($("notificationBtn")) {

  $("notificationBtn").onclick = () => {

    const today = todayISO();

    const due =
      (state.recurring || [])
        .filter(r =>
          r.active &&
          r.next_date &&
          String(r.next_date).slice(0, 10) <= today
        );

    if (due.length) {

      toast(
        `${due.length} recurring transaction menunggu diproses.`
      );

    } else {

      toast(
        "Tidak ada recurring transaction yang jatuh tempo. ✅"
      );

    }

  };

}


/* =========================================================
   JALANKAN RECURRING SAAT APP LOAD
   ========================================================= */

/*
  loadAll() dari Part 1 sudah ada.
  Kita bungkus supaya setelah data selesai dimuat,
  recurring otomatis diproses.
*/

const __finovaOriginalLoadAll = loadAll;

loadAll = async function () {

  await __finovaOriginalLoadAll();

  await processRecurring();

  renderAll();

};


/* =========================================================
   SELESAI PART 3
   ========================================================= */
