/*!
 * @name 圈圈音源
 * @description 酷我直连 v8（绕过慢中转，0.5 秒取链接）
 * @version 8
 * @author 圈圈
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;

  // 酷我官方接口，实测 0.35~0.6 秒
  var KW_URL = 'http://mobi.kuwo.cn/mobi.s';
  var KW_SRC = 'kwplayer_ar_5.1.0.0_B_jiakong_vh.apk';
  var UA = 'okhttp/4.10.0';

  // 仍然保留中转，但只在酷我失败时才用
  var FALLBACK_API = 'https://api.music.lerd.dpdns.org';

  function dig(obj, path){
    var cur = obj;
    for (var i = 0; i < path.length; i++){
      if (cur === null || cur === undefined) return undefined;
      cur = cur[path[i]];
    }
    return cur;
  }
  function toObj(v){
    if (typeof v === 'string'){ try { return JSON.parse(v); } catch (e) { return null; } }
    return (v && typeof v === 'object') ? v : null;
  }
  function httpOnce(url, opts, ms){
    return new Promise(function(resolve, reject){
      var settled = false;
      var timer = setTimeout(function(){
        if (settled) return; settled = true;
        reject(new Error('timeout'));
      }, ms || 8000);
      try {
        lx.request(url, opts || { method: 'GET' }, function(err, resp){
          if (settled) return; settled = true; clearTimeout(timer);
          if (resp && resp.body) return resolve(resp);
          reject(new Error('net:' + String(err).slice(0, 40)));
        });
      } catch (e) {
        if (settled) return; settled = true; clearTimeout(timer);
        reject(e);
      }
    });
  }
  function bodyOf(resp){
    var b = toObj(resp && resp.body);
    if (b) return b;
    var r = toObj(resp);
    if (r) return r;
    throw new Error('bad body');
  }

  // 初始化：声明支持五个源（酷我自己实现，其余走中转）
  var INIT = {
    sources: {
      kw: { type: 'music', actions: ['musicUrl'], qualitys: ['128k','320k','flac'] },
      tx: { type: 'music', actions: ['musicUrl'], qualitys: ['128k','320k','flac','flac24bit'] },
      wy: { type: 'music', actions: ['musicUrl'], qualitys: ['128k','320k','flac','flac24bit'] },
      mg: { type: 'music', actions: ['musicUrl'], qualitys: ['128k','320k','flac','flac24bit'] },
      kg: { type: 'music', actions: ['musicUrl'], qualitys: ['128k','320k','flac','flac24bit'] }
    }
  };
  lx.send(EV.inited, INIT);

  // ============ 酷我直连 ============
  function kwGetUrl(info){
    var meta = info.meta || {};
    var rid = meta.songId || info.songmid;
    if (!rid) return Promise.reject(new Error('no kw rid'));

    var q = info.type || '128k';
    var br = q === 'flac' || q === 'flac24bit' ? 'flac' : (q === '320k' ? '320kmp3' : '128kmp3');

    var url = KW_URL
      + '?user=0&android_id=0&f=web&source=' + KW_SRC
      + '&type=convert_url_with_sign&rid=' + rid + '&br=' + br;

    return httpOnce(url, { method: 'GET', headers: { 'User-Agent': UA } }, 8000).then(function(resp){
      var b = bodyOf(resp);
      if (b.code !== 200 || !b.data || !b.data.url) {
        throw new Error('kw code=' + (b && b.code));
      }
      return b.data.url;
    });
  }

  // ============ 中转兜底（其他源） ============
  function proxyGetUrl(source, info){
    return httpOnce(FALLBACK_API + '/' + source, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info)
    }, 9000).then(function(resp){
      var b = bodyOf(resp);
      if (b.code === 200 && b.data && b.data.url) return b.data.url;
      if (b.code !== 303 || !b.data || !b.data.request) {
        throw new Error((b && b.msg) || ('code=' + (b && b.code)));
      }
      var req = b.data.request, spec = b.data.response || {};
      return httpOnce(req.url, req.options || { method: 'GET' }, 9000).then(function(resp2){
        var b2 = bodyOf(resp2);
        var url = spec.url ? dig(b2, spec.url.slice(1)) : null;
        if (!url && b2 && b2.data) url = b2.data.url;
        if (!url) throw new Error('no url');
        return url;
      });
    });
  }

  lx.on(EV.request, function(payload){
    var action = payload.action;
    var source = payload.source;
    var info = payload.info;
    if (action !== 'musicUrl') throw new Error('bad action ' + action);

    if (source === 'kw') {
      // 酷我直连，失败再走中转
      return kwGetUrl(info).catch(function(e){
        return proxyGetUrl('kw', info);
      });
    }
    return proxyGetUrl(source, info);
  });
})();
