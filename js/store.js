// ============================================================
// 数据层：本地演示(localStorage) + LeanCloud 云端(REST)
// 统一通过 Data 接口读写，界面无感切换。
// 集合映射：
//   profile        CoupleProfile   我们（昵称、在一起的日子、主题语）
//   messages       Message         留言（小纸条）
//   anniversaries  Anniversary     纪念日
//   wishes         Wish            心愿清单
//   moments        Moment          小确幸日记
// ============================================================

function getLCConfig() {
  try {
    var saved = localStorage.getItem('love_lc_config');
    if (saved) {
      var c = JSON.parse(saved);
      if (c.appId) return c;
    }
  } catch (e) {}
  return window.LC_CONFIG || {};
}

function setLCConfig(c) {
  localStorage.setItem('love_lc_config', JSON.stringify(c));
}

var COLUMNS = {
  profile: 'CoupleProfile',
  messages: 'Message',
  anniversaries: 'Anniversary',
  wishes: 'Wish',
  moments: 'Moment',
  photos: 'Photo',
  photochunks: 'PhotoChunk',
  answers: 'DailyAnswer',
  fight: 'FightState',
  daily: 'DailyQuestion',
  checkin: 'CheckIn'
};

// ---------- 本地演示存储 ----------
var LocalStore = {
  _key: function (cls) { return 'love_' + cls; },

  getAll: function (cls) {
    try { return JSON.parse(localStorage.getItem(this._key(cls)) || '[]'); }
    catch (e) { return []; }
  },

  save: function (cls, item) {
    var list = this.getAll(cls);
    if (item.id) {
      var i = list.findIndex(function (x) { return x.id === item.id; });
      if (i >= 0) list[i] = item; else list.push(item);
    } else {
      item.id = 'loc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      item.createdAt = new Date().toISOString();
      list.push(item);
    }
    localStorage.setItem(this._key(cls), JSON.stringify(list));
    return item;
  },

  remove: function (cls, id) {
    var list = this.getAll(cls).filter(function (x) { return x.id !== id; });
    localStorage.setItem(this._key(cls), JSON.stringify(list));
  },

  clear: function () {
    Object.keys(COLUMNS).forEach(function (k) { localStorage.removeItem('love_' + k); });
  }
};

// ---------- Bmob 云端存储（REST API，无第三方依赖） ----------
var BMOB_HOST = 'https://api.bmobcloud.com';

var CloudStore = {
  _cls: function (key) { return COLUMNS[key]; },

  _headers: function (c) {
    return { 'X-Bmob-Application-Id': c.appId, 'X-Bmob-REST-API-Key': c.appKey, 'Content-Type': 'application/json' };
  },

  _url: function (c, key, id) {
    return BMOB_HOST + '/1/classes/' + this._cls(key) + (id ? '/' + id : '');
  },

  getAll: function (key) {
    var self = this;
    var c = getLCConfig();
    var all = [];
    // 照片分块、报平安记录较大，一次少查几条，避免单次查询超过 200KB 限制
    var batch = (key === 'photochunks' || key === 'checkin') ? 8 : 100;
    function page(skip) {
      return fetch(self._url(c, key) + '?limit=' + batch + '&skip=' + skip + '&order=createdAt', { headers: self._headers(c) })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.error) throw new Error(data.error);
          all = all.concat(data.results || []);
          if ((data.results || []).length === batch) return page(skip + batch);
          return all.map(function (o) {
            var obj = {};
            Object.keys(o).forEach(function (k) { if (k !== 'objectId') obj[k] = o[k]; });
            obj.id = o.objectId;
            obj.createdAt = o.createdAt;
            return obj;
          });
        });
    }
    return page(0);
  },

  save: function (key, item) {
    var self = this;
    var c = getLCConfig();
    var id = item.id;
    var body = {};
    Object.keys(item).forEach(function (k) {
      if (k !== 'id' && k !== 'createdAt' && k !== 'updatedAt') body[k] = item[k];
    });
    var url = this._url(c, key, id);
    var opts = { method: id ? 'PUT' : 'POST', headers: this._headers(c), body: JSON.stringify(body) };
    return fetch(url, opts)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        if (id) return item;
        var obj = Object.assign({}, body, { id: data.objectId, createdAt: data.createdAt });
        return obj;
      });
  },

  remove: function (key, id) {
    var c = getLCConfig();
    return fetch(this._url(c, key, id), { method: 'DELETE', headers: this._headers(c) })
      .then(function (res) { return res.json(); })
      .then(function (data) { if (data.error) throw new Error(data.error); });
  }
};

// ---------- 统一接口 ----------
var Data = {
  cloudMode: function () {
    var c = getLCConfig();
    return !!(c.appId && c.appKey);
  },
  getAll: function (key) {
    return this.cloudMode() ? CloudStore.getAll(key) : Promise.resolve(LocalStore.getAll(key));
  },
  save: function (key, item) {
    return this.cloudMode() ? CloudStore.save(key, item) : Promise.resolve(LocalStore.save(key, item));
  },
  remove: function (key, id) {
    return this.cloudMode() ? CloudStore.remove(key, id) : Promise.resolve(LocalStore.remove(key, id));
  },
  clearLocal: function () {
    LocalStore.clear();
  }
};
