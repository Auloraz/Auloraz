/**
 * Aulora - Main Application (Part 1)
 */
const App = {
  state: {
    view: 'dashboard',
    currentClassId: null,
    classTab: 'overview',
    showSidebar: true,
    modal: null,
    createClassStep: 1,
    createClassData: {},
    searchQuery: '',
    aiMessages: [],
    aiLoading: false,
    aiPendingImages: []
  },

  init() {
    Storage.load();
    // Remove senhas em texto puro legadas (se ainda existirem)
    try {
      const d = Storage.get();
      let changed = false;
      (d.users || []).forEach(u => {
        if (u.password) { delete u.password; changed = true; }
        if (u.recoveryHint) { delete u.recoveryHint; changed = true; }
      });
      // Limpa senha do "remember"
      const rem = Storage.getRememberedCredentials();
      if (rem && rem.password) {
        Storage.setRememberedCredentials(rem.email);
        changed = true;
      }
      if (changed) Storage.save(false);
    } catch (e) {}
    // Garante config Gemini (chave ofuscada em Storage._kSeed; sem texto puro no código)
    const _ai = Storage.getAISettings();
    if (!_ai.apiKey || _ai.provider !== 'gemini') {
      Storage.setAISettings({
        apiKey: Storage._kSeed(),
        model: 'gemini-3.5-flash',
        provider: 'gemini'
      });
    } else if (!_ai.model) {
      Storage.setAISettings({ model: 'gemini-3.5-flash', provider: 'gemini' });
    }
    // Configura Gemini (Google AI Studio)
    const ai = Storage.getAISettings();
    const user = Storage.getCurrentUser();
    if (!user) this.renderAuth();
    else if (!Storage.isOnboardingComplete()) this.renderOnboarding();
    else this.renderApp();
    setTimeout(() => {
      const loading = document.getElementById('loading-screen');
      if (loading) loading.style.display = 'none';
    }, 400);
  },

  renderAuth() {
    const remembered = Storage.getRememberedCredentials();
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="min-h-screen w-full flex items-center justify-center bg-dark-950 p-4">
        <div class="w-full max-w-md">
          <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4 shadow-glow">
              <span class="text-2xl">📚</span>
            </div>
            <h1 class="text-3xl font-bold gradient-text mb-2">Aulora</h1>
            <p class="text-gray-400 text-sm">Organização inteligente para quem ensina.</p>
          </div>
          <div class="card p-6" id="auth-card">
            <div class="flex gap-2 mb-6">
              <button class="btn flex-1 btn-primary" id="tab-login" onclick="App.showAuthTab('login')">Entrar</button>
              <button class="btn flex-1 btn-secondary" id="tab-register" onclick="App.showAuthTab('register')">Criar conta</button>
            </div>

            <div id="auth-login">
              <div class="space-y-4">
                <div>
                  <label class="label">E-mail (Gmail ou outro)</label>
                  <input type="email" class="input" id="login-email" placeholder="seu@gmail.com"
                         value="${remembered ? remembered.email : ''}" autocomplete="username">
                </div>
                <div>
                  <label class="label">Senha</label>
                  <input type="password" class="input" id="login-password" placeholder="••••••••"
                         value="" autocomplete="current-password">
                </div>
                <button class="btn btn-primary w-full" onclick="App.doLogin()">Entrar</button>
                <button class="btn btn-ghost w-full text-sm text-gray-400" onclick="App.showAuthTab('recover')">Esqueci minha senha</button>
                <p class="text-xs text-gray-500 text-center">Seus dados ficam só neste navegador/PC. Ninguém mais vê sua conta.</p>
              </div>
            </div>

            <div id="auth-register" class="hidden">
              <div class="space-y-4">
                <div>
                  <label class="label">Nome de usuário / Nome completo *</label>
                  <input type="text" class="input" id="reg-name" placeholder="Ex: Maria Silva" autocomplete="name">
                </div>
                <div>
                  <label class="label">E-mail (use seu Gmail) *</label>
                  <input type="email" class="input" id="reg-email" placeholder="seu@gmail.com" autocomplete="email">
                </div>
                <div>
                  <label class="label">Senha * (mín. 6 caracteres)</label>
                  <input type="password" class="input" id="reg-password" placeholder="••••••••" autocomplete="new-password">
                </div>
                <div>
                  <label class="label">Dica de recuperação (opcional, mas recomendado)</label>
                  <input type="text" class="input" id="reg-hint" placeholder="Ex: nome do primeiro animal de estimação">
                  <p class="text-xs text-gray-500 mt-1">Usada só neste PC para recuperar a senha, sem enviar e-mail.</p>
                </div>
                <button class="btn btn-primary w-full" onclick="App.doRegister()">Criar conta</button>
              </div>
            </div>

            <div id="auth-recover" class="hidden">
              <div class="space-y-4">
                <p class="text-sm text-gray-400">Recuperação local (sem e-mail). Informe o e-mail da conta e a dica que você cadastrou.</p>
                <div>
                  <label class="label">E-mail da conta</label>
                  <input type="email" class="input" id="rec-email" placeholder="seu@gmail.com">
                </div>
                <div>
                  <label class="label">Dica de recuperação</label>
                  <input type="text" class="input" id="rec-hint" placeholder="A dica que você cadastrou">
                </div>
                <div>
                  <label class="label">Nova senha</label>
                  <input type="password" class="input" id="rec-password" placeholder="Mínimo 6 caracteres">
                </div>
                <button class="btn btn-primary w-full" onclick="App.doRecover()">Redefinir senha</button>
                <button class="btn btn-ghost w-full text-sm" onclick="App.showAuthTab('login')">← Voltar ao login</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  showAuthTab(tab) {
    ['login', 'register', 'recover'].forEach(t => {
      const el = document.getElementById('auth-' + t);
      if (el) el.classList.toggle('hidden', t !== tab);
    });
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    if (tabLogin) tabLogin.className = 'btn flex-1 ' + (tab === 'login' ? 'btn-primary' : 'btn-secondary');
    if (tabReg) tabReg.className = 'btn flex-1 ' + (tab === 'register' ? 'btn-primary' : 'btn-secondary');
  },

  async doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
      alert('Informe e-mail e senha.');
      return;
    }
    const res = await Storage.login(email, password);
    if (res.error) {
      alert(res.error);
      return;
    }
    const alreadyRemembered = Storage.getRememberedCredentials();
    const same = alreadyRemembered && alreadyRemembered.email === email.toLowerCase();
    if (!same) {
      const save = confirm('Login ok. Lembrar o e-mail neste PC? A senha NAO sera salva.');
      if (save) Storage.setRememberedCredentials(email.trim().toLowerCase());
      else Storage.clearRememberedCredentials();
    }
    if (!Storage.isOnboardingComplete()) this.renderOnboarding();
    else this.renderApp();
  },

  async doRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const recoveryHint = document.getElementById('reg-hint').value.trim();
    const res = await Storage.registerUser({ name, username: name, email, password, recoveryHint });
    if (res.error) {
      alert(res.error);
      return;
    }
    const save = confirm('Conta criada. Lembrar o e-mail neste PC? A senha nao sera salva.');
    if (save) Storage.setRememberedCredentials(email.trim().toLowerCase());
    this.renderOnboarding();
  },

  async doRecover() {
    const email = document.getElementById('rec-email').value.trim();
    const hint = document.getElementById('rec-hint').value.trim();
    const newPassword = document.getElementById('rec-password').value;
    const res = await Storage.recoverPassword(email, hint, newPassword);
    if (res.error) {
      alert(res.error);
      return;
    }
    alert(res.message);
    Storage.clearRememberedCredentials();
    this.showAuthTab('login');
    const emailEl = document.getElementById('login-email');
    if (emailEl) emailEl.value = email.trim().toLowerCase();
  },

  renderOnboarding() {
    const app = document.getElementById('app');
    const user = Storage.getCurrentUser();
    app.innerHTML = `
      <div class="min-h-screen w-full flex items-center justify-center bg-dark-950 p-4">
        <div class="w-full max-w-lg">
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold mb-2">Vamos configurar seu espaço de trabalho</h1>
            <p class="text-gray-400 text-sm">Só leva alguns minutos</p>
          </div>
          <div class="card p-6">
            <div class="space-y-4">
              <p class="text-gray-300">Olá, <strong>${user.name}</strong>! 👋</p>
              <p class="text-sm text-gray-400">Vamos criar sua primeira sala de aula.</p>
              <div><label class="label">Nome da turma</label><input class="input" id="ob-class-name" placeholder="Ex: 8º Ano A" value="8º Ano A"></div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="label">Série/Ano</label><input class="input" id="ob-grade" value="8º Ano"></div>
                <div><label class="label">Disciplina</label><input class="input" id="ob-subject" value="História"></div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="label">Turno</label><select class="input" id="ob-shift"><option>Manhã</option><option>Tarde</option><option>Noite</option></select></div>
                <div><label class="label">Ano letivo</label><input class="input" id="ob-year" value="2026"></div>
              </div>
              <button class="btn btn-primary w-full mt-4" onclick="App.finishOnboarding()">Criar minha primeira sala →</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  finishOnboarding() {
    const name = document.getElementById('ob-class-name').value.trim() || 'Minha Turma';
    const grade = document.getElementById('ob-grade').value.trim();
    const subject = document.getElementById('ob-subject').value.trim();
    const shift = document.getElementById('ob-shift').value;
    const year = parseInt(document.getElementById('ob-year').value) || 2026;
    const cls = Storage.createClass({ name, grade, subject, shift, year });
    const sampleNames = ['Ana Clara', 'João Silva', 'Maria Souza', 'Pedro Henrique', 'Lucas Gabriel', 'Julia Costa', 'Gabriel Lima', 'Beatriz Alves'];
    sampleNames.forEach((n, i) => Storage.addStudent({ classId: cls.id, name: n, number: i + 1 }));
    const map = Storage.getMap(cls.id);
    const students = Storage.getStudents(cls.id);
    if (map && students.length) {
      students.slice(0, Math.min(8, map.desks.length)).forEach((s, i) => { if (map.desks[i]) map.desks[i].studentId = s.id; });
      Storage.updateMap(cls.id, map);
    }
    Storage.setOnboardingComplete();
    this.state.currentClassId = cls.id;
    this.renderApp();
    this.toast('Sala criada com sucesso! 🎉');
  }
};

// ===== MAIN APP SHELL =====
Object.assign(App, {
  renderApp() {
    const app = document.getElementById('app');
    const user = Storage.getCurrentUser();
    app.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <div class="p-4 flex items-center gap-3 border-b border-white/5">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0"><span class="text-sm">📚</span></div>
          <div class="sidebar-label overflow-hidden">
            <div class="font-semibold text-sm truncate">Aulora</div>
            <div class="text-xs text-gray-500 truncate">${user.name}</div>
          </div>
        </div>
        <nav class="flex-1 py-3 overflow-y-auto">
          ${this._navItem('dashboard', '🏠', 'Início')}
          ${this._navItem('ai', '🤖', 'Plusck')}
          ${this._navItem('classes', '🏫', 'Minhas Salas')}
          ${this._navItem('students', '👥', 'Alunos')}
          ${this._navItem('map', '🪑', 'Mapas de Sala')}
          ${this._navItem('activities', '📝', 'Atividades')}
          ${this._navItem('planning', '📚', 'Planejamento')}
          ${this._navItem('announcements', '📢', 'Comunicados')}
          ${this._navItem('reports', '📈', 'Relatórios')}
        </nav>
        <div class="p-3 border-t border-white/5">
          ${this._navItem('settings', '⚙️', 'Configurações')}
          <button class="nav-item w-full text-left text-red-400/80 hover:text-red-400" onclick="App.logout()">
            <span class="icon">🚪</span><span class="sidebar-label">Sair</span>
          </button>
        </div>
      </aside>
      <div class="flex-1 flex flex-col min-w-0">
        <header class="h-14 border-b border-white/5 flex items-center px-4 gap-4 bg-dark-900/50">
          <button class="btn btn-ghost p-2 md:hidden" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
          <div class="flex-1 max-w-xl relative">
            <input type="text" class="input pl-10 text-sm" id="global-search" placeholder="Pesquise alunos, salas, atividades ou pergunte à IA..."
                   oninput="App.onSearch(this.value)">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
            <div id="search-dropdown" class="absolute top-full left-0 right-0 mt-1 card p-2 hidden z-50 max-h-80 overflow-y-auto"></div>
          </div>
        </header>
        <main class="main-content flex-1 p-4 md:p-6" id="main-content"></main>
      </div>
      <div class="saved-indicator" id="saved-indicator">✓ Salvo</div>`;
    window.showSaved = () => {
      const el = document.getElementById('saved-indicator');
      if (el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1500); }
    };
    this.renderView();
  },

  _navItem(view, icon, label) {
    const active = this.state.view === view ? 'active' : '';
    return `<a class="nav-item ${active}" onclick="App.navigate('${view}')"><span class="icon">${icon}</span><span class="sidebar-label">${label}</span></a>`;
  },

  navigate(view, classId = null) {
    this.state.view = view;
    if (classId) this.state.currentClassId = classId;
    if (view === 'class' && classId) this.state.classTab = 'overview';
    this.renderApp();
  },

  logout() { Storage.logout(); this.renderAuth(); },

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  },

  onSearch(q) {
    this.state.searchQuery = q;
    const results = Storage.search(q);
    const dd = document.getElementById('search-dropdown');
    if (!q || results.length === 0) { dd.classList.add('hidden'); return; }
    dd.classList.remove('hidden');
    dd.innerHTML = results.map(r => `
      <div class="px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer text-sm"
           onclick="App.goToSearchResult('${r.type}','${r.id}','${r.classId || ''}')">
        <div class="font-medium">${r.title}</div>
        <div class="text-xs text-gray-500">${r.subtitle}</div>
      </div>`).join('');
  },

  goToSearchResult(type, id, classId) {
    document.getElementById('search-dropdown')?.classList.add('hidden');
    if (type === 'class') this.navigate('class', id);
    else if (type === 'student') this.navigate('class', classId);
    else this.navigate('activities');
  },

  renderView() {
    const el = document.getElementById('main-content');
    if (!el) return;
    const views = {
      dashboard: () => this.viewDashboard(),
      classes: () => this.viewClasses(),
      class: () => this.viewClassDetail(),
      students: () => this.viewStudents(),
      map: () => this.viewMapGlobal(),
      ai: () => { const h = this.viewAI(); setTimeout(() => this._initAIChat(), 50); return h; },
      activities: () => this.viewActivities(),
      planning: () => this.viewPlanning(),
      announcements: () => this.viewAnnouncements(),
      reports: () => this.viewReports(),
      settings: () => this.viewSettings()
    };
    el.innerHTML = (views[this.state.view] || views.dashboard)();
    if (this.state.view === 'class' && this.state.classTab === 'map') {
      setTimeout(() => this._initClassMap(), 50);
    }
  }
});

