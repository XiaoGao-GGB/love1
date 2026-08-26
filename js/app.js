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
  checkins: [],
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
    Data.getAll('checkin')
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
    state.checkins = r[10].sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    render();
    updateNewBanner();
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

// 只在进入照片页时拉取照片分块（分块是整张图片，比较占流量）
function loadPhotoChunks() {
  return Data.getAll('photochunks').then(function (chunks) {
    state.photochunks = chunks;
    assemblePhotos();
    renderPhotos();
  }).catch(function (e) {
    toast('照片加载失败：' + (e && e.message ? e.message : e));
  });
}

function render() {
  renderCloudDot();
  renderHome();
  renderDailyQuestion();
  renderCheckin();
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

// ---------- 实时日期时间 ----------
var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function updateClock() {
  var d = new Date();
  var elDate = $('#curDate'), elClock = $('#curClock');
  if (!elDate || !elClock) return;
  elDate.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + WEEK_CN[d.getDay()];
  elClock.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

// ---------- 天气（Open-Meteo，免费免Key） ----------
var WEATHER_CODES = {
  0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
  45: '雾', 48: '冻雾',
  51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨', 56: '冻雨', 57: '冻雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '阵雨', 82: '强阵雨',
  85: '阵雪', 86: '阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '雷阵雨伴强冰雹'
};

function setWeatherText(t) {
  var el = $('#curWeather');
  if (el) el.textContent = t || '';
}

function applyForecast(w, prefix) {
  if (!w.current) throw new Error('noweather');
  var t = Math.round(w.current.temperature_2m);
  var feel = Math.round(w.current.apparent_temperature);
  var code = WEATHER_CODES[w.current.weather_code] || '';
  var txt = (prefix ? prefix + ' ' : '') + t + '°' + (code ? ' ' + code : '');
  if (code && Math.abs(feel - t) >= 3) txt += ' 体感' + feel + '°';
  setWeatherText(txt);
}

function fetchWeatherByCity(city) {
  return fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=zh')
    .then(function (r) { return r.json(); })
    .then(function (g) {
      if (!g.results || !g.results.length) throw new Error('notfound');
      var loc = g.results[0];
      return fetch('https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude + '&longitude=' + loc.longitude +
        '&current=temperature_2m,apparent_temperature,weather_code&timezone=auto')
        .then(function (r) { return r.json(); })
        .then(function (w) { applyForecast(w, loc.name); });
    });
}

function fetchWeatherByGeo(lat, lon) {
  return fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,apparent_temperature,weather_code&timezone=auto')
    .then(function (r) { return r.json(); })
    .then(function (w) { applyForecast(w, ''); });
}

function refreshWeather() {
  var p = state.profile || {};
  if (p.city) {
    fetchWeatherByCity(p.city).catch(function () { setWeatherText(''); });
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function (pos) {
      fetchWeatherByGeo(pos.coords.latitude, pos.coords.longitude).catch(function () { setWeatherText(''); });
    }, function () { setWeatherText(''); });
  } else {
    setWeatherText('');
  }
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
      '<button class="note-share" data-share-note="' + esc(m.id) + '">分享</button>' +
      '<button class="note-del" data-del-note="' + esc(m.id) + '">删除</button>' +
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
    if (!p.data) return '<div class="photo-thumb loading" data-photo="' + esc(p.id) + '"></div>';
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
            .then(function () { closeModal(); notifyPartner('新照片', state.myName + '发了张新照片，快去看看'); return loadAll(); })
            .then(loadPhotoChunks)
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
  Promise.all(tasks).then(function () { closeLightbox(); return loadAll(); }).then(loadPhotoChunks);
}

// ---------- 报平安 · 我在哪 ----------
// 手机 GPS 给的是 WGS-84，高德/腾讯/百度地图用的是 GCJ-02，不换算地图上会偏几百米
var GCJ_A = 6378245.0, GCJ_EE = 0.00669342162296594323;
function outOfChina(lat, lon) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function gcjTransformLat(x, y) {
  var ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  ret += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  ret += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return ret;
}
function gcjTransformLon(x, y) {
  var ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  ret += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  ret += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return ret;
}
function wgs84ToGcj02(lat, lon) {
  if (outOfChina(lat, lon)) return { lat: lat, lon: lon };
  var dLat = gcjTransformLat(lon - 105, lat - 35);
  var dLon = gcjTransformLon(lon - 105, lat - 35);
  var radLat = lat / 180 * Math.PI;
  var magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  var sqrtMagic = Math.sqrt(magic);
  dLat = dLat * 180 / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI);
  dLon = dLon * 180 / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lon: lon + dLon };
}

