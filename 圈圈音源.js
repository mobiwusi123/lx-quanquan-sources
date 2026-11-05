/*!
 * @name 圈圈音源
 * @description 五源直连 v15（kw/tx/wy/kg 四个平台实测可出链；mg 走官方接口，无版权/下线曲返回明确错误）
 * @version 15
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
        return kwUrl(r2, br);
      });
    }
    return kwUrl(rid, br);
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
    if (!id && kwOf(info)){
      return wySearch(kwOf(info)).then(function(i2){
        if (!i2) throw new Error('wy:search miss');
        return wyUrl(i2, q(info));
      });
    }
    if (!id) return Promise.reject(new Error('wy:no id'));
    return wyUrl(id, q(info));
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
    var m = meta(info);
    var kw2 = m.songname || info.name || (m.name || "");
    var singer = m.singer || info.singer || "";
    var text = (String(kw2) + " " + String(singer)).trim();
    if (!text) return Promise.reject(new Error("mg:no keyword"));
    var url = "https://oiapi.net/api/MiGu_Music?msg=" + encodeURIComponent(text) + "&n=1&type=json";
    return httpOnce(url, { method:"GET" }, 9000).then(function(r){
      var b = bodyOf(r);
      var it = b.data;
      if (Array.isArray(it)) it = it[0];
      if (!it) throw new Error("mg:no data");
      if (!it.url) throw new Error("mg:offline(no url)");
      return it.url;
    });
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
    if (!h && kwOf(info)) {
      return kgSearch(kwOf(info), q(info)).then(function(hh){
        if (!hh) throw new Error("kg:no hash");
        return kgPlay(hh);
      });
    }
    if (!h) return Promise.reject(new Error("kg:no hash"));
    return kgPlay(h);
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
