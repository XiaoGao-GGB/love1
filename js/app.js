// ============================================================
// 我们的小站 —— 交互逻辑
// ============================================================

// ---------- 工具 ----------
function $(s) { return document.querySelector(s); }
function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseDay(str) {
  var p = String(str).split('-').map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}

function diffDays(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}

function fmtDate(str) {
  if (!str) return '';
  var p = String(str).split('-').map(Number);
  if (!p[0]) return '';
  return p[0] + '年' + p[1] + '月' + p[2] + '日';
}

function timeStr(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var now = new Date();
  var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return hm;
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
}

// ---------- 状态 ----------
var state = {
  myName: localStorage.getItem('love_myname') || '音宝',
  profile: null,
  timeline: [],
  messages: [],
  anniversaries: [],
  wishes: [],
  moments: [],
  photos: [],
  photochunks: [],
  answers: [],
  fight: null,
  daily: null,
  replyTarget: null,
  wishSeg: 'wish'
};

function defaults() {
  return { nicknameMe: '音宝', nicknameTa: '轩宝', startDate: '', motto: '把日子过成喜欢的样子' };
}

// ---------- 数据加载与渲染 ----------
function loadAll() {
  return Promise.all([
    Data.getAll('profile'), Data.getAll('timeline'), Data.getAll('messages'),
    Data.getAll('anniversaries'), Data.getAll('wishes'), Data.getAll('moments'),
    Data.getAll('photos'), Data.getAll('answers'), Data.getAll('fight'), Data.getAll('daily'),
    Data.getAll('photochunks')
  ]).then(function (r) {
    state.profile = r[0][0] || defaults();
    state.timeline = r[1].sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    state.messages = r[2];
    state.anniversaries = r[3];
    state.wishes = r[4];
    state.moments = r[5].sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    state.photos = r[6].sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    state.answers = r[7];
    state.fight = r[8][0] || null;
    state.daily = r[9][0] || null;
    state.photochunks = r[10];
    assemblePhotos();
    render();
  }).catch(function (e) {
    toast('数据加载失败：' + (e && e.message ? e.message : e));
  });
}

// 照片分块拼回完整图。云端照片拆成多块存（避开单条 40KB 限制），本地模式则直接存整张。
function assemblePhotos() {
  var map = {};
  (state.photochunks || []).forEach(function (c) {
    if (!map[c.photoId]) map[c.photoId] = [];
    map[c.photoId].push(c);
  });
  state.photos.forEach(function (p) {
    var cs = map[p.photoId];
    if (cs && cs.length) {
      cs.sort(function (a, b) { return (a.idx || 0) - (b.idx || 0); });
      p.data = cs.map(function (c) { return c.data || ''; }).join('');
    }
  });
}

function render() {
  renderCloudDot();
  renderHome();
  renderDailyQuestion();
  renderFight();
  renderNotes();
  renderWish();
  renderPhotos();
  renderTimeline();
  renderMine();
}

function renderCloudDot() {
  var dot = $('#cloudDot');
  var cloud = Data.cloudMode();
  dot.classList.toggle('cloud', cloud);
  dot.classList.toggle('local', !cloud);
  dot.title = cloud ? '已连接云端，两人实时同步' : '本地演示模式（数据只在本机）';
}

// ---------- 首页 ----------
function nextOccurrence(dateStr, today) {
  var p = String(dateStr).split('-').map(Number);
  var ty = parseDay(today).getFullYear();
  var nxt = new Date(ty, p[1] - 1, p[2]);
  if (nxt < parseDay(today)) nxt = new Date(ty + 1, p[1] - 1, p[2]);
  var key = nxt.getFullYear() + '-' + String(nxt.getMonth() + 1).padStart(2, '0') + '-' + String(nxt.getDate()).padStart(2, '0');
  return { next: key, days: diffDays(today, key) };
}