function renderCheckin() {
  var wrap = $('#checkinList');
  if (!wrap) return;
  if (!state.checkins.length) {
    wrap.innerHTML = '<div class="empty">还没有报平安，点右上角「报平安」报一下</div>';
    return;
  }
  wrap.innerHTML = state.checkins.map(function (c, i) {
    var note = c.note || '报了个平安';
    var hasLoc = !(c.lat == null || c.lon == null);
    var mapLink = '';
    if (hasLoc) {
      var g = wgs84ToGcj02(Number(c.lat), Number(c.lon));
      mapLink = '<a class="checkin-map" target="_blank" rel="noopener" href="https://uri.amap.com/marker?position=' +
        encodeURIComponent(g.lon) + ',' + encodeURIComponent(g.lat) +
        '&name=' + encodeURIComponent(note) + '&callnative=0">地图</a>';
    }
    var photo = c.photo ? '<div class="checkin-photo"><img src="' + c.photo + '" alt=""></div>' : '';
    return '<div class="checkin-item">' + photo +
      '<div class="checkin-body">' +
      '<div class="checkin-note">' + esc(note) + '</div>' +
      '<div class="checkin-meta">' + esc(c.author) + ' · ' + timeStr(c.createdAt) +
      (hasLoc ? '' : ' · 无定位') + (c.acc ? ' · 精度±' + c.acc + '米' : '') + '</div>' +
      '</div>' + mapLink +
      '<button class="checkin-share" data-share-checkin="' + i + '">分享</button>' +
      '<button class="checkin-del" data-del-checkin="' + i + '">删除</button>' +
      '</div>';
  }).join('');
}

function pickCheckinPhoto() {
  $('#checkinPhoto').click();
}

// 压成小缩略图：让整条报平安记录（含照片）远小于 40KB，不用分块
function fileToThumb(file, cb) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var MAX_B64 = 16 * 1024;
      var maxW = 320, q = 0.5, data;
      for (;;) {
        var scale = Math.min(1, maxW / img.width);
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        data = canvas.toDataURL('image/jpeg', q);
        if (data.length <= MAX_B64 || maxW <= 200) break;
        maxW = Math.round(maxW * 0.7);
        q = Math.max(0.35, q - 0.08);
      }
      cb(data);
    };
    img.onerror = function () { cb(null); };
    img.src = e.target.result;
  };
  reader.onerror = function () { cb(null); };
  reader.readAsDataURL(file);
}

function handleCheckinPhotoFile() {
  var input = $('#checkinPhoto');
  var file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  fileToThumb(file, function (data) {
    if (!data) { toast('照片打不开，换一张试试'); return; }
    openModal(
      '<div class="modal-title">报平安</div>' +
      '<img src="' + data + '" class="modal-photo-preview" alt="">' +
      '<input id="mCheckinNote" placeholder="想说的话（可不填）" autocomplete="off">' +
      '<div class="modal-hint">确认后会记录你的当前位置，对方能看到你报平安的照片和位置。</div>' +
      '<div class="modal-btns"><button class="btn-ghost modal-close">取消</button>' +
      '<button id="btnModalOk" class="btn-main">报平安</button></div>',
      function () { submitCheckin(data); }
    );
  });
}

function submitCheckin(data) {
  var note = $('#mCheckinNote').value.trim();
  var base = { author: state.myName, note: note, photo: data };
  toast('正在获取位置…');
  var flow = { done: false };
  function save(item) {
    if (flow.done) return false;
    // 弹窗已被取消就不要再保存了
    if (modalCb === null) return false;
    flow.done = true;
    Data.save('checkin', item)
      .then(function () {
        closeModal();
        toast('报平安成功');
        notifyPartner('报平安', (base.author || state.myName) + '报了平安，快去看看 TA 在哪');
        return loadAll();
      })
      .catch(function () { toast('保存失败，请检查网络后重试'); });
    return true;
  }
  if (!navigator.geolocation) {
    toast('设备不支持定位，已记为普通报平安');
    save(base);
    return;
  }
  getLocation(function (loc) {
    if (loc.acc && loc.acc > 300) {
      confirmCoarse(base, loc, save, flow);
    } else {
      save(Object.assign({}, base, loc));
    }
  }, function () { toast('没拿到定位，已记为普通报平安'); save(base); });
}

