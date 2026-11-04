/*!
 * @name 圈圈音源
 * @description oiapi 聚合源（酷我直连，秒出链接）
 * @version 10
 * @author 圈圈
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;

  var KW_API = 'https://oiapi.net/api/Kuwo';

  function toObj(v){
    if (typeof v === 'string'){ try { return JSON.parse(v); } catch(e){ return null; } }
    return (v && typeof v === 'object') ? v : null;
  }
  function httpOnce(url, opts, ms){
    return new Promise(function(resolve, reject){
      var done = false;
      var timer = setTimeout(function(){
        if (done) return; done = true;
        reject(new Error('timeout'));
      }, ms || 12000);
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
    // 可能直接是字符串
    var s = (r && r.body) || '';
    if (typeof s === 'string') return { raw: s };
    throw new Error('bad body');
  }

  lx.send(EV.inited, {
    sources: {
      kw: { name:'酷我音乐', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] }
    }
  });

  // oiapi 返回的是文本，里面含「音乐链接：http://...」
  function extractUrl(txt){
    if (!txt) return null;
    // 优先找 kw 域名
    var m = txt.match(/https?:\/\/[^\s"'±]*kuwo[^\s"'±]*/);
    if (m) return m[0];
    m = txt.match(/https?:\/\/[^\s"'±]+/);
    if (m) return m[0];
    return null;
  }

  lx.on(EV.request, function(payload){
    if (payload.action !== 'musicUrl') throw new Error('bad action ' + payload.action);
    var info = payload.info || {};
    var name = info.name || '';
    var singer = info.singer || '';

    if (!name) return Promise.reject(new Error('no song name'));

    var q = info.type || '128k';
    var kw = encodeURIComponent(name + (singer ? ' ' + singer : ''));

    var url = KW_API + '?msg=' + kw + '&n=1&type=json';

    return httpOnce(url, { method:'GET' }, 12000).then(function(resp){
      var b = bodyOf(resp);
      var txt = '';
      if (b.raw) txt = b.raw;
      else if (typeof b === 'string') txt = b;
      else txt = JSON.stringify(b);

      var u = extractUrl(txt);
      if (!u) throw new Error('no url in response');

      // 需要 320k 时尝试替换 bitrate
      if ((q === '320k' || q === 'flac') && u.indexOf('bitrate$128') >= 0){
        u = u.replace('bitrate$128', 'bitrate$320');
      }
      return u;
    });
  });
})();