function renderHome() {
  var p = state.profile || defaults();
  var daysEl = $('#daysTogether');
  var subEl = $('#daysSub');
  var mottoEl = $('#homeMotto');

  if (!p.startDate) {
    daysEl.textContent = '—';
    subEl.textContent = '先在「我的」里设置我们在一起的日子';
  } else {
    var n = diffDays(p.startDate, todayStr()) + 1;
    daysEl.textContent = n;
    var d1 = parseDay(p.startDate), d2 = new Date();
    var years = d2.getFullYear() - d1.getFullYear();
    var months = d2.getMonth() - d1.getMonth();
    var days = d2.getDate() - d1.getDate();
    if (days < 0) { months--; days += new Date(d2.getFullYear(), d2.getMonth(), 0).getDate(); }
    if (months < 0) { years--; months += 12; }
    subEl.textContent = years + '年' + months + '个月' + days + '天 · 从 ' + fmtDate(p.startDate) + ' 开始';
  }
  mottoEl.textContent = p.motto || '';

  var wrap = $('#annivList');
  var list = state.anniversaries;
  if (!list.length) {
    wrap.innerHTML = '<div class="empty">还没有纪念日，点右上角 ＋ 添加</div>';
    return;
  }
  var t = todayStr();
  wrap.innerHTML = list.map(function (a) {
    var info = nextOccurrence(a.date, t);
    var isToday = info.days === 0;
    var sub = isToday ? '就是今天！' : '还有 ' + info.days + ' 天';
    return '<div class="anniv card' + (isToday ? ' today' : '') + '">' +
      '<div><div class="anniv-name">' + esc(a.name) + '</div>' +
      '<div class="anniv-sub">' + sub + ' · ' + fmtDate(info.next) + '</div></div>' +
      '<button class="del" data-del-anniv="' + esc(a.id) + '">×</button>' +
      '</div>';
  }).join('');
}

// ---------- 留言 ----------
function renderReplyHint() {
  var el = $('#replyHint');
  if (!state.replyTarget) { el.hidden = true; el.innerHTML = ''; return; }
  var m = state.messages.find(function (x) { return x.id === state.replyTarget; });
  el.hidden = false;
  el.innerHTML = '正在回复 <b>' + esc(m ? m.author : '') + '</b>' +
    '<span class="reply-ctx">：' + esc(m ? m.content : '') + '</span>' +
    '<button class="cancel-reply" id="btnCancelReply">取消</button>';
}

function renderNotes() {
  var wrap = $('#noteList');
  var p = state.profile || defaults();
  if (!state.messages.length) {
    wrap.innerHTML = '<div class="empty">写第一张小纸条吧</div>';
    renderReplyHint();
    return;
  }
  wrap.innerHTML = state.messages.map(function (m) {
    var mine = m.author === state.myName;
    var reply = m.replyTo ? state.messages.find(function (x) { return x.id === m.replyTo; }) : null;
    var replyHtml = reply
      ? '<div class="replyto">↩ ' + esc(reply.author) + '：' + esc(reply.content) + '</div>' : '';
    return '<div class="note' + (mine ? ' mine' : '') + '">' +
      '<div class="meta">' + esc(m.author) + ' · ' + timeStr(m.createdAt) + '</div>' +
      replyHtml +
      '<div class="note-body">' + esc(m.content) + '</div>' +
      '<button class="note-reply" data-reply="' + esc(m.id) + '">回复</button>' +
      '</div>';
  }).join('');
  renderReplyHint();
}

