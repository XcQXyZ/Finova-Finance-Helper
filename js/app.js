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
      .forEach(tab => tab.classList.toggle("active", tab === button));

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

      if (error) {
        console.error("LOGIN ERROR:", error);
        throw error;
      }

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

      if (error) {
        console.error("REGISTER ERROR:", error);
        throw error;
      }

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


/* =========================
   CHECK SESSION SAAT APP DIBUKA
========================= */

async function initAuth() {

  try {

    const {
      data: { session },
      error
    } = await db.auth.getSession();

    if (error) {
      throw error;
    }

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


/* =========================
   PERUBAHAN LOGIN / LOGOUT
========================= */

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


/* Jalankan pemeriksaan session */
initAuth();


/* =========================
   LOGOUT
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

$("logoutBtn").onclick=async()=>{await db.auth.signOut();location.reload()};

$("themeBtn").onclick=async()=>{
  document.body.classList.toggle("light");
  await saveSettings({
    theme:document.body.classList.contains("light")?"light":"dark"
  })
};

document.querySelectorAll("[data-page]").forEach(
  b=>b.onclick=()=>showPage(b.dataset.page)
);

function showPage(p){
  document
    .querySelectorAll(".page")
    .forEach(x=>x.classList.toggle("active",x.id==="page-"+p));

  document
    .querySelectorAll(".nav")
    .forEach(x=>x.classList.toggle("active",x.dataset.page===p));

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });

  if(p==="reports")renderReports();
}


/* =========================
   MENU LAINNYA
========================= */

function renderCategoryManager(){

  const list=state.categories.map(c=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08)">
      <span>
        ${esc(c.icon)}
        ${esc(c.name)}
        <small class="muted">
          ${c.type==="income"?"Pemasukan":"Pengeluaran"}
        </small>
      </span>

      <button
        class="link-btn small danger-text"
        onclick="deleteCategory('${c.id}')">
        Hapus
      </button>
    </div>
  `).join("");

  openModal(
    "Kelola kategori",
    `<div class="stack">

      <div>
        ${
          list ||
          `<div class="muted">Belum ada kategori.</div>`
        }
      </div>

      <form
        id="categoryForm"
        class="form-grid"
        style="margin-top:14px">

        <div>
          <label>Ikon</label>
          <input
            id="catIcon"
            value="📌"
            maxlength="4">
        </div>

        <div>
          <label>Nama</label>
          <input
            id="catName"
            placeholder="Contoh: Kopi"
            required>
        </div>

        <div>
          <label>Jenis</label>
          <select id="catType">
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </select>
        </div>

        <div class="form-actions full-col">
          <button class="primary">
            Tambah kategori
          </button>
        </div>

      </form>

    </div>`
  );

  $("categoryForm").onsubmit=async e=>{
    e.preventDefault();

    const p={
      user_id:state.user.id,
      icon:$("catIcon").value||"📌",
      name:$("catName").value.trim(),
      type:$("catType").value
    };

    if(!p.name)return;

    const r=await db
      .from("categories")
      .insert(p);

    if(r.error){
      fail(r.error);
      return;
    }

    const q=await db
      .from("categories")
      .select("*")
      .eq("user_id",state.user.id)
      .order("name");

    if(q.error){
      fail(q.error);
      return;
    }

    state.categories=q.data||[];

    renderAll();
    renderCategoryManager();

    toast("Kategori ditambahkan.");
  };
}

window.deleteCategory=async id=>{

  if(!confirm("Hapus kategori ini?"))return;

  const r=await db
    .from("categories")
    .delete()
    .eq("id",id)
    .eq("user_id",state.user.id);

  if(r.error){
    fail(r.error);
    return;
  }

  state.categories=
    state.categories.filter(c=>c.id!==id);

  renderAll();
  renderCategoryManager();

  toast("Kategori dihapus.");
};

$("categoriesBtn").onclick=renderCategoryManager;

$("recurringBtn").onclick=()=>openModal(
  "Transaksi berulang",
  `<div class="muted">
    Menu ini sudah aktif, tetapi fitur transaksi berulang belum kita implementasikan.
    Kita biarkan aman dulu supaya fitur transaksi utama tetap stabil.
  </div>`
);

$("notificationBtn").onclick=()=>{

  openModal(
    "Notifikasi pengingat",
    `<div class="stack">

      <p class="muted">
        Atur apakah Finova boleh menggunakan pengaturan pengingat.
      </p>

      <label style="display:flex;gap:10px;align-items:center">
        <input
          id="notifToggle"
          type="checkbox"
          ${state.settings?.notifications!==false?"checked":""}>
        Aktifkan pengingat
      </label>

      <div class="form-actions">
        <button
          class="primary"
          id="saveNotif">
          Simpan
        </button>
      </div>

    </div>`
  );

  $("saveNotif").onclick=async()=>{

    const enabled=$("notifToggle").checked;

    const r=await db
      .from("app_settings")
      .upsert({
        user_id:state.user.id,
        notifications:enabled,
        updated_at:new Date().toISOString()
      });

    if(r.error){
      fail(r.error);
      return;
    }

    state.settings={
      ...(state.settings||{}),
      notifications:enabled
    };

    closeModal();

    toast("Pengaturan notifikasi disimpan.");
  };
};


async function loadAll(){

  const uid=state.user.id;

  const results=await Promise.all([

    db
      .from("transactions")
      .select("*")
      .eq("user_id",uid)
      .order("transaction_date",{ascending:false})
      .order("created_at",{ascending:false}),

    db
      .from("categories")
      .select("*")
      .eq("user_id",uid)
      .order("name"),

    db
      .from("budgets")
      .select("*, categories(name,icon)")
      .eq("user_id",uid)
      .order("month",{ascending:false}),

    db
      .from("savings_goals")
      .select("*")
      .eq("user_id",uid)
      .order("created_at",{ascending:false}),

    db
      .from("recurring_transactions")
      .select("*, categories(name,icon)")
      .eq("user_id",uid)
      .order("next_date"),

    db
      .from("app_settings")
      .select("*")
      .eq("user_id",uid)
      .maybeSingle()

  ]);

  const names=[
    "transactions",
    "categories",
    "budgets",
    "goals",
    "recurring",
    "settings"
  ];

  results.forEach((r,i)=>{
    if(r.error) throw r.error;
    state[names[i]]=r.data||null;
  });

  if(!state.settings){

    await saveSettings({
      currency:"IDR",
      theme:"dark",
      notifications:true
    });

    state.settings={
      theme:"dark"
    };
  }

  if(!state.categories.length)
    await seedCategories();

  applyTheme();
  renderAll();
}


async function seedCategories(){

  const base=[
    ["🍔","Makanan","expense"],
    ["🚌","Transportasi","expense"],
    ["🎮","Hiburan","expense"],
    ["📚","Pendidikan","expense"],
    ["🛍️","Belanja","expense"],
    ["💡","Tagihan","expense"],
    ["🏠","Rumah","expense"],
    ["📦","Lainnya","expense"],
    ["💼","Gaji","income"],
    ["💻","Freelance","income"],
    ["🎁","Bonus","income"],
    ["💰","Lainnya","income"]
  ];

  const {error}=await db
    .from("categories")
    .insert(
      base.map(
        ([icon,name,type])=>({
          user_id:state.user.id,
          icon,
          name,
          type
        })
      )
    );

  if(error) throw error;

  const {data}=await db
    .from("categories")
    .select("*")
    .eq("user_id",state.user.id)
    .order("name");

  state.categories=data||[];
}


async function saveSettings(patch){

  await db
    .from("app_settings")
    .upsert({
      user_id:state.user.id,
      ...patch,
      updated_at:new Date().toISOString()
    });
}


function applyTheme(){
  document.body.classList.toggle(
    "light",
    state.settings?.theme==="light"
  );
}


function renderAll(){
  renderDashboard();
  renderFilters();
  renderTransactions();
  renderBudgets();
  renderGoals();
  renderHealth();
}


function monthTx(m=monthISO()){
  return state.transactions.filter(
    t=>String(t.transaction_date).startsWith(m)
  );
}


function renderDashboard(){

  const tx=monthTx();

  const income=tx
    .filter(t=>t.type==="income")
    .reduce((a,t)=>a+Number(t.amount),0);

  const expense=tx
    .filter(t=>t.type==="expense")
    .reduce((a,t)=>a+Number(t.amount),0);

  const allIncome=state.transactions
    .filter(t=>t.type==="income")
    .reduce((a,t)=>a+Number(t.amount),0);

  const allExpense=state.transactions
    .filter(t=>t.type==="expense")
    .reduce((a,t)=>a+Number(t.amount),0);

  $("balance").textContent=
    money(allIncome-allExpense);

  $("incomeTotal").textContent=
    money(income);

  $("expenseTotal").textContent=
    money(expense);

  $("savingRate").textContent=
    income
      ? Math.round((income-expense)/income*100)+"%"
      : "0%";

  $("txCount").textContent=
    tx.length;

  $("greeting").textContent=
    "Halo, "+
    (state.user.email?.split("@")[0]||"Finova")+
    " 👋";

  renderCashflowChart();
  renderBudgetPreview();
  renderGoalPreview();
  renderHealth();
}


function destroyChart(k){
  if(state.charts[k])
    state.charts[k].destroy();
}


function renderCashflowChart(){

  destroyChart("cash");

  const labels=[];
  const inc=[];
  const exp=[];

  for(let i=5;i>=0;i--){

    const d=new Date();

    d.setMonth(
      d.getMonth()-i
    );

    const m=d
      .toISOString()
      .slice(0,7);

    labels.push(
      d.toLocaleDateString(
        "id-ID",
        {month:"short"}
      )
    );

    const tx=monthTx(m);

    inc.push(
      tx
        .filter(t=>t.type==="income")
        .reduce(
          (a,t)=>a+Number(t.amount),
          0
        )
    );

    exp.push(
      tx
        .filter(t=>t.type==="expense")
        .reduce(
          (a,t)=>a+Number(t.amount),
          0
        )
    );
  }

  state.charts.cash=new Chart(
    $("cashflowChart"),
    {
      type:"line",

      data:{
        labels,

        datasets:[
          {
            label:"Masuk",
            data:inc,
            tension:.35,
            borderWidth:2
          },
          {
            label:"Keluar",
            data:exp,
            tension:.35,
            borderWidth:2
          }
        ]
      },

      options:{
        animation:false,
        responsive:true,
        maintainAspectRatio:false,

        plugins:{
          legend:{
            labels:{
              color:getComputedStyle(document.body)
                .getPropertyValue("--text")
            }
          }
        },

        scales:{
          y:{
            ticks:{
              callback:v=>money(v),
              color:"#8e94a7"
            },
            grid:{
              color:"#242837"
            }
          },

          x:{
            ticks:{
              color:"#8e94a7"
            },
            grid:{
              display:false
            }
          }
        }
      }
    }
  );
}


function renderBudgetPreview(){

  const m=monthISO();

  const bud=state.budgets.filter(
    b=>String(b.month).startsWith(m)
  );

  $("budgetPreview").innerHTML=
    bud.length
      ? bud.slice(0,4)
          .map(b=>budgetHTML(b))
          .join("")
      : `<div class="muted">
          Belum ada anggaran bulan ini.
        </div>`;
}


function spentForBudget(b){

  return monthTx(
    String(b.month).slice(0,7)
  )
  .filter(
    t=>
      t.type==="expense" &&
      (
        b.category_id
          ? t.category_id===b.category_id
          : t.category===b.categories?.name
      )
  )
  .reduce(
    (a,t)=>a+Number(t.amount),
    0
  );
}


function budgetHTML(b){

  const spent=spentForBudget(b);

  const pct=Math.min(
    100,
    Math.round(
      spent/Number(b.amount)*100
    )
  );

  return `
    <div class="budget-item">

      <div class="budget-top">

        <b>
          ${esc(b.categories?.icon||"📦")}
          ${esc(b.categories?.name||"Kategori")}
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

      <small class="${pct>=90?"expense":""}">
        ${pct}% terpakai
      </small>

    </div>
  `;
}


function renderBudgetList(){

  $("budgetList").innerHTML=
    state.budgets
      .filter(
        b=>String(b.month).startsWith(monthISO())
      )
      .map(
        b=>
          budgetHTML(b)+
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
      .join("")
      ||
      `<div class="muted">
        Belum ada anggaran.
      </div>`;
}


function renderBudgets(){
  renderBudgetList();
}


function renderGoalPreview(){

  $("goalPreview").innerHTML=
    state.goals
      .slice(0,3)
      .map(goalHTML)
      .join("")
      ||
      `<div class="muted">
        Belum ada target tabungan.
      </div>`;
}


function goalHTML(g){

  const pct=Math.min(
    100,
    Math.round(
      Number(g.current_amount)/
      Number(g.target_amount)*100
    )
  );

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


function renderGoals(){

  $("goalList").innerHTML=
    state.goals
      .map(
        g=>
          goalHTML(g)+
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
      .join("")
      ||
      `<div class="muted">
        Belum ada target.
      </div>`;
}


function renderFilters(){

  $("filterCategory").innerHTML=
    `<option value="">
      Semua kategori
    </option>`+
    state.categories
      .filter(c=>c.type==="expense")
      .map(
        c=>
          `<option value="${c.id}">
            ${esc(c.icon)}
            ${esc(c.name)}
          </option>`
      )
      .join("");
}


function renderTransactions(){

  const q=
    $("searchTx")
      .value
      .toLowerCase();

  const type=
    $("filterType").value;

  const cat=
    $("filterCategory").value;

  const m=
    $("filterMonth").value;

  const selectedCategory=
    state.categories.find(
      c=>c.id===cat
    );

  const selectedCategoryName=
    selectedCategory?.name||"";

  let tx=
    state.transactions.filter(
      t=>
        (
          !q ||
          `${t.name} ${t.note||""} ${t.category||""}`
            .toLowerCase()
            .includes(q)
        )&&
        (!type||t.type===type)&&
        (!cat||t.category===selectedCategoryName)&&
        (!m||String(t.transaction_date).startsWith(m))
    );

  $("transactionList").innerHTML=
    tx
      .map(t=>{

        const c=
          state.categories.find(
            x=>
              x.name===t.category &&
              x.type===t.type
          );

        return `
          <div class="tx-item">

            <div class="tx-icon">
              ${esc(c?.icon||"📦")}
            </div>

            <div>

              <div class="tx-name">
                ${esc(t.name)}
              </div>

              <div class="tx-meta">
                ${esc(c?.name||t.category||"Tanpa kategori")}
                ·
                ${new Date(t.transaction_date)
                  .toLocaleDateString("id-ID")}
              </div>

            </div>

            <div style="text-align:right">

              <b class="${t.type}">
                ${t.type==="income"?"+":"-"}
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
      .join("")
      ||
      `<div class="muted">
        Tidak ada transaksi.
      </div>`;
}


[
  "searchTx",
  "filterType",
  "filterCategory",
  "filterMonth"
].forEach(
  id=>$(id).addEventListener(
    "input",
    renderTransactions
  )
);


function openModal(title,html){

  $("modalTitle").textContent=title;

  $("modalBody").innerHTML=html;

  $("modal").classList.remove("hidden");
}


function closeModal(){

  $("modal").classList.add("hidden");
}

$("closeModal").onclick=closeModal;

document
  .querySelector(".modal-backdrop")
  .onclick=closeModal;


function categoryOptions(
  type,
  selected=""
){

  return state.categories
    .filter(c=>c.type===type)
    .map(
      c=>
        `<option
          value="${c.id}"
          ${c.id===selected?"selected":""}>
          ${esc(c.icon)}
          ${esc(c.name)}
        </option>`
    )
    .join("");
}


function txForm(t={}){

  const type=
    t.type||"expense";

  const selectedId=
    state.categories.find(
      c=>
        c.name===t.category &&
        c.type===type
    )?.id||"";

  return `
    <form id="txForm">

      <div class="form-grid">

        <div>

          <label>Jenis</label>

          <select id="fType">

            <option
              value="expense"
              ${type==="expense"?"selected":""}>
              Pengeluaran
            </option>

            <option
              value="income"
              ${type==="income"?"selected":""}>
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
            value="${t.amount||""}"
            required>

        </div>

        <div class="full-col">

          <label>Nama</label>

          <input
            id="fName"
            value="${esc(t.name||"")}"
            placeholder="Contoh: Makan siang"
            required>

        </div>

        <div>

          <label>Kategori</label>

          <select id="fCategory">
            ${categoryOptions(type,selectedId)}
          </select>

        </div>

        <div>

          <label>Tanggal</label>

          <input
            id="fDate"
            type="date"
            value="${t.transaction_date||todayISO()}"
            required>

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


function openTx(t){

  openModal(
    t
      ? "Edit transaksi"
      : "Tambah transaksi",
    txForm(t)
  );

  $("fType").onchange=()=>{

    $("fCategory").innerHTML=
      categoryOptions(
        $("fType").value
      );
  };

  $("cancelForm").onclick=
    closeModal;

  $("txForm").onsubmit=
    async e=>{

      e.preventDefault();

      const type=
        $("fType").value;

      const cid=
        $("fCategory").value;

      const c=
        state.categories.find(
          x=>x.id===cid
        );

      const payload={
        name:$("fName").value.trim(),
        amount:Number($("fAmount").value),
        type,
        category:c?.name||null,
        transaction_date:$("fDate").value
      };

      try{

        let r=
          t
            ? await db
                .from("transactions")
                .update(payload)
                .eq("id",t.id)
                .eq("user_id",state.user.id)

            : await db
                .from("transactions")
                .insert({
                  ...payload,
                  user_id:state.user.id
                });

        if(r.error)
          throw r.error;

        closeModal();

        await refreshTransactions();

        toast("Transaksi tersimpan.");

      }catch(err){

        fail(err);
      }
    };
}


$("addTxBtn").onclick=
  ()=>openTx();

$("quickAdd").onclick=
  ()=>openTx();


async function refreshTransactions(){

  const r=
    await db
      .from("transactions")
      .select("*")
      .eq("user_id",state.user.id)
      .order(
        "transaction_date",
        {ascending:false}
      )
      .order(
        "created_at",
        {ascending:false}
      );

  if(r.error)
    throw r.error;

  state.transactions=
    r.data||[];

  renderAll();
}


window.editTransaction=
  id=>
    openTx(
      state.transactions.find(
        t=>t.id===id
      )
    );


window.deleteTransaction=
  async id=>{

    if(!confirm("Hapus transaksi ini?"))
      return;

    const r=
      await db
        .from("transactions")
        .delete()
        .eq("id",id)
        .eq("user_id",state.user.id);

    if(r.error){

      fail(r.error);

    }else{

      await refreshTransactions();

      toast("Transaksi dihapus.");
    }
  };


function budgetForm(b={}){

  const m=
    b.month
      ? String(b.month).slice(0,7)
      : monthISO();

  return `
    <form id="budgetForm">

      <label>Kategori</label>

      <select id="bCat">
        ${categoryOptions(
          "expense",
          b.category_id
        )}
      </select>

      <label>Anggaran</label>

      <input
        id="bAmount"
        type="number"
        min="1"
        value="${b.amount||""}"
        required>

      <label>Bulan</label>

      <input
        id="bMonth"
        type="month"
        value="${m}"
        required>

      <div class="form-actions">

        <button class="primary">
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


function openBudget(b){

  openModal(
    b
      ? "Edit anggaran"
      : "Tambah anggaran",
    budgetForm(b)
  );

  $("cancelBudget").onclick=
    closeModal;

  $("budgetForm").onsubmit=
    async e=>{

      e.preventDefault();

      const payload={
        user_id:state.user.id,
        category_id:$("bCat").value,
        amount:Number(
          $("bAmount").value
        ),
        month:$("bMonth").value+"-01"
      };

      const r=
        b
          ? await db
              .from("budgets")
              .update(payload)
              .eq("id",b.id)
              .eq("user_id",state.user.id)

          : await db
              .from("budgets")
              .insert(payload);

      if(r.error){

        fail(r.error);

      }else{

        closeModal();

        await refreshBudgets();

        toast("Anggaran tersimpan.");
      }
    };
}


$("addBudgetBtn").onclick=
  ()=>openBudget();

window.editBudget=
  id=>
    openBudget(
      state.budgets.find(
        x=>x.id===id
      )
    );


window.deleteBudget=
  async id=>{

    if(!confirm("Hapus anggaran?"))
      return;

    const r=
      await db
        .from("budgets")
        .delete()
        .eq("id",id)
        .eq("user_id",state.user.id);

    if(r.error)
      fail(r.error);
    else
      await refreshBudgets();
  };


async function refreshBudgets(){

  const r=
    await db
      .from("budgets")
      .select("*, categories(name,icon)")
      .eq("user_id",state.user.id)
      .order(
        "month",
        {ascending:false}
      );

  if(r.error)
    throw r.error;

  state.budgets=
    r.data||[];

  renderAll();
}


function goalForm(g={}){

  return `
    <form id="goalForm">

      <div class="form-grid">

        <div>

          <label>Ikon</label>

          <input
            id="gIcon"
            value="${esc(g.icon||"🎯")}">

        </div>

        <div>

          <label>Nama target</label>

          <input
            id="gName"
            value="${esc(g.name||"")}"
            required>

        </div>

        <div>

          <label>Target nominal</label>

          <input
            id="gTarget"
            type="number"
            min="1"
            value="${g.target_amount||""}"
            required>

        </div>

        <div>

          <label>Sudah terkumpul</label>

          <input
            id="gCurrent"
            type="number"
            min="0"
            value="${g.current_amount||0}">

        </div>

        <div class="full-col">

          <label>Deadline</label>

          <input
            id="gDeadline"
            type="date"
            value="${g.deadline||""}">

        </div>

      </div>

      <div class="form-actions">

        <button class="primary">
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


function openGoal(g){

  openModal(
    g
      ? "Edit target"
      : "Tambah target",
    goalForm(g)
  );

  $("cancelGoal").onclick=
    closeModal;

  $("goalForm").onsubmit=
    async e=>{

      e.preventDefault();

      const p={
        user_id:state.user.id,
        name:$("gName").value.trim(),
        icon:$("gIcon").value||"🎯",
        target_amount:Number(
          $("gTarget").value
        ),
        current_amount:Number(
          $("gCurrent").value||0
        ),
        deadline:
          $("gDeadline").value||null,
        updated_at:
          new Date().toISOString()
      };

      const r=
        g
          ? await db
              .from("savings_goals")
              .update(p)
              .eq("id",g.id)
              .eq("user_id",state.user.id)

          : await db
              .from("savings_goals")
              .insert(p);

      if(r.error){

        fail(r.error);

      }else{

        closeModal();

        await refreshGoals();

        toast("Target tersimpan.");
      }
    };
}


$("addGoalBtn").onclick=
  ()=>openGoal();

window.editGoal=
  id=>
    openGoal(
      state.goals.find(
        x=>x.id===id
      )
    );


window.deleteGoal=
  async id=>{

    if(!confirm("Hapus target?"))
      return;

    const r=
      await db
        .from("savings_goals")
        .delete()
        .eq("id",id)
        .eq("user_id",state.user.id);

    if(r.error)
      fail(r.error);
    else
      await refreshGoals();
  };


async function refreshGoals(){

  const r=
    await db
      .from("savings_goals")
      .select("*")
      .eq("user_id",state.user.id)
      .order(
        "created_at",
        {ascending:false}
      );

  if(r.error)
    throw r.error;

  state.goals=
    r.data||[];

  renderAll();
}


function renderHealth(){

  const income=
    monthTx()
      .filter(t=>t.type==="income")
      .reduce(
        (a,t)=>a+Number(t.amount),
        0
      );

  const expense=
    monthTx()
      .filter(t=>t.type==="expense")
      .reduce(
        (a,t)=>a+Number(t.amount),
        0
      );

  const saving=
    income
      ? Math.max(
          0,
          (income-expense)/income
        )
      : 0;

  const bud=
    state.budgets.filter(
      b=>String(b.month)
        .startsWith(monthISO())
    );

  const avgBudget=
    bud.length
      ? bud.reduce(
          (a,b)=>
            a+
            Math.min(
              1,
              spentForBudget(b)/
              Number(b.amount)
            ),
          0
        )/bud.length
      : 0;

  const goals=
    state.goals.length
      ? state.goals.reduce(
          (a,g)=>
            a+
            Math.min(
              1,
              Number(g.current_amount)/
              Number(g.target_amount)
            ),
          0
        )/state.goals.length
      : 0;

  const score=
    Math.round(
      saving*45+
      (1-avgBudget)*30+
      goals*15+
      (state.transactions.length?10:0)
    );

  $("healthBadge").textContent=
    `Health ${score}/100`;

  $("healthMeter").style.width=
    Math.min(100,score)+"%";

  $("healthText").textContent=
    score+"/100";

  $("healthExplanation").textContent=
    score>=75
      ? "Keuanganmu terlihat cukup terkontrol."
      : score>=50
        ? "Ada beberapa area yang bisa diperbaiki bulan ini."
        : "Coba fokus pada cash flow, anggaran, dan target tabungan.";
}


function renderReports(){

  const m=
    $("reportMonth").value||
    state.reportMonth;

  state.reportMonth=m;

  const tx=monthTx(m);

  const inc=
    tx
      .filter(t=>t.type==="income")
      .reduce(
        (a,t)=>a+Number(t.amount),
        0
      );

  const exp=
    tx
      .filter(t=>t.type==="expense")
      .reduce(
        (a,t)=>a+Number(t.amount),
        0
      );

  $("reportSummary").innerHTML=
    [
      ["Pemasukan",money(inc)],
      ["Pengeluaran",money(exp)],
      ["Net Cash Flow",money(inc-exp)],
      [
        "Saving Rate",
        inc
          ? Math.round(
              (inc-exp)/inc*100
            )+"%"
          : "0%"
      ]
    ]
    .map(
      x=>
        `<div class="stat glass">
          <span>${x[0]}</span>
          <strong>${x[1]}</strong>
        </div>`
    )
    .join("");

  const cats={};

  tx
    .filter(t=>t.type==="expense")
    .forEach(t=>{
      cats[t.category||"Lainnya"]=
        (cats[t.category||"Lainnya"]||0)+
        Number(t.amount);
    });

  destroyChart("cat");

  state.charts.cat=
    new Chart(
      $("categoryChart"),
      {
        type:"doughnut",

        data:{
          labels:Object.keys(cats),

          datasets:[
            {
              data:Object.values(cats)
            }
          ]
        },

        options:{
          animation:false,
          responsive:true,
          maintainAspectRatio:false,

          plugins:{
            legend:{
              labels:{
                color:
                  getComputedStyle(document.body)
                    .getPropertyValue("--text")
              }
            }
          }
        }
      }
    );


  const labels=[];
  const data=[];

  for(let i=5;i>=0;i--){

    const d=
      new Date(m+"-01");

    d.setMonth(
      d.getMonth()-i
    );

    const mm=
      d.toISOString()
        .slice(0,7);

    labels.push(
      d.toLocaleDateString(
        "id-ID",
        {month:"short"}
      )
    );

    const mt=
      monthTx(mm);

    data.push(
      mt
        .filter(t=>t.type==="expense")
        .reduce(
          (a,t)=>a+Number(t.amount),
          0
        )
    );
  }

  destroyChart("trend");

  state.charts.trend=
    new Chart(
      $("trendChart"),
      {
        type:"bar",

        data:{
          labels,

          datasets:[
            {
              label:"Pengeluaran",
              data
            }
          ]
        },

        options:{
          animation:false,
          responsive:true,
          maintainAspectRatio:false,

          plugins:{
            legend:{
              display:false
            }
          },

          scales:{
            y:{
              ticks:{
                callback:v=>money(v),
                color:"#8e94a7"
              },
              grid:{
                color:"#242837"
              }
            },

            x:{
              ticks:{
                color:"#8e94a7"
              }
            }
          }
        }
      }
    );


  const prev=
    new Date(m+"-01");

  prev.setMonth(
    prev.getMonth()-1
  );

  const pm=
    prev.toISOString()
      .slice(0,7);

  const pe=
    monthTx(pm)
      .filter(t=>t.type==="expense")
      .reduce(
        (a,t)=>a+Number(t.amount),
        0
      );

  const ins=[];

  ins.push(
    `📊 Bulan ini pengeluaran ${money(exp)}.`
  );

  if(pe){

    ins.push(
      exp>pe
        ? `⚠️ Pengeluaran naik ${Math.round((exp-pe)/pe*100)}% dibanding bulan lalu.`
        : `✅ Pengeluaran turun ${Math.round((pe-exp)/pe*100)}% dibanding bulan lalu.`
    );
  }

  const max=
    Object
      .entries(cats)
      .sort(
        (a,b)=>b[1]-a[1]
      )[0];

  if(max){

    ins.push(
      `💡 Kategori terbesar: ${max[0]} (${money(max[1])}).`
    );
  }

  $("insightList").innerHTML=
    ins
      .map(
        x=>`<div class="insight">${x}</div>`
      )
      .join("");
}


$("reportMonth").value=
  monthISO();

$("reportMonth").onchange=
  renderReports;

$("reportRefresh").onclick=
  renderReports;
