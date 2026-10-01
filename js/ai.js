/**
 * Aulora - Contextual AI Engine
 * Smart rule-based + template system that understands classroom map, students, grades etc.
 * Does NOT make personal judgments about students.
 */

const ProfessorAI = {
  FREE_MODELS: [
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (recomendado)' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite (rápido)' },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash' },
    { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite (latest)' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash (latest)' }
  ],

  // Ordem de fallback quando o modelo escolhido está sobrecarregado (503)
  FALLBACK_MODELS: [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-flash-lite-latest',
    'gemini-3.7-flash',
    'gemini-3.8-flash'
  ],

  async respond(message, context = {}) {
    const msg = message.trim().toLowerCase();
    const { classId, classData, students, map, grades, lessons } = context;

    // === Comandos de MAPA: sempre locais (precisam alterar o mapa de verdade) ===
    if (this._match(msg, ['quem está', 'quem esta', 'quem senta', 'quem sentado', 'qual aluno'])) {
      return this._handleWhoIsSitting(msg, map, students);
    }
    if (this._match(msg, ['coloque', 'coloca', 'mova', 'move', 'troque', 'troca', 'ponha'])) {
      return this._handleMoveStudent(msg, map, students, classId);
    }
    if (this._match(msg, ['organize', 'organiza', 'monte', 'cria disposição', 'layout', 'formato'])) {
      return this._handleOrganize(msg, map, classId);
    }
    if (this._match(msg, ['perto da janela', 'próximo da janela', 'ao lado da janela'])) {
      return this._handleNearWindow(map, students);
    }
    if (this._match(msg, ['segunda fila', '2ª fila', '2a fila', 'fila 2'])) {
      return this._listByRow(2, map, students);
    }
    if (this._match(msg, ['primeira fila', '1ª fila', '1a fila', 'fila 1'])) {
      return this._listByRow(1, map, students);
    }
    if (this._match(msg, ['terceira fila', '3ª fila', '3a fila', 'fila 3'])) {
      return this._listByRow(3, map, students);
    }
    if (this._match(msg, ['ao lado de', 'ao lado do', 'ao lado da', 'perto de', 'perto do'])) {
      return this._handleNextTo(msg, map, students);
    }

    // === Resto: Gemini (Google) se tiver chave, senão IA local ===
    const aiCfg = (typeof Storage !== 'undefined' && Storage.getAISettings) ? Storage.getAISettings() : null;
    if (aiCfg && aiCfg.enabled && aiCfg.apiKey) {
      try {
        const llm = await this._callGemini(message, context, aiCfg);
        if (llm && llm.text) return llm;
      } catch (err) {
        console.warn('Gemini falhou, usando IA local:', err);
        return {
          text: '⚠️ Não consegui falar com o Gemini (' + (err.message || 'erro') + ').\n\nUsando resposta local:\n\n' +
            (await this._respondLocal(message, context)).text
        };
      }
    }

    return this._respondLocal(message, context);
  },

  async _callGemini(message, context, aiCfg) {
    const { classData, students, map, grades, images } = context;
    const system = this._buildSystemPrompt(classData, students, map, grades);
    const key = aiCfg.apiKey.trim();
    const preferred = (aiCfg.model || 'gemini-3.5-flash').replace(/^models\//, '');
    const queue = [preferred, ...(this.FALLBACK_MODELS || [])].filter((m, i, a) => m && a.indexOf(m) === i);

    let lastError = null;
    for (const model of queue) {
      try {
        const result = await this._geminiRequest(key, model, system, message, images || []);
        if (result && result.text) {
          if (model !== preferred) {
            result.text = result.text + '\n\n_(Respondido com ' + model + ' — o modelo principal estava ocupado.)_';
          }
          return result;
        }
      } catch (err) {
        lastError = err;
        const msg = String(err.message || err);
        if (/high demand|UNAVAILABLE|503|overloaded|try again later|404|NOT_FOUND|no longer available/i.test(msg)) {
          console.warn('Gemini modelo falhou, tentando outro:', model, msg);
          continue;
        }
        throw err;
      }
    }
    throw lastError || new Error('Nenhum modelo Gemini respondeu');
  },

  async _geminiRequest(key, model, system, message, images) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
    const parts = [];
    if (message && String(message).trim()) {
      parts.push({ text: String(message) });
    }
    (images || []).forEach(img => {
      if (!img || !img.data) return;
      parts.push({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.data
        }
      });
    });
    if (!parts.length) {
      parts.push({ text: 'Olá' });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let detail = res.status + ' ' + res.statusText;
      try {
        const j = JSON.parse(errText);
        detail = (j.error && j.error.message) || detail;
      } catch (_) {}
      throw new Error(String(detail));
    }

    const data = await res.json();
    const outParts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    if (!outParts || !outParts.length) throw new Error('Resposta vazia do Gemini');
    const text = outParts.map(p => p.text || '').join('').trim();
    if (!text) throw new Error('Resposta vazia do Gemini');
    return { text };
  },

  _buildSystemPrompt(classData, students, map, grades) {
    const cls = classData || {};
    const names = (students || []).map(s => s.name).join(', ') || 'nenhum cadastrado';
    let deskInfo = 'sem mapa';
    if (map && map.desks) {
      deskInfo = map.desks
        .filter(d => d.studentId)
        .map(d => {
          const st = (students || []).find(s => s.id === d.studentId);
          return (st ? st.name : '?') + ' → ' + d.label;
        })
        .join('; ') || 'carteiras vazias';
    }
    let gradeInfo = 'sem notas';
    if (grades && grades.length) {
      gradeInfo = grades.length + ' lançamentos de nota';
    }

    return `Você é o Plusck, assistente pedagógico do sistema Aulora.
Responda SEMPRE em português do Brasil, de forma clara, prática e profissional.
Contexto da turma atual:
- Turma: ${cls.name || 'não selecionada'}
- Série: ${cls.grade || '—'}
- Disciplina: ${cls.subject || '—'}
- Alunos: ${names}
- Mapa (aluno → carteira): ${deskInfo}
- Notas: ${gradeInfo}

Você pode: criar planos de aula, atividades, questões, quizzes, gabaritos, resumos, ideias de avaliação e dicas pedagógicas. Se o professor enviar imagens (quadro, prova, livro, caderno), descreva e ajude com base no que vê.
NÃO invente dados de alunos que não estejam na lista.
NÃO faça julgamentos sobre capacidade, comportamento ou personalidade dos alunos.
Se pedirem para mover alunos no mapa, diga para usar o comando de mapa (ex: "troque João e Ana") ou o arrastar no mapa visual.
Seja objetivo e útil.`;
  },

  async _respondLocal(message, context = {}) {
    const msg = message.trim().toLowerCase();
    const { classId, classData, students, map, grades, lessons } = context;
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));

    if (this._match(msg, ['ao lado de', 'ao lado do', 'ao lado da', 'perto de', 'perto do'])) {
      return this._handleNextTo(msg, map, students);
    }

    // === ACTIVITY GENERATION ===
    if (this._match(msg, ['crie uma aula', 'criar aula', 'planeje uma aula', 'plano de aula'])) {
      return this._generateLesson(message, classData);
    }

    if (this._match(msg, ['crie', 'gerar', 'gere', 'faça', 'faz']) && this._match(msg, ['questão', 'questoes', 'atividade', 'quiz', 'prova', 'exercício', 'exercicio'])) {
      return this._generateActivity(message, classData);
    }

    if (this._match(msg, ['gabarito'])) {
      return this._generateAnswerKey(message);
    }

    if (this._match(msg, ['resumo', 'resuma', 'summarize'])) {
      return this._generateSummary(message, classData);
    }

    // === GRADES / STATS ===
    if (this._match(msg, ['média da turma', 'media da turma', 'média geral', 'como está a turma'])) {
      return this._classAverage(grades, students);
    }

    if (this._match(msg, ['quem está ausente', 'quem faltou', 'ausentes'])) {
      return { text: 'Para ver a presença de hoje, abra a aba **Presença** ou o **Mapa da Sala**. Lá você marca e visualiza quem está presente, ausente ou atrasado.' };
    }

    // === GENERAL HELP ===
    if (this._match(msg, ['ajuda', 'o que você pode', 'o que voce pode', 'comandos', 'help'])) {
      return this._help();
    }

    // === FALLBACK ===
    return this._fallback(message, classData);
  },

  _match(text, keywords) {
    return keywords.some(k => text.includes(k));
  },

  _findStudentByName(name, students) {
    if (!name || !students) return null;
    const n = name.toLowerCase().trim();
    return students.find(s => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase().split(' ')[0]));
  },

  _getDeskStudent(desk, students) {
    if (!desk || !desk.studentId) return null;
    return students.find(s => s.id === desk.studentId);
  },

  _handleWhoIsSitting(msg, map, students) {
    if (!map) return { text: 'Nenhum mapa configurado para esta turma ainda. Vá em **Mapa da Sala** para criar.' };

    // "terceira mesa da segunda fila" / "fila 2 mesa 3"
    const rowMatch = msg.match(/(?:fila|fileira)\s*(\d+)/i) || msg.match(/(\d+)[ªa]?\s*fila/i);
    const colMatch = msg.match(/(?:mesa|carteira)\s*(\d+)/i) || msg.match(/(\d+)[ªa]?\s*mesa/i);

    if (rowMatch && colMatch) {
      const row = parseInt(rowMatch[1]);
      const col = parseInt(colMatch[1]);
      const desk = map.desks.find(d => d.row === row && d.col === col);
      if (!desk) return { text: `Não encontrei a carteira **Fila ${row} — Mesa ${col}**.` };
      const student = this._getDeskStudent(desk, students);
      if (student) {
        return { text: `Na **${desk.label}** está sentado(a): **${student.name}**.` };
      }
      return { text: `A **${desk.label}** está **vazia**.` };
    }

    if (rowMatch) {
      return this._listByRow(parseInt(rowMatch[1]), map, students);
    }

    // Generic
    const occupied = map.desks.filter(d => d.studentId).map(d => {
      const s = this._getDeskStudent(d, students);
      return s ? `• ${s.name} → ${d.label}` : null;
    }).filter(Boolean);

    if (occupied.length === 0) {
      return { text: 'Nenhum aluno está atribuído às carteiras ainda. Vá em **Mapa da Sala** e arraste os alunos para as mesas.' };
    }
    return { text: `Alunos no mapa:\n\n${occupied.join('\n')}` };
  },

  _listByRow(row, map, students) {
    if (!map) return { text: 'Mapa não encontrado.' };
    const desks = map.desks.filter(d => d.row === row).sort((a, b) => a.col - b.col);
    if (desks.length === 0) return { text: `Não há carteiras na fila ${row}.` };
    const lines = desks.map(d => {
      const s = this._getDeskStudent(d, students);
      return `• ${d.label}: ${s ? s.name : '_vazia_'}`;
    });
    return { text: `**Fila ${row}:**\n\n${lines.join('\n')}` };
  },

  _handleNearWindow(map, students) {
    if (!map) return { text: 'Mapa não encontrado.' };
    // Simple heuristic: desks with high x (right side) or near window elements
    const windows = (map.elements || []).filter(e => e.type === 'window');
    const near = map.desks.filter(d => {
      if (windows.length) {
        return windows.some(w => Math.abs(d.x - w.x) < 150 && Math.abs(d.y - w.y) < 150);
      }
      return d.x > 700; // right side
    });
    const names = near.map(d => this._getDeskStudent(d, students)?.name).filter(Boolean);
    if (names.length === 0) return { text: 'Nenhum aluno identificado perto das janelas no momento.' };
    return { text: `Alunos próximos às janelas:\n\n${names.map(n => '• ' + n).join('\n')}` };
  },

  _handleNextTo(msg, map, students) {
    const match = msg.match(/(?:ao lado|perto)\s+(?:de|do|da)\s+([a-záàâãéèêíïóôõöúçñ\s]+)/i);
    if (!match) return { text: 'Não entendi o nome do aluno. Tente: "Quem está ao lado do João?"' };
    const name = match[1].trim();
    const student = this._findStudentByName(name, students);
    if (!student) return { text: `Não encontrei o aluno "${name}".` };
    const desk = map.desks.find(d => d.studentId === student.id);
    if (!desk) return { text: `${student.name} ainda não está atribuído a nenhuma carteira.` };

    const neighbors = map.desks.filter(d =>
      d.id !== desk.id &&
      Math.abs(d.row - desk.row) <= 1 &&
      Math.abs(d.col - desk.col) <= 1 &&
      d.studentId
    ).map(d => this._getDeskStudent(d, students)?.name).filter(Boolean);

    if (neighbors.length === 0) return { text: `${student.name} não tem ninguém sentado imediatamente ao lado no mapa atual.` };
    return { text: `Ao lado de **${student.name}** estão:\n\n${neighbors.map(n => '• ' + n).join('\n')}` };
  },

  _handleMoveStudent(msg, map, students, classId) {
    if (!map || !classId) return { text: 'Selecione uma turma primeiro.' };

    // "troque João e Lucas"
    const swapMatch = msg.match(/(?:troque|troca)\s+([a-záàâãéèêíïóôõöúçñ\s]+?)\s+e\s+([a-záàâãéèêíïóôõöúçñ\s]+)/i);
    if (swapMatch) {
      const s1 = this._findStudentByName(swapMatch[1], students);
      const s2 = this._findStudentByName(swapMatch[2], students);
      if (!s1 || !s2) return { text: 'Não encontrei um ou ambos os alunos.' };
      const d1 = map.desks.find(d => d.studentId === s1.id);
      const d2 = map.desks.find(d => d.studentId === s2.id);
      if (!d1 || !d2) return { text: 'Um dos alunos não está em nenhuma carteira.' };
      d1.studentId = s2.id;
      d2.studentId = s1.id;
      Storage.updateMap(classId, map);
      return {
        text: `Pronto! **${s1.name}** e **${s2.name}** trocaram de lugar.`,
        mapUpdated: true
      };
    }

    // "coloque João na primeira mesa da terceira fila"
    const placeMatch = msg.match(/(?:coloque|coloca|mova|move|ponha)\s+([a-záàâãéèêíïóôõöúçñ\s]+?)\s+(?:na|no|em)\s+(?:a\s+)?(?:(\d+)[ªa]?\s*)?(?:mesa|carteira)?\s*(?:da|do)?\s*(?:(\d+)[ªa]?\s*)?(?:fila|fileira)?/i);
    // Better simple parsing
    const nameMatch = msg.match(/(?:coloque|coloca|mova|move|ponha)\s+([a-záàâãéèêíïóôõöúçñ]+(?:\s+[a-záàâãéèêíïóôõöúçñ]+)?)/i);
    const rowCol = msg.match(/(?:fila|fileira)\s*(\d+).{0,20}(?:mesa|carteira)\s*(\d+)/i) ||
                   msg.match(/(?:mesa|carteira)\s*(\d+).{0,20}(?:fila|fileira)\s*(\d+)/i);

    if (nameMatch) {
      const student = this._findStudentByName(nameMatch[1], students);
      if (!student) return { text: `Não encontrei o aluno "${nameMatch[1]}".` };

      let targetDesk = null;
      if (rowCol) {
        let row = parseInt(rowCol[1]), col = parseInt(rowCol[2]);
        // Detect order
        if (msg.indexOf('fila') < msg.indexOf('mesa') || msg.includes('fila ' + row)) {
          // row then col
        } else {
          // might be inverted
          const tmp = row; row = col; col = tmp;
        }
        targetDesk = map.desks.find(d => d.row === row && d.col === col);
      }

      if (!targetDesk) {
        // Try free desk
        targetDesk = map.desks.find(d => !d.studentId);
      }

      if (!targetDesk) return { text: 'Não encontrei a carteira de destino ou não há carteiras livres.' };

      Storage.assignStudentToDesk(classId, targetDesk.id, student.id);
      return {
        text: `**${student.name}** foi colocado(a) na **${targetDesk.label}**.`,
        mapUpdated: true
      };
    }

    return { text: 'Não entendi o comando de movimentação. Exemplos:\n• "Coloque João na primeira mesa da terceira fila"\n• "Troque Ana e Pedro de lugar"' };
  },

  _handleOrganize(msg, map, classId) {
    if (!map || !classId) return { text: 'Selecione uma turma e configure o mapa primeiro.' };

    let preset = null;
    if (this._match(msg, ['u', 'formato u', 'em u'])) preset = 'u';
    else if (this._match(msg, ['círculo', 'circulo', 'redondo'])) preset = 'circulo';
    else if (this._match(msg, ['grupo', 'grupos'])) preset = 'grupos';
    else if (this._match(msg, ['dupla', 'duplas'])) preset = 'duplas';
    else if (this._match(msg, ['prova', 'avaliação', 'avaliacao', 'teste'])) preset = 'prova';
    else if (this._match(msg, ['debate', 'discussão', 'discussao'])) preset = 'debate';
    else if (this._match(msg, ['tradicional', 'fileira', 'fileiras'])) preset = 'tradicional';

    if (!preset) {
      return { text: 'Posso reorganizar o mapa nos seguintes formatos:\n\n• Tradicional (fileiras)\n• Duplas\n• Grupos de 4\n• Formato U\n• Círculo\n• Prova (espaçado)\n• Debate\n\nExemplo: "Organize em formato U" ou "Monte a sala para prova".' };
    }

    const layout = Models.layoutPresets[preset];
    if (!layout) return { text: 'Layout não encontrado.' };

    // Preserve student assignments by position order as much as possible
    const oldAssignments = map.desks.filter(d => d.studentId).map(d => d.studentId);
    const newDesks = layout.apply(map, map.desks.length || 24);
    oldAssignments.forEach((sid, i) => {
      if (newDesks[i]) newDesks[i].studentId = sid;
    });

    map.desks = newDesks;
    Storage.updateMap(classId, map);

    return {
      text: `Mapa reorganizado no formato **${layout.name}**. Os alunos foram redistribuídos mantendo a ordem anterior o máximo possível.`,
      mapUpdated: true
    };
  },

  _generateLesson(originalMsg, classData) {
    const subject = classData?.subject || 'a disciplina';
    const grade = classData?.grade || 'a série';
    const themeMatch = originalMsg.match(/(?:sobre|de)\s+([^.!?]+)/i);
    const theme = themeMatch ? themeMatch[1].trim() : 'o tema solicitado';

    return {
      text: `Aqui está um plano de aula de **50 minutos** sobre **${theme}** para ${grade} (${subject}):

**1. Introdução (5 min)**  
Apresente o tema com uma pergunta provocativa ou um fato curioso relacionado a ${theme}. Ative conhecimentos prévios.

**2. Explicação / Conteúdo (15 min)**  
Explique os conceitos principais de forma clara. Use exemplos concretos e, se possível, recursos visuais.

**3. Atividade prática (20 min)**  
Proponha uma atividade em duplas ou individual onde os alunos apliquem o que aprenderam sobre ${theme}.

**4. Revisão e fechamento (10 min)**  
Recapitule os pontos principais. Tire dúvidas e dê um preview da próxima aula.

---
Quer que eu detalhe alguma parte, crie a atividade completa ou gere um material de apoio?`
    };
  },

  _generateActivity(originalMsg, classData) {
    const subject = classData?.subject || 'a disciplina';
    const numMatch = originalMsg.match(/(\d+)\s*(?:quest|pergunt|exerc)/i);
    const num = numMatch ? parseInt(numMatch[1]) : 5;
    const themeMatch = originalMsg.match(/(?:sobre|de)\s+([^.!?]+)/i);
    const theme = themeMatch ? themeMatch[1].trim() : 'o conteúdo atual';

    let questions = [];
    for (let i = 1; i <= Math.min(num, 10); i++) {
      questions.push(`${i}. [Questão ${i} sobre ${theme}] — Explique ou resolva com base no que estudamos.`);
    }

    return {
      text: `**Atividade gerada** — ${subject}  
**Tema:** ${theme}  
**Quantidade:** ${questions.length} questões

${questions.join('\n\n')}

---
Você pode copiar, editar ou pedir para eu regenerar questões específicas.  
Quer o **gabarito** também?`
    };
  },

  _generateAnswerKey(msg) {
    return {
      text: `**Gabarito sugerido**

Como as questões foram geradas de forma genérica, o gabarito completo depende do conteúdo específico da sua turma.

Sugestão:
1. Resposta modelo A
2. Resposta modelo B
3. ...

Peça "Crie o gabarito da atividade X" com mais detalhes do conteúdo para eu gerar respostas mais precisas.`
    };
  },

  _generateSummary(msg, classData) {
    return {
      text: `Posso resumir conteúdos para você. Cole o texto ou descreva o tema que deseja resumir, e eu organizo os pontos principais de forma clara e objetiva para ${classData?.grade || 'sua turma'}.`
    };
  },

  _classAverage(grades, students) {
    if (!grades || grades.length === 0) {
      return { text: 'Ainda não há notas registradas para esta turma. Vá em **Notas** para lançar as avaliações.' };
    }
    const byStudent = {};
    grades.forEach(g => {
      if (!byStudent[g.studentId]) byStudent[g.studentId] = [];
      byStudent[g.studentId].push(g);
    });
    const avgs = Object.values(byStudent).map(gs => Models.calcAverage(gs)).filter(a => a !== null);
    if (avgs.length === 0) return { text: 'Não foi possível calcular a média.' };
    const overall = Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10;
    return { text: `**Média geral da turma:** ${overall}\n\nBaseado em ${avgs.length} aluno(s) com notas registradas.` };
  },

  _help() {
    return {
      text: `**Sou o Plusck.** Posso ajudar com:

**Mapa da sala**
• "Quem está na terceira mesa da segunda fila?"
• "Coloque a Ana na primeira mesa da terceira fila"
• "Troque João e Lucas de lugar"
• "Organize a sala em formato U"
• "Monte a disposição para prova"
• "Quem está perto da janela?"

**Atividades e aulas**
• "Crie uma aula de 50 minutos sobre Revolução Industrial"
• "Crie 10 questões sobre frações"
• "Crie um quiz de 15 perguntas"
• "Gere o gabarito"

**Turma**
• "Qual a média da turma?"

Estou sempre no contexto da turma selecionada. Como posso ajudar?`
    };
  },

  _fallback(message, classData) {
    const subject = classData?.subject || 'sua disciplina';
    return {
      text: `Entendi sua mensagem sobre "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}".

Estou no contexto de **${classData?.name || 'nenhuma turma selecionada'}** (${subject}).

Posso:
• Consultar e reorganizar o **mapa da sala**
• Gerar **atividades, quizzes e planos de aula**
• Calcular **médias** e responder sobre a turma

Tente reformular ou diga "ajuda" para ver exemplos de comandos.`
    };
  }
};