// ---------- 心愿 ----------
function renderWish() {
  $('#wishPanel').hidden = state.wishSeg !== 'wish';
  $('#momentPanel').hidden = state.wishSeg !== 'moment';
  $$('#wishSeg button').forEach(function (b) {
    b.classList.toggle('on', b.dataset.seg === state.wishSeg);
  });

  var wl = $('#wishList');
  if (!state.wishes.length) {
    wl.innerHTML = '<div class="empty">添加一件想和你一起做的事</div>';
  } else {
    wl.innerHTML = state.wishes.map(function (w) {
      return '<div class="wish-item' + (w.done ? ' done' : '') + '">' +
        '<button class="wish-check" data-toggle-wish="' + esc(w.id) + '">' + (w.done ? '✓' : '') + '</button>' +
        '<span class="wish-text">' + esc(w.title) + '</span>' +
        '<span class="wish-meta">' + esc(w.author) + '</span>' +
        '<button class="del" data-del-wish="' + esc(w.id) + '">×</button>' +
        '</div>';
    }).join('');
  }

  var ml = $('#momentList');
  if (!state.moments.length) {
    ml.innerHTML = '<div class="empty">记下今天的一件小确幸</div>';
  } else {
    ml.innerHTML = state.moments.map(function (m) {
      return '<div class="moment-item">' +
        '<div class="moment-text">' + esc(m.content) + '</div>' +
        '<div class="moment-meta">' + esc(m.author) + ' · ' + fmtDate(String(m.createdAt || '').slice(0, 10)) + '</div>' +
        '<button class="del" data-del-moment="' + esc(m.id) + '">×</button>' +
        '</div>';
    }).join('');
  }
}

// ---------- 时光轴 ----------
function renderTimeline() {
  var wrap = $('#timelineList');
  if (!state.timeline.length) {
    wrap.innerHTML = '<div class="empty">点右上角 ＋，记下重要的时刻</div>';
    return;
  }
  wrap.innerHTML = state.timeline.map(function (e) {
    return '<div class="tl-item">' +
      '<div class="tl-date">' + fmtDate(e.date) + '</div>' +
      '<div class="tl-title">' + esc(e.title) + '</div>' +
      (e.note ? '<div class="tl-note">' + esc(e.note) + '</div>' : '') +
      '<button class="del tl-del" data-del-tl="' + esc(e.id) + '">×</button>' +
      '</div>';
  }).join('');
}

// ---------- 每日一问 ----------
var QUESTIONS = [
  '今天最想和我分享的一件事是什么？',
  '你最喜欢我哪个表情？',
  '如果明天一起休假一天，你想怎么过？',
  '你最近一次梦到我是什么场景？',
  '我们一起去过的地方里，你最喜欢哪个？',
  '你觉得我什么时候最可爱？',
  '如果我们养一只宠物，你想养什么？',
  '你现在最想让我为你做什么？',
  '认识我之前，你觉得爱情是什么？',
  '你最喜欢吃我做的哪道菜？',
  '如果要一起学一样新技能，你想学什么？',
  '你心里有没有一直想对我说却没说出口的话？',
  '我们吵架的时候，你希望我怎么哄你？',
  '你最近的小目标是什么？',
  '你会怎么向别人介绍我？',
  '如果我们去旅行，你最想去哪里？',
  '你眼中的我有什么优点？',
  '你觉得最浪漫的事是什么？',
  '你希望十年后的我们是什么样子？',
  '我今天哪里让你心动了？',
  '你有什么小时候的趣事想讲给我听？',
  '如果今天是世界末日，你想和我做什么？',
  '你最喜欢我们之间的哪个瞬间？',
  '你现在最想要什么？',
  '你觉得我做过的哪件事最让你感动？',
  '我们的关系里，你最珍惜什么？',
  '你最近有没有因为什么事偷偷开心？',
  '如果有一天我不开心，你希望我怎么告诉你？',
  '你理想中的周末是什么样？',
  '你有多喜欢我？用一个比喻形容'
];

function autoDailyQuestion() {
  var now = new Date();
  var start = new Date(now.getFullYear(), 0, 0);
  var doy = Math.floor((now - start) / 86400000);
  return QUESTIONS[doy % QUESTIONS.length];
}

// 有人手动换过题就优先显示换的题，否则按日期自动出题
function currentQuestion() {
  if (state.daily && state.daily.date === todayStr()) return state.daily.question;
  return autoDailyQuestion();
}

