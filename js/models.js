/**
 * Aulora - Helper models & utilities
 */

const Models = {
  // Room layout presets
  layoutPresets: {
    tradicional: {
      name: 'Tradicional',
      description: 'Carteiras em fileiras alinhadas',
      apply: (map, rows = 5, cols = 6) => {
        const desks = [];
        const startX = 80, startY = 100, gapX = 110, gapY = 90;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            desks.push({
              id: Storage.generateId('desk'),
              classId: map.classId,
              row: r + 1,
              col: c + 1,
              label: `Fila ${r + 1} — Mesa ${c + 1}`,
              x: startX + c * gapX,
              y: startY + r * gapY,
              width: 90, height: 70, rotation: 0, studentId: null, type: 'single'
            });
          }
        }
        return desks;
      }
    },
    duplas: {
      name: 'Duplas',
      description: 'Carteiras agrupadas de duas em duas',
      apply: (map, rows = 5, cols = 6) => {
        const desks = [];
        const startX = 60, startY = 100, gapX = 200, gapY = 90;
        let idx = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < Math.ceil(cols / 2); c++) {
            for (let p = 0; p < 2 && idx < rows * cols; p++) {
              desks.push({
                id: Storage.generateId('desk'),
                classId: map.classId,
                row: r + 1,
                col: c * 2 + p + 1,
                label: `Fila ${r + 1} — Mesa ${c * 2 + p + 1}`,
                x: startX + c * gapX + p * 95,
                y: startY + r * gapY,
                width: 90, height: 70, rotation: 0, studentId: null, type: 'pair'
              });
              idx++;
            }
          }
        }
        return desks;
      }
    },
    grupos: {
      name: 'Grupos',
      description: 'Mesas em grupos de 4',
      apply: (map, total = 24) => {
        const desks = [];
        const groups = Math.ceil(total / 4);
        const cols = 3;
        let idx = 0;
        for (let g = 0; g < groups; g++) {
          const gx = 80 + (g % cols) * 280;
          const gy = 90 + Math.floor(g / cols) * 180;
          const offsets = [[0,0],[100,0],[0,80],[100,80]];
          for (let i = 0; i < 4 && idx < total; i++) {
            desks.push({
              id: Storage.generateId('desk'),
              classId: map.classId,
              row: Math.floor(idx / 4) + 1,
              col: (idx % 4) + 1,
              label: `Grupo ${g + 1} — ${i + 1}`,
              x: gx + offsets[i][0],
              y: gy + offsets[i][1],
              width: 90, height: 70, rotation: 0, studentId: null, type: 'group'
            });
            idx++;
          }
        }
        return desks;
      }
    },
    u: {
      name: 'Formato U',
      description: 'Carteiras formando um U',
      apply: (map, count = 20) => {
        const desks = [];
        const cx = 450, cy = 280;
        // Left side
        for (let i = 0; i < 6; i++) {
          desks.push({
            id: Storage.generateId('desk'), classId: map.classId,
            row: i + 1, col: 1, label: `U-Esq ${i + 1}`,
            x: 80, y: 80 + i * 75, width: 90, height: 70, rotation: 90, studentId: null, type: 'u'
          });
        }
        // Bottom
        for (let i = 0; i < 6; i++) {
          desks.push({
            id: Storage.generateId('desk'), classId: map.classId,
            row: 7, col: i + 1, label: `U-Base ${i + 1}`,
            x: 180 + i * 110, y: 500, width: 90, height: 70, rotation: 0, studentId: null, type: 'u'
          });
        }
        // Right side
        for (let i = 0; i < 6; i++) {
          desks.push({
            id: Storage.generateId('desk'), classId: map.classId,
            row: i + 1, col: 8, label: `U-Dir ${i + 1}`,
            x: 820, y: 80 + i * 75, width: 90, height: 70, rotation: -90, studentId: null, type: 'u'
          });
        }
        return desks.slice(0, count);
      }
    },
    circulo: {
      name: 'Círculo',
      description: 'Carteiras em círculo',
      apply: (map, count = 16) => {
        const desks = [];
        const cx = 450, cy = 300, radius = 220;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          desks.push({
            id: Storage.generateId('desk'), classId: map.classId,
            row: 1, col: i + 1, label: `Círculo ${i + 1}`,
            x: cx + Math.cos(angle) * radius - 45,
            y: cy + Math.sin(angle) * radius - 35,
            width: 90, height: 70,
            rotation: (angle * 180 / Math.PI) + 90,
            studentId: null, type: 'circle'
          });
        }
        return desks;
      }
    },
    prova: {
      name: 'Prova',
      description: 'Carteiras mais espaçadas para avaliação',
      apply: (map, rows = 5, cols = 5) => {
        const desks = [];
        const startX = 100, startY = 100, gapX = 140, gapY = 110;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            desks.push({
              id: Storage.generateId('desk'), classId: map.classId,
              row: r + 1, col: c + 1, label: `Fila ${r + 1} — Mesa ${c + 1}`,
              x: startX + c * gapX, y: startY + r * gapY,
              width: 90, height: 70, rotation: 0, studentId: null, type: 'exam'
            });
          }
        }
        return desks;
      }
    },
    debate: {
      name: 'Debate',
      description: 'Dois lados enfrentados',
      apply: (map, count = 20) => {
        const desks = [];
        // Left team
        for (let i = 0; i < 10; i++) {
          desks.push({
            id: Storage.generateId('desk'), classId: map.classId,
            row: Math.floor(i / 2) + 1, col: (i % 2) + 1, label: `Time A ${i + 1}`,
            x: 100 + (i % 2) * 100, y: 80 + Math.floor(i / 2) * 85,
            width: 90, height: 70, rotation: 0, studentId: null, type: 'debate'
          });
        }
        // Right team
        for (let i = 0; i < 10; i++) {
          desks.push({
            id: Storage.generateId('desk'), classId: map.classId,
            row: Math.floor(i / 2) + 1, col: (i % 2) + 3, label: `Time B ${i + 1}`,
            x: 600 + (i % 2) * 100, y: 80 + Math.floor(i / 2) * 85,
            width: 90, height: 70, rotation: 0, studentId: null, type: 'debate'
          });
        }
        return desks.slice(0, count);
      }
    },
    apresentacao: {
      name: 'Apresentação',
      description: 'Todas voltadas para a frente',
      apply: (map, rows = 5, cols = 6) => {
        return Models.layoutPresets.tradicional.apply(map, rows, cols);
      }
    }
  },

  today() {
    return new Date().toISOString().slice(0, 10);
  },

  formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  },

  calcAverage(grades, weights = { prova: 0.5, trabalho: 0.3, atividade: 0.2 }) {
    // Simple average of available types
    if (!grades || grades.length === 0) return null;
    let total = 0, count = 0;
    grades.forEach(g => {
      if (typeof g.value === 'number') {
        total += g.value;
        count++;
      }
    });
    return count ? Math.round((total / count) * 10) / 10 : null;
  },

  presencePercent(records) {
    if (!records || records.length === 0) return 0;
    const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
    return Math.round((present / records.length) * 100);
  }
};
