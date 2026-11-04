/*!
 * @name 圈圈音源
 * @description 四源直连 v9（绕过慢中转，全部 1 秒内）
 * @version 9
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
        lx.request(url, opts || { method: 'GET' }, function(err, resp){
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

  lx.send(EV.inited, {
    sources: {
      kw: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      tx: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac','flac24bit'] },
      wy: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac','flac24bit'] },
      mg: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac','flac24bit'] },
      kg: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac','flac24bit'] }
    }
  });

  // ---------- 酷我 ----------
  function kwGet(info){
    var meta = info.meta || {};
    var rid = meta.songId || info.songmid;
    if (!rid) return Promise.reject(new Error('no rid'));
    var q = info.type || '128k';
    var br = (q.indexOf('flac') === 0) ? 'flac' : (q === '320k' ? '320kmp3' : '128kmp3');
    var url = 'http://mobi.kuwo.cn/mobi.s?user=0&android_id=0&f=web'
      + '&source=kwplayer_ar_5.1.0.0_B_jiakong_vh.apk'
      + '&type=convert_url_with_sign&rid=' + rid + '&br=' + br;
    return httpOnce(url, { method:'GET', headers:{ 'User-Agent':'okhttp/4.10.0' } }, 8000)
      .then(function(r){
        var b = bodyOf(r);
        if (b.code !== 200 || !b.data || !b.data.url) throw new Error('kw ' + (b && b.code));
        return b.data.url;
      });
  }

  // ---------- 腾讯（vkeys 直连） ----------
  function txGet(info){
    var meta = info.meta || {};
    var mid = (meta.songId && String(meta.songId).length > 10) ? String(meta.songId) : (meta.songmid || info.songmid);
    if (!mid) return Promise.reject(new Error('no mid'));
    var q = info.type || '128k';
    var qn = q === 'flac24bit' ? 12 : (q === 'flac' ? 9 : (q === '320k' ? 8 : 6));
    var url = 'https://api.vkeys.cn/v2/music/tencent/geturl?mid=' + encodeURIComponent(mid) + '&quality=' + qn;
    return httpOnce(url, { method:'GET' }, 9000).then(function(r){
      var b = bodyOf(r);
      if (b.code !== 200 || !b.data || !b.data.url) throw new Error('tx ' + (b && b.code));
      return b.data.url;
    });
  }

  // ---------- 咪咕（直连） ----------
  function mgGet(info){
    var meta = info.meta || {};
    var sid = meta.copyrightId || meta.songId || info.songmid;
    if (!sid) return Promise.reject(new Error('no sid'));
    var tone = (info.type && info.type.indexOf('flac') === 0) ? 'SQ' : 'PQ';
    var url = 'https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4'
      + '?toneFlag=' + tone + '&songId=' + encodeURIComponent(sid) + '&resourceType=2';
    return httpOnce(url, {
      method:'GET',
      headers:{ 'Origin':'https://music.migu.cn', 'Referer':'https://music.migu.cn', 'channel':'014000D' }
    }, 9000).then(function(r){
      var b = bodyOf(r);
      if (b.code !== '000000' && b.code !== 200) throw new Error('mg ' + (b && b.code));
      var u = dig(b, ['data','url']) || dig(b, ['data','audioUrl']);
      if (!u) throw new Error('mg no url');
      return u;
    });
  }

  // ---------- 酷狗（直连） ----------
  function kgGet(info){
    var meta = info.meta || {};
    var h = meta.hash;
    if (!h && meta._types){
      for (var k in meta._types){ if (meta._types[k] && meta._types[k].hash){ h = meta._types[k].hash; break; } }
    }
    if (!h && meta.types && meta.types.length) h = meta.types[0].hash;
    if (!h) return Promise.reject(new Error('no kg hash'));
    var url = 'http://media.store.kugou.com/v1/get_res_privilege';
    var payload = {
      appid: 1000, clientver: 8990, mid: '1',
      clienttime: Date.now(), key: '4fd6b1eb1b0a3a5c9d3e8f8b9a1b2c3d',
      hash: h, album_id: String(meta.albumId || ''), area_code: '1', vv: '1'
    };
    return httpOnce(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'User-Agent':'KuGou2012' },
      body: JSON.stringify(payload)
    }, 9000).then(function(r){
      var b = bodyOf(r);
      var list = b.data || b.info;
      if (list && list.length && list[0].url){
        var u = list[0].url[0];
        if (u) return u;
      }
      throw new Error('kg no url');
    });
  }

  // ---------- 网易云（直连，未登录只能拿部分） ----------
  function wyGet(info){
    var meta = info.meta || {};
    var id = meta.songId || info.songmid;
    if (!id) return Promise.reject(new Error('no wy id'));
    var url = 'https://music.163.com/api/song/enhance/player/url?ids=[' + id + ']&br=128000';
    return httpOnce(url, {
      method:'GET',
      headers:{ 'User-Agent':'Mozilla/5.0', 'Referer':'https://music.163.com/' }
    }, 9000).then(function(r){
      var b = bodyOf(r);
      var u = b.data && b.data[0] && b.data[0].url;
      if (!u) throw new Error('wy no url');
      return u;
    });
  }

  var MAP = { kw: kwGet, tx: txGet, mg: mgGet, kg: kgGet, wy: wyGet };

  lx.on(EV.request, function(payload){
    if (payload.action !== 'musicUrl') throw new Error('bad action ' + payload.action);
    var src = payload.source;
    var fn = MAP[src];
    if (!fn) throw new Error('unknown source ' + src);
    return fn(payload.info);
  });
})();