// ===== VIEWS =====
Object.assign(App, {
  viewDashboard() {
    const classes = Storage.getClasses();
    const user = Storage.getCurrentUser();
    const totalStudents = classes.reduce((acc, c) => acc + Storage.getStudents(c.id).length, 0);
    return `
      <div class="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold">${Models.greeting()}, ${user.name.split(' ')[0]}.</h1>
          <p class="text-gray-400 mt-1">Veja tudo que está acontecendo hoje.</p>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="card p-4 card-interactive" onclick="App.navigate('classes')"><div class="text-xs text-gray-500 mb-1">Minhas turmas</div><div class="text-2xl font-bold">${classes.length}</div></div>
          <div class="card p-4"><div class="text-xs text-gray-500 mb-1">Alunos</div><div class="text-2xl font-bold">${totalStudents}</div></div>
          <div class="card p-4 card-interactive" onclick="App.navigate('activities')"><div class="text-xs text-gray-500 mb-1">Atividades</div><div class="text-2xl font-bold text-amber-400">${Storage.get().assignments.length}</div></div>
          <div class="card p-4 card-interactive" onclick="App.navigate('planning')"><div class="text-xs text-gray-500 mb-1">Planos de aula</div><div class="text-2xl font-bold text-blue-400">${Storage.get().lessons.length}</div></div>
        </div>
        <div>
          <h2 class="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Ações rápidas</h2>
          <div class="flex flex-wrap gap-3">
            <button class="btn btn-primary" onclick="App.openCreateClass()">+ Adicionar Sala</button>
            <button class="btn btn-secondary" onclick="App.navigate('activities')">Criar Atividade</button>
                        <button class="btn btn-secondary" onclick="App.navigate('planning')">Planejar Aula</button>
            <button class="btn btn-secondary" onclick="App.navigate('ai')">Abrir Plusck</button>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">Minhas turmas</h2>
            <button class="btn btn-ghost text-xs" onclick="App.navigate('classes')">Ver todas</button>
          </div>
          ${classes.length === 0 ? `
            <div class="card p-8 text-center"><p class="text-gray-400 mb-4">Você ainda não tem turmas.</p>
            <button class="btn btn-primary" onclick="App.openCreateClass()">+ Adicionar primeira sala</button></div>
          ` : `<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${classes.map(c => {
              const stuCount = Storage.getStudents(c.id).length;
              return `<div class="card p-5 card-interactive" onclick="App.navigate('class','${c.id}')">
                <div class="flex items-start justify-between"><div><h3 class="font-semibold text-lg">${c.name}</h3>
                <p class="text-sm text-gray-400 mt-0.5">${c.subject} • ${c.grade}</p></div>
                <span class="badge badge-blue">${c.shift}</span></div>
                <div class="mt-4 flex items-center gap-4 text-xs text-gray-500"><span>👥 ${stuCount} alunos</span><span>📅 ${c.year}</span></div>
              </div>`;
            }).join('')}</div>`}
        </div>
        <div>
          <h2 class="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Próximas aulas</h2>
          <div class="card p-4 space-y-3">
            ${classes.slice(0, 3).map((c, i) => `
              <div class="flex items-center gap-4 py-2 ${i > 0 ? 'border-t border-white/5' : ''}">
                <div class="text-sm font-mono text-blue-400 w-14">${['08:00','09:00','10:30'][i] || '14:00'}</div>
                <div><div class="font-medium text-sm">${c.name}</div><div class="text-xs text-gray-500">${c.subject}</div></div>
              </div>`).join('') || '<p class="text-gray-500 text-sm">Nenhuma aula agendada</p>'}
          </div>
        </div>
      </div>`;
  },

  viewClasses() {
    const classes = Storage.getClasses();
    return `
      <div class="max-w-5xl mx-auto space-y-6">
        <div class="flex items-center justify-between">
          <div><h1 class="text-2xl font-bold">Minhas Salas</h1><p class="text-gray-400 text-sm mt-1">${classes.length} turma(s)</p></div>
          <button class="btn btn-primary" onclick="App.openCreateClass()">+ Adicionar Sala</button>
        </div>
        ${classes.length === 0 ? `
          <div class="card p-12 text-center"><div class="text-4xl mb-4">🏫</div>
          <h3 class="text-lg font-semibold mb-2">Nenhuma sala ainda</h3>
          <p class="text-gray-400 mb-6">Crie sua primeira turma para começar.</p>
          <button class="btn btn-primary" onclick="App.openCreateClass()">+ Adicionar Sala</button></div>
        ` : `<div class="grid md:grid-cols-2 gap-4">${classes.map(c => {
          const stu = Storage.getStudents(c.id);
          return `<div class="card p-5 card-interactive group" onclick="App.navigate('class','${c.id}')">
            <div class="flex justify-between items-start"><div>
              <h3 class="text-xl font-semibold group-hover:text-blue-400 transition">${c.name}</h3>
              <p class="text-gray-400 text-sm mt-1">${c.subject} • ${c.grade} • ${c.shift}</p></div>
              <button class="btn btn-ghost text-xs opacity-0 group-hover:opacity-100" onclick="event.stopPropagation();App.deleteClass('${c.id}')">🗑️</button>
            </div>
            <div class="mt-4 flex gap-4 text-sm text-gray-500"><span>👥 ${stu.length} alunos</span><span>📅 ${c.year}</span></div>
          </div>`;
        }).join('')}</div>`}
      </div>`;
  },

  viewClassDetail() {
    const cls = Storage.getClass(this.state.currentClassId);
    if (!cls) return `<div class="text-center py-20 text-gray-400">Turma não encontrada. <button class="btn btn-secondary mt-4" onclick="App.navigate('classes')">Voltar</button></div>`;
    const students = Storage.getStudents(cls.id);
    const tabs = [
      { id: 'overview', label: 'Visão geral' }, { id: 'students', label: 'Alunos' },
      { id: 'map', label: 'Mapa da sala' }, { id: 'activities', label: 'Atividades' },
      { id: 'planning', label: 'Planejamento' }, { id: 'reports', label: 'Relatórios' }
    ];
    return `
      <div class="max-w-6xl mx-auto space-y-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button class="text-sm text-gray-500 hover:text-gray-300 mb-1" onclick="App.navigate('classes')">← Minhas Salas</button>
            <h1 class="text-2xl font-bold">${cls.name}</h1>
            <p class="text-gray-400 text-sm">${cls.subject} • ${students.length} alunos • ${cls.shift}</p>
          </div>
          <button class="btn btn-secondary text-sm" onclick="App.navigate('ai')">🤖 Plusck</button>
        </div>
        <div class="flex gap-1 overflow-x-auto pb-1 border-b border-white/5">
          ${tabs.map(t => `<button class="px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition
            ${this.state.classTab === t.id ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5' : 'text-gray-500 hover:text-gray-300'}"
            onclick="App.setClassTab('${t.id}')">${t.label}</button>`).join('')}
        </div>
        <div id="class-tab-content">${this._renderClassTab(cls, students)}</div>
      </div>`;
  },

  setClassTab(tab) { this.state.classTab = tab; this.renderView(); },

  _renderClassTab(cls, students) {
    switch (this.state.classTab) {
      case 'overview': return `
        <div class="grid md:grid-cols-3 gap-4">
          <div class="card p-5"><div class="text-xs text-gray-500 mb-1">Alunos</div><div class="text-3xl font-bold">${students.length}</div></div>
          <div class="card p-5"><div class="text-xs text-gray-500 mb-1">Disciplina</div><div class="text-xl font-semibold">${cls.subject}</div></div>
          <div class="card p-5"><div class="text-xs text-gray-500 mb-1">Ano letivo</div><div class="text-xl font-semibold">${cls.year}</div></div>
        </div>
        <div class="card p-5 mt-4"><h3 class="font-semibold mb-3">Ações rápidas desta turma</h3>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-secondary text-sm" onclick="App.setClassTab('map')">🪑 Abrir Mapa</button>
            <button class="btn btn-secondary text-sm" onclick="App.setClassTab('students')">👥 Gerenciar Alunos</button>
            <button class="btn btn-secondary text-sm" onclick="App.setClassTab('activities')">📝 Atividades</button>
            <button class="btn btn-secondary text-sm" onclick="App.navigate('ai')">🤖 Perguntar à IA</button>
          </div>
        </div>`;
      case 'students': return this._classStudentsTab(cls, students);
      case 'map': return this._classMapTab(cls, students);
      case 'activities': return this._classActivitiesTab(cls);
      case 'planning': return this._classPlanningTab(cls);
      case 'reports': return this._classReportsTab(cls, students);
      default: return '';
    }
  }
});

Object.assign(App, {
  _classStudentsTab(cls, students) {
    return `<div class="space-y-4">
      <div class="flex justify-between items-center"><h3 class="font-semibold">Alunos (${students.length})</h3>
        <button class="btn btn-primary text-sm" onclick="App.openAddStudent('${cls.id}')">+ Adicionar aluno</button></div>
      <div class="card overflow-hidden"><table class="data-table">
        <thead><tr><th>Nº</th><th>Nome</th><th>Carteira</th><th></th></tr></thead>
        <tbody>${students.length === 0 ? '<tr><td colspan="4" class="text-center text-gray-500 py-8">Nenhum aluno cadastrado</td></tr>' :
          students.map(s => {
            const map = Storage.getMap(cls.id);
            const desk = map?.desks.find(d => d.studentId === s.id);
            return `<tr><td class="text-gray-500">${s.number || '—'}</td><td class="font-medium">${s.name}</td>
              <td class="text-sm text-gray-400">${desk ? desk.label : '—'}</td>
              <td><button class="btn btn-ghost text-xs text-red-400" onclick="App.deleteStudent('${s.id}')">Remover</button></td></tr>`;
          }).join('')}</tbody></table></div></div>`;
  },

  _classMapTab(cls, students) {
    return `<div class="space-y-4">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <h3 class="font-semibold">Mapa da Sala</h3>
        <div class="flex flex-wrap gap-2">
          <select class="input text-sm py-1.5 w-auto" id="layout-preset" onchange="App.applyMapLayout(this.value)">
            <option value="">Layout pronto...</option>
            <option value="tradicional">Tradicional</option><option value="duplas">Duplas</option>
            <option value="grupos">Grupos</option><option value="u">Formato U</option>
            <option value="circulo">Círculo</option><option value="prova">Prova</option>
            <option value="debate">Debate</option>
          </select>
          
        </div>
      </div>
      <div class="grid lg:grid-cols-4 gap-4">
        <div class="lg:col-span-3"><div id="classroom-map" class="h-[520px] card overflow-hidden"></div></div>
        <div class="space-y-3"><div class="card p-4">
          <h4 class="text-sm font-semibold mb-3">Alunos (arraste para a carteira)</h4>
          <div class="space-y-1 max-h-[400px] overflow-y-auto" id="student-list-dnd">
            ${students.map(s => {
              const map = Storage.getMap(cls.id);
              const assigned = map?.desks.some(d => d.studentId === s.id);
              return `<div class="px-3 py-2 rounded-lg bg-dark-800 text-sm cursor-grab hover:bg-dark-700 flex justify-between items-center ${assigned ? 'opacity-50' : ''}"
                draggable="true" ondragstart="event.dataTransfer.setData('text/student-id','${s.id}')">
                <span>${s.name}</span>${assigned ? '<span class="text-xs text-green-400">✓</span>' : ''}</div>`;
            }).join('') || '<p class="text-xs text-gray-500">Nenhum aluno</p>'}
          </div>
        </div></div>
      </div></div>`;
  },

  _initClassMap() {
    const el = document.getElementById('classroom-map');
    if (el && this.state.currentClassId) {
      ClassroomMap.init(el, this.state.currentClassId, {
        mode: this.state.classTab === 'attendance' ? 'attendance' : 'edit',
        onUpdate: () => {}
      });
    }
  },

  applyMapLayout(preset) {
    if (!preset) return;
    ClassroomMap.applyLayout(preset);
    this.toast('Layout aplicado: ' + (Models.layoutPresets[preset]?.name || preset));
  },

  _classAttendanceTab(cls, students) {
    const today = Models.today();
    const att = Storage.getAttendance(cls.id, today);
    const records = {};
    if (att?.records) att.records.forEach(r => records[r.studentId] = r.status);
    return `<div class="space-y-4">
      <div class="flex justify-between items-center">
        <div><h3 class="font-semibold">Chamada — ${Models.formatDate(today)}</h3>
        <p class="text-xs text-gray-500">Clique no status para alternar</p></div>
        <button class="btn btn-secondary text-sm" onclick="App.setClassTab('map')">Ver no mapa</button>
      </div>
      <div class="card overflow-hidden"><table class="data-table">
        <thead><tr><th>Nº</th><th>Aluno</th><th>Status</th></tr></thead>
        <tbody>${students.map(s => {
          const st = records[s.id] || 'none';
          return `<tr><td class="text-gray-500">${s.number || '—'}</td><td>${s.name}</td><td>
            <div class="flex gap-1">${['present','late','absent','justified'].map(status => {
              const labels = { present: '🟢', late: '🟡', absent: '🔴', justified: '🔵' };
              const active = st === status ? 'ring-2 ring-white/30' : 'opacity-40';
              return `<button class="text-lg ${active} hover:opacity-100" title="${status}"
                onclick="App.setStudentAttendance('${cls.id}','${s.id}','${status}')">${labels[status]}</button>`;
            }).join('')}</div></td></tr>`;
        }).join('') || '<tr><td colspan="3" class="text-center text-gray-500 py-6">Nenhum aluno</td></tr>'}</tbody></table></div></div>`;
  },

  setStudentAttendance(classId, studentId, status) {
    const today = Models.today();
    const students = Storage.getStudents(classId);
    let att = Storage.getAttendance(classId, today);
    let records = att?.records ? [...att.records] : students.map(s => ({ studentId: s.id, status: 'none' }));
    const idx = records.findIndex(r => r.studentId === studentId);
    if (idx >= 0) records[idx].status = status; else records.push({ studentId, status });
    Storage.setAttendance(classId, today, records);
    this.renderView(); this.toast('Presença atualizada');
  },

  _classGradesTab(cls, students) {
    const grades = Storage.getGrades(cls.id);
    return `<div class="space-y-4">
      <div class="flex justify-between items-center"><h3 class="font-semibold">Notas</h3>
        <button class="btn btn-primary text-sm" onclick="App.openAddGrade('${cls.id}')">+ Lançar nota</button></div>
      <div class="card overflow-x-auto"><table class="data-table">
        <thead><tr><th>Aluno</th><th class="text-right">Prova</th><th class="text-right">Trabalho</th><th class="text-right">Atividade</th><th class="text-right">Média</th></tr></thead>
        <tbody>${students.map(s => {
          const sg = grades.filter(g => g.studentId === s.id);
          const prova = sg.find(g => g.type === 'prova')?.value;
          const trab = sg.find(g => g.type === 'trabalho')?.value;
          const ativ = sg.find(g => g.type === 'atividade')?.value;
          const avg = Models.calcAverage(sg);
          return `<tr><td class="font-medium">${s.name}</td>
            <td class="text-right">${prova ?? '—'}</td><td class="text-right">${trab ?? '—'}</td>
            <td class="text-right">${ativ ?? '—'}</td>
            <td class="text-right font-semibold ${avg >= 7 ? 'text-green-400' : avg ? 'text-amber-400' : ''}">${avg ?? '—'}</td></tr>`;
        }).join('') || '<tr><td colspan="5" class="text-center text-gray-500 py-6">Nenhum aluno</td></tr>'}</tbody></table></div>
      <p class="text-xs text-gray-500">Pesos padrão: Prova 50% • Trabalho 30% • Atividades 20%</p></div>`;
  },

  _classActivitiesTab(cls) {
    const assigns = Storage.getAssignments(cls.id);
    return `<div class="space-y-4">
      <div class="flex justify-between items-center"><h3 class="font-semibold">Atividades</h3>
        <button class="btn btn-primary text-sm" onclick="App.openCreateActivity('${cls.id}')">+ Criar Atividade</button></div>
      ${assigns.length === 0 ? '<div class="card p-8 text-center text-gray-400">Nenhuma atividade ainda. Use o criador ou peça ao Plusck.</div>' :
        `<div class="space-y-3">${assigns.map(a => {
          const qCount = (a.questions && a.questions.length) ? a.questions.length : 0;
          return `<div class="card p-4 card-interactive flex justify-between items-center" onclick="App.openAssignmentDetail('${a.id}')">
          <div><div class="font-medium">${a.title}</div>
          <div class="text-xs text-gray-500">${a.type || 'Atividade'} • ${qCount ? qCount + ' questões' : 'ver conteúdo'} • ${Models.formatDate(a.createdAt)}</div></div>
          <span class="badge badge-blue">${a.status || 'draft'}</span></div>`;
        }).join('')}</div>`}</div>`;
  },

  _classPlanningTab(cls) {
    const lessons = Storage.getLessons(cls.id);
    return `<div class="space-y-4">
      <div class="flex justify-between items-center"><h3 class="font-semibold">Planejamento de Aulas</h3>
        <button class="btn btn-primary text-sm" onclick="App.openCreateLesson('${cls.id}')">+ Nova aula</button></div>
      ${lessons.length === 0 ? '<div class="card p-8 text-center text-gray-400">Nenhum plano salvo. Clique em Nova aula ou peça ao Plusck.</div>' :
        lessons.map(l => `<div class="card p-5 card-interactive" onclick="App.openLessonDetail('${l.id}')">
          <h4 class="font-semibold">${l.theme || l.title}</h4>
          <p class="text-sm text-gray-400 mt-1">${l.duration || 50} min • ${Models.formatDate(l.createdAt)}</p>
          ${l.objective ? `<p class="text-sm mt-2 text-gray-300 line-clamp-2">${l.objective}</p>` : ''}
          <p class="text-xs text-blue-400 mt-2">Clique para ver o plano completo →</p>
        </div>`).join('')}</div>`;
  },

  _classReportsTab(cls, students) {
    const assigns = Storage.getAssignments(cls.id);
    const lessons = Storage.getLessons(cls.id);
    return `<div class="grid md:grid-cols-2 gap-4">
      <div class="card p-5"><div class="text-xs text-gray-500 mb-1">Alunos</div>
        <div class="text-3xl font-bold">${students.length}</div></div>
      <div class="card p-5"><div class="text-xs text-gray-500 mb-1">Atividades criadas</div>
        <div class="text-3xl font-bold">${assigns.length}</div></div>
      <div class="card p-5"><div class="text-xs text-gray-500 mb-1">Planos de aula</div>
        <div class="text-3xl font-bold">${lessons.length}</div></div>
      <div class="card p-5"><div class="text-xs text-gray-500 mb-1">Disciplina</div>
        <div class="text-xl font-semibold">${cls.subject || '—'}</div></div>
      <div class="card p-5 md:col-span-2">
        <h4 class="font-semibold mb-2">Foco do Aulora</h4>
        <p class="text-sm text-gray-400">Monitoramento da turma, mapa de sala, planejamento e atividades com o Plusck. Presença e notas ficam no sistema principal da escola.</p>
      </div>
    </div>`;
  }
});

Object.assign(App, {
  viewStudents() {
    const classes = Storage.getClasses();
    const all = [];
    classes.forEach(c => Storage.getStudents(c.id).forEach(s => all.push({ ...s, className: c.name })));
    return `<div class="max-w-5xl mx-auto space-y-6"><h1 class="text-2xl font-bold">Alunos</h1>
      <div class="card overflow-hidden"><table class="data-table">
        <thead><tr><th>Nome</th><th>Turma</th><th>Nº</th></tr></thead>
        <tbody>${all.map(s => `<tr class="cursor-pointer hover:bg-white/5" onclick="App.navigate('class','${s.classId}')">
          <td class="font-medium">${s.name}</td><td class="text-gray-400">${s.className}</td><td class="text-gray-500">${s.number || '—'}</td></tr>`).join('') ||
          '<tr><td colspan="3" class="text-center text-gray-500 py-8">Nenhum aluno</td></tr>'}</tbody></table></div></div>`;
  },

  viewMapGlobal() {
    const classes = Storage.getClasses();
    return `<div class="max-w-4xl mx-auto space-y-6"><h1 class="text-2xl font-bold">Mapas de Sala</h1>
      <p class="text-gray-400 text-sm">Selecione uma turma para gerenciar o mapa.</p>
      <div class="grid md:grid-cols-2 gap-4">${classes.map(c => `
        <div class="card p-5 card-interactive" onclick="App.navigate('class','${c.id}'); setTimeout(()=>App.setClassTab('map'),100)">
          <h3 class="font-semibold">${c.name}</h3>
          <p class="text-sm text-gray-400">${c.subject} • ${Storage.getStudents(c.id).length} alunos</p>
        </div>`).join('') || '<p class="text-gray-500">Nenhuma turma</p>'}</div></div>`;
  },

  viewAI() {
    const classes = Storage.getClasses();
    return `<div class="max-w-3xl mx-auto h-full flex flex-col" style="min-height:calc(100vh - 120px)">
      <div class="flex items-center justify-between mb-4">
        <div><h1 class="text-2xl font-bold">Plusck</h1>
          <p class="text-sm text-gray-400">Assistente pedagógico · ${Storage.getAISettings().enabled ? 'conectado' : 'modo offline'}</p></div>
        <select class="input text-sm py-1.5 w-auto" id="ai-class-select" onchange="App.setAIClass(this.value)">
          <option value="">Selecione a turma...</option>
          ${classes.map(c => `<option value="${c.id}" ${c.id === this.state.currentClassId ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="card flex-1 flex flex-col overflow-hidden" style="min-height:400px">
        <div id="ai-messages" class="flex-1 overflow-y-auto p-4 space-y-4"></div>
        <div class="p-4 border-t border-white/5 space-y-2">
          <div id="ai-image-preview" class="flex flex-wrap gap-2 hidden"></div>
          <div class="flex gap-2 items-center">
            <label class="btn btn-secondary text-sm cursor-pointer px-3" title="Enviar imagem">
              📎
              <input type="file" id="ai-image-input" accept="image/*" multiple class="hidden" onchange="App.onAIImagesSelected(event)">
            </label>
            <input class="input flex-1" id="ai-input" placeholder="Mensagem ou legenda da imagem..."
                   onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();App.sendAI()}">
            <button class="btn btn-primary" onclick="App.sendAI()">Enviar</button>
          </div>
          <p class="text-xs text-gray-500">Você pode anexar imagens (foto de quadro, atividade, livro…). O Plusck analisa com o Gemini.</p>
        </div>
      </div></div>`;
  },

  _initAIChat() {
    const id = this.state.currentClassId;
    if (id) {
      const conv = Storage.getAIConversation(id);
      this.state.aiMessages = (conv && conv.messages) ? conv.messages : [];
    } else {
      this.state.aiMessages = [];
    }
    this._renderAIMessages();
  },

  setAIClass(id) {
    // Salva conversa da turma atual antes de trocar
    if (this.state.currentClassId && this.state.aiMessages && this.state.aiMessages.length) {
      Storage.saveAIConversation(this.state.currentClassId, this.state.aiMessages);
    }
    this.state.currentClassId = id || null;
    if (id) {
      const conv = Storage.getAIConversation(id);
      this.state.aiMessages = (conv && conv.messages) ? conv.messages.slice() : [];
    } else {
      this.state.aiMessages = [];
    }
    this._renderAIMessages();
  },

  _renderAIMessages() {
    const el = document.getElementById('ai-messages');
    if (!el) return;
    const cls = this.state.currentClassId ? Storage.getClass(this.state.currentClassId) : null;
    const hasHistory = this.state.aiMessages && this.state.aiMessages.length > 0;

    let html = '';
    if (!this.state.currentClassId) {
      html = `<div class="chat-bubble-ai">Selecione uma turma acima. Cada sala mantém o próprio histórico de conversas com o Plusck.</div>`;
    } else if (!hasHistory) {
      html = `<div class="chat-bubble-ai">Plusck · <strong>${cls ? cls.name : 'Turma'}</strong><br><br>Nenhuma conversa salva nesta sala ainda. Pode perguntar sobre a turma, pedir um plano de aula ou uma atividade.</div>`;
    }

    html += (this.state.aiMessages || []).map(m => {
      const imgs = (m.images || []).map(src => `<img src="${src}" class="mt-2 max-h-40 rounded-lg border border-white/10" alt="">`).join('');
      const body = String(m.text || '').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return `<div class="${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}">${body}${imgs}</div>`;
    }).join('');

    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  },

  async sendAI() {
    const input = document.getElementById('ai-input');
    const text = (input?.value || '').trim();
    const images = (this.state.aiPendingImages || []).slice();
    if (!text && !images.length) return;
    if (!this.state.currentClassId) {
      alert('Selecione uma turma para conversar com o Plusck. O histórico fica salvo por sala.');
      return;
    }
    if (input) input.value = '';
    this.state.aiPendingImages = [];
    this._renderAIImagePreview();

    const userDisplay = text || (images.length ? '[Imagem enviada]' : '');
    const userMsg = { role: 'user', text: userDisplay };
    if (images.length) {
      userMsg.images = images.map(i => i.preview);
      userMsg.text = (text ? text + '\n' : '') + (images.length === 1 ? '📷 1 imagem' : '📷 ' + images.length + ' imagens');
    }
    this.state.aiMessages.push(userMsg);
    this._renderAIMessages();

    const classId = this.state.currentClassId;
    const classData = classId ? Storage.getClass(classId) : null;
    const students = classId ? Storage.getStudents(classId) : [];
    const map = classId ? Storage.getMap(classId) : null;
    const grades = classId ? Storage.getGrades(classId) : [];
    const el = document.getElementById('ai-messages');
    const loading = document.createElement('div');
    loading.className = 'chat-bubble-ai opacity-60'; loading.textContent = 'Analisando...';
    el.appendChild(loading); el.scrollTop = el.scrollHeight;

    const res = await ProfessorAI.respond(text || 'Analise a(s) imagem(ns) enviada(s) e responda de forma útil para o professor.', {
      classId, classData, students, map, grades, lessons: [],
      images: images.map(i => ({ mimeType: i.mimeType, data: i.data }))
    });
    loading.remove();
    this.state.aiMessages.push({ role: 'ai', text: res.text });
    if (classId) Storage.saveAIConversation(classId, this.state.aiMessages);
    this._renderAIMessages();
    if (res.mapUpdated) this.toast('Mapa atualizado pela IA');
  },

  viewActivities() {
    const classes = Storage.getClasses();
    const all = [];
    classes.forEach(c => Storage.getAssignments(c.id).forEach(a => all.push({ ...a, className: c.name })));
    return `<div class="max-w-4xl mx-auto space-y-6">
      <div class="flex justify-between items-center"><h1 class="text-2xl font-bold">Atividades</h1>
        <button class="btn btn-primary" onclick="App.openCreateActivity()">+ Criar Atividade</button></div>
      ${all.length === 0 ? `<div class="card p-12 text-center"><p class="text-gray-400 mb-4">Nenhuma atividade criada ainda.</p>
        <button class="btn btn-primary" onclick="App.openCreateActivity()">Criar com IA</button></div>` :
        all.map(a => {
          const qCount = (a.questions && a.questions.length) ? a.questions.length : 0;
          return `<div class="card p-5 card-interactive" onclick="App.openAssignmentDetail('${a.id}')">
          <div class="flex justify-between"><div>
          <h3 class="font-semibold">${a.title}</h3>
          <p class="text-sm text-gray-400">${a.className} • ${a.type || ''} • ${qCount ? qCount + ' questões' : ''} • ${Models.formatDate(a.createdAt)}</p></div>
          <span class="badge badge-purple">${a.status || 'draft'}</span></div>
          <p class="text-xs text-blue-400 mt-3">Clique para ver as questões →</p>
        </div>`;
        }).join('')}</div>`;
  },

  viewPlanning() {
    const classes = Storage.getClasses();
    const all = [];
    classes.forEach(c => Storage.getLessons(c.id).forEach(l => all.push({ ...l, className: c.name })));
    return `<div class="max-w-4xl mx-auto space-y-6">
      <div class="flex justify-between items-center"><h1 class="text-2xl font-bold">Planejamento</h1>
        <button class="btn btn-primary" onclick="App.openCreateLesson()">+ Nova aula</button></div>
      ${all.length === 0 ? '<div class="card p-12 text-center text-gray-400">Nenhum plano de aula. Use o Plusck para gerar automaticamente.</div>' :
        all.map(l => `<div class="card p-5 card-interactive" onclick="App.openLessonDetail('${l.id}')">
          <h3 class="font-semibold">${l.theme || l.title}</h3>
          <p class="text-sm text-gray-400">${l.className} • ${l.duration || 50} min • ${Models.formatDate(l.createdAt)}</p>
          <p class="text-xs text-blue-400 mt-2">Clique para ver o plano →</p>
        </div>`).join('')}</div>`;
  },

  viewGrades() {
    return `<div class="max-w-lg mx-auto card p-8 text-center">
      <h2 class="text-xl font-semibold mb-2">Indisponível no Aulora</h2>
      <p class="text-gray-400 text-sm mb-4">Presença e notas ficam no sistema principal da escola. Use o Aulora para mapa, planejamento e atividades.</p>
      <button class="btn btn-primary" onclick="App.navigate('dashboard')">Voltar ao início</button>
    </div>`;
  },

  viewAttendance() {
    return `<div class="max-w-lg mx-auto card p-8 text-center">
      <h2 class="text-xl font-semibold mb-2">Indisponível no Aulora</h2>
      <p class="text-gray-400 text-sm mb-4">Presença e notas ficam no sistema principal da escola. Use o Aulora para mapa, planejamento e atividades.</p>
      <button class="btn btn-primary" onclick="App.navigate('dashboard')">Voltar ao início</button>
    </div>`;
  },

  viewAnnouncements() {
    const anns = Storage.getAnnouncements();
    return `<div class="max-w-3xl mx-auto space-y-6">
      <div class="flex justify-between items-center"><h1 class="text-2xl font-bold">Comunicados</h1>
        <button class="btn btn-primary" onclick="App.openCreateAnnouncement()">+ Novo comunicado</button></div>
      ${anns.length === 0 ? '<div class="card p-8 text-center text-gray-400">Nenhum comunicado ainda.</div>' :
        anns.map(a => `<div class="card p-5"><h3 class="font-semibold">${a.title}</h3>
          <p class="text-sm text-gray-300 mt-2">${a.content}</p>
          <p class="text-xs text-gray-500 mt-3">${Models.formatDate(a.createdAt)}</p></div>`).join('')}</div>`;
  },

  viewReports() {
    const classes = Storage.getClasses();
    return `<div class="max-w-4xl mx-auto space-y-6"><h1 class="text-2xl font-bold">Relatórios</h1>
      <p class="text-sm text-gray-400">Resumo por turma — foco em planejamento e atividades.</p>
      <div class="grid md:grid-cols-2 gap-4">${classes.map(c => {
        const students = Storage.getStudents(c.id);
        const assigns = Storage.getAssignments(c.id);
        const lessons = Storage.getLessons(c.id);
        return `<div class="card p-5"><h3 class="font-semibold">${c.name}</h3>
          <div class="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div><span class="text-gray-500">Alunos</span><div class="font-semibold">${students.length}</div></div>
            <div><span class="text-gray-500">Atividades</span><div class="font-semibold">${assigns.length}</div></div>
            <div><span class="text-gray-500">Planos</span><div class="font-semibold">${lessons.length}</div></div>
          </div>
          <button class="btn btn-secondary text-xs mt-4" onclick="App.navigate('class','${c.id}');setTimeout(()=>App.setClassTab('reports'),50)">Ver detalhes</button>
        </div>`;
      }).join('')}</div></div>`;
  },

  viewSettings() {
    const user = Storage.getCurrentUser();
    const remembered = Storage.getRememberedCredentials();
    const ai = Storage.getAISettings();
    const models = (typeof ProfessorAI !== 'undefined' && ProfessorAI.FREE_MODELS) ? ProfessorAI.FREE_MODELS : [];
    const modelOpts = models.map(m =>
      `<option value="${m.id}" ${ai.model === m.id ? 'selected' : ''}>${m.name}</option>`
    ).join('');
    return `<div class="max-w-lg mx-auto space-y-6"><h1 class="text-2xl font-bold">Configurações</h1>
      <div class="card p-5 space-y-4">
        <div><label class="label">Nome</label><input class="input" value="${user.name}" disabled></div>
        <div><label class="label">E-mail</label><input class="input" value="${user.email}" disabled></div>
        <hr class="border-white/5">
        <div>
          <p class="text-sm text-gray-400 mb-2">E-mail lembrado neste PC: ${remembered && remembered.email ? '<span class="text-green-400">' + remembered.email + '</span>' : '<span class="text-gray-500">Não</span>'}</p>
          ${remembered ? '<button class="btn btn-secondary w-full text-sm" onclick="Storage.clearRememberedCredentials();App.toast(\'Dados de login removidos deste PC\');App.renderView()">Remover e-mail lembrado neste PC</button>' : ''}
        </div>
        <div class="text-xs text-gray-500 bg-dark-800 rounded-lg p-3">
          <strong class="text-gray-300">Segurança neste dispositivo</strong><br>
          Senhas são guardadas com hash (SHA-256 + salt), não em texto puro.
          O e-mail fica local para login. A chave do Gemini é ofuscada, mas em app só no navegador quem inspecionar a rede ainda pode vê-la.
          Para proteção máxima, o ideal é um servidor (backend) no futuro.
        </div>
        <hr class="border-white/5">
        <h3 class="font-semibold text-sm">🤖 Plusck</h3>
        <p class="text-xs text-gray-500">1) Chave do <strong>Google AI Studio</strong> (Gemini) já pode estar preenchida.<br>
2) Escolha o modelo (recomendado: Gemini 3.8 Flash).<br>
3) Clique em <strong>Salvar IA</strong> e <strong>Testar</strong>.</p>
        <div>
          <label class="label">API Key (Gemini)</label>
          <input type="password" class="input" id="ai-api-key" placeholder="${ai.apiKey ? Storage.maskApiKey(ai.apiKey) + ' — deixe em branco para manter' : 'Cole a chave do Google AI Studio'}" value="" autocomplete="off">
          <p class="text-xs text-gray-500 mt-1">${ai.apiKey ? 'Chave configurada: ' + Storage.maskApiKey(ai.apiKey) : 'Nenhuma chave salva'}</p>
        </div>
        <div>
          <label class="label">Modelo</label>
          <select class="input" id="ai-model">${modelOpts}</select>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-primary flex-1" onclick="App.saveAISettings()">Salvar IA</button>
          <button class="btn btn-secondary text-sm" onclick="App.testAI()">Testar</button>
        </div>
        <p class="text-xs ${ai.enabled ? 'text-green-400' : 'text-amber-400'}">${ai.enabled ? '✓ IA online ativa' : 'IA online desligada (usando respostas locais)'}</p>
        <hr class="border-white/5">
        <button class="btn btn-danger w-full" onclick="if(confirm('Isso apagará todos os dados locais (turmas, alunos, notas...). Continuar?')){Storage.resetAll();Storage.clearRememberedCredentials();location.reload()}">
          Resetar todos os dados</button>
      </div></div>`;
  },

  saveAISettings() {
    const raw = document.getElementById('ai-api-key')?.value?.trim() || '';
    const model = document.getElementById('ai-model')?.value || 'gemini-3.5-flash';
    const payload = { model, provider: 'gemini' };
    if (raw) payload.apiKey = raw;
    Storage.setAISettings(payload);
    this.toast('Configurações do Plusck salvas.');
    this.renderView();
  },

  async testAI() {
    const raw = document.getElementById('ai-api-key')?.value?.trim();
    const model = document.getElementById('ai-model')?.value;
    const payload = { model, provider: 'gemini' };
    if (raw) payload.apiKey = raw;
    Storage.setAISettings(payload);
    const cfg = Storage.getAISettings();
    if (!cfg.apiKey) { alert('Nenhuma chave configurada.'); return; }
    this.toast('Testando Gemini...');
    try {
      const r = await ProfessorAI._callGemini('Responda só: OK, estou funcionando em português.', {}, cfg);
      alert('Sucesso!\n\n' + (r.text || '').slice(0, 300));
    } catch (e) {
      alert('Falhou: ' + (e.message || e));
    }
  },

  onAIImagesSelected(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const max = 4;
    const toRead = files.slice(0, max);
    toRead.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 8 * 1024 * 1024) {
        this.toast('Imagem muito grande (máx. 8 MB)');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(dataUrl);
        if (!m) return;
        this.state.aiPendingImages.push({ mimeType: m[1], data: m[2], preview: dataUrl, name: file.name });
        this._renderAIImagePreview();
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  },

  _renderAIImagePreview() {
    const box = document.getElementById('ai-image-preview');
    if (!box) return;
    const imgs = this.state.aiPendingImages || [];
    if (!imgs.length) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = imgs.map((img, i) => `
      <div class="relative">
        <img src="${img.preview}" alt="" class="h-16 w-16 object-cover rounded-lg border border-white/10">
        <button type="button" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-5"
          onclick="App.removeAIImage(${i})">×</button>
      </div>`).join('');
  },

  removeAIImage(i) {
    this.state.aiPendingImages.splice(i, 1);
    this._renderAIImagePreview();
  }
});

// ===== MODALS & ACTIONS =====
Object.assign(App, {
  openCreateClass() {
    this.state.createClassStep = 1;
    this.state.createClassData = {};
    this._showModal(this._createClassModal());
  },

  _createClassModal() {
    const step = this.state.createClassStep;
    const d = this.state.createClassData;
    return `<div class="modal w-full max-w-lg">
      <div class="p-6 border-b border-white/5 flex justify-between items-center">
        <h2 class="text-lg font-semibold">Adicionar Sala</h2>
        <button class="btn btn-ghost" onclick="App.closeModal()">✕</button>
      </div>
      <div class="p-6">
        <div class="flex justify-center gap-2 mb-6">
          <div class="step-dot ${step >= 1 ? 'active' : ''}"></div>
          <div class="step-dot ${step >= 2 ? 'active' : ''}"></div>
        </div>
        ${step === 1 ? `
          <div class="space-y-4">
            <h3 class="font-medium">Informações da turma</h3>
            <div><label class="label">Nome da turma *</label><input class="input" id="cc-name" value="${d.name || ''}" placeholder="Ex: 8º Ano A"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="label">Série/Ano</label><input class="input" id="cc-grade" value="${d.grade || ''}" placeholder="8º Ano"></div>
              <div><label class="label">Disciplina</label><input class="input" id="cc-subject" value="${d.subject || ''}" placeholder="História"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="label">Turno</label><select class="input" id="cc-shift">
                <option ${d.shift==='Manhã'?'selected':''}>Manhã</option>
                <option ${d.shift==='Tarde'?'selected':''}>Tarde</option>
                <option ${d.shift==='Noite'?'selected':''}>Noite</option>
              </select></div>
              <div><label class="label">Ano letivo</label><input class="input" id="cc-year" value="${d.year || 2026}"></div>
            </div>
            <div><label class="label">Descrição (opcional)</label><textarea class="input" id="cc-desc" rows="2">${d.description || ''}</textarea></div>
            <button class="btn btn-primary w-full" onclick="App.createClassNext()">Continuar →</button>
          </div>
        ` : `
          <div class="space-y-4">
            <h3 class="font-medium">Como é a sua sala?</h3>
            <div class="grid grid-cols-2 gap-3">
              ${['rectangular','square','lab','auditorium'].map(t => {
                const labels = { rectangular: 'Retangular', square: 'Quadrada', lab: 'Laboratório', auditorium: 'Auditório' };
                return `<button class="card p-4 text-center text-sm hover:border-blue-500 ${d.roomType===t?'border-blue-500':''}"
                  onclick="App.state.createClassData.roomType='${t}';App._showModal(App._createClassModal())">${labels[t]}</button>`;
              }).join('')}
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="label">Fileiras</label><input type="number" class="input" id="cc-rows" value="${d.rows || 5}" min="2" max="12"></div>
              <div><label class="label">Carteiras por fileira</label><input type="number" class="input" id="cc-cols" value="${d.cols || 6}" min="2" max="10"></div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary flex-1" onclick="App.state.createClassStep=1;App._showModal(App._createClassModal())">← Voltar</button>
              <button class="btn btn-primary flex-1" onclick="App.finishCreateClass()">Criar sala</button>
            </div>
          </div>
        `}
      </div>
    </div>`;
  },

  createClassNext() {
    this.state.createClassData = {
      name: document.getElementById('cc-name').value.trim() || 'Nova Turma',
      grade: document.getElementById('cc-grade').value.trim(),
      subject: document.getElementById('cc-subject').value.trim(),
      shift: document.getElementById('cc-shift').value,
      year: parseInt(document.getElementById('cc-year').value) || 2026,
      description: document.getElementById('cc-desc').value.trim()
    };
    this.state.createClassStep = 2;
    this._showModal(this._createClassModal());
  },

  finishCreateClass() {
    const d = this.state.createClassData;
    d.rows = parseInt(document.getElementById('cc-rows')?.value) || 5;
    d.cols = parseInt(document.getElementById('cc-cols')?.value) || 6;
    d.roomType = d.roomType || 'rectangular';
    const cls = Storage.createClass(d);
    this.closeModal();
    this.toast('Sala criada!');
    this.navigate('class', cls.id);
  },

  openAddStudent(classId) {
    this._showModal(`<div class="modal w-full max-w-md">
      <div class="p-6 border-b border-white/5 flex justify-between"><h2 class="text-lg font-semibold">Adicionar Aluno</h2>
        <button class="btn btn-ghost" onclick="App.closeModal()">✕</button></div>
      <div class="p-6 space-y-4">
        <div><label class="label">Nome completo *</label><input class="input" id="as-name" placeholder="Nome do aluno"></div>
        <div><label class="label">Número de chamada</label><input type="number" class="input" id="as-number" placeholder="Ex: 14"></div>
        <button class="btn btn-primary w-full" onclick="App.saveStudent('${classId}')">Salvar</button>
      </div></div>`);
  },

  saveStudent(classId) {
    const name = document.getElementById('as-name').value.trim();
    if (!name) return alert('Nome é obrigatório');
    const number = parseInt(document.getElementById('as-number').value) || null;
    Storage.addStudent({ classId, name, number });
    this.closeModal(); this.toast('Aluno adicionado'); this.renderView();
  },

  deleteStudent(id) {
    if (!confirm('Remover este aluno?')) return;
    Storage.deleteStudent(id); this.toast('Aluno removido'); this.renderView();
  },

  deleteClass(id) {
    if (!confirm('Excluir esta turma e todos os dados relacionados?')) return;
    Storage.deleteClass(id); this.toast('Turma excluída'); this.navigate('classes');
  },

  openAddGrade(classId) {
    const students = Storage.getStudents(classId);
    this._showModal(`<div class="modal w-full max-w-md">
      <div class="p-6 border-b border-white/5 flex justify-between"><h2 class="text-lg font-semibold">Lançar Nota</h2>
        <button class="btn btn-ghost" onclick="App.closeModal()">✕</button></div>
      <div class="p-6 space-y-4">
        <div><label class="label">Aluno</label><select class="input" id="ag-student">
          ${students.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
        <div><label class="label">Tipo</label><select class="input" id="ag-type">
          <option value="prova">Prova</option><option value="trabalho">Trabalho</option><option value="atividade">Atividade</option></select></div>
        <div><label class="label">Nota (0-10)</label><input type="number" class="input" id="ag-value" min="0" max="10" step="0.1" placeholder="8.5"></div>
        <div><label class="label">Nome da avaliação</label><input class="input" id="ag-name" placeholder="Ex: Prova 1"></div>
        <button class="btn btn-primary w-full" onclick="App.saveGrade('${classId}')">Salvar</button>
      </div></div>`);
  },

  saveGrade(classId) {
    const studentId = document.getElementById('ag-student').value;
    const type = document.getElementById('ag-type').value;
    const value = parseFloat(document.getElementById('ag-value').value);
    const name = document.getElementById('ag-name').value.trim() || type;
    if (isNaN(value)) return alert('Nota inválida');
    Storage.setGrade({ classId, studentId, type, value, name });
    this.closeModal(); this.toast('Nota lançada'); this.renderView();
  },

  openCreateActivity(classId) {
    const classes = Storage.getClasses();
    this._showModal(`<div class="modal w-full max-w-lg">
      <div class="p-6 border-b border-white/5 flex justify-between"><h2 class="text-lg font-semibold">Criar Atividade</h2>
        <button class="btn btn-ghost" onclick="App.closeModal()">✕</button></div>
      <div class="p-6 space-y-4" id="ca-form">
        <div><label class="label">Turma</label><select class="input" id="ca-class">
          ${classes.map(c => `<option value="${c.id}" ${c.id===classId?'selected':''}>${c.name}</option>`).join('')}</select></div>
        <div><label class="label">Assunto / tema *</label>
          <input class="input" id="ca-title" placeholder="Ex: moda, mediana e média"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Nº de questões</label>
            <input type="number" class="input" id="ca-num" value="10" min="1" max="30"></div>
          <div><label class="label">Tipo</label><select class="input" id="ca-type">
            <option>Múltipla escolha</option>
            <option>Dissertativa</option>
            <option>Verdadeiro ou falso</option>
            <option>Mista</option>
          </select></div>
        </div>
        <div><label class="label">Instruções extras (opcional)</label>
          <textarea class="input" id="ca-extra" rows="2" placeholder="Ex: nível 8º ano, com gabarito"></textarea></div>
        <button class="btn btn-primary w-full" id="ca-btn" onclick="App.generateActivity()">✨ Gerar com IA</button>
      </div>
      <div class="p-8 hidden text-center" id="ca-loading">
        <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="font-medium">Carregando...</p>
        <p class="text-sm text-gray-400 mt-2">O Plusck está elaborando as questões. Isso pode levar alguns segundos.</p>
      </div>
    </div>`);
  },

  async generateActivity() {
    const classId = document.getElementById('ca-class').value;
    const title = document.getElementById('ca-title').value.trim();
    if (!title) { alert('Informe o assunto da atividade.'); return; }
    const num = parseInt(document.getElementById('ca-num').value) || 10;
    const type = document.getElementById('ca-type').value;
    const extra = (document.getElementById('ca-extra')?.value || '').trim();
    const cls = Storage.getClass(classId);

    document.getElementById('ca-form')?.classList.add('hidden');
    document.getElementById('ca-loading')?.classList.remove('hidden');

    const prompt = `Crie EXATAMENTE ${num} questões do tipo "${type}" sobre o assunto: "${title}".
${extra ? 'Instruções do professor: ' + extra : ''}
Turma: ${cls?.name || ''} — ${cls?.grade || ''} — ${cls?.subject || ''}.

REGRAS OBRIGATÓRIAS:
1) Numere as questões de 1 a ${num}.
2) Cada questão deve ser completa e utilizável em sala.
3) Se for múltipla escolha, use alternativas A) B) C) D).
4) Ao final, inclua uma seção GABARITO com as respostas.
5) Responda só com as questões e o gabarito, em português do Brasil.
6) Foque estritamente no tema "${title}".`;

    try {
      const res = await ProfessorAI.respond(prompt, {
        classId, classData: cls, students: [], map: null, grades: [], lessons: []
      });
      const content = res.text || '';
      const questions = App._parseQuestions(content, num);
      const a = Storage.createAssignment({
        classId,
        title,
        type,
        content,
        questions,
        status: 'ready',
        questionCount: questions.length || num
      });
      this.closeModal();
      this.toast('Atividade gerada com ' + (questions.length || num) + ' questões!');
      this.openAssignmentDetail(a.id);
    } catch (e) {
      document.getElementById('ca-loading')?.classList.add('hidden');
      document.getElementById('ca-form')?.classList.remove('hidden');
      alert('Erro ao gerar: ' + (e.message || e));
    }
  },

  _parseQuestions(text, expected) {
    if (!text) return [];
    const parts = text.split(/\n(?=\s*\d+[\).\-\:]|\s*Quest[aã]o\s*\d+)/i);
    const questions = [];
    for (const part of parts) {
      const t = part.trim();
      if (!t || t.length < 10) continue;
      if (/^gabarito/i.test(t)) continue;
      questions.push(t);
    }
    if (questions.length < 2) {
      // fallback: split by double newlines
      return text.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 15 && !/^gabarito/i.test(s));
    }
    return questions;
  },

  openAssignmentDetail(id) {
    const data = Storage.get();
    const a = data.assignments.find(x => x.id === id);
    if (!a) { alert('Atividade não encontrada'); return; }
    const questions = a.questions && a.questions.length
      ? a.questions
      : this._parseQuestions(a.content || '', a.questionCount || 10);
    const qHtml = questions.length
      ? questions.map((q, i) => `
          <div class="card p-4 mb-3">
            <div class="text-xs text-gray-500 mb-1">Questão ${i + 1}</div>
            <div class="text-sm whitespace-pre-wrap leading-relaxed">${String(q).replace(/</g, '&lt;')}</div>
          </div>`).join('')
      : `<div class="text-sm whitespace-pre-wrap text-gray-300">${(a.content || 'Sem conteúdo').replace(/</g, '&lt;')}</div>`;

    this._showModal(`<div class="modal w-full max-w-2xl max-h-[90vh] flex flex-col">
      <div class="p-5 border-b border-white/5 flex justify-between items-start gap-3">
        <div>
          <h2 class="text-lg font-semibold">${a.title}</h2>
          <p class="text-xs text-gray-500 mt-1">${a.type || ''} • ${questions.length || 0} questões</p>
        </div>
        <button class="btn btn-ghost" onclick="App.closeModal()">✕</button>
      </div>
      <div class="p-5 overflow-y-auto flex-1">${qHtml}</div>
      <div class="p-4 border-t border-white/5 flex gap-2 justify-end">
        <button class="btn btn-secondary text-sm" onclick="App.copyAssignmentText('${a.id}')">Copiar texto</button>
        <button class="btn btn-primary text-sm" onclick="App.closeModal()">Fechar</button>
      </div>
    </div>`);
  },

  openCreateLesson(classId) {
    const classes = Storage.getClasses();
    this._showModal(`<div class="modal w-full max-w-lg">
      <div class="p-6 border-b border-white/5 flex justify-between"><h2 class="text-lg font-semibold">Planejar Aula</h2>
        <button class="btn btn-ghost" onclick="App.closeModal()">✕</button></div>
      <div class="p-6 space-y-4" id="cl-form">
        <div><label class="label">Turma</label><select class="input" id="cl-class">
          ${classes.map(c => `<option value="${c.id}" ${c.id===classId?'selected':''}>${c.name}</option>`).join('')}</select></div>
        <div><label class="label">Tema da aula *</label>
          <input class="input" id="cl-theme" placeholder="Ex: Guerra Fria"></div>
        <div><label class="label">Duração (min)</label>
          <input type="number" class="input" id="cl-duration" value="50"></div>
        <button class="btn btn-primary w-full" onclick="App.generateLesson()">✨ Gerar plano com IA</button>
      </div>
      <div class="p-8 hidden text-center" id="cl-loading">
        <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="font-medium">Carregando...</p>
        <p class="text-sm text-gray-400 mt-2">O Plusck está montando o plano de aula.</p>
      </div>
    </div>`);
  },

  async generateLesson() {
    const classId = document.getElementById('cl-class').value;
    const theme = document.getElementById('cl-theme').value.trim();
    if (!theme) { alert('Informe o tema da aula.'); return; }
    const duration = document.getElementById('cl-duration').value || 50;
    const cls = Storage.getClass(classId);

    document.getElementById('cl-form')?.classList.add('hidden');
    document.getElementById('cl-loading')?.classList.remove('hidden');

    const prompt = `Crie um plano de aula completo de ${duration} minutos sobre "${theme}" para ${cls?.grade || 'a série'} (${cls?.subject || 'a disciplina'}).