function changeQuestion() {
  var current = currentQuestion();
  var q;
  do {
    q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  } while (q === current && QUESTIONS.length > 1);
  var base = (state.daily && state.daily.date === todayStr()) ? state.daily : { date: todayStr() };
  Data.save('daily', Object.assign({}, base, {
    date: todayStr(),
    question: q,
    changedBy: state.myName
  })).then(function () {
    toast('换题成功，两人都会看到新问题');
    return loadAll();
  });
}

function renderDailyQuestion() {
  $('#dqQuestion').textContent = currentQuestion();
  var today = todayStr();
  var p = state.profile || defaults();
  var me = state.myName;
  var todayAnswers = state.answers.filter(function (a) { return a.date === today; });
  var mine = todayAnswers.find(function (a) { return a.author === me; });
  var theirs = todayAnswers.find(function (a) { return a.author !== me; });
  setField($('#dqInput'), mine ? mine.answer : '');
  var otherName = me === p.nicknameMe ? p.nicknameTa : p.nicknameMe;
  var taName = theirs ? theirs.author : otherName;
  var rows = '';
  rows += '<div class="dq-row mine"><span class="who">' + esc(me) + '</span>' +
    '<span class="txt">' + esc(mine ? mine.answer : '我还没回答') + '</span></div>';
  rows += '<div class="dq-row"><span class="who">' + esc(taName) + '</span>' +
    '<span class="txt">' + esc(theirs ? theirs.answer : 'TA 还没回答') + '</span></div>';
  $('#dqList').innerHTML = rows;
}

function submitDailyQuestion() {
  var answer = $('#dqInput').value.trim();
  if (!answer) { toast('先写下你的回答吧'); return; }
  var today = todayStr();
  var existing = state.answers.find(function (a) { return a.date === today && a.author === state.myName; });
  if (existing) {
    Data.save('answers', Object.assign({}, existing, { answer: answer })).then(loadAll);
  } else {
    Data.save('answers', { date: today, author: state.myName, answer: answer }).then(loadAll);
  }
}

// ---------- 吵架和好卡 ----------
var MAKEUP_TASKS = [
  '抱抱 30 秒',
  '亲一下额头',
  '说三句真心话',
  '大声说「我爱你」',
  '给对方按摩 5 分钟',
  '一起去吃顿好的',
  '写一张道歉小纸条',
  '讲一件最糗的事逗 TA 笑',
  '手牵手散步 10 分钟',
  '做 TA 最爱吃的一顿饭'
];

function randomTask() {
  return MAKEUP_TASKS[Math.floor(Math.random() * MAKEUP_TASKS.length)];
}

function renderFight() {
  var card = $('#fightCard');
  var f = state.fight;
  if (f && f.active) {
    card.classList.add('fighting');
    card.innerHTML =
      '<div class="card-title">吵架和好卡</div>' +
      '<div class="fight-state">在吵架中 · ' + esc(f.triggeredBy) + ' 按下的</div>' +
      '<div class="fight-task">和好卡：' + esc(f.task) + '</div>' +
      '<div class="fight-row">' +
      '<button class="btn-ghost" id="btnRedeem">重新抽一张</button>' +
      '<button class="btn-main" id="btnMakeup">我们和好了</button>' +
      '</div>';
  } else {
    card.classList.remove('fighting');
    card.innerHTML =
      '<div class="card-title">吵架和好卡</div>' +
      '<div class="fight-idle">今天我们好好的。</div>' +
      '<button class="btn-ghost" id="btnFight">我们吵架了</button>';
  }
}

function startFight() {
  var base = state.fight || {};
  Data.save('fight', Object.assign({}, base, {
    active: true,
    triggeredBy: state.myName,
    task: randomTask()
  })).then(loadAll);
}

