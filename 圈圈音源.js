/*!
 * @name 圈圈音源
 * @description 五源直连 v17（kw/tx/wy/mg/kg 五平台全部出链；VIP/付费曲优先取原版完整文件）
 * @version 17
 * @author 圈圈
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;

  function toObj(v){
    if (typeof v === 'string'){ try { return JSON.parse(v); } catch (e) { return null; } }
    return (v && typeof v === 'object') ? v : null;
  }
  function dig(o, p){
    var c = o;
    for (var i=0;i<p.length;i++){ if (c==null) return undefined; c = c[p[i]]; }
    return c;
  }
  function httpOnce(url, opts, ms){
    return new Promise(function(resolve, reject){
      var done = false;
      var timer = setTimeout(function(){
        if (done) return; done = true;
        reject(new Error('timeout'));
      }, ms || 9000);
      try {
        lx.request(url, opts || { method:'GET' }, function(err, resp){
          if (done) return; done = true; clearTimeout(timer);
          if (resp && resp.body) return resolve(resp);
          reject(new Error('net:' + String(err).slice(0,40)));
        });
      } catch(e){
        if (done) return; done = true; clearTimeout(timer);
        reject(e);
      }
    });
  }
  function bodyOf(r){
    var b = toObj(r && r.body); if (b) return b;
    var o = toObj(r); if (o) return o;
    throw new Error('bad body');
  }
  function meta(info){ return (info && info.meta) || {}; }
  function q(info){ return (info && info.type) || '128k'; }

  lx.send(EV.inited, {
    sources: {
      kw: { name:'酷我音乐', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      tx: { name:'QQ音乐',  type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac','flac24bit'] },
      wy: { name:'网易云',  type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac','flac24bit'] },
      mg: { name:'咪咕音乐', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac','flac24bit'] },
      kg: { name:'酷狗音乐', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac','flac24bit'] }
    }
  });

  // ================= 酷我（mobi 直连，实测 200 有 url） =================
  function kwGet(info){
    var m = meta(info);
    var rid = m.songId || m.rid || info.songmid;
    if (!rid && kwOf(info)){ rid = kwOf(info); }
    var t = q(info);
    var br = t.indexOf('flac') === 0 ? 'flac' : (t === '320k' ? '320kmp3' : '128kmp3');
    if (!/^\d+$/.test(String(rid))){
      return kwSearch(String(rid)).then(function(r2){
        if (!r2) throw new Error('kw:search miss');
        return kwUrl(r2, br).catch(function(){ return kwAnti(r2); });
      });
    }
    return kwUrl(rid, br).catch(function(){ return kwAnti(rid); });
  }
  // anti.s：酷我官方转链接口，纯文本直出真实 mp3 地址（无 UA 校验）
  function kwAnti(rid){
    var url = 'http://antiserver.kuwo.cn/anti.s?type=convert_url&format=mp3&response=url&rid=MUSIC_' + encodeURIComponent(rid);
    return httpOnce(url, { method:'GET' }, 8000).then(function(r){
      var t = String((r && r.body) || '').trim();
      if (!/^https?:\/\//.test(t)) throw new Error('kw-anti:no url');
      return t;
    });
  }
  function kwUrl(rid, br){
    var url0 = 'http://mobi.kuwo.cn/mobi.s?user=0&android_id=0&f=web'
      + '&source=kwplayer_ar_5.1.0.0_B_jiakong_vh.apk'
      + '&type=convert_url_with_sign&rid=' + encodeURIComponent(rid) + '&br=' + br;
    return httpOnce(url0, { method:'GET', headers:{ 'User-Agent':'okhttp/4.10.0' } }, 8000)
      .then(function(r){
        var b = bodyOf(r);
        if (b.code !== 200) throw new Error('kw:code ' + b.code);
        var u = dig(b, ['data','url']);
        if (!u) throw new Error('kw:no url');
        return u;
      });
  }

  // ================= QQ音乐（vkeys 直连，实测 200 有 url） =================
  function txGet(info){
    var m = meta(info);
    var mid = m.songmid || (m.songId && String(m.songId).length > 10 ? String(m.songId) : '') || info.songmid;
    if (!mid && kwOf(info)){
      return txSearch(kwOf(info)).then(function(m2){
        if (!m2) throw new Error("tx:search miss");
        return txUrl(m2, q(info));
      });
    }
    if (!mid) return Promise.reject(new Error("tx:no mid"));
    return txUrl(mid, q(info));
  }
  function txUrl(mid, qt){
    var t = qt || '128k';
    var qn = t === 'flac24bit' ? 12 : (t.indexOf('flac') === 0 ? 9 : (t === '320k' ? 8 : 6));
    var url = 'https://api.vkeys.cn/v2/music/tencent/geturl?mid=' + encodeURIComponent(mid) + '&quality=' + qn;
    return httpOnce(url, { method:'GET' }, 9000).then(function(r){
      var b = bodyOf(r);
      if (b.code !== 200) throw new Error('tx:code ' + b.code);
      var u = dig(b, ['data','url']);
      if (!u) throw new Error('tx:no url');
      return u;
    });
  }

  // ================= 网易云（官方 enhance 接口） =================
  function wyGet(info){
    var m = meta(info);
    var id = m.songId || m.id || info.songmid;
    function fallback(){
      if (!kwOf(info)) return Promise.reject(new Error('wy:no keyword'));
      // ① oiapi Music_163 按「歌名 歌手」精确查，返回的是完整原版文件
      //    （实测：孤勇者/陈奕迅 官方 -110 不给，oiapi 给 4.1MB 完整 mp3）
      return wyOiapi(kwOf(info)).catch(function(){
        // ② 再退到官方搜索多候选
        return wySearchAll(kwOf(info), q(info));
      }).then(function(u){
        if (!u) throw new Error('wy:原版与候选均无可用链接');
        return u;
      });
    }
    if (!id) return fallback();
    return wyUrl(id, q(info)).catch(function(){ return fallback(); });
  }
  // oiapi Music_163：参数名是 name（不是 msg），返回 data.url / data.id / data.singers
  function wyOiapi(keyword){
    var url = 'https://oiapi.net/api/Music_163?name=' + encodeURIComponent(keyword) + '&n=1&type=json';
    return httpOnce(url, { method:'GET' }, 10000).then(function(r){
      var b = bodyOf(r);
      if (b.code !== 0) throw new Error('wy-oiapi:code ' + b.code);
      var d = b.data;
      if (!d || !d.url) throw new Error('wy-oiapi:no url');
      // 双重校验：歌名要对得上，歌手也要对得上，否则视为拿到翻唱/他人版本
      var got = String(d.name || '');
      var gotSinger = (d.singers || []).map(function(s){ return s.name; }).join(' ');
      if (!nameMatch(got, keyword)) throw new Error('wy-oiapi:歌名不匹配(' + got + ')');
      var want = String(keyword).split(/\s+/).filter(function(x){ return x; });
      if (want.length > 1){
        var wantSinger = normName(want[want.length - 1]);
        if (wantSinger && normName(gotSinger).indexOf(wantSinger) < 0){
          throw new Error('wy-oiapi:非原唱(' + gotSinger.trim() + ')');
        }
      }
      return d.url;
    });
  }
  function wyUrl(id, qt){
    var t = qt || '128k';
    var br = t === 'flac24bit' ? 999000 : (t.indexOf('flac') === 0 ? 999000 : (t === '320k' ? 320000 : 128000));
    var url = 'https://music.163.com/api/song/enhance/player/url?ids=%5B' + encodeURIComponent(id) + '%5D&br=' + br;
    return httpOnce(url, {
      method:'GET',
      headers:{ 'User-Agent':'Mozilla/5.0', 'Referer':'https://music.163.com/' }
    }, 9000).then(function(r){
      var b = bodyOf(r);
      var item = b.data && b.data[0];
      if (!item) throw new Error('wy:no data');
      if (!item.url){
        var reason = dig(item, ['freeTrialPrivilege','cannotListenReason']);
        throw new Error('wy:no url(' + (reason === 1 ? 'VIP/无版权' : String(item.code || '-')) + ')');
      }
      return item.url;
    });
  }

  // ================= 咪咕（oiapi MiGu_Music，官方 listen-url 已全线下线） =================
  function mgGet(info){
    var text = kwOf(info);
    if (!text) return Promise.reject(new Error("mg:no keyword"));
    // 多关键词轮询：英文曲名 oiapi 常查不到，退到「歌手+歌名」中文写法
    var keys = kwVariants(text);
    var k = 0;
    function tryKey(){
      if (k >= keys.length) throw new Error("mg:全部关键词均无结果");
      var url = "https://oiapi.net/api/MiGu_Music?msg=" + encodeURIComponent(keys[k++]) + "&n=1&type=json";
      return httpOnce(url, { method:"GET" }, 9000).then(function(r){
        var b = bodyOf(r);
        var it = b.data;
        if (Array.isArray(it)) it = it[0];
        if (!it || !it.url) return tryKey();
        return it.url;
      }, function(){ return tryKey(); });
    }
    return Promise.resolve().then(function(){ return tryKey(); });
  }
  // ================= 酷狗（m.kugou.com playInfo 直连，实测有 url） =================
  function kgHash(m){
    if (m.hash) return m.hash;
    if (m._types){ for (var k in m._types){ if (m._types[k] && m._types[k].hash) return m._types[k].hash; } }
    if (m.types && m.types.length && m.types[0].hash) return m.types[0].hash;
    return "";
  }
  function kgGet(info){
    var m = meta(info);
    var h = kgHash(m);
    // 有 hash 先直试；失败（付费）再走多候选搜索兜底
    function fallback(){
      if (!kwOf(info)) return Promise.reject(new Error("kg:no keyword"));
      return kgSearchAll(kwOf(info), q(info)).then(function(u){
        if (!u) throw new Error("kg:全部候选均需付费");
        return u;
      });
    }
    if (!h) return fallback();
    return kgPlay(h).catch(function(){ return fallback(); });
  }
  function kgPlay(h){
    var url = "https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=" + encodeURIComponent(h);
    return httpOnce(url, { method:"GET", headers:{ "User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)", "Referer":"https://m.kugou.com/" } }, 9000).then(function(r){
      var b = bodyOf(r);
      if (b.error) throw new Error("kg:" + b.error);
      var u = b.url || (b.backup_url && b.backup_url[0]);
      if (!u) throw new Error("kg:no url");
      return u;
    });
  }

  // ================= 搜索兜底：meta 缺 id 时按 歌名+歌手 反查 =================
  function kwOf(info){
    var m = meta(info);
    var name = info.name || m.name || m.songname || m.title || "";
    var singer = info.singer || m.singer || m.artist || "";
    if (!singer && m.artists && m.artists.length){
      singer = m.artists.map(function(a){ return a.name; }).join("/");
    }
    return (name + " " + singer).trim();
  }
  // 名称匹配：去掉括号后缀、空白、大小写后，核心词必须互相包含
  function normName(s){
    return String(s || '')
      .replace(/[（(【\[].*?[)）】\]]/g, '')
      .replace(/[\s\.\-_/·]/g, '')
      .toLowerCase();
  }
  function nameMatch(got, want){
    var a = normName(got), b = normName(want);
    if (!a || !b) return false;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
    // 关键词是「歌名 歌手」，逐段比对
    var parts = String(want).split(/\s+/).filter(function(x){ return x; });
    if (parts.length > 1){
      var p = normName(parts[0]);
      if (p && (a.indexOf(p) >= 0 || p.indexOf(a) >= 0)) return true;
    }
    return false;
  }
  // 关键词变体：原文优先，再退到「歌手 歌名」与纯歌名，提高上游命中率
  function kwVariants(kw){
    var s = String(kw || "").trim();
    if (!s) return [];
    var list = [s];
    var parts = s.split(/\s+/);
    if (parts.length > 1){
      var last = parts.pop();
      var rest = parts.join(" ");
      var two = (last + " " + rest).trim();
      if (list.indexOf(two) < 0) list.push(two);
      if (list.indexOf(rest) < 0 && rest) list.push(rest);
    }
    return list;
  }
  function kwSearch(keyword){
    var url = "http://search.kuwo.cn/r.s?all=" + encodeURIComponent(keyword)
      + "&ft=music&itemset=web_2013&client=kt&pn=0&rn=1&rformat=json&encoding=utf8";
    return httpOnce(url, { method:"GET" }, 8000).then(function(r){
      var raw = String((r && r.body) || "");
      var b = null;
      try { b = JSON.parse(raw); } catch (e) {
        try { b = JSON.parse(raw.replace(/\x27/g, String.fromCharCode(34))); } catch (e2) { b = null; }
      }
      if (!b) b = toObj(r && r.body);
      if (!b) throw new Error("kw:bad body");
      var list = b.abslist || b.list;
      if (!list || !list.length) return null;
      var it = list[0];
      var rid = it.MUSICRID ? String(it.MUSICRID).replace("MUSIC_", "") : it.DC_TARGETID;
      return rid || null;
    });
  }
  
  function txSearch(keyword){
    var url = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=" + encodeURIComponent(keyword)
      + "&format=json&p=1&n=1&cr=1&new_json=1";
    return httpOnce(url, { method:"GET", headers:{ "User-Agent":"Mozilla/5.0", "Referer":"https://y.qq.com/" } }, 9000).then(function(r){
      var b = bodyOf(r);
      var it = dig(b, ["data","song","list"]) || [];
      if (!it.length) return null;
      return it[0].mid || it[0].songmid || null;
    });
  }
  function kgSearch(keyword, quality){
    var url = "https://songsearch.kugou.com/song_search_v2?keyword=" + encodeURIComponent(keyword) + "&page=1&pagesize=1";
    return httpOnce(url, { method:"GET", headers:{ "User-Agent":"Mozilla/5.0" } }, 9000).then(function(r){
      var b = bodyOf(r);
      var it = b.data && b.data.lists && b.data.lists[0];
      if (!it) return null;
      if (quality === "320k" && it.HQFileHash) return it.HQFileHash;
      if (quality.indexOf("flac") === 0 && it.SQFileHash) return it.SQFileHash;
      return it.FileHash || null;
    });
  }
  // 多候选：一次搜 5 条，逐条试播；原版付费时自动落到 Live/改编/环绕等可播版本
  function kgSearchAll(keyword, quality){
    var keys = kwVariants(keyword);
    var k = 0;
    function tryKey(){
      if (k >= keys.length) return null;
      var url = "https://songsearch.kugou.com/song_search_v2?keyword=" + encodeURIComponent(keys[k++]) + "&page=1&pagesize=5";
      return httpOnce(url, { method:"GET", headers:{ "User-Agent":"Mozilla/5.0" } }, 9000).then(function(r){
        var b = bodyOf(r);
        var list = (b.data && b.data.lists) || [];
        var hashes = [];
        list.forEach(function(it){
          var h = null;
          if (quality === "320k" && it.HQFileHash) h = it.HQFileHash;
          else if (quality && quality.indexOf("flac") === 0 && it.SQFileHash) h = it.SQFileHash;
          h = h || it.FileHash;
          if (h && hashes.indexOf(h) < 0) hashes.push(h);
        });
        var i = 0;
        function next(){
          if (i >= hashes.length) return tryKey();
          var hh = hashes[i++];
          return kgPlay(hh).then(function(u){ return u; }, function(){ return next(); });
        }
        return Promise.resolve().then(next);
      }, function(){ return tryKey(); });
    }
    return Promise.resolve().then(tryKey);
  }
  // 多候选：一次搜 5 条，逐条取链；VIP 原曲失败时落到免费版本
  function wySearchAll(keyword, quality){
    var keys = kwVariants(keyword);
    var k = 0;
    function tryKey(){
      if (k >= keys.length) return null;
      var url = "https://music.163.com/api/search/get?s=" + encodeURIComponent(keys[k++]) + "&type=1&limit=8";
      return httpOnce(url, { method:"GET", headers:{ "User-Agent":"Mozilla/5.0", "Referer":"https://music.163.com/" } }, 9000).then(function(r){
        var b = bodyOf(r);
        var songs = (b.result && b.result.songs) || [];
        var i = 0;
        function next(){
          if (i >= songs.length) return tryKey();
          var sid = songs[i++].id;
          return wyUrl(sid, quality).then(function(u){ return u; }, function(){ return next(); });
        }
        return Promise.resolve().then(next);
      }, function(){ return tryKey(); });
    }
    return Promise.resolve().then(tryKey);
  }
  function wySearch(keyword){
    var url = "https://music.163.com/api/search/get?s=" + encodeURIComponent(keyword) + "&type=1&limit=1";
    return httpOnce(url, { method:"GET", headers:{ "User-Agent":"Mozilla/5.0", "Referer":"https://music.163.com/" } }, 9000).then(function(r){
      var b = bodyOf(r);
      var s = b.result && b.result.songs && b.result.songs[0];
      return s ? s.id : null;
    });
  }
  var MAP = { kw: kwGet, tx: txGet, wy: wyGet, mg: mgGet, kg: kgGet };

  lx.on(EV.request, function(payload){
    if (payload.action !== 'musicUrl') throw new Error('bad action ' + payload.action);
    var fn = MAP[payload.source];
    if (!fn) throw new Error('unknown source ' + payload.source);
    return fn(payload.info);
  });
})();