// 定位太粗（室内/信号差，几百米以上）时先问一下，别悄悄存个偏很远的
function confirmCoarse(base, loc, save, flow) {
  if (flow.done || modalCb === null) return;
  function retryCoarse() {
    toast('再等一下，正在找更准的位置…');
    getLocation(function (loc2) {
      if (flow.done || modalCb === null) return;
      if (loc2.acc && loc2.acc > 300) {
        confirmCoarse(base, loc2, save, flow);
      } else {
        save(Object.assign({}, base, loc2));
      }
    }, function () {
      if (flow.done || modalCb === null) return;
      toast('还是没拿到更准的定位');
      confirmCoarse(base, loc, save, flow);
    });
  }
  openModal(
    '<div class="modal-title">定位不太准</div>' +
    '<div class="modal-hint">现在只能定位到大约 ±' + loc.acc + ' 米，可能是室内或信号不好。<br>建议到窗边、阳台或楼下再报，能准到几米~几十米。</div>' +
    '<div class="modal-btns"><button class="btn-ghost" id="btnCoarseRetry">再等等</button>' +
    '<button id="btnModalOk" class="btn-main">就用这个位置</button></div>',
    function () { save(Object.assign({}, base, loc)); }
  );
  $('#btnCoarseRetry').onclick = retryCoarse;
}

// 先要 GPS 高精度（一般能到几米），拿不到再退回普通定位，总比没有位置好
function getLocation(ok, fail) {
  var done = false;
  function accept(pos) {
    if (done) return;
    done = true;
    ok({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) });
  }
  function giveup() {
    if (done) return;
    done = true;
    fail();
  }
  if (!navigator.geolocation) { fail(); return; }
  navigator.geolocation.getCurrentPosition(
    accept,
    function () {
      navigator.geolocation.getCurrentPosition(accept, giveup, { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 });
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

// ---------- 分享给 TA ----------
function shareOut(title, text, url) {
  var full = text + (url ? '\n' + url : '');
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url || location.href }).catch(function () {});
    return;
  }
  function copy() {
    var ta = document.createElement('textarea');
    ta.value = full;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制，可粘贴发给 TA'); }
    catch (e) { prompt('复制下面这段话发给 TA：', full); }
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(function () { toast('已复制，可粘贴发给 TA'); }).catch(copy);
  } else {
    copy();
  }
}

function shareCheckin(i) {
  var c = state.checkins[i];
  if (!c) return;
  var note = c.note || '报了个平安';
  var text = (c.author || 'TA') + '报平安啦（' + timeStr(c.createdAt) + '）：' + note;
  var url = '';
  if (c.lat != null && c.lon != null) {
    var g = wgs84ToGcj02(Number(c.lat), Number(c.lon));
    url = 'https://uri.amap.com/marker?position=' + encodeURIComponent(g.lon) + ',' + encodeURIComponent(g.lat) +
      '&name=' + encodeURIComponent(note) + '&callnative=0';
  }
  shareOut('报平安', text, url || location.href);
}

function shareNote(id) {
  var m = state.messages.find(function (x) { return x.id === id; });
  if (!m) return;
  shareOut('留言', (m.author || 'TA') + '：' + m.content, location.href);
}

function sharePhoto() {
  var p = state.photos.find(function (x) { return x.id === lbPhotoId; });
  shareOut('照片', (p && p.author ? p.author : 'TA') + '在情侣小网站发了张新照片，快去看看', location.href);
}

// ---------- 微信提醒（PushPlus 推送加，网页可直接调用，已实测支持跨域） ----------
function partnerToken() {
  var p = state.profile || {};
  if (!p.tokenMe && !p.tokenTa) return '';
  if (state.myName === p.nicknameMe) return p.tokenTa || '';
  return p.tokenMe || '';
}
function notifyPartner(title, content) {
  var token = partnerToken();
  if (!token) return Promise.resolve();
  return fetch('https://www.pushplus.plus/send?token=' + encodeURIComponent(token) +
    '&title=' + encodeURIComponent(title) +
    '&content=' + encodeURIComponent(content))
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j && j.code === 905) toast('微信提醒：PushPlus 需先在公众号实名认证');
      else if (j && j.code === 903) toast('微信提醒：对方的提醒码不对，核对一下');
    })
    .catch(function () {});
}

// 发一条测试消息到「我的微信提醒码」，用来确认 token 和实名认证没问题
function testPush() {
  var token = $('#setTokenMe').value.trim();
  if (!token) { toast('先在「我的微信提醒码」填好你的 token 再试'); return; }
  toast('正在发送测试…');
  fetch('https://www.pushplus.plus/send?token=' + encodeURIComponent(token) +
    '&title=' + encodeURIComponent('情侣小网站测试') +
    '&content=' + encodeURIComponent('如果你在微信收到这条消息，说明提醒设置成功啦！'))
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j && j.code === 200) { toast('发送成功！去微信看看收到没'); }
      else if (j && j.code === 905) { toast('PushPlus 未实名认证：去公众号里点「实名认证」完成'); }
      else if (j && j.code === 903) { toast('提醒码不对：回公众号重新复制 token'); }
      else if (j && j.code === 401) { toast('提醒码无效：回公众号重新复制 token'); }
      else { toast('发送失败（' + (j && j.code ? j.code : '网络') + '），稍后再试'); }
    })
    .catch(function () { toast('网络不通，稍后再试'); });
}

