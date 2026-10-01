/**
 * Aulora - Local Storage Persistence Layer
 * All data is persisted automatically in localStorage.
 */

const STORAGE_KEY = 'professor_hub_v1';

const defaultData = {
  version: 1,
  currentUser: null,
  users: [],
  classes: [],
  students: [],
  desks: [],
  maps: [],
  attendance: [],
  grades: [],
  assignments: [],
  lessons: [],
  announcements: [],
  aiConversations: [],
  settings: {
    onboardingComplete: false,
    theme: 'dark',
    year: new Date().getFullYear()
  }
};

const Storage = {
  _data: null,
  _saveTimeout: null,

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this._data = JSON.parse(raw);
        // Migration / ensure structure
        Object.keys(defaultData).forEach(k => {
          if (this._data[k] === undefined) this._data[k] = defaultData[k];
        });
      } else {
        this._data = JSON.parse(JSON.stringify(defaultData));
      }
    } catch (e) {
      console.error('Storage load error', e);
      this._data = JSON.parse(JSON.stringify(defaultData));
    }
    return this._data;
  },

  get() {
    if (!this._data) this.load();
    return this._data;
  },

  save(showIndicator = true) {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
        if (showIndicator && window.showSaved) window.showSaved();
      } catch (e) {
        console.error('Storage save error', e);
      }
    }, 300);
  },

  // Helpers
  generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  },

  // ——— Segurança local ———
  // Senhas NUNCA em texto puro: SHA-256 + salt (Web Crypto).
  // E-mail fica no localStorage (necessário para login neste PC).
  // Em produção real use backend (bcrypt/argon2 + HTTPS + JWT).

  async _sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  _randomSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async _hashPassword(password, salt) {
    // salt + password (ordem fixa)
    return this._sha256Hex(salt + '|' + password);
  },

  async _verifyPassword(user, password) {
    if (!user) return false;
    // Conta nova (hash)
    if (user.passwordHash && user.salt) {
      const h = await this._hashPassword(password, user.salt);
      return h === user.passwordHash;
    }
    // Migração: senha antiga em texto puro → compara e reescreve como hash
    if (user.password && user.password === password) {
      const salt = this._randomSalt();
      user.salt = salt;
      user.passwordHash = await this._hashPassword(password, salt);
      delete user.password;
      this.save(false);
      return true;
    }
    return false;
  },

  // Users — banco local (localStorage). Cada navegador/PC só vê a própria conta.
  async registerUser(userData) {
    const data = this.get();
    const email = (userData.email || '').trim().toLowerCase();
    const name = (userData.name || '').trim();
    const username = (userData.username || name || '').trim();
    const password = userData.password || '';

    if (!name || !email || !password) {
      return { error: 'Preencha nome, e-mail e senha.' };
    }
    if (password.length < 6) {
      return { error: 'A senha precisa ter no mínimo 6 caracteres.' };
    }
    if (!email.includes('@')) {
      return { error: 'Informe um e-mail válido (ex: seu@gmail.com).' };
    }
    if (data.users.find(u => u.email === email)) {
      return { error: 'Este e-mail já está cadastrado neste dispositivo.' };
    }

    const salt = this._randomSalt();
    const passwordHash = await this._hashPassword(password, salt);
    // Dica de recuperação também hasheada (não fica legível)
    let recoveryHintHash = '';
    const hint = (userData.recoveryHint || '').trim();
    if (hint) {
      recoveryHintHash = await this._sha256Hex('hint|' + email + '|' + hint.toLowerCase());
    }

    const user = {
      id: this.generateId('user'),
      name,
      username: username || name.split(' ')[0],
      email,
      salt,
      passwordHash,
      recoveryHintHash,
      hasRecoveryHint: !!hint,
      subjects: userData.subjects || [],
      createdAt: new Date().toISOString()
    };
    data.users.push(user);
    data.currentUser = { id: user.id, name: user.name, email: user.email, username: user.username };
    this.save();
    return { user: data.currentUser };
  },

  async login(email, password) {
    const data = this.get();
    const emailNorm = (email || '').trim().toLowerCase();
    const user = data.users.find(u => u.email === emailNorm);
    if (!user) return { error: 'E-mail ou senha incorretos.' };
    const ok = await this._verifyPassword(user, password);
    if (!ok) return { error: 'E-mail ou senha incorretos.' };
    data.currentUser = { id: user.id, name: user.name, email: user.email, username: user.username };
    this.save();
    return { user: data.currentUser };
  },

  /** Recuperação local: e-mail + dica (comparada por hash). */
  async recoverPassword(email, recoveryHint, newPassword) {
    const data = this.get();
    const emailNorm = (email || '').trim().toLowerCase();
    const user = data.users.find(u => u.email === emailNorm);
    if (!user) return { error: 'E-mail não encontrado neste dispositivo.' };
    if (!user.recoveryHintHash && !user.recoveryHint) {
      return { error: 'Esta conta não tem dica de recuperação. Crie uma nova conta ou redefina os dados do app.' };
    }
    const hint = (recoveryHint || '').trim().toLowerCase();
    let hintOk = false;
    if (user.recoveryHintHash) {
      const h = await this._sha256Hex('hint|' + emailNorm + '|' + hint);
      hintOk = h === user.recoveryHintHash;
    } else if (user.recoveryHint) {
      hintOk = hint === String(user.recoveryHint).toLowerCase();
    }
    if (!hintOk) return { error: 'Dica de recuperação incorreta.' };
    if (!newPassword || newPassword.length < 6) {
      return { error: 'A nova senha precisa ter no mínimo 6 caracteres.' };
    }
    const salt = this._randomSalt();
    user.salt = salt;
    user.passwordHash = await this._hashPassword(newPassword, salt);
    delete user.password;
    // Migra dica antiga em texto para hash
    if (user.recoveryHint) {
      user.recoveryHintHash = await this._sha256Hex('hint|' + emailNorm + '|' + String(user.recoveryHint).toLowerCase());
      delete user.recoveryHint;
      user.hasRecoveryHint = true;
    }
    this.save(false);
    return { ok: true, message: 'Senha alterada com sucesso. Faça login com a nova senha.' };
  },

  logout() {
    const data = this.get();
    data.currentUser = null;
    this.save(false);
  },

  getCurrentUser() {
    return this.get().currentUser;
  },

  // Credenciais salvas só neste PC/navegador (nunca compartilhadas)
  getRememberedCredentials() {
    try {
      const raw = localStorage.getItem('professor_hub_remember');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  setRememberedCredentials(email, _passwordIgnored) {
    // Segurança: salva só o e-mail. Senha NUNCA no "lembrar neste PC".
    try {
      localStorage.setItem('professor_hub_remember', JSON.stringify({
        email: (email || '').trim().toLowerCase()
      }));
    } catch (e) {
      console.error(e);
    }
  },

  clearRememberedCredentials() {
    localStorage.removeItem('professor_hub_remember');
  },

  // Gemini / IA settings (chave só neste navegador)
  // Chave ofuscada no código (não é segurança total em app client-side, só evita texto puro)
  _kSeed() {
    try {
      const s = 'QVEuQWI4Uk42S0l2LUZSMGhJQnFtYTFPcU5jTklBbUFWNUFfOVRTZDg4MmV1TVV2bW5aMlE=';
      return atob(s);
    } catch (e) { return ''; }
  },

  getAISettings() {
    try {
      const raw = localStorage.getItem('professor_hub_ai');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.apiKey) return parsed;
      }
    } catch (e) {}
    const seed = this._kSeed();
    return {
      apiKey: seed,
      model: 'gemini-3.5-flash',
      provider: 'gemini',
      enabled: !!seed
    };
  },

  setAISettings(settings) {
    const current = this.getAISettings();
    const next = { ...current, ...settings };
    // Se apiKey vier vazio no formulário, mantém a atual
    if (settings && Object.prototype.hasOwnProperty.call(settings, 'apiKey') && !String(settings.apiKey || '').trim()) {
      next.apiKey = current.apiKey;
    }
    next.enabled = !!(next.apiKey && String(next.apiKey).trim());
    try {
      localStorage.setItem('professor_hub_ai', JSON.stringify(next));
    } catch (e) {
      console.error(e);
    }
    return next;
  },

  maskApiKey(key) {
    if (!key || key.length < 8) return '••••••••';
    return '••••••••••••' + key.slice(-4);
  },

  // Classes (Salas / Turmas)
  createClass(classData) {
    const data = this.get();
    const user = data.currentUser;
    if (!user) return null;

    const cls = {
      id: this.generateId('class'),
      teacherId: user.id,
      name: classData.name,
      grade: classData.grade || '',
      subject: classData.subject || '',
      shift: classData.shift || 'Manhã',
      year: classData.year || new Date().getFullYear(),
      description: classData.description || '',
      roomType: classData.roomType || 'rectangular',
      rows: classData.rows || 5,
      cols: classData.cols || 6,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.classes.push(cls);

    // Create default map
    const map = this._createDefaultMap(cls);
    data.maps.push(map);

    this.save();
    return cls;
  },

  _createDefaultMap(cls) {
    const desks = [];
    const startX = 80;
    const startY = 100;
    const gapX = 110;
    const gapY = 90;

    for (let r = 0; r < cls.rows; r++) {
      for (let c = 0; c < cls.cols; c++) {
        desks.push({
          id: this.generateId('desk'),
          classId: cls.id,
          row: r + 1,
          col: c + 1,
          label: `Fila ${r + 1} — Mesa ${c + 1}`,
          x: startX + c * gapX,
          y: startY + r * gapY,
          width: 90,
          height: 70,
          rotation: 0,
          studentId: null,
          type: 'single'
        });
      }
    }

    return {
      id: this.generateId('map'),
      classId: cls.id,
      name: 'Mapa Principal',
      type: 'normal',
      width: 900,
      height: 600,
      desks,
      elements: [
        { id: 'board', type: 'board', label: 'QUADRO', x: 200, y: 20, width: 500, height: 40 },
        { id: 'teacher', type: 'teacher', label: 'Mesa do Professor', x: 380, y: 520, width: 140, height: 50 },
        { id: 'door', type: 'door', label: 'PORTA', x: 20, y: 280, width: 40, height: 80 },
        { id: 'window1', type: 'window', label: 'JANELA', x: 850, y: 100, width: 30, height: 100 },
        { id: 'window2', type: 'window', label: 'JANELA', x: 850, y: 250, width: 30, height: 100 }
      ],
      updatedAt: new Date().toISOString()
    };
  },

  getClasses() {
    const data = this.get();
    const user = data.currentUser;
    if (!user) return [];
    return data.classes.filter(c => c.teacherId === user.id);
  },

  getClass(id) {
    return this.getClasses().find(c => c.id === id) || null;
  },

  updateClass(id, updates) {
    const data = this.get();
    const idx = data.classes.findIndex(c => c.id === id);
    if (idx === -1) return null;
    data.classes[idx] = { ...data.classes[idx], ...updates, updatedAt: new Date().toISOString() };
    this.save();
    return data.classes[idx];
  },

  deleteClass(id) {
    const data = this.get();
    data.classes = data.classes.filter(c => c.id !== id);
    data.students = data.students.filter(s => s.classId !== id);
    data.maps = data.maps.filter(m => m.classId !== id);
    data.attendance = data.attendance.filter(a => a.classId !== id);
    data.grades = data.grades.filter(g => g.classId !== id);
    data.assignments = data.assignments.filter(a => a.classId !== id);
    data.lessons = data.lessons.filter(l => l.classId !== id);
    this.save();
  },

  // Students
  addStudent(studentData) {
    const data = this.get();
    const student = {
      id: this.generateId('stu'),
      classId: studentData.classId,
      name: studentData.name,
      number: studentData.number || null,
      photo: studentData.photo || null,
      notes: studentData.notes || '',
      createdAt: new Date().toISOString()
    };
    data.students.push(student);
    this.save();
    return student;
  },

  getStudents(classId) {
    return this.get().students.filter(s => s.classId === classId);
  },

  getStudent(id) {
    return this.get().students.find(s => s.id === id) || null;
  },

  updateStudent(id, updates) {
    const data = this.get();
    const idx = data.students.findIndex(s => s.id === id);
    if (idx === -1) return null;
    data.students[idx] = { ...data.students[idx], ...updates };
    this.save();
    return data.students[idx];
  },

  deleteStudent(id) {
    const data = this.get();
    data.students = data.students.filter(s => s.id !== id);
    // Unassign from desks
    data.maps.forEach(map => {
      map.desks.forEach(d => {
        if (d.studentId === id) d.studentId = null;
      });
    });
    this.save();
  },

  // Maps
  getMap(classId) {
    const data = this.get();
    return data.maps.find(m => m.classId === classId) || null;
  },

  updateMap(classId, mapData) {
    const data = this.get();
    const idx = data.maps.findIndex(m => m.classId === classId);
    if (idx === -1) return null;
    data.maps[idx] = { ...data.maps[idx], ...mapData, updatedAt: new Date().toISOString() };
    this.save();
    return data.maps[idx];
  },

  /**
   * Coloca aluno na carteira. Se a destino já tem alguém → TROCA (swap).
   * Se vazia → só move. Posições das carteiras não mudam, só os alunos.
   */
  assignStudentToDesk(classId, deskId, studentId) {
    const map = this.getMap(classId);
    if (!map || !studentId) return { swapped: false };

    const target = map.desks.find(d => d.id === deskId);
    if (!target) return { swapped: false };

    const source = map.desks.find(d => d.studentId === studentId);
    const occupantId = target.studentId;

    if (occupantId === studentId) return { swapped: false };

    if (occupantId && source) {
      // SWAP: A e B trocam de lugar
      source.studentId = occupantId;
      target.studentId = studentId;
      this.updateMap(classId, map);
      return { swapped: true, from: studentId, to: occupantId };
    }

    // Destino vazio: move o aluno
    map.desks.forEach(d => {
      if (d.studentId === studentId) d.studentId = null;
    });
    target.studentId = studentId;
    this.updateMap(classId, map);
    return { swapped: false };
  },

  /** Troca direta entre duas carteiras */
  swapDesks(classId, deskIdA, deskIdB) {
    const map = this.getMap(classId);
    if (!map) return false;
    const a = map.desks.find(d => d.id === deskIdA);
    const b = map.desks.find(d => d.id === deskIdB);
    if (!a || !b) return false;
    const tmp = a.studentId;
    a.studentId = b.studentId;
    b.studentId = tmp;
    this.updateMap(classId, map);
    return true;
  },

  // Attendance
  setAttendance(classId, date, records) {
    const data = this.get();
    const existing = data.attendance.findIndex(a => a.classId === classId && a.date === date);
    const entry = { classId, date, records, updatedAt: new Date().toISOString() };
    if (existing >= 0) {
      data.attendance[existing] = entry;
    } else {
      data.attendance.push(entry);
    }
    this.save();
  },

  getAttendance(classId, date) {
    return this.get().attendance.find(a => a.classId === classId && a.date === date) || null;
  },

  getAttendanceHistory(classId) {
    return this.get().attendance.filter(a => a.classId === classId);
  },

  // Grades
  setGrade(gradeData) {
    const data = this.get();
    const existing = data.grades.findIndex(g =>
      g.classId === gradeData.classId &&
      g.studentId === gradeData.studentId &&
      g.type === gradeData.type &&
      g.name === gradeData.name
    );
    if (existing >= 0) {
      data.grades[existing] = { ...data.grades[existing], ...gradeData, updatedAt: new Date().toISOString() };
    } else {
      data.grades.push({
        id: this.generateId('grade'),
        ...gradeData,
        createdAt: new Date().toISOString()
      });
    }
    this.save();
  },

  getGrades(classId) {
    return this.get().grades.filter(g => g.classId === classId);
  },

  // Assignments
  createAssignment(assignData) {
    const data = this.get();
    const a = {
      id: this.generateId('assign'),
      ...assignData,
      status: 'draft',
      createdAt: new Date().toISOString()
    };
    data.assignments.push(a);
    this.save();
    return a;
  },

  getAssignments(classId) {
    return this.get().assignments.filter(a => a.classId === classId);
  },

  updateAssignment(id, updates) {
    const data = this.get();
    const idx = data.assignments.findIndex(a => a.id === id);
    if (idx === -1) return null;
    data.assignments[idx] = { ...data.assignments[idx], ...updates };
    this.save();
    return data.assignments[idx];
  },

  // Lessons (Planejamento)
  createLesson(lessonData) {
    const data = this.get();
    const l = {
      id: this.generateId('lesson'),
      ...lessonData,
      createdAt: new Date().toISOString()
    };
    data.lessons.push(l);
    this.save();
    return l;
  },

  getLessons(classId) {
    return this.get().lessons.filter(l => l.classId === classId);
  },

  // Announcements
  createAnnouncement(annData) {
    const data = this.get();
    const a = {
      id: this.generateId('ann'),
      teacherId: data.currentUser?.id,
      ...annData,
      createdAt: new Date().toISOString()
    };
    data.announcements.push(a);
    this.save();
    return a;
  },

  getAnnouncements() {
    const data = this.get();
    const user = data.currentUser;
    if (!user) return [];
    return data.announcements.filter(a => a.teacherId === user.id);
  },

  // AI Conversations
  saveAIConversation(classId, messages) {
    const data = this.get();
    const existing = data.aiConversations.findIndex(c => c.classId === classId);
    const entry = { classId, messages, updatedAt: new Date().toISOString() };
    if (existing >= 0) {
      data.aiConversations[existing] = entry;
    } else {
      data.aiConversations.push(entry);
    }
    this.save(false);
  },

  getAIConversation(classId) {
    return this.get().aiConversations.find(c => c.classId === classId) || { messages: [] };
  },

  // Settings
  setOnboardingComplete() {
    const data = this.get();
    data.settings.onboardingComplete = true;
    this.save();
  },

  isOnboardingComplete() {
    return this.get().settings.onboardingComplete;
  },

  // Search
  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const results = [];
    const data = this.get();
    const user = data.currentUser;
    if (!user) return [];

    // Students
    data.students
      .filter(s => {
        const cls = data.classes.find(c => c.id === s.classId);
        return cls && cls.teacherId === user.id && s.name.toLowerCase().includes(q);
      })
      .forEach(s => {
        const cls = data.classes.find(c => c.id === s.classId);
        const map = data.maps.find(m => m.classId === s.classId);
        const desk = map?.desks.find(d => d.studentId === s.id);
        results.push({
          type: 'student',
          id: s.id,
          title: s.name,
          subtitle: `${cls?.name || ''} ${desk ? '• ' + desk.label : ''}`,
          classId: s.classId
        });
      });

    // Classes
    data.classes
      .filter(c => c.teacherId === user.id && (c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q)))
      .forEach(c => {
        results.push({
          type: 'class',
          id: c.id,
          title: c.name,
          subtitle: `${c.subject} • ${c.grade}`,
          classId: c.id
        });
      });

    // Assignments
    data.assignments
      .filter(a => {
        const cls = data.classes.find(c => c.id === a.classId);
        return cls && cls.teacherId === user.id && a.title?.toLowerCase().includes(q);
      })
      .forEach(a => {
        results.push({
          type: 'assignment',
          id: a.id,
          title: a.title,
          subtitle: a.classId,
          classId: a.classId
        });
      });

    return results.slice(0, 12);
  },

  // Reset for demo
  resetAll() {
    this._data = JSON.parse(JSON.stringify(defaultData));
    this.save(false);
  }
};

// Auto-load
Storage.load();