Inclua: objetivo, materiais, etapas com tempo (introdução, desenvolvimento, atividade, fechamento) e avaliação rápida.
Responda em português, de forma clara e pronta para usar.`;

    try {
      const res = await ProfessorAI.respond(prompt, {
        classId, classData: cls, students: [], map: null, grades: [], lessons: []
      });
      const lesson = Storage.createLesson({
        classId,
        theme,
        title: theme,
        duration: parseInt(duration),
        content: res.text,
        objective: `Compreender os principais aspectos de ${theme}`
      });
      this.closeModal();
      this.toast('Plano de aula criado!');
      this.openLessonDetail(lesson.id);
    } catch (e) {
      document.getElementById('cl-loading')?.classList.add('hidden');
      document.getElementById('cl-form')?.classList.remove('hidden');
      alert('Erro ao gerar: ' + (e.message || e));
    }
  },

  openLessonDetail(id) {
    const data = Storage.get();
    const l = data.lessons.find(x => x.id === id);
    if (!l) { alert('Plano não encontrado'); return; }
    this._showModal(`<div class="modal w-full max-w-2xl max-h-[90vh] flex flex-col">
      <div class="p-5 border-b border-white/5 flex justify-between items-start gap-3">
        <div>
          <h2 class="text-lg font-semibold">${l.theme || l.title}</h2>
          <p class="text-xs text-gray-500 mt-1">${l.duration || 50} min • ${Models.formatDate(l.createdAt)}</p>
        </div>
        <button class="btn btn-ghost" onclick="App.closeModal()">✕</button>
      </div>
      <div class="p-5 overflow-y-auto flex-1 text-sm whitespace-pre-wrap leading-relaxed text-gray-200">${(l.content || l.objective || 'Sem conteúdo').replace(/</g, '&lt;')}</div>
      <div class="p-4 border-t border-white/5 flex justify-end">
        <button class="btn btn-primary text-sm" onclick="App.closeModal()">Fechar</button>
      </div>
    </div>`);
  },

  openCreateAnnouncement() {
    this._showModal(`<div class="modal w-full max-w-md">
      <div class="p-6 border-b border-white/5 flex justify-between"><h2 class="text-lg font-semibold">Novo Comunicado</h2>
        <button class="btn btn-ghost" onclick="App.closeModal()">✕</button></div>
      <div class="p-6 space-y-4">
        <div><label class="label">Título</label><input class="input" id="ann-title" placeholder="Ex: Prova de História"></div>
        <div><label class="label">Conteúdo</label><textarea class="input" id="ann-content" rows="4" placeholder="Mensagem..."></textarea></div>
        <button class="btn btn-primary w-full" onclick="App.saveAnnouncement()">Publicar</button>
      </div></div>`);
  },

  saveAnnouncement() {
    const title = document.getElementById('ann-title').value.trim();
    const content = document.getElementById('ann-content').value.trim();
    if (!title || !content) return alert('Preencha título e conteúdo');
    Storage.createAnnouncement({ title, content });
    this.closeModal(); this.toast('Comunicado criado'); this.renderView();
  },

  _showModal(html) {
    document.getElementById('modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = html;
    overlay.addEventListener('click', e => { if (e.target === overlay) this.closeModal(); });
    document.body.appendChild(overlay);
  },

  closeModal() { document.getElementById('modal-overlay')?.remove(); }
});

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
