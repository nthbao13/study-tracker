(function () {
  'use strict';

  const MAX_IMAGES_PER_TASK = 3;
  const MAX_IMAGE_EDGE = 1280;
  const JPEG_QUALITY = 0.7;
  const REQUEST_TIMEOUT_MS = 90000;
  const STUDENT_KEY = 'study-tracker:student';

  // ---------- ngày hôm nay (có thể giả lập bằng ?day=0..6 để xem thử) ----------
  const now = new Date();
  const dayParam = new URLSearchParams(location.search).get('day');
  const weekdayIndex = /^[0-6]$/.test(dayParam || '') ? Number(dayParam) : now.getDay();
  const pad = (n) => String(n).padStart(2, '0');
  const dateISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dateVN = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const weekdayName = WEEKDAY_NAMES[weekdayIndex];
  const tasks = SCHEDULE[weekdayIndex];

  // ---------- state (localStorage theo ngày; ảnh chỉ giữ trong RAM) ----------
  const storageKey = `study-tracker:${dateISO}:${weekdayIndex}`;
  const state = Object.assign(
    { done: {}, learned: '', difficulties: '', questions: '', submitted: false },
    readStorage(storageKey)
  );
  const images = {}; // taskId -> [{ name, mime, data, preview }]

  function readStorage(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (e) {
      return {};
    }
  }
  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) {
      /* localStorage bị chặn: app vẫn chạy, chỉ không nhớ nháp */
    }
  }
  const saveState = () => writeStorage(storageKey, state);

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    title: $('today-title'),
    fill: $('progress-fill'),
    progressText: $('progress-text'),
    tasks: $('tasks'),
    form: $('report'),
    student: $('student'),
    learned: $('learned'),
    difficulties: $('difficulties'),
    questions: $('questions'),
    error: $('error'),
    submit: $('submit'),
    done: $('done'),
  };
  const textFields = ['learned', 'difficulties', 'questions'];

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  // ---------- render task ----------
  const cards = {}; // taskId -> { card, checkbox, proof, thumbs, addBtn }

  function renderTasks() {
    tasks.forEach((task) => {
      images[task.id] = [];

      const checkbox = el('input', { type: 'checkbox' });
      checkbox.checked = !!state.done[task.id];

      const info = el('div', { class: 'task-info' }, [el('div', { class: 'task-title', text: task.title })]);
      if (task.note) info.appendChild(el('p', { class: 'task-note', text: task.note }));
      if (task.duration) info.appendChild(el('span', { class: 'chip', text: task.duration }));

      const main = el('label', { class: 'task-main' }, [checkbox, info]);

      const thumbs = el('div', { class: 'thumbs' });
      const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: '' });
      const addBtn = el('button', { type: 'button', class: 'btn-ghost', text: 'Đính kèm ảnh bài làm' });
      addBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        addImages(task.id, Array.from(fileInput.files));
        fileInput.value = '';
      });
      const proof = el('div', { class: 'proof' }, [thumbs, addBtn, fileInput]);

      const card = el('article', { class: 'card task' }, [main, proof]);
      els.tasks.appendChild(card);
      cards[task.id] = { card, checkbox, proof, thumbs, addBtn };

      checkbox.addEventListener('change', () => {
        state.done[task.id] = checkbox.checked;
        saveState();
        refreshTask(task.id);
        refreshProgress();
      });
      refreshTask(task.id);
    });
  }

  function refreshTask(taskId) {
    const c = cards[taskId];
    const done = c.checkbox.checked;
    c.card.classList.toggle('is-done', done);
    c.proof.hidden = !done || state.submitted;
    c.addBtn.hidden = images[taskId].length >= MAX_IMAGES_PER_TASK;
  }

  function refreshProgress() {
    const n = tasks.filter((t) => state.done[t.id]).length;
    els.fill.style.width = `${(n / tasks.length) * 100}%`;
    els.progressText.textContent = `${n}/${tasks.length} task đã làm`;
  }

  // ---------- ảnh minh chứng ----------
  function renderThumbs(taskId) {
    const { thumbs } = cards[taskId];
    thumbs.replaceChildren();
    images[taskId].forEach((img, i) => {
      const remove = el('button', { type: 'button', 'aria-label': 'Xóa ảnh', text: '×' });
      remove.addEventListener('click', () => {
        images[taskId].splice(i, 1);
        renderThumbs(taskId);
        refreshTask(taskId);
      });
      thumbs.appendChild(
        el('div', { class: 'thumb' }, [el('img', { src: img.preview, alt: img.name }), remove])
      );
    });
  }

  async function addImages(taskId, files) {
    const room = MAX_IMAGES_PER_TASK - images[taskId].length;
    const picked = files.filter((f) => f.type.startsWith('image/')).slice(0, room);
    hideError();
    for (const file of picked) {
      try {
        images[taskId].push(await compressImage(file));
      } catch (e) {
        showError(`Không đọc được ảnh “${file.name}”. Em thử chọn ảnh khác nhé.`);
      }
    }
    renderThumbs(taskId);
    refreshTask(taskId);
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // PNG trong suốt -> nền trắng khi chuyển JPEG
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const preview = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve({
          name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
          mime: 'image/jpeg',
          data: preview.split(',')[1],
          preview,
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('decode failed'));
      };
      img.src = url;
    });
  }

  // ---------- submit ----------
  function showError(msg) {
    els.error.textContent = msg;
    els.error.hidden = false;
  }
  function hideError() {
    els.error.hidden = true;
  }

  function validate() {
    textFields.forEach((f) => els[f].classList.remove('invalid'));
    if (!tasks.some((t) => state.done[t.id])) {
      return 'Em hãy tick ít nhất một task đã làm trước khi gửi.';
    }
    const empty = textFields.filter((f) => !els[f].value.trim());
    if (empty.length) {
      empty.forEach((f) => els[f].classList.add('invalid'));
      els[empty[0]].focus();
      return 'Em hãy điền đủ 3 ô bên dưới (nếu không có thì ghi “Không có”).';
    }
    return '';
  }

  function buildPayload() {
    return {
      token: APP_CONFIG.SECRET_TOKEN,
      date: dateISO,
      weekday: weekdayName,
      student: els.student.value.trim(),
      tasks: tasks.map((t) => {
        const done = !!state.done[t.id];
        return {
          id: t.id,
          title: t.title,
          done,
          images: done ? images[t.id].map(({ name, mime, data }) => ({ name, mime, data })) : [],
        };
      }),
      learned: els.learned.value.trim(),
      difficulties: els.difficulties.value.trim(),
      questions: els.questions.value.trim(),
    };
  }

  async function send(payload) {
    if (!APP_CONFIG.APPS_SCRIPT_URL) {
      // Chế độ demo: chưa cấu hình backend.
      const preview = JSON.parse(JSON.stringify(payload));
      preview.tasks.forEach((t) => t.images.forEach((i) => (i.data = `<${i.data.length} ký tự base64>`)));
      console.log('[demo] payload sẽ được gửi:', preview);
      await new Promise((r) => setTimeout(r, 600));
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      // Không đặt Content-Type => text/plain, tránh CORS preflight (Apps Script không xử lý OPTIONS).
      const res = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Máy chủ báo lỗi.');
    } finally {
      clearTimeout(timer);
    }
  }

  function setSending(sending) {
    els.submit.disabled = sending;
    els.submit.querySelector('.spinner').hidden = !sending;
    els.submit.querySelector('.label').textContent = sending ? 'Đang gửi…' : 'Gửi báo cáo';
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (state.submitted) return;
    const problem = validate();
    if (problem) return showError(problem);
    hideError();
    setSending(true);
    try {
      await send(buildPayload());
      state.submitted = true;
      saveState();
      showDone();
    } catch (err) {
      const offline = err instanceof TypeError || err.name === 'AbortError';
      showError(
        offline
          ? 'Không kết nối được. Em kiểm tra mạng rồi bấm gửi lại nhé (bài làm của em vẫn còn nguyên).'
          : `Gửi chưa được: ${err.message}`
      );
      setSending(false);
    }
  }

  function showDone() {
    els.form.hidden = true;
    els.done.hidden = false;
    tasks.forEach((t) => {
      cards[t.id].checkbox.disabled = true;
      refreshTask(t.id);
    });
  }

  // ---------- khởi tạo ----------
  function init() {
    els.title.textContent = `${weekdayName}, ${dateVN}`;
    document.title = `${weekdayName} – Study Tracker`;
    renderTasks();
    refreshProgress();

    els.student.value = readStorage(STUDENT_KEY).name || '';
    textFields.forEach((f) => {
      els[f].value = state[f] || '';
      els[f].addEventListener('input', () => {
        state[f] = els[f].value;
        els[f].classList.remove('invalid');
        saveState();
      });
    });
    els.student.addEventListener('input', () => writeStorage(STUDENT_KEY, { name: els.student.value }));
    els.form.addEventListener('submit', onSubmit);

    if (state.submitted) showDone();
  }

  init();
})();