function redeemTask() {
  if (!state.fight) return;
  Data.save('fight', Object.assign({}, state.fight, { task: randomTask() })).then(loadAll);
}

function makeup() {
  if (!state.fight) return;
  Data.save('fight', Object.assign({}, state.fight, { active: false })).then(loadAll);
}

// ---------- 照片墙 ----------
var lbPhotoId = null;

function renderPhotos() {
  var grid = $('#photoGrid');
  if (!state.photos.length) {
    grid.innerHTML = '<div class="empty">点右上角 ＋ 上传我们的第一张照片</div>';
    return;
  }
  grid.innerHTML = state.photos.map(function (p) {
    return '<div class="photo-thumb" data-photo="' + esc(p.id) + '">' +
      '<img src="' + p.data + '" alt="">' +
      (p.caption ? '<div class="photo-caption">' + esc(p.caption) + '</div>' : '') +
      '</div>';
  }).join('');
}

function pickPhoto() {
  $('#photoFile').click();
}

function fileToDataUrl(file, cb) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      // 目标：压缩后 base64 不超过约 200KB，避免超出 Bmob 单条数据大小限制。
      // 先按 800px/0.6 压一次，还超标就不断缩小尺寸和画质，直到达标。
      var MAX_B64 = 200 * 1024;
      var maxW = 800, q = 0.6, data;
      for (;;) {
        var scale = Math.min(1, maxW / img.width);
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        data = canvas.toDataURL('image/jpeg', q);
        if (data.length <= MAX_B64 || maxW <= 240) break;
        maxW = Math.round(maxW * 0.7);
        q = Math.max(0.4, q - 0.1);
      }
      cb(data);
    };
    img.onerror = function () { cb(null); };
    img.src = e.target.result;
  };
  reader.onerror = function () { cb(null); };
  reader.readAsDataURL(file);
}

// 保存照片。云端把 base64 拆成小块存进 PhotoChunk（每块远小于 40KB 限制），
// 再存一张带 photoId 的记录；本地模式直接整张存。
function savePhoto(meta) {
  if (!Data.cloudMode()) return Data.save('photos', meta);
  var CHUNK = 24000;
  var data = meta.data;
  var photoId = 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var n = Math.max(1, Math.ceil(data.length / CHUNK));
  var saved = [];
  for (var i = 0; i < n; i++) {
    saved.push(Data.save('photochunks', {
      photoId: photoId, idx: i, data: data.slice(i * CHUNK, (i + 1) * CHUNK)
    }));
  }
  return Promise.all(saved).then(function () {
    return Data.save('photos', { author: meta.author, caption: meta.caption, photoId: photoId, partCount: n });
  });
}

function handlePhotoFile() {
  var input = $('#photoFile');
  var file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  fileToDataUrl(file, function (data) {
    if (!data) { toast('这张照片打不开，换一张试试'); return; }
    openModal(
      '<div class="modal-title">加上一张照片</div>' +
      '<img src="' + data + '" class="modal-photo-preview" alt="">' +
      '<input id="mPhotoCaption" placeholder="配一句话（可不填）" autocomplete="off">' +
      '<div class="modal-btns"><button class="btn-ghost modal-close">取消</button>' +
      '<button id="btnModalOk" class="btn-main">保存</button></div>',
      function () {
        var caption = $('#mPhotoCaption').value.trim();
        try {
          savePhoto({ author: state.myName, caption: caption, data: data })
            .then(function () { closeModal(); return loadAll(); })
            .catch(function () { toast('保存失败，请检查网络后重试'); });
        } catch (e) {
          toast('保存失败：本地空间不足，清理一些旧照片试试');
        }
      }
    );
  });
}

