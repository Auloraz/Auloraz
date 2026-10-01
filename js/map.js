/**
 * Aulora - Interactive Classroom Map Engine
 * Drag-and-drop desks and students, zoom, pan, status indicators.
 */

const ClassroomMap = {
  container: null,
  mapData: null,
  classId: null,
  students: [],
  attendance: {},
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  isPanning: false,
  startPan: { x: 0, y: 0 },
  selectedDeskId: null,
  onUpdate: null,
  mode: 'edit', // edit | attendance | view

  init(containerEl, classId, options = {}) {
    this.container = containerEl;
    this.classId = classId;
    this.onUpdate = options.onUpdate || null;
    this.mode = options.mode || 'edit';
    this.students = Storage.getStudents(classId);
    this.mapData = Storage.getMap(classId);
    if (!this.mapData) {
      this.container.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Nenhum mapa configurado</div>';
      return;
    }

    const today = Models.today();
    const att = Storage.getAttendance(classId, today);
    this.attendance = {};
    if (att && att.records) {
      att.records.forEach(r => { this.attendance[r.studentId] = r.status; });
    }

    this.render();
    this._bindEvents();
  },

  render() {
    if (!this.container || !this.mapData) return;

    const { width, height, desks, elements } = this.mapData;

    this.container.innerHTML = `
      <div class="map-viewport relative w-full h-full overflow-hidden bg-[#0c0c12] rounded-xl border border-white/5"
           style="touch-action: none;">
        <div class="map-canvas absolute origin-top-left"
             style="width:${width}px;height:${height}px;transform:scale(${this.scale}) translate(${this.offsetX}px,${this.offsetY}px);">
          <!-- Grid background -->
          <div class="absolute inset-0 opacity-20"
               style="background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
                      background-size: 40px 40px;"></div>
          
          <!-- Elements (board, door, windows, teacher desk) -->
          ${(elements || []).map(el => this._renderElement(el)).join('')}
          
          <!-- Desks -->
          ${desks.map(d => this._renderDesk(d)).join('')}
        </div>
        
        <!-- Controls -->
        <div class="absolute bottom-4 right-4 flex gap-2 z-30">
          <button class="btn btn-secondary text-xs px-3 py-1.5" onclick="ClassroomMap.zoomIn()" title="Zoom +">+</button>
          <button class="btn btn-secondary text-xs px-3 py-1.5" onclick="ClassroomMap.zoomOut()" title="Zoom -">−</button>
          <button class="btn btn-secondary text-xs px-3 py-1.5" onclick="ClassroomMap.resetView()" title="Resetar vista">↺</button>
        </div>
        
        <div class="absolute top-3 left-3 text-xs text-gray-500 z-30 bg-dark-900/80 px-2 py-1 rounded">
          Arraste o NOME do aluno para outra carteira = troca • Arraste a carteira para mover • Lista à direita
        </div>
      </div>
    `;

    this._makeDesksDraggable();
  },

  _renderElement(el) {
    const cls = {
      board: 'element-board',
      door: 'element-door',
      window: 'element-window',
      teacher: 'element-teacher'
    }[el.type] || 'classroom-element';

    return `<div class="classroom-element ${cls}"
                 style="left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;">
              ${el.label || ''}
            </div>`;
  },

  _renderDesk(desk) {
    const student = desk.studentId ? this.students.find(s => s.id === desk.studentId) : null;
    const status = student ? (this.attendance[student.id] || 'none') : 'none';
    const statusClass = {
      present: 'status-present',
      absent: 'status-absent',
      late: 'status-late',
      justified: 'status-justified',
      none: 'status-none'
    }[status];

    const selected = this.selectedDeskId === desk.id ? 'selected' : '';
    const empty = !student ? 'empty' : '';

    return `
      <div class="desk ${empty} ${selected}" 
           data-desk-id="${desk.id}"
           data-student-id="${desk.studentId || ''}"
           style="left:${desk.x}px;top:${desk.y}px;width:${desk.width || 90}px;height:${desk.height || 70}px;
                  transform:rotate(${desk.rotation || 0}deg);">
        ${this.mode === 'attendance' && student ? `<div class="status-dot ${statusClass}"></div>` : ''}
        <div class="student-name" ${student ? `draggable="true" data-drag-student="${student.id}" title="Arraste para outra carteira para trocar"` : ''}>${student ? this._shortName(student.name) : '—'}</div>
        <div class="desk-label">${desk.label || ''}</div>
      </div>
    `;
  },

  _shortName(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 10);
    return (parts[0] + ' ' + (parts[parts.length - 1][0] || '') + '.').slice(0, 12);
  },

  _makeDesksDraggable() {
    const desks = this.container.querySelectorAll('.desk');
    desks.forEach(el => {
      let startX, startY, origX, origY, moved = false;

      const onStart = (clientX, clientY) => {
        const deskId = el.dataset.deskId;
        this.selectedDeskId = deskId;
        el.classList.add('dragging');
        startX = clientX;
        startY = clientY;
        const desk = this.mapData.desks.find(d => d.id === deskId);
        origX = desk.x;
        origY = desk.y;
        moved = false;

        // Click to select / open student assign
        this._onDeskClick(deskId);
      };

      const onMove = (clientX, clientY) => {
        const dx = (clientX - startX) / this.scale;
        const dy = (clientY - startY) / this.scale;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        const desk = this.mapData.desks.find(d => d.id === el.dataset.deskId);
        if (desk) {
          desk.x = Math.round(origX + dx);
          desk.y = Math.round(origY + dy);
          el.style.left = desk.x + 'px';
          el.style.top = desk.y + 'px';
        }
      };

      const onEnd = () => {
        el.classList.remove('dragging');
        if (moved) {
          Storage.updateMap(this.classId, this.mapData);
          if (this.onUpdate) this.onUpdate();
        }
      };

      // Mouse
      el.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        onStart(e.clientX, e.clientY);
        const move = ev => onMove(ev.clientX, ev.clientY);
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          onEnd();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });

      // Touch
      el.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        const t = e.touches[0];
        onStart(t.clientX, t.clientY);
        const move = ev => {
          if (ev.touches.length) onMove(ev.touches[0].clientX, ev.touches[0].clientY);
        };
        const end = () => {
          document.removeEventListener('touchmove', move);
          document.removeEventListener('touchend', end);
          onEnd();
        };
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', end);
      }, { passive: false });
    });

    // Arrastar NOME do aluno (ícone) → soltar em outra carteira = troca ou move
    // (arrastar a carteira inteira continua movendo a posição no mapa)
    this.container.querySelectorAll('.student-name[draggable="true"]').forEach(nameEl => {
      nameEl.addEventListener('dragstart', e => {
        const sid = nameEl.getAttribute('data-drag-student');
        if (!sid) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/student-id', sid);
        e.dataTransfer.effectAllowed = 'move';
        nameEl.closest('.desk')?.classList.add('dragging');
        e.stopPropagation();
      });
      nameEl.addEventListener('dragend', e => {
        nameEl.closest('.desk')?.classList.remove('dragging');
      });
      // Impede que mousedown no nome inicie o drag de posição da carteira
      nameEl.addEventListener('mousedown', e => e.stopPropagation());
    });

    desks.forEach(el => {
      el.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('drag-over');
        const studentId = e.dataTransfer.getData('text/student-id');
        const targetDeskId = el.dataset.deskId;
        if (!studentId || !targetDeskId) return;

        const result = Storage.assignStudentToDesk(this.classId, targetDeskId, studentId);
        this.students = Storage.getStudents(this.classId);
        this.mapData = Storage.getMap(this.classId);
        this.render();
        if (this.onUpdate) this.onUpdate();
        if (window.App && App.toast) {
          App.toast(result && result.swapped ? '✓ Alunos trocados de lugar' : '✓ Aluno na carteira');
        }
      });
    });
  },

  _onDeskClick(deskId) {
    this.selectedDeskId = deskId;
    // Highlight will be applied on next render if needed
    const desk = this.mapData.desks.find(d => d.id === deskId);
    if (window.onDeskSelected) window.onDeskSelected(desk);
  },

  zoomIn() {
    this.scale = Math.min(1.8, this.scale + 0.15);
    this.render();
  },

  zoomOut() {
    this.scale = Math.max(0.5, this.scale - 0.15);
    this.render();
  },

  resetView() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.render();
  },

  applyLayout(presetKey) {
    const layout = Models.layoutPresets[presetKey];
    if (!layout || !this.mapData) return;
    const oldStudents = this.mapData.desks.filter(d => d.studentId).map(d => d.studentId);
    const newDesks = layout.apply(this.mapData, this.mapData.desks.length || 24);
    oldStudents.forEach((sid, i) => {
      if (newDesks[i]) newDesks[i].studentId = sid;
    });
    this.mapData.desks = newDesks;
    Storage.updateMap(this.classId, this.mapData);
    this.render();
    if (this.onUpdate) this.onUpdate();
  },

  setAttendanceMode(enabled) {
    this.mode = enabled ? 'attendance' : 'edit';
    this.render();
  },

  setStudentStatus(studentId, status) {
    this.attendance[studentId] = status;
    const today = Models.today();
    const records = this.students.map(s => ({
      studentId: s.id,
      status: this.attendance[s.id] || 'none'
    }));
    Storage.setAttendance(this.classId, today, records);
    this.render();
  },

  refresh() {
    this.students = Storage.getStudents(this.classId);
    this.mapData = Storage.getMap(this.classId);
    this.render();
  },

  _bindEvents() {
    // Simple pan with middle mouse or space+drag could be added later
  }
};