// ---------- 网站内新动态提醒 ----------
function collectActivity() {
  return (state.checkins || []).concat(state.messages || [], state.photos || [], state.moments || []);
}
function unseenActivity() {
  var lastSeen = localStorage.getItem('love_lastseen') || '';
  var mine = state.myName;
  return collectActivity().filter(function (x) {
    return x.author && x.author !== mine && String(x.createdAt || '') > lastSeen;
  });
}
function updateNewBanner() {
  var banner = $('#newBanner');
  if (!banner) return;
  var unseen = unseenActivity();
  if (!unseen.length) { banner.hidden = true; return; }
  $('#newBannerText').textContent = unseen[0].author + '发来 ' + unseen.length + ' 条新动态，点这里看看';
  banner.hidden = false;
}
function markAllSeen() {
  var max = '';
  collectActivity().forEach(function (x) {
    if (String(x.createdAt || '') > max) max = String(x.createdAt || '');
  });
  localStorage.setItem('love_lastseen', max);
  var banner = $('#newBanner');
  if (banner) banner.hidden = true;
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
  setField($('#setCity'), p.city || '');
  setField($('#setTokenMe'), p.tokenMe || '');
  setField($('#setTokenTa'), p.tokenTa || '');

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
  // 每次进照片页都拉一次最新照片，能看到 TA 新传的
  if (tab === 'photos') loadPhotoChunks();
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
      notifyPartner('新留言', state.myName + '给你留言：' + content);
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
  Data.save('moments', { content: content, author: state.myName }).then(function () {
    notifyPartner('小确幸', state.myName + '记下了一件小确幸：' + content);
    return loadAll();
  });
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
function delNote(id) {
  if (!confirm('删除这条留言？')) return;
  Data.remove('messages', id).then(loadAll);
}
function delCheckin(i) {
  var c = state.checkins[i];
  if (!c) return;
  if (!confirm('删除这条报平安？')) return;
  Data.remove('checkin', c.id).then(loadAll);
}

function saveProfile() {
  var p = Object.assign({}, state.profile || defaults(), {
    nicknameMe: $('#setMe').value.trim() || '我',
    nicknameTa: $('#setTa').value.trim() || 'TA',
    startDate: $('#setStart').value,
    motto: $('#setMotto').value.trim(),
    city: $('#setCity').value.trim(),
    tokenMe: $('#setTokenMe').value.trim(),
    tokenTa: $('#setTokenTa').value.trim()
  });
  Data.save('profile', p).then(function () { toast('已保存'); return loadAll(); }).then(refreshWeather);
}

function clearLocalData() {
  if (!confirm('确定清空当前设备缓存的数据吗？')) return;
  Data.clearLocal();
  toast('已清空');
  loadAll();
}

// ---------- 登录 ----------
function applyLogin(u) {
  var p = state.profile || defaults();
  state.myName = u.role === 'me' ? (p.nicknameMe || '音宝') : (p.nicknameTa || '轩宝');
  localStorage.setItem('love_myname', state.myName);
  localStorage.setItem('love_user', u.user);
  var ov = $('#loginOverlay');
  if (ov) ov.hidden = true;
}
function tryAutoLogin() {
  var saved = localStorage.getItem('love_user');
  if (!saved) return false;
  var u = (window.LOGIN_USERS || []).filter(function (x) { return x.user === saved; })[0];
  if (!u) return false;
  applyLogin(u);
  return true;
}
function doLogin() {
  var user = $('#loginUser').value.trim();
  var pass = $('#loginPass').value;
  var u = (window.LOGIN_USERS || []).filter(function (x) { return x.user === user && x.pass === pass; })[0];
  if (!u) { toast('账号或密码不对'); return; }
  applyLogin(u);
  loadAll();
}
function doLogout() {
  if (!confirm('确定退出登录吗？')) return;
  localStorage.removeItem('love_user');
  localStorage.removeItem('love_myname');
  location.reload();
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

  t = e.target.closest('#newBanner');
  if (t) { markAllSeen(); switchTab('home'); return; }

  t = e.target.closest('#btnAddAnniv'); if (t) { openAnnivModal(); return; }
  t = e.target.closest('#btnAddEvent'); if (t) { openEventModal(); return; }
  t = e.target.closest('#btnSendNote'); if (t) { sendNote(); return; }
  t = e.target.closest('#btnAddWish'); if (t) { addWish(); return; }
  t = e.target.closest('#btnAddMoment'); if (t) { addMoment(); return; }
  t = e.target.closest('#btnSaveProfile'); if (t) { saveProfile(); return; }
  t = e.target.closest('#btnTestPush'); if (t) { testPush(); return; }
  t = e.target.closest('#btnCloudConfig'); if (t) { openCloudModal(); return; }
  t = e.target.closest('#btnRefresh'); if (t) { toast('正在刷新…'); loadAll(); return; }
  t = e.target.closest('#btnClearLocal'); if (t) { clearLocalData(); return; }
  t = e.target.closest('#btnLogin'); if (t) { doLogin(); return; }
  t = e.target.closest('#btnLogout'); if (t) { doLogout(); return; }
  t = e.target.closest('#btnDqSubmit'); if (t) { submitDailyQuestion(); return; }
  t = e.target.closest('#btnChangeQ'); if (t) { changeQuestion(); return; }
  t = e.target.closest('#btnFight'); if (t) { startFight(); return; }
  t = e.target.closest('#btnRedeem'); if (t) { redeemTask(); return; }
  t = e.target.closest('#btnMakeup'); if (t) { makeup(); return; }
  t = e.target.closest('#btnAddPhoto'); if (t) { pickPhoto(); return; }
  t = e.target.closest('#btnCheckin'); if (t) { pickCheckinPhoto(); return; }
  t = e.target.closest('#lbClose'); if (t) { closeLightbox(); return; }
  t = e.target.closest('#lbDel'); if (t) { delPhoto(); return; }
  t = e.target.closest('#lbShare'); if (t) { sharePhoto(); return; }
  t = e.target.closest('.lightbox'); if (t && t === e.target) { closeLightbox(); return; }
  t = e.target.closest('#btnCancelReply'); if (t) { state.replyTarget = null; renderReplyHint(); return; }
  t = e.target.closest('#btnModalOk'); if (t) { submitModal(); return; }
  t = e.target.closest('.modal-close'); if (t) { closeModal(); return; }
  t = e.target.closest('.modal-wrap'); if (t && t === e.target) { closeModal(); return; }

  t = e.target.closest('[data-reply]'); if (t) { setReply(t.dataset.reply); return; }
  t = e.target.closest('[data-share-note]'); if (t) { shareNote(t.dataset.shareNote); return; }
  t = e.target.closest('[data-share-checkin]'); if (t) { shareCheckin(+t.dataset.shareCheckin); return; }
  t = e.target.closest('[data-del-note]'); if (t) { delNote(t.dataset.delNote); return; }
  t = e.target.closest('[data-del-checkin]'); if (t) { delCheckin(+t.dataset.delCheckin); return; }
  t = e.target.closest('[data-toggle-wish]'); if (t) { toggleWish(t.dataset.toggleWish); return; }
  t = e.target.closest('[data-del-anniv]'); if (t) { delAnniv(t.dataset.delAnniv); return; }
  t = e.target.closest('[data-del-wish]'); if (t) { delWish(t.dataset.delWish); return; }
  t = e.target.closest('[data-del-moment]'); if (t) { delMoment(t.dataset.delMoment); return; }
  t = e.target.closest('[data-del-tl]'); if (t) { delTimeline(t.dataset.delTl); return; }
  t = e.target.closest('[data-photo]'); if (t) { openLightbox(t.dataset.photo); return; }


  t = e.target.closest('#wishSeg button');
  if (t) { state.wishSeg = t.dataset.seg; renderWish(); return; }
});

$('#loginUser').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
$('#loginPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
$('#noteInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendNote(); });
$('#wishInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addWish(); });
$('#momentInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addMoment(); });
$('#dqInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitDailyQuestion(); });
$('#photoFile').addEventListener('change', handlePhotoFile);
$('#checkinPhoto').addEventListener('change', handleCheckinPhotoFile);

// ---------- 启动 ----------
(function init() {
  tryAutoLogin();
  render();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(refreshWeather, 30 * 60 * 1000);
  loadAll().then(refreshWeather);

  // 云端模式每 12 秒自动刷新一次，接近实时同步
  setInterval(function () {
    if (Data.cloudMode()) loadAll();
  }, 12000);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Data.cloudMode()) loadAll();
  });
})();