function openLightbox(id) {
  var p = state.photos.find(function (x) { return x.id === id; });
  if (!p) return;
  lbPhotoId = id;
  $('#lbImg').src = p.data;
  $('#lbMeta').innerHTML = (p.caption ? esc(p.caption) + '<br>' : '') + esc(p.author) + ' · ' + timeStr(p.createdAt);
  $('#lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  $('#lightbox').hidden = true;
  lbPhotoId = null;
  document.body.style.overflow = '';
}

function delPhoto() {
  if (!lbPhotoId) return;
  if (!confirm('删除这张照片？')) return;
  var photo = state.photos.find(function (x) { return x.id === lbPhotoId; });
  var tasks = [Data.remove('photos', lbPhotoId)];
  if (Data.cloudMode() && photo && photo.photoId) {
    (state.photochunks || []).filter(function (c) { return c.photoId === photo.photoId; })
      .forEach(function (c) { tasks.push(Data.remove('photochunks', c.id)); });
  }
  Promise.all(tasks).then(function () { closeLightbox(); return loadAll(); });
}

// ---------- 我的 ----------
function setField(el, v) {
  if (document.activeElement !== el) el.value = v;
}

function renderMine() {
  var p = state.profile || defaults();
  setField($('#setMe'), p.nicknameMe || '');
  setField($('#setTa'), p.nicknameTa || '');
  setField($('#setStart'), p.startDate || '');
  setField($('#setMotto'), p.motto || '');

  var me = p.nicknameMe || '我';
  var ta = p.nicknameTa || 'TA';
  $('#identitySeg').innerHTML =
    '<button data-who="' + esc(me) + '" class="' + (state.myName === me ? 'on' : '') + '">' + esc(me) + '</button>' +
    '<button data-who="' + esc(ta) + '" class="' + (state.myName === ta ? 'on' : '') + '">' + esc(ta) + '</button>';

  $('#cloudStatus').textContent = Data.cloudMode()
    ? '已连接云端：填入同一密钥的两人实时同步。'
    : '当前是本地演示模式：数据只在本机。去「云端设置」填好密钥即可两人互通。';
}

// ---------- 页签 ----------
function switchTab(tab) {
  state.tab = tab;
  $$('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + tab); });
  $$('#tabbar button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
  window.scrollTo(0, 0);
}

// ---------- 弹窗 ----------
var modalCb = null;
function openModal(html, cb) {
  $('#modalBody').innerHTML = html;
  $('#modalWrap').hidden = false;
  modalCb = cb;
  setTimeout(function () {
    var input = $('#modalBody input');
    if (input) input.focus();
  }, 60);
}
function closeModal() {
  $('#modalWrap').hidden = true;
  modalCb = null;
}
function submitModal() {
  if (modalCb) modalCb();
}

function openAnnivModal() {
  openModal(
    '<div class="modal-title">加一个纪念日</div>' +
    '<input id="mAnnivName" placeholder="名字（如：我们的纪念日）" autocomplete="off">' +
    '<input id="mAnnivDate" type="date">' +
    '<div class="modal-btns"><button class="btn-ghost modal-close">取消</button>' +
    '<button id="btnModalOk" class="btn-main">保存</button></div>',
    function () {
      var name = $('#mAnnivName').value.trim();
      var date = $('#mAnnivDate').value;
      if (!name || !date) { toast('名字和日期都要填哦'); return; }
      Data.save('anniversaries', { name: name, date: date, author: state.myName })
        .then(function () { closeModal(); return loadAll(); });
    }
  );
}

function openEventModal() {
  openModal(
    '<div class="modal-title">记下一个时刻</div>' +
    '<input id="mEventDate" type="date">' +
    '<input id="mEventTitle" placeholder="标题（如：第一次旅行）" autocomplete="off">' +
    '<input id="mEventNote" placeholder="想说的话（可不填）" autocomplete="off">' +
    '<div class="modal-btns"><button class="btn-ghost modal-close">取消</button>' +
    '<button id="btnModalOk" class="btn-main">保存</button></div>',
    function () {
      var date = $('#mEventDate').value;
      var title = $('#mEventTitle').value.trim();
      if (!date || !title) { toast('日期和标题都要填哦'); return; }
      Data.save('timeline', { date: date, title: title, note: $('#mEventNote').value.trim(), author: state.myName })
        .then(function () { closeModal(); return loadAll(); });
    }
  );
}

function openCloudModal() {
  var c = getLCConfig();
  openModal(
    '<div class="modal-title">云端设置（Bmob）</div>' +
    '<input id="mAppId" placeholder="Application ID" value="' + esc(c.appId) + '" autocomplete="off">' +
    '<input id="mAppKey" placeholder="REST API Key" value="' + esc(c.appKey) + '" autocomplete="off">' +
    '<div class="modal-hint">注册 bmobapp.com → 创建应用（免费版）→「应用密钥」里复制 Application ID 和 REST API Key 填进来。留空就是本地演示模式。</div>' +
    '<div class="modal-btns"><button class="btn-ghost modal-close">取消</button>' +
    '<button id="btnModalOk" class="btn-main">保存</button></div>',
    function () {
      var cfg = {
        appId: $('#mAppId').value.trim(),
        appKey: $('#mAppKey').value.trim()
      };
      setLCConfig(cfg);
      closeModal();
      toast(Data.cloudMode() ? '已切换到云端，正在同步…' : '已保存（本地演示模式）');
      return loadAll();
    }
  );
}

// ---------- 操作 ----------
function setReply(id) {
  state.replyTarget = id;
  renderReplyHint();
  $('#noteInput').focus();
}

function sendNote() {
  var content = $('#noteInput').value.trim();
  if (!content) return;
  var msg = { author: state.myName, content: content };
  if (state.replyTarget) msg.replyTo = state.replyTarget;
  var wasReply = state.replyTarget;
  state.replyTarget = null;
  $('#noteInput').value = '';
  renderReplyHint();
  Data.save('messages', msg)
    .then(function () { return loadAll(); })
    .then(function () {
      if (wasReply) {
        var list = $('#noteList');
        if (list) list.scrollIntoView({ block: 'end' });
      }
    });
}

function addWish() {
  var title = $('#wishInput').value.trim();
  if (!title) return;
  $('#wishInput').value = '';
  Data.save('wishes', { title: title, done: false, author: state.myName }).then(loadAll);
}

function addMoment() {
  var content = $('#momentInput').value.trim();
  if (!content) return;
  $('#momentInput').value = '';
  Data.save('moments', { content: content, author: state.myName }).then(loadAll);
}

function toggleWish(id) {
  var w = state.wishes.find(function (x) { return x.id === id; });
  if (!w) return;
  Data.save('wishes', Object.assign({}, w, { done: !w.done })).then(loadAll);
}

function delAnniv(id) {
  if (!confirm('删除这个纪念日？')) return;
  Data.remove('anniversaries', id).then(loadAll);
}
function delWish(id) {
  if (!confirm('删除这个心愿？')) return;
  Data.remove('wishes', id).then(loadAll);
}
function delMoment(id) {
  if (!confirm('删除这条小确幸？')) return;
  Data.remove('moments', id).then(loadAll);
}
function delTimeline(id) {
  if (!confirm('删除这个时刻？')) return;
  Data.remove('timeline', id).then(loadAll);
}

function saveProfile() {
  var p = Object.assign({}, state.profile || defaults(), {
    nicknameMe: $('#setMe').value.trim() || '我',
    nicknameTa: $('#setTa').value.trim() || 'TA',
    startDate: $('#setStart').value,
    motto: $('#setMotto').value.trim()
  });
  Data.save('profile', p).then(function () { toast('已保存'); return loadAll(); });
}

function setIdentity(who) {
  state.myName = who;
  localStorage.setItem('love_myname', who);
  renderMine();
  renderNotes();
}

function clearLocalData() {
  if (!confirm('确定清空当前设备缓存的数据吗？')) return;
  Data.clearLocal();
  toast('已清空');
  loadAll();
}

// ---------- Toast ----------
var toastTimer = null;
function toast(msg) {
  var el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
}

// ---------- 事件 ----------
document.addEventListener('click', function (e) {
  var t;

  t = e.target.closest('[data-tab]');
  if (t) { switchTab(t.dataset.tab); return; }

  t = e.target.closest('#btnAddAnniv'); if (t) { openAnnivModal(); return; }
  t = e.target.closest('#btnAddEvent'); if (t) { openEventModal(); return; }
  t = e.target.closest('#btnSendNote'); if (t) { sendNote(); return; }
  t = e.target.closest('#btnAddWish'); if (t) { addWish(); return; }
  t = e.target.closest('#btnAddMoment'); if (t) { addMoment(); return; }
  t = e.target.closest('#btnSaveProfile'); if (t) { saveProfile(); return; }
  t = e.target.closest('#btnCloudConfig'); if (t) { openCloudModal(); return; }
  t = e.target.closest('#btnRefresh'); if (t) { toast('正在刷新…'); loadAll(); return; }
  t = e.target.closest('#btnClearLocal'); if (t) { clearLocalData(); return; }
  t = e.target.closest('#btnDqSubmit'); if (t) { submitDailyQuestion(); return; }
  t = e.target.closest('#btnChangeQ'); if (t) { changeQuestion(); return; }
  t = e.target.closest('#btnFight'); if (t) { startFight(); return; }
  t = e.target.closest('#btnRedeem'); if (t) { redeemTask(); return; }
  t = e.target.closest('#btnMakeup'); if (t) { makeup(); return; }
  t = e.target.closest('#btnAddPhoto'); if (t) { pickPhoto(); return; }
  t = e.target.closest('#lbClose'); if (t) { closeLightbox(); return; }
  t = e.target.closest('#lbDel'); if (t) { delPhoto(); return; }
  t = e.target.closest('.lightbox'); if (t && t === e.target) { closeLightbox(); return; }
  t = e.target.closest('#btnCancelReply'); if (t) { state.replyTarget = null; renderReplyHint(); return; }
  t = e.target.closest('#btnModalOk'); if (t) { submitModal(); return; }
  t = e.target.closest('.modal-close'); if (t) { closeModal(); return; }
  t = e.target.closest('.modal-wrap'); if (t && t === e.target) { closeModal(); return; }

  t = e.target.closest('[data-reply]'); if (t) { setReply(t.dataset.reply); return; }
  t = e.target.closest('[data-toggle-wish]'); if (t) { toggleWish(t.dataset.toggleWish); return; }
  t = e.target.closest('[data-del-anniv]'); if (t) { delAnniv(t.dataset.delAnniv); return; }
  t = e.target.closest('[data-del-wish]'); if (t) { delWish(t.dataset.delWish); return; }
  t = e.target.closest('[data-del-moment]'); if (t) { delMoment(t.dataset.delMoment); return; }
  t = e.target.closest('[data-del-tl]'); if (t) { delTimeline(t.dataset.delTl); return; }
  t = e.target.closest('[data-photo]'); if (t) { openLightbox(t.dataset.photo); return; }

  t = e.target.closest('[data-who]'); if (t) { setIdentity(t.dataset.who); return; }

  t = e.target.closest('#wishSeg button');
  if (t) { state.wishSeg = t.dataset.seg; renderWish(); return; }
});

$('#noteInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendNote(); });
$('#wishInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addWish(); });
$('#momentInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addMoment(); });
$('#dqInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitDailyQuestion(); });
$('#photoFile').addEventListener('change', handlePhotoFile);

// ---------- 启动 ----------
(function init() {
  render();
  loadAll();

  // 云端模式每 12 秒自动刷新一次，接近实时同步
  setInterval(function () {
    if (Data.cloudMode()) loadAll();
  }, 12000);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Data.cloudMode()) loadAll();
  });
})();
